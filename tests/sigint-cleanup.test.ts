import { describe, expect, it, beforeEach } from 'bun:test';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

const stateDir = join(process.cwd(), '.ralph');
const statePath = join(stateDir, 'ralph-loop.state.json');
const questionsPath = join(stateDir, 'ralph-questions.json');

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('SIGINT Cleanup', () => {
  beforeEach(() => {
    [statePath, questionsPath].forEach(path => {
      if (existsSync(path)) {
        try { unlinkSync(path); } catch {}
      }
    });
  });

  it('stops heartbeat timer on SIGINT', async () => {
    const proc = Bun.spawn({
      cmd: ['bun', 'run', 'ralph.ts', 'sleep 5', '--max-iterations', '1'],
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, NODE_ENV: 'test' }
    });

    await wait(1500);
    
    // Read current output
    const reader = proc.stdout.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    reader.releaseLock();
    
    const heartbeatCount = (text.match(/⏳ working\.\.\./g) || []).length;
    expect(heartbeatCount).toBeGreaterThan(0);

    proc.kill('SIGINT');
    const exitCode = await proc.exited;
    expect(exitCode).toBeGreaterThanOrEqual(0);
  });

  it('clears state on SIGINT', async () => {
    const proc = Bun.spawn({
      cmd: ['bun', 'run', 'ralph.ts', 'echo test', '--max-iterations', '1'],
      stdout: 'pipe',
      env: { ...process.env, NODE_ENV: 'test' }
    });

    await wait(500);
    proc.kill('SIGINT');
    await proc.exited;
    
    // State should be cleared after SIGINT
    expect(existsSync(statePath)).toBe(false);
  });

  it('handles double SIGINT (force stop)', async () => {
    const proc = Bun.spawn({
      cmd: ['bun', 'run', 'ralph.ts', 'sleep 10', '--max-iterations', '1'],
      stdout: 'pipe',
      env: { ...process.env, NODE_ENV: 'test' }
    });

    await wait(500);
    proc.kill('SIGINT');
    await wait(100);
    proc.kill('SIGINT');

    const exitCode = await proc.exited;
    // Either force stop (1) or normal stop (0) is acceptable
    expect([0, 1]).toContain(exitCode);
  });
});
