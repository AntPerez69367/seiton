---
sidebar_position: 1
slug: /
---

# Introduction

**seiton** is an interactive command-line auditor for [Bitwarden](https://bitwarden.com/) vaults. It detects duplicates, weak and reused passwords, missing fields, and disorganized folders, then walks you through each finding so you can approve or reject changes one at a time.

The name derives from Japanese 整頓 ("set in order"), one of the five principles of the 5S workplace-organization methodology — the tool does the same job for a password vault that 5S does for a workshop.

## Key Principles

- **Plaintext never leaves memory.** No password, TOTP seed, or note body is ever written to disk, logged, or transmitted.
- **No network I/O.** seiton itself makes zero network calls — no telemetry, no update checks, no analytics. All vault access goes through the `bw` CLI.
- **Per-item confirmation.** Every destructive vault operation requires interactive user approval. There is no `--force` or `--yes-to-all` flag.
- **Deterministic analysis.** The same vault input always produces identical findings.

## What seiton Does

1. Reads your vault through the Bitwarden CLI (`bw`)
2. Runs five analyzers: duplicates, password reuse, weak passwords, missing fields, and folder classification
3. Presents findings interactively for your review
4. Applies approved changes serially through `bw`
5. Saves progress if interrupted — resume later with `seiton resume`

## Who It's For

- Bitwarden power users with accumulated cruft
- Security-conscious individuals doing post-breach or quarterly hygiene audits
- Solo founders running `bw` against a personal vault

## What It's Not

seiton is not an enterprise admin tool, not a password generator, and not a replacement for Bitwarden's own management UI. It audits — it does not write new secrets.
