import {
  MUTED_PALETTE,
  APP_HASH_SCALE,
  MUTED,
  mutedColorFor,
  randomMutedColor,
  nextUnusedMutedColor,
  recolorOntoPalette,
} from '~/util/palette';
import { defaultCategories } from '~/util/classes';

const HEX = /^#[0-9A-F]{6}$/;

describe('palette', () => {
  it('is a set of distinct six-digit hexes', () => {
    MUTED_PALETTE.forEach(c => expect(c).toMatch(HEX));
    expect(new Set(MUTED_PALETTE).size).toBe(MUTED_PALETTE.length);
  });

  it('contains the app-hash scale, so both halves of the UI share one family', () => {
    // The point of the whole change: an app colour and a category colour are picked
    // for different reasons, but out of the same tin of paint.
    APP_HASH_SCALE.forEach(c => expect(MUTED_PALETTE).toContain(c));
  });

  it('keeps the app-hash scale exactly as it was', () => {
    // Widening or reordering this repaints every app the owner already recognises.
    expect(APP_HASH_SCALE).toEqual(['#90CAF9', '#FFE082', '#EF9A9A', '#A5D6A7']);
  });

  it('exposes every palette entry under a name', () => {
    expect(Object.values(MUTED).slice().sort()).toEqual(MUTED_PALETTE.slice().sort());
  });

  it('picks the same colour for the same name every time', () => {
    expect(mutedColorFor('Reading')).toBe(mutedColorFor('Reading'));
    expect(MUTED_PALETTE).toContain(mutedColorFor(''));
  });

  it('never randomises outside the palette', () => {
    for (let i = 0; i < 200; i++) expect(MUTED_PALETTE).toContain(randomMutedColor());
  });
});

describe('nextUnusedMutedColor', () => {
  it('avoids colours already in use, case-insensitively', () => {
    const used = MUTED_PALETTE.slice(0, 3).map(c => c.toLowerCase());
    expect(nextUnusedMutedColor(used)).toBe(MUTED_PALETTE[3]);
  });

  it('ignores empty entries', () => {
    expect(nextUnusedMutedColor(['', null as any, undefined as any])).toBe(MUTED_PALETTE[0]);
  });

  it('still returns a palette colour once every entry is taken', () => {
    expect(MUTED_PALETTE).toContain(nextUnusedMutedColor(MUTED_PALETTE));
  });
});

describe('recolorOntoPalette', () => {
  it('repaints only the categories that carry their own colour', () => {
    const cats = [
      { name: ['Work'], data: { color: '#0F0' } },
      { name: ['Work', 'Programming'] }, // inherits; must stay inheriting
      { name: ['Media'], data: { color: '#F33' } },
    ];
    recolorOntoPalette(cats as any);
    expect(cats[0].data.color).toBe(MUTED_PALETTE[0]);
    expect(cats[1].data).toBeUndefined();
    expect(cats[2].data.color).toBe(MUTED_PALETTE[1]);
  });

  it('leaves Uncategorized grey', () => {
    const cats = [{ name: ['Uncategorized'], data: { color: '#CCC' } }];
    recolorOntoPalette(cats as any);
    expect(cats[0].data.color).toBe('#CCC');
  });

  it('reports how many actually changed, and is idempotent', () => {
    const cats = [
      { name: ['Work'], data: { color: '#0F0' } },
      { name: ['Media'], data: { color: '#F33' } },
    ];
    expect(recolorOntoPalette(cats as any)).toBe(2);
    expect(recolorOntoPalette(cats as any)).toBe(0);
  });
});

describe('defaultCategories', () => {
  it('now ships only palette colours', () => {
    const colored = defaultCategories.filter(c => c.data && c.data.color);
    expect(colored.length).toBeGreaterThan(0);
    for (const c of colored) {
      if (c.name[0] === 'Uncategorized') continue;
      expect(MUTED_PALETTE).toContain(c.data.color);
    }
  });

  it('keeps Work scoring 10', () => {
    // The recolour must not disturb anything else stored on a category.
    const work = defaultCategories.find(c => c.name.length === 1 && c.name[0] === 'Work');
    expect(work.data.score).toBe(10);
  });
});
