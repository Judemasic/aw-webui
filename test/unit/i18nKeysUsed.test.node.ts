/**
 * Every translation key a component asks for must exist.
 *
 * `scripts/check-locales.mjs` compares the locales against *each other*, so a key put in
 * the wrong section is invisible to it: as long as the mistake is made identically in all
 * six files, every locale agrees and the check passes. That is exactly what happened --
 * five `activity.*` keys were inserted after the first `host:` line in the file, which
 * lives in `footer:`, and the phone rendered `activity.unresolvedTitle` as literal text.
 *
 * This checks the other axis: what the code *uses* against what `en` actually has.
 */
import fs from 'fs';
import path from 'path';
import en from '~/i18n/locales/en';

const SRC = path.resolve(__dirname, '../../src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(vue|ts|js)$/.test(entry.name) && !p.includes('i18n')) out.push(p);
  }
  return out;
}

function has(obj: any, dotted: string): boolean {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj) !== undefined;
}

// $t('a.b.c') / $tc("a.b") / t('a.b') -- only static single-quoted or double-quoted keys.
// Dynamic keys ($t(someVar), template literals) cannot be checked and are skipped.
const CALL = /\$?tc?\(\s*(['"])([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)\1/g;

describe('i18n keys used in the app', () => {
  const files = walk(SRC);

  it('finds keys to check at all (guards against the regex silently matching nothing)', () => {
    const found = files.flatMap(f => [...fs.readFileSync(f, 'utf8').matchAll(CALL)]);
    expect(found.length).toBeGreaterThan(50);
  });

  it('all exist in the en locale', () => {
    const missing: string[] = [];
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(CALL)) {
        const key = m[2];
        if (!has(en, key)) {
          missing.push(`${path.relative(SRC, file)}: ${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
