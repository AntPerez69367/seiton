---
"@bigantlabs/seiton": patch
---

Replaced `zxcvbn-ts@^2.0.2` with `@zxcvbn-ts/core@^3.0.4` + `@zxcvbn-ts/language-common@^3.0.4` to correct a supply-chain near-miss (the unscoped package was an unrelated third-party, not the official zxcvbn TypeScript port). CI `test-integration` job now installs `@bitwarden/cli` before running integration tests.
