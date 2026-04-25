import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatFindingsText, formatFindingsJson } from '../../../src/commands/report.js';
import type { WeakFinding, MissingFinding, FolderFinding, DuplicateFinding, ReuseFinding } from '../../../src/lib/domain/finding.js';

function makeFakeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    name: 'Test Item',
    type: 1 as const,
    organizationId: null,
    folderId: null,
    notes: null,
    favorite: false,
    login: {
      uris: [{ match: null, uri: 'https://example.com' }],
      username: 'user@example.com',
      password: 'secret123',
      totp: null,
    },
    revisionDate: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('formatFindingsText', () => {
  it('returns clean message for empty findings', () => {
    const output = formatFindingsText([]);
    assert.ok(output.includes('No findings'));
  });

  it('formats weak findings grouped under category header', () => {
    const finding: WeakFinding = {
      category: 'weak',
      item: makeFakeItem(),
      score: 1,
      reasons: ['too short'],
    };
    const output = formatFindingsText([finding]);
    assert.ok(output.includes('Weak Passwords (1)'));
    assert.ok(output.includes('Test Item'));
    assert.ok(output.includes('too short'));
  });

  it('formats missing findings grouped under category header', () => {
    const finding: MissingFinding = {
      category: 'missing',
      item: makeFakeItem(),
      missingFields: ['password'],
    };
    const output = formatFindingsText([finding]);
    assert.ok(output.includes('Missing Fields (1)'));
    assert.ok(output.includes('password'));
  });

  it('formats folder findings grouped under category header', () => {
    const finding: FolderFinding = {
      category: 'folders',
      item: makeFakeItem(),
      suggestedFolder: 'Banking & Finance',
      existingFolderId: null,
      matchReason: { matchedKeyword: 'bank', ruleSource: 'builtin' },
    };
    const output = formatFindingsText([finding]);
    assert.ok(output.includes('Folder Suggestions (1)'));
    assert.ok(output.includes('Banking & Finance'));
  });

  it('formats duplicate findings grouped under category header', () => {
    const finding: DuplicateFinding = {
      category: 'duplicates',
      items: [
        makeFakeItem({ id: 'dup-1', name: 'Email A' }),
        makeFakeItem({ id: 'dup-2', name: 'Email B' }),
      ],
      key: 'user@example.com:https://example.com',
    };
    const output = formatFindingsText([finding]);
    assert.ok(output.includes('Duplicates (1)'));
    assert.ok(output.includes('2 items share key'));
    assert.ok(output.includes('Email A'));
    assert.ok(output.includes('Email B'));
  });

  it('formats reuse findings grouped under category header', () => {
    const finding: ReuseFinding = {
      category: 'reuse',
      items: [
        makeFakeItem({ id: 'reuse-1', name: 'Gmail' }),
        makeFakeItem({ id: 'reuse-2', name: 'GitHub' }),
        makeFakeItem({ id: 'reuse-3', name: 'Twitter' }),
      ],
      passwordHash: 'abc123def456',
    };
    const output = formatFindingsText([finding]);
    assert.ok(output.includes('Reused Passwords (1)'));
    assert.ok(output.includes('3 items share the same password'));
    assert.ok(output.includes('Gmail'));
    assert.ok(output.includes('GitHub'));
    assert.ok(output.includes('Twitter'));
  });

  it('orders categories consistently in grouped output', () => {
    const findings = [
      {
        category: 'missing' as const,
        item: makeFakeItem({ id: 'missing-1' }),
        missingFields: ['password'],
      },
      {
        category: 'duplicates' as const,
        items: [makeFakeItem({ id: 'dup-1' }), makeFakeItem({ id: 'dup-2' })],
        key: 'test@example.com:https://test.com',
      },
      {
        category: 'weak' as const,
        item: makeFakeItem({ id: 'weak-1' }),
        score: 1,
        reasons: ['too short'],
      },
      {
        category: 'reuse' as const,
        items: [makeFakeItem({ id: 'reuse-1' }), makeFakeItem({ id: 'reuse-2' })],
        passwordHash: 'hash123',
      },
    ];
    const output = formatFindingsText(findings);
    const duplicatesIndex = output.indexOf('Duplicates');
    const reuseIndex = output.indexOf('Reused Passwords');
    const weakIndex = output.indexOf('Weak Passwords');
    const missingIndex = output.indexOf('Missing Fields');
    assert.ok(duplicatesIndex < reuseIndex, 'duplicates should come before reuse');
    assert.ok(reuseIndex < weakIndex, 'reuse should come before weak');
    assert.ok(weakIndex < missingIndex, 'weak should come before missing');
  });
});

describe('formatFindingsJson', () => {
  it('returns valid JSON with version and summary', () => {
    const output = formatFindingsJson([], '•', 10, 3);
    const parsed = JSON.parse(output) as { version: number; summary: { totalItems: number } };
    assert.equal(parsed.version, 1);
    assert.equal(parsed.summary.totalItems, 10);
  });

  it('redacts passwords in JSON output', () => {
    const finding: WeakFinding = {
      category: 'weak',
      item: makeFakeItem(),
      score: 1,
      reasons: ['too short'],
    };
    const output = formatFindingsJson([finding], '•', 1, 0);
    assert.ok(!output.includes('secret123'));
    assert.ok(output.includes('•'));
  });
});
