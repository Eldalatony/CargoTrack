import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Gate 4: "Document withholding gate proven by an automated test that cannot
 * be disabled."
 *
 * Nothing stops a person from deleting a test. What this stops is the quiet
 * version — an `it.skip` during a hurried refactor, an `fdescribe` left behind
 * after debugging that silently turns every other case off — which leave the
 * suite green while proving nothing. It runs in the default unit suite, so
 * the build fails the moment either gate spec is neutered or goes missing.
 */
const GATE_SPECS = [
  join(__dirname, 'document-release-gate.spec.ts'),
  join(__dirname, '../../../test/e2e/document-release-gate.e2e-spec.ts'),
];

const DISABLING = [
  /\b(?:it|test|describe)\.(?:skip|only|todo|failing)\s*\(/,
  /\b(?:xit|xtest|xdescribe|fit|fdescribe)\s*\(/,
];

describe('the document release gate tests', () => {
  it.each(GATE_SPECS)('%s exists', (path) => {
    expect(existsSync(path)).toBe(true);
  });

  it.each(GATE_SPECS)('%s has no skipped or focused cases', (path) => {
    const source = readFileSync(path, 'utf8');

    for (const pattern of DISABLING) {
      expect([path, pattern.test(source)]).toEqual([path, false]);
    }
  });

  it('keeps the route sweep that proves no request path leaks', () => {
    const source = readFileSync(GATE_SPECS[1], 'utf8');

    expect(source).toContain('cannot be bypassed by any GET route');
    expect(source).toContain('registeredGetRoutes(app)');
  });
});
