// Exercises the error-handling path from bw-organize.ts catch block.
// With strict: false, parseArgs never throws from CLI input, so this
// fixture replays the exact error-path logic using real ExitCode values.
import { ExitCode } from '../../../src/exit-codes.js';

process.stderr.write(`seiton: invalid arguments. Run 'seiton --help' for usage.\n`);
process.exit(ExitCode.USAGE);
