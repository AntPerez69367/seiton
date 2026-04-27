import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';

interface Zone {
  name: string;
  match: (srcRelPath: string) => boolean;
  denied: DeniedRule[];
}

interface DeniedRule {
  pattern: (specifier: string, resolved: string) => boolean;
  description: string;
}

interface Violation {
  file: string;
  line: number;
  importSpecifier: string;
  rule: string;
}

interface ParsedImport {
  specifier: string;
  line: number;
}

const SRC_DIR = resolve(import.meta.dirname, '..', 'src');

const PURE_LIB_PREFIXES = [
  'src/lib/analyze/',
  'src/lib/dedup/',
  'src/lib/strength/',
  'src/lib/folders/',
  'src/lib/domain/',
];

function isPureLib(srcRel: string): boolean {
  return PURE_LIB_PREFIXES.some((p) => srcRel.startsWith(p));
}

function matchesPrefix(resolved: string, prefix: string): boolean {
  return resolved === prefix || resolved.startsWith(prefix);
}

const ZONES: Zone[] = [
  {
    name: 'pure-lib',
    match: isPureLib,
    denied: [
      {
        pattern: (spec) => spec === 'node:fs' || spec === 'node:fs/promises',
        description: 'pure-lib may not import node:fs',
      },
      {
        pattern: (spec) => spec === 'node:child_process',
        description: 'pure-lib may not import node:child_process',
      },
      {
        pattern: (spec) => spec === 'node:readline',
        description: 'pure-lib may not import node:readline',
      },
      {
        pattern: (_spec, resolved) => matchesPrefix(resolved, 'src/lib/bw'),
        description: 'pure-lib may not import src/lib/bw.ts',
      },
      {
        pattern: (_spec, resolved) => matchesPrefix(resolved, 'src/commands/'),
        description: 'pure-lib may not import src/commands/**',
      },
      {
        pattern: (_spec, resolved) =>
          matchesPrefix(resolved, 'src/config/loader'),
        description: 'pure-lib may not import src/config/loader.ts',
      },
    ],
  },
  {
    name: 'bw.ts',
    match: (p) => p === 'src/lib/bw.ts',
    denied: [
      {
        pattern: (_spec, resolved) => matchesPrefix(resolved, 'src/commands/'),
        description: 'src/lib/bw.ts may not import src/commands/**',
      },
    ],
  },
  {
    name: 'pending.ts',
    match: (p) => p === 'src/lib/pending.ts',
    denied: [
      {
        pattern: (_spec, resolved) => matchesPrefix(resolved, 'src/commands/'),
        description: 'src/lib/pending.ts may not import src/commands/**',
      },
    ],
  },
  {
    name: 'config',
    match: (p) => p.startsWith('src/config/'),
    denied: [
      {
        pattern: (_spec, resolved) => matchesPrefix(resolved, 'src/lib/bw'),
        description: 'src/config/** may not import src/lib/bw.ts',
      },
      {
        pattern: (_spec, resolved) => matchesPrefix(resolved, 'src/commands/'),
        description: 'src/config/** may not import src/commands/**',
      },
    ],
  },
  {
    name: 'commands',
    match: (p) => p.startsWith('src/commands/'),
    denied: [],
  },
];

const REVERSE_RULE: Zone = {
  name: 'no-import-commands-from-lib',
  match: (p) => p.startsWith('src/lib/'),
  denied: [
    {
      pattern: (_spec, resolved) => matchesPrefix(resolved, 'src/commands/'),
      description: 'src/lib/** may not import src/commands/**',
    },
  ],
};

const STATIC_RE = /^\s*import\s+.*?\s*from\s+['"]([^'"]+)['"]/;
const SIDE_EFFECT_RE = /^\s*import\s+['"]([^'"]+)['"]/;
const DYNAMIC_RE = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

function parseImports(content: string): ParsedImport[] {
  const results: ParsedImport[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const staticMatch = STATIC_RE.exec(line);
    if (staticMatch) {
      results.push({ specifier: staticMatch[1], line: i + 1 });
      continue;
    }
    const sideEffectMatch = SIDE_EFFECT_RE.exec(line);
    if (sideEffectMatch) {
      results.push({ specifier: sideEffectMatch[1], line: i + 1 });
      continue;
    }
    let dynMatch: RegExpExecArray | null;
    DYNAMIC_RE.lastIndex = 0;
    while ((dynMatch = DYNAMIC_RE.exec(line)) !== null) {
      results.push({ specifier: dynMatch[1], line: i + 1 });
    }
  }
  return results;
}

function resolveSpecifier(specifier: string, fromFile: string): string {
  if (!specifier.startsWith('.')) return specifier;
  const fromDir = dirname(fromFile);
  let resolved = resolve(SRC_DIR, '..', fromDir, specifier);
  resolved = resolved.replace(/\.js$/, '.ts');
  if (!resolved.endsWith('.ts')) resolved += '.ts';
  return relative(resolve(SRC_DIR, '..'), resolved);
}

function collectTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(full);
    }
  }
  return files;
}

function checkFile(srcRelPath: string, content: string): Violation[] {
  const violations: Violation[] = [];
  const imports = parseImports(content);

  const matchedZones: Zone[] = [];
  for (const zone of ZONES) {
    if (zone.match(srcRelPath)) matchedZones.push(zone);
  }
  if (REVERSE_RULE.match(srcRelPath)) matchedZones.push(REVERSE_RULE);

  if (matchedZones.length === 0) return [];

  for (const imp of imports) {
    const resolved = resolveSpecifier(imp.specifier, srcRelPath);
    for (const zone of matchedZones) {
      for (const rule of zone.denied) {
        if (rule.pattern(imp.specifier, resolved)) {
          violations.push({
            file: srcRelPath,
            line: imp.line,
            importSpecifier: imp.specifier,
            rule: rule.description,
          });
        }
      }
    }
  }
  return violations;
}

function main(): void {
  const files = collectTsFiles(SRC_DIR);
  const allViolations: Violation[] = [];

  for (const file of files) {
    const srcRel = relative(resolve(SRC_DIR, '..'), file);
    const content = readFileSync(file, 'utf-8');
    allViolations.push(...checkFile(srcRel, content));
  }

  if (allViolations.length === 0) {
    process.exit(0);
  }

  for (const v of allViolations) {
    process.stderr.write(
      `${v.file}:${v.line}: ${v.rule} (imported '${v.importSpecifier}')\n`,
    );
  }
  process.exit(1);
}

main();
