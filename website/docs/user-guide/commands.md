---
sidebar_position: 2
---

# Commands

## `seiton audit`

The primary command. Fetches your vault, runs all analyzers, and presents findings interactively.

```bash
seiton audit [--dry-run] [--verbose]
```

| Flag | Description |
|------|-------------|
| `--dry-run` | Show what would be changed without applying |
| `--verbose` | Show detailed analyzer output |

Requires a TTY (interactive terminal) and a valid `BW_SESSION`.

## `seiton resume`

Resumes a previously interrupted audit session from the saved pending-ops queue.

```bash
seiton resume
```

If no pending queue exists, exits with an informational message.

## `seiton discard`

Deletes the saved pending-ops queue without applying any changes.

```bash
seiton discard
```

## `seiton report`

Read-only analysis — produces findings without interactive review or mutations.

```bash
seiton report [--json] [--verbose]
```

| Flag | Description |
|------|-------------|
| `--json` | Output machine-readable JSON (secrets redacted) |
| `--verbose` | Include additional detail in output |

Does not require a TTY. Suitable for piping to other tools.

## `seiton doctor`

Preflight checks: verifies `bw` is installed, session is valid, and configuration is sound.

```bash
seiton doctor [--fix] [--verbose]
```

| Flag | Description |
|------|-------------|
| `--fix` | Attempt safe automatic remediation |
| `--verbose` | Show detailed check results |

## `seiton config`

Manage the configuration file.

```bash
seiton config path           # Print config file location
seiton config get <key>      # Read a config value
seiton config set <key> <value>  # Set a config value
seiton config set <key> --unset  # Reset a key to default
seiton config edit           # Open config in $EDITOR
seiton config reset [--yes]  # Reset entire config file
```
