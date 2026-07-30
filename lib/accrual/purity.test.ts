/**
 * §03 / §13 M1: the accrual engine must be pure and dependency-free, and must
 * never import a database client. This test fails the build if that slips.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Sibling modules the engine is allowed to reach for. */
const ALLOWED_RELATIVE = new Set(['../errors', '../money']);

const IMPORT_SOURCE = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g;

function sourceFiles(): string[] {
  return readdirSync(HERE)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => join(HERE, name));
}

describe('accrual engine purity', () => {
  it('imports nothing beyond its own siblings', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(IMPORT_SOURCE)) {
        const specifier = match[1];
        const isSibling = specifier.startsWith('./') || ALLOWED_RELATIVE.has(specifier);
        // `import type` of a sibling is fine; a bare package name is not.
        if (!isSibling) offenders.push(`${file}: ${specifier}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('never mentions a database, framework, or network primitive', () => {
    const forbidden = [
      'drizzle',
      'neondatabase',
      'next/',
      'react',
      'better-auth',
      'dexie',
      'fetch(',
      'process.env',
    ];

    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const source = readFileSync(file, 'utf8');
      for (const needle of forbidden) {
        if (source.includes(needle)) offenders.push(`${file}: ${needle}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('does not read the clock — every valuation date is passed in', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const source = readFileSync(file, 'utf8');
      // dates.ts constructs Date objects to do calendar arithmetic, but no
      // module may ask the host what time it is.
      if (/Date\.now\(\)|new Date\(\)/.test(source)) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });
});
