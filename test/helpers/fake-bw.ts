#!/usr/bin/env node
/**
 * Stand-in binary for `bw` in integration tests.
 * Reads FAKE_BW_SCENARIO env var and emits canned output.
 */

const scenario = process.env['FAKE_BW_SCENARIO'] ?? 'default';
const args = process.argv.slice(2);

if (args[0] === '--version') {
  if (scenario === 'version-error') {
    process.stderr.write('bw: error fetching version\n');
    process.exit(1);
  }
  process.stdout.write('2024.6.0\n');
  process.exit(0);
}

if (args[0] === 'status') {
  const status = scenario === 'locked' ? 'locked' : 'unlocked';
  process.stdout.write(JSON.stringify({
    status,
    userEmail: 'user@example.com',
  }) + '\n');
  process.exit(0);
}

process.stderr.write(`fake-bw: unhandled command: ${args.join(' ')}\n`);
process.exit(1);
