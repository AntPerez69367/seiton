---
sidebar_position: 2
---

# Quick Start

Once you have seiton [installed](/docs/getting-started/installation), here's how to run your first vault audit.

## 1. Unlock Your Vault

```bash
export BW_SESSION=$(bw unlock --raw)
```

## 2. Run the Doctor

Verify everything is set up correctly:

```bash
seiton doctor
```

## 3. Run an Audit

```bash
seiton audit
```

seiton will:
1. Fetch your vault items via `bw`
2. Run all analyzers (duplicates, weak passwords, reuse, missing fields, folder classification)
3. Present each finding interactively
4. Ask you to approve or reject each proposed change
5. Apply approved changes serially through `bw`

## 4. If Interrupted

If you press `Ctrl+C` during an audit, seiton saves your pending operations automatically. Resume later:

```bash
seiton resume
```

Or discard the saved queue:

```bash
seiton discard
```

## 5. Read-Only Mode

If you just want to see findings without making changes:

```bash
seiton report
```

For machine-readable output:

```bash
seiton report --json
```

## Next Steps

- Learn about all [available commands](/docs/user-guide/commands)
- Customize behavior via [configuration](/docs/user-guide/configuration)
