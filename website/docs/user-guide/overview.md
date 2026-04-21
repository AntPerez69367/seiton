---
sidebar_position: 1
---

# User Guide Overview

seiton performs five types of analysis on your Bitwarden vault:

## Analyzers

### Duplicate Detection

Finds items that share the same domain and username (exact duplicates) or have very similar names (near duplicates using Levenshtein distance). You choose which to keep and which to delete.

### Password Strength

Evaluates passwords using [zxcvbn](https://github.com/dropbox/zxcvbn) scoring plus configurable heuristics (minimum length, character class requirements). Flags weak entries so you know what to rotate.

### Password Reuse

Groups items that share the same password (compared by SHA-256 hash — the plaintext is never logged). Highlights the risk of credential-stuffing attacks.

### Missing Fields

Identifies login items without URIs, items without usernames, and other incomplete entries that reduce the usefulness of browser auto-fill.

### Folder Classification

Suggests folder assignments for unfiled items based on keyword matching against item names and URIs. Uses built-in category rules (Banking, Email, Social, etc.) and any custom rules you configure.

## Workflow

```
Fetch vault → Analyze → Present findings → You approve/reject → Apply changes
```

Every step is transparent. seiton never makes changes without your explicit per-item approval.

## Security Model

- seiton accesses your vault exclusively through the `bw` CLI
- It never handles your master password
- Plaintext secrets never reach disk, logs, or network
- The pending-ops queue stores only item IDs and operation kinds — no passwords
- All files seiton writes use mode `0600`
