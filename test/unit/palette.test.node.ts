import {
  MUTED_PALETTE,
  APP_HASH_SCALE,
  MUTED,
  mutedColorFor,
  randomMutedColor,
  nextUnusedMutedColor,
  nearestMutedColor,
  recolorOntoPalette,
} from '~/util/palette';
import { defaultCategories } from '~/util/classes';

const HEX = /^#[0-9A-F]{6}$/;

/** A fully saturated colour at hue `h`, for probing the wheel. */
function hslHex(h: number): string {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = 0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * v)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** How far apart two hexes are on the colour wheel, in degrees. */
function hueGap(a: string, b: string): number {
  const hue = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const bl = (n & 255) / 255;
    const mx = Math.max(r, g, bl);
    const c = mx - Math.min(r, g, bl);
    if (!c) return 0;
    let x = mx === r ? ((g - bl) / c) % 6 : mx === g ? (bl - r) / c + 2 : (r - g) / c + 4;
    x *= 60;
    return x < 0 ? x + 360 : x;
  };
  const d = Math.abs(hue(a) - hue(b)) % 360;
  return d > 180 ? 360 - d : d;
}

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
    expect(MUTED_PALETTE).toContain(cats[0].data.color);
    expect(cats[1].data).toBeUndefined();
    expect(MUTED_PALETTE).toContain(cats[2].data.color);
  });

  it('keeps a category recognisably its own colour', () => {
    // The bug found on the phone: palette-order assignment turned Work green -> red.
    const cats = [
      { name: ['Work'], data: { color: '#0F0' } },
      { name: ['Media'], data: { color: '#F33' } },
      { name: ['Comms'], data: { color: '#9FF' } },
    ];
    recolorOntoPalette(cats as any);
    expect(cats[0].data.color).toBe(MUTED.green);
    expect(cats[1].data.color).toBe(MUTED.red);
    // #9FF sits at hue 180, exactly between Teal and Cyan; either keeps it cyan-ish.
    expect([MUTED.teal, MUTED.cyan]).toContain(cats[2].data.color);
  });

  it('never gives two categories the same entry while others are free', () => {
    const cats = [
      { name: ['A'], data: { color: '#0F0' } },
      { name: ['B'], data: { color: '#0F0' } },
      { name: ['C'], data: { color: '#0F0' } },
    ];
    recolorOntoPalette(cats as any);
    const used = cats.map(c => c.data.color);
    expect(new Set(used).size).toBe(3);
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

describe('nearestMutedColor', () => {
  it('answers a hue with the same hue, quieter', () => {
    expect(nearestMutedColor('#0F0')).toBe(MUTED.green);
    expect(nearestMutedColor('#F00')).toBe(MUTED.red);
  });

  it('never moves a hue far around the wheel', () => {
    // The property that matters, rather than which of two adjacent entries wins: the
    // palette has 18 stops, so nothing should ever have to travel more than about a
    // sixth of the wheel to reach one.
    for (let h = 0; h < 360; h += 5) {
      const src = hslHex(h);
      const got = nearestMutedColor(src);
      expect(hueGap(src, got)).toBeLessThan(35);
    }
  });

  it('is unchanged by a hue already in the palette', () => {
    // The neutrals are excluded: they have no hue, so both answer to the same branch
    // and either is a correct answer for the other.
    MUTED_PALETTE.filter(c => c !== MUTED.brown && c !== MUTED.blueGrey).forEach(c =>
      expect(nearestMutedColor(c)).toBe(c)
    );
  });

  it('reads the short hex form the category defaults are written in', () => {
    // #0F0 and friends are what actually ship; a parser that wanted #RRGGBB read every
    // one of them as black.
    expect(nearestMutedColor('#0F0')).toBe(nearestMutedColor('#00FF00'));
    expect(nearestMutedColor('#F33')).toBe(MUTED.red);
    expect(nearestMutedColor('#CCC')).not.toBe(nearestMutedColor('#0F0'));
  });

  it('sends a grey to a neutral, not to a hue', () => {
    expect([MUTED.brown, MUTED.blueGrey]).toContain(nearestMutedColor('#888888'));
    expect([MUTED.brown, MUTED.blueGrey]).toContain(nearestMutedColor('#CCCCCC'));
  });

  it('never answers a hue with a near-grey while a hue is free', () => {
    expect([MUTED.brown, MUTED.blueGrey]).not.toContain(nearestMutedColor('#0F0'));
  });

  it('skips entries already taken', () => {
    const taken = new Set([MUTED.green]);
    const picked = nearestMutedColor('#0F0', taken);
    expect(picked).not.toBe(MUTED.green);
    expect([MUTED.lightGreen, MUTED.teal]).toContain(picked);
  });

  it('survives junk without throwing', () => {
    expect(MUTED_PALETTE).toContain(nearestMutedColor('not a colour'));
    expect(MUTED_PALETTE).toContain(nearestMutedColor(''));
  });
});
