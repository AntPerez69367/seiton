# Runtime Dependencies

Every runtime dependency is listed here with its justification, why stdlib is
insufficient, and the most recent audit date.

| Package | Version | Purpose | Why not stdlib | Last Audit |
| --- | --- | --- | --- | --- |
| `zod` | ^4.3.6 | Runtime schema validation at the `bw` trust boundary | No stdlib equivalent for declarative schema validation with TypeScript type inference | 2026-04-20 |
| `tldts` | ^7.0.28 | Public Suffix List–based domain parsing for dedup key normalization | PSL changes frequently; maintaining it by hand is a security/correctness risk | 2026-04-20 |
| `@clack/prompts` | ^1.2.0 | Interactive terminal prompts, spinners, select, confirm, intro/outro banners | `readline` lacks multi-select, progress spinners, and styled terminal UI | 2026-04-21 |
| `zxcvbn-ts` | ^2.0.2 | Dictionary-aware password strength scoring (0-4 scale with pattern matching) | Rolling a strength estimator is a security liability; no stdlib equivalent | 2026-04-26 |
| `@zxcvbn-ts/language-en` | ^3.0.2 | English dictionary pack for zxcvbn-ts (common words, names, Wikipedia terms) | Required for pattern matching against common English words and names | 2026-04-26 |

## Dependency Rules

- Adding a new runtime dependency requires a PR that updates this file.
- The justification must explain why Node.js built-ins cannot cover the use case.
- Dev dependencies (`typescript`, `@types/node`, `tsx`) are exempt from this list.
- Each dependency is subject to periodic audit for security and maintenance status.
