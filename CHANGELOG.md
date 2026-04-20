# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
## [0.2.0] - 2026-04-19

### Added
- Project bootstrap: `package.json` with ESM, `bin` field, `engines`, and npm scripts (M2)
- TypeScript build system: `tsconfig.json` with strict mode, NodeNext modules, ES2022 target (M2)
- CLI entry point `src/bw-organize.ts` with `--version` and `--help` flags (M2)
- `ExitCode` enum in `src/exit-codes.ts` with BSD sysexits-compatible codes (M2)
- Version constant in `src/version.ts` with unit test verifying semver validity (M2)
- `.nvmrc` pinning Node 22, `.editorconfig` for consistent formatting (M2)

- Project bootstrap with `package.json`: ESM (`"type": "module"`), `bin` field pointing to `dist/bw-organize.js`, `engines.node >= 22`, npm scripts for build/lint/test (M2)
## [0.1.1] - 2026-04-19

### Added
- Created `README.md` with project description, prerequisites, quick start, command table, and configuration overview (M1)
