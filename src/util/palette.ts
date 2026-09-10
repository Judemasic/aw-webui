/**
 * The one palette.
 *
 * Two parts of the UI colour things, and until now they did it from two unrelated
 * sets of hexes:
 *
 *  - **by app identity** — the Combined timeline, the Timeline, the Calendar and the
 *    activity sunburst all hash an app or window name into a colour, so that "Firefox"
 *    is the same colour every day. That hash used four soft tones.
 *  - **by category** — Categorization settings, the category sunburst and the category
 *    charts read a hex the owner picked and stored on the category itself. Those
 *    defaults were fully saturated (`#0F0`, `#F33`, `#F80`, …) and the colour picker's
 *    "randomize" button handed out any hex in the 16.7-million, so a new category was
 *    usually louder still.
 *
 * The two remain *different questions* — an app is not a category, and colouring by
 * one is not colouring by the other — but there is no reason for them to be drawn from
 * different-looking paint. This file is the paint.
 *
 * `MUTED_PALETTE` is the Material Design **200** tier, which is where the four tones
 * the app-hash already used come from (`#90CAF9` Blue 200, `#FFE082` Amber 200,
 * `#EF9A9A` Red 200, `#A5D6A7` Green 200). Keeping the tier fixed is what makes the
 * set look like a set: every entry has roughly the same lightness and the same
 * restraint, so no single category shouts over the others, and dark text stays legible
 * on all of them.
 *
 * Ordered by hue so that neighbouring picks in the colour picker read as neighbours.
 */
export const MUTED_PALETTE: string[] = [
  '#EF9A9A', // Red 200
  '#FFAB91', // Deep Orange 200
  '#FFCC80', // Orange 200
  '#FFE082', // Amber 200
  '#FFF59D', // Yellow 200
  '#E6EE9C', // Lime 200
  '#C5E1A5', // Light Green 200
  '#A5D6A7', // Green 200
  '#80CBC4', // Teal 200
  '#80DEEA', // Cyan 200
  '#81D4FA', // Light Blue 200
  '#90CAF9', // Blue 200
  '#9FA8DA', // Indigo 200
  '#B39DDB', // Deep Purple 200
  '#CE93D8', // Purple 200
  '#F48FB1', // Pink 200
  '#BCAAA4', // Brown 200
  '#B0BEC5', // Blue Grey 200
];

/**
 * The four tones the app-name hash spreads across.
 *
 * Deliberately a *subset* of `MUTED_PALETTE` and deliberately unchanged: every app in
 * the Combined timeline and the Timeline keeps the exact colour it has today. Widening
 * this would repaint every app the owner has learned to recognise, which is a separate
 * decision from making the categories quieter.
 */
export const APP_HASH_SCALE: string[] = ['#90CAF9', '#FFE082', '#EF9A9A', '#A5D6A7'];

/** Neutral grey for "no category" / "no colour set". Not part of the palette proper. */
export const COLOR_UNCAT = '#CCC';

/**
 * Pick a palette entry for a string, stably.
 *
 * Used to give a freshly-added category a colour that is not black and not random —
 * the same name always lands on the same swatch, so adding "Reading" twice in two
 * sessions does not produce two different colours.
 */
export function mutedColorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash = hash & hash; // to 32-bit
  }
  return MUTED_PALETTE[Math.abs(hash) % MUTED_PALETTE.length];
}

/** A random entry from the palette — what "randomize" in the colour picker now means. */
export function randomMutedColor(): string {
  return MUTED_PALETTE[Math.floor(Math.random() * MUTED_PALETTE.length)];
}

/**
 * Named handles onto the palette, for places that want to say *which* colour they mean
 * rather than index into the list — the default category set, mostly. The names are the
 * hue, not the meaning, so that a category's colour choice stays readable as a choice.
 */
export const MUTED = {
  red: '#EF9A9A',
  deepOrange: '#FFAB91',
  orange: '#FFCC80',
  amber: '#FFE082',
  yellow: '#FFF59D',
  lime: '#E6EE9C',
  lightGreen: '#C5E1A5',
  green: '#A5D6A7',
  teal: '#80CBC4',
  cyan: '#80DEEA',
  lightBlue: '#81D4FA',
  blue: '#90CAF9',
  indigo: '#9FA8DA',
  deepPurple: '#B39DDB',
  purple: '#CE93D8',
  pink: '#F48FB1',
  brown: '#BCAAA4',
  blueGrey: '#B0BEC5',
} as const;

/**
 * The next palette entry not already spoken for.
 *
 * Used when a category is created. Falls back to walking the palette from the start
 * once every entry is in use, which on a set of more than 18 coloured categories is
 * unavoidable and harmless — duplicates at that point are already the norm.
 */
export function nextUnusedMutedColor(used: string[]): string {
  const taken = new Set(used.filter(Boolean).map(c => c.toUpperCase()));
  const free = MUTED_PALETTE.find(c => !taken.has(c.toUpperCase()));
  return free ?? MUTED_PALETTE[taken.size % MUTED_PALETTE.length];
}

/**
 * Re-colour an existing set of categories onto the palette.
 *
 * Changing `defaultCategories` only reaches a *fresh* install — anyone who has ever
 * saved a category has their own stored colours, and "Restore defaults" would take
 * their rules with it. So repainting has to be its own action.
 *
 * Two rules, both deliberate:
 *
 *  - **Only categories that already carry an explicit colour are touched.** A category
 *    with no colour of its own inherits its parent's, and that inheritance is a choice
 *    the owner made; filling it in would quietly break the grouping.
 *  - **`Uncategorized` keeps its grey.** It is not a category so much as the absence of
 *    one, and it is grey everywhere else in the app for that reason.
 *
 * Colours are handed out in palette order, so the result reads as a spectrum rather
 * than as a re-shuffle.
 */
export function recolorOntoPalette<T extends { name: string[]; data?: { color?: string } }>(
  categories: T[]
): number {
  let next = 0;
  let changed = 0;
  for (const c of categories) {
    if (!c.data || !c.data.color) continue;
    if (c.name.length === 1 && c.name[0] === 'Uncategorized') continue;
    const color = MUTED_PALETTE[next % MUTED_PALETTE.length];
    next += 1;
    if (c.data.color.toUpperCase() === color.toUpperCase()) continue;
    c.data.color = color;
    changed += 1;
  }
  return changed;
}
