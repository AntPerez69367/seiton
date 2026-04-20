import { writeFileSync } from 'node:fs';
import { registerCleanup, installSignalHandlers } from '../../src/core/signals.js';

const markerPath = process.argv[2];
if (!markerPath) {
  process.stderr.write('Usage: signal-test-child.ts <marker-path>\n');
  process.exit(1);
}

registerCleanup(async () => {
  writeFileSync(markerPath, 'cleanup-ran');
});

installSignalHandlers();

process.stdout.write('READY\n');

setInterval(() => {}, 60000);
