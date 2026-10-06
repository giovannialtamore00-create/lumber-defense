// PreToolUse(Bash) hook: run the test suite before any real git commit; deny the commit if tests fail.
import { spawnSync } from 'node:child_process';

let raw = '';
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  let cmd = '';
  try { cmd = (JSON.parse(raw).tool_input || {}).command || ''; } catch { process.exit(0); }
  // Only a real git commit command: at the start, or after ; & | ( or a newline.
  if (!/(?:^|[;&|(\n])\s*git\s+commit\b/.test(cmd)) process.exit(0);
  const r = spawnSync('npm', ['test'], { encoding: 'utf8', shell: true, timeout: 150000 });
  if (r.status === 0) process.exit(0);
  const tail = ((r.stdout || '') + (r.stderr || '')).split('\n').slice(-15).join('\n');
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'npm test failed, so the commit is blocked. Fix the tests first.\n' + tail,
    },
  }));
});
