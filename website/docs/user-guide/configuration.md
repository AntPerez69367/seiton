---
sidebar_position: 3
---

# Configuration

seiton uses a JSON configuration file. All settings have sensible defaults — no config file is required to get started.

## Config File Location

seiton searches for config in this order (first match wins):

1. `--config <path>` CLI flag
2. `$SEITON_CONFIG` environment variable
3. `$XDG_CONFIG_HOME/seiton/config.json`
4. `$HOME/.config/seiton/config.json`
5. `$HOME/.seitonrc.json`

Find your active config path:

```bash
seiton config path
```

## Example Configuration

```json
{
  "$schema": "https://raw.githubusercontent.com/seiton-cli/seiton/main/schemas/config.schema.json",
  "version": 1,
  "strength": {
    "min_length": 14,
    "zxcvbn_min_score": 3
  },
  "dedup": {
    "name_similarity_threshold": 3,
    "treat_www_as_same_domain": true
  },
  "folders": {
    "enabled_categories": ["Banking & Finance", "Email", "Social", "Development"],
    "custom_rules": [
      { "folder": "Crypto", "keywords": ["binance", "kraken", "coinbase"] },
      { "folder": "Work", "keywords": ["acme.internal", "acme-corp.com"] }
    ]
  }
}
```

## Key Settings

### Password Strength (`strength`)

| Key | Default | Description |
|-----|---------|-------------|
| `min_length` | `12` | Minimum acceptable password length |
| `require_digit` | `true` | Require at least one digit |
| `require_symbol` | `true` | Require at least one symbol |
| `min_character_classes` | `2` | Minimum distinct character classes |
| `zxcvbn_min_score` | `2` | Minimum zxcvbn score (0-4) |
| `extra_common_passwords` | `[]` | Additional passwords to flag |

### Deduplication (`dedup`)

| Key | Default | Description |
|-----|---------|-------------|
| `name_similarity_threshold` | `3` | Levenshtein distance for near-duplicate detection |
| `treat_www_as_same_domain` | `true` | Consider `www.example.com` and `example.com` as same |
| `case_insensitive_usernames` | `true` | Ignore case when comparing usernames |

### Folders (`folders`)

| Key | Default | Description |
|-----|---------|-------------|
| `preserve_existing` | `true` | Don't suggest moves for already-filed items |
| `enabled_categories` | All built-in categories | Which categories to suggest |
| `custom_rules` | `[]` | User-defined keyword-to-folder rules (evaluated first) |

### UI (`ui`)

| Key | Default | Description |
|-----|---------|-------------|
| `prompt_style` | `"clack"` | UI style: `"clack"` or `"plain"` |
| `mask_character` | `"*"` | Character used to mask passwords |
| `color_scheme` | `"auto"` | Color mode: `"auto"`, `"dark"`, `"light"` |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BW_SESSION` | Bitwarden session token (required for vault access) |
| `SEITON_CONFIG` | Alternate config file path |
| `SEITON_VERBOSE` | `1` or `2` for verbose/trace output |
| `NO_COLOR` | Disable ANSI color output |
