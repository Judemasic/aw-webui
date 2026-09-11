import _ from 'lodash';
import { IEvent } from './interfaces';
import { useSettingsStore } from '~/stores/settings';
import { getPresetCategorySets } from '~/util/presetCategories';
import { MUTED, COLOR_UNCAT } from '~/util/palette';

const level_sep = '>';
export const CLASSIFY_KEYS = ['app', 'title'] as const;
const UNCATEGORIZED = ['Uncategorized'];

/** Canonical event fields offered in the category-rule editor. */
export const CANONICAL_SELECT_KEYS = CLASSIFY_KEYS;

/** ID of the implicit set holding a user's own (non-preset) categories. */
export const DEFAULT_SET_ID = 'default';

export interface Rule {
  type: 'regex' | 'none';
  regex?: string;
  ignore_case?: boolean;
  /** When set, only these event.data keys are tested. Absent = all string fields. */
  select_keys?: string[];
}

/** Drop empty/invalid select_keys so the rust parser never sees `[]`. */
export function normalizeSelectKeys(keys?: string[] | null): string[] | undefined {
  if (!keys || keys.length === 0) {
    return undefined;
  }
  const unique: string[] = [];
  for (const key of keys) {
    if (typeof key === 'string' && key && !unique.includes(key)) {
      unique.push(key);
    }
  }
  return unique.length > 0 ? unique : undefined;
}

export interface Category {
  id?: number;
  name: string[];
  name_pretty?: string;
  subname?: string;
  rule: Rule;
  data?: Record<string, any>;
  depth?: number;
  parent?: string[];
  children?: Category[];
}

export interface CategorySet {
  id: string;
  categories: Category[];
}

/**
 * Merge multiple category sets in priority order (first set = highest priority).
 * When the same category name appears in multiple sets, the first occurrence wins.
 * Within each set, the standard specificity rule applies (deeper category wins).
 */
export function mergeCategorySets(sets: CategorySet[]): Category[] {
  const seen = new Set<string>();
  const merged: Category[] = [];
  for (const set of sets) {
    for (const cat of set.categories) {
      const key = JSON.stringify(cat.name);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(cat);
      }
    }
  }
  return merged;
}

// The default categories
//
// Colours come from `~/util/palette` — the same Material 200 tier the app-name hash
// draws from — so a category and an app look like they belong to one application
// rather than two. See the header of that file for why.
//
// Should be run through createMissingParents before being used in most cases.
export const defaultCategories: Category[] = [
  {
    name: ['Work'],
    rule: { type: 'regex', regex: 'Google Docs|libreoffice|ReText' },
    data: { color: MUTED.green, score: 10 },
  },
  {
    name: ['Work', 'Programming'],
    rule: {
      type: 'regex',
      regex: 'GitHub|Stack Overflow|BitBucket|Gitlab|vim|Spyder|kate|Ghidra|Scite',
    },
  },
  {
    name: ['Work', 'Programming', 'ActivityWatch'],
    rule: { type: 'regex', regex: 'ActivityWatch|aw-', ignore_case: true },
  },
  { name: ['Work', 'Image'], rule: { type: 'regex', regex: 'GIMP|Inkscape' } },
  { name: ['Work', 'Video'], rule: { type: 'regex', regex: 'Kdenlive' } },
  { name: ['Work', 'Audio'], rule: { type: 'regex', regex: 'Audacity' } },
  { name: ['Work', '3D'], rule: { type: 'regex', regex: 'Blender' } },
  {
    name: ['Media'],
    rule: { type: 'none' },
    data: { color: MUTED.red },
  },
  {
    name: ['Media', 'Games'],
    rule: { type: 'regex', regex: 'Minecraft|RimWorld' },
    data: { color: MUTED.orange },
  },
  {
    name: ['Media', 'Video'],
    rule: { type: 'regex', regex: 'YouTube|Plex|VLC' },
    data: { color: MUTED.red },
  },
  {
    name: ['Media', 'Social Media'],
    rule: {
      type: 'regex',
      regex: 'reddit|Facebook|Twitter|Instagram|devRant',
      ignore_case: true,
    },
    data: { color: MUTED.amber },
  },
  {
    name: ['Media', 'Music'],
    rule: {
      type: 'regex',
      regex: 'Spotify|Deezer',
      ignore_case: true,
    },
    data: { color: MUTED.lime },
  },
  {
    name: ['Comms'],
    rule: { type: 'none' },
    data: { color: MUTED.cyan },
  },
  {
    name: ['Comms', 'IM'],
    rule: {
      type: 'regex',
      regex:
        'Messenger|Telegram|Signal|WhatsApp|Rambox|Slack|Riot|Element|Discord|Nheko|NeoChat|Mattermost',
    },
  },
  { name: ['Comms', 'Email'], rule: { type: 'regex', regex: 'Gmail|Thunderbird|mutt|alpine' } },
  { name: ['Uncategorized'], rule: { type: null }, data: { color: COLOR_UNCAT } },
];

/**
 * The categories a set starts out with — what "restore defaults" restores.
 *
 * Normally the built-in `defaultCategories`, but builds/deployments that ship
 * preset category sets (see `~/util/presetCategories`) start from those instead.
 *
 * `setId` is the set the categories are destined for, so that restoring never
 * writes one set's categories into another:
 *  - a preset set restores its own categories,
 *  - a user-owned set restores the built-in defaults,
 *  - omitting it (install default) uses the first preset, which is the one
 *    `loadCategories()` activates on a fresh install.
 */
export function getDefaultClasses(setId?: string): Category[] {
  const presets = getPresetCategorySets();
  if (presets.length === 0) {
    return _.cloneDeep(defaultCategories);
  }
  if (setId === undefined) {
    return presets[0].categories;
  }
  const preset = presets.find(p => p.id === setId);
  return preset ? preset.categories : _.cloneDeep(defaultCategories);
}

export function annotate(c: Category) {
  const ch = c.name;
  c.name_pretty = ch.join(level_sep);
  c.subname = ch.slice(-1)[0];
  c.parent = ch.length > 1 ? ch.slice(0, -1) : null;
  c.depth = ch.length - 1;
  return c;
}

export function createMissingParents(classes: Category[]): Category[] {
  // Creates parents for categories that are missing theirs (implicit parents)
  classes = _.cloneDeep(classes);
  classes = classes.slice().map(c => annotate(c));
  const all_full_names = new Set(classes.map(c => c.name.join(level_sep)));

  function _createMissing(children: Category[]) {
    children
      .map(c => c.parent)
      .filter(p => !!p)
      .map(p => {
        const name = p.join(level_sep);
        if (p && !all_full_names.has(name)) {
          const new_parent = annotate({ name: p, rule: { type: null } });
          //console.log('Creating missing parent:', new_parent);
          classes.push(new_parent);
          all_full_names.add(name);
          // New parent might not be top-level, so we need to recurse
          _createMissing([new_parent]);
        }
      });
  }

  _createMissing(classes);
  return classes;
}

export function build_category_hierarchy(classes: Category[]): Category[] {
  classes = createMissingParents(classes);

  function assignChildren(classes_at_level: Category[]) {
    return classes_at_level.map(cls => {
      cls.children = classes.filter(child => {
        return child.parent && cls.name
          ? JSON.stringify(child.parent) == JSON.stringify(cls.name)
          : false;
      });
      assignChildren(cls.children);
      return cls;
    });
  }

  return assignChildren(classes.filter(c => !c.parent));
}

export function flatten_category_hierarchy(hier: Category[]): Category[] {
  return _.flattenDeep(
    hier.map(h => {
      const level = [h, flatten_category_hierarchy(h.children)];
      h.children = [];
      return level;
    })
  );
}

function areWeTesting() {
  return process.env.NODE_ENV === 'test';
}

export function saveClasses(classes: Category[]) {
  if (areWeTesting()) {
    // TODO: move this into settings store?
    console.log('Not saving classes in test mode');
    return;
  }
  const settingsStore = useSettingsStore();
  settingsStore.update({ classes: classes.map(cleanCategory) });
  console.log('Saved classes', settingsStore.classes);
}

export function cleanCategory(cat: Category): Category {
  cat = _.cloneDeep(cat);
  delete cat.children;
  delete cat.parent;
  delete cat.subname;
  delete cat.name_pretty;
  delete cat.depth;
  // in an older version, type could be null (which is not allowed)
  // we also want to strip any excess properties that may have belonged to another rule type
  if (cat.rule && (cat.rule.type === null || cat.rule.type === 'none')) {
    cat.rule = { type: 'none' };
  } else if (cat.rule && cat.rule.type === 'regex') {
    const keys = normalizeSelectKeys(cat.rule.select_keys);
    if (keys) {
      cat.rule.select_keys = keys;
    } else {
      delete cat.rule.select_keys;
    }
  }
  return cat;
}

export function loadClasses(): Category[] {
  const settingsStore = useSettingsStore();
  return settingsStore.classes;
}

/** The owner's collision answers, for callers that also use `loadClasses()`. */
export function loadPins(): CategoryPin[] {
  const settingsStore = useSettingsStore();
  return settingsStore.category_pins || [];
}

/**
 * Persist category sets and active set IDs to the settings store.
 * Also updates the legacy `classes` field for backwards compatibility with external readers.
 */
export function saveCategories(sets: CategorySet[], activeIds: string[]) {
  if (areWeTesting()) {
    console.log('Not saving categories in test mode');
    return;
  }
  const settingsStore = useSettingsStore();
  const cleanSets = sets.map(s => ({ ...s, categories: s.categories.map(cleanCategory) }));
  const effectiveClasses = mergeCategorySets(sets.filter(s => activeIds.includes(s.id))).map(
    cleanCategory
  );
  return settingsStore.update({
    category_sets: cleanSets,
    active_set_ids: activeIds,
    classes: effectiveClasses,
  });
}

/**
 * Load category sets and active set IDs from the settings store.
 * Falls back to the legacy flat `classes` setting if no sets are defined yet.
 *
 * Preset sets shipped by the build/deployment (see `~/util/presetCategories`)
 * are always appended as *available* sets, but are only active by default when
 * the user has no stored categorization of their own. A stored set with the
 * same id always wins over the preset definition, so user edits stick.
 */
export function loadCategories(): { sets: CategorySet[]; activeIds: string[] } {
  const settingsStore = useSettingsStore();
  const storedSets: CategorySet[] = settingsStore.category_sets;
  const storedActiveIds: string[] = settingsStore.active_set_ids;
  const presets = getPresetCategorySets();

  let sets: CategorySet[];
  let activeIds: string[];

  if (storedSets && storedSets.length > 0) {
    sets = [...storedSets];
    activeIds =
      storedActiveIds && storedActiveIds.length > 0 ? [...storedActiveIds] : [storedSets[0].id];
  } else if (presets.length > 0 && !settingsStore.hasStoredCategories) {
    // First run on a build that ships presets: activate the first preset only.
    //
    // We deliberately limit the initial selection to one set: syncToPrimarySet()
    // in the category store cannot split state.classes back into individual sets
    // when multiple sets are active, so it skips the sync entirely. Activating
    // more than one preset on first run would therefore cause any category edit
    // the user makes to be lost on the next reload.
    //
    // The remaining presets are still appended below and are available in the UI
    // for the user to activate manually.
    sets = [];
    activeIds = [presets[0].id];
  } else {
    // Migration path: no sets defined yet — wrap the existing flat classes into a "default" set
    const legacyClasses = settingsStore.classes || defaultCategories;
    sets = [{ id: DEFAULT_SET_ID, categories: legacyClasses }];
    activeIds = [DEFAULT_SET_ID];
  }

  // Presets are always offered as sets the user can switch to/combine,
  // unless a set with the same id is already stored (that one is authoritative).
  for (const preset of presets) {
    if (!sets.some(s => s.id === preset.id)) {
      sets.push(preset);
    }
  }

  // Never return a dangling or empty selection
  if (sets.length === 0) {
    sets = [{ id: DEFAULT_SET_ID, categories: defaultCategories }];
  }
  activeIds = activeIds.filter(id => sets.some(s => s.id === id));
  if (activeIds.length === 0) {
    activeIds = [sets[0].id];
  }

  return { sets, activeIds };
}

function pickDeepest(categories: Category[]) {
  return _.maxBy(categories, c => c.name.length);
}

// -- Pinned activities (roadmap 4.4e) ---------------------------------------
//
// When two rules both match an activity, the deepest category wins; two categories at
// the *same* depth were resolved by whichever happened to come first in the stored
// list, which from the owner's point of view is arbitrary. `priority` cannot fix that,
// because priority is a property of the *rule*, and so answers every collision between
// two rules identically and forever: rank Work above Fun and `YouTube Morphe` goes to
// Work along with `youtube G`.
//
// So the decision is keyed on the **activity**, not on the rules: "this app is Work",
// asked once per colliding label and remembered. A new colliding label is a new
// question.

/** The owner's answer to one collision: this exact activity label is this category. */
export interface CategoryPin {
  /** The activity label the question was about, matched exactly. */
  label: string;
  /** The category the owner chose, as a full name path. */
  category: string[];
  /** When it was decided -- shown in the pinned list, never used to rank. */
  decided_at?: string;
}

/**
 * Rank given to the synthetic rule a pin becomes when it is sent to the server-side
 * classifier. It has to beat any depth-derived rank (`depth * 10`) by a margin no real
 * category hierarchy could reach. Two pins can never compete with each other: each
 * matches one exact label and no other.
 */
export const PIN_PRIORITY = 1000000;

/** Escape a label so it can be used as a literal inside a regex. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Every category whose rule matches, in stored order. */
export function matchingCategories(
  str: string,
  categories: Category[],
  event?: IEvent
): Category[] {
  return categories
    .filter(c => c.rule && c.rule.type == 'regex')
    .filter(c => {
      // using 'm' flag to make `$` and `^` in rules work
      const re = RegExp(c.rule.regex, (c.rule.ignore_case ? 'i' : '') + 'm');
      const selectKeys = normalizeSelectKeys(c.rule.select_keys);
      if (event && selectKeys) {
        return selectKeys.some(key => {
          const value = event.data[key];
          return typeof value === 'string' && re.test(value);
        });
      }
      return re.test(str);
    });
}

/**
 * The matches that are actually competing for the win -- those at the greatest depth.
 * More than one means the winner would otherwise be decided by array order, which is
 * the collision this mechanism exists to answer.
 */
export function tiedCategories(matches: Category[]): Category[] {
  if (matches.length === 0) return [];
  const deepest = _.max(matches.map(c => c.name.length));
  return matches.filter(c => c.name.length === deepest);
}

/** The pin recorded for this exact label, if any. */
export function pinFor(label: string, pins?: CategoryPin[]): CategoryPin | undefined {
  if (!pins || pins.length === 0) return undefined;
  return pins.find(p => p.label === label);
}

/**
 * What a pin is doing right now.
 *
 * A pin only decides anything while its collision still exists. If the rules are later
 * edited so the label no longer ties -- or so the pinned category no longer matches it
 * at all -- the pin goes **inert**: it stops applying but is still listed, because an
 * override that silently keeps applying, or silently vanishes, is one the owner will
 * end up mistrusting the totals over.
 */
export function pinStatus(
  pin: CategoryPin,
  categories: Category[]
): { active: boolean; tied: Category[] } {
  const tied = tiedCategories(matchingCategories(pin.label, categories));
  const active = tied.length > 1 && tied.some(c => _.isEqual(c.name, pin.category));
  return { active, tied };
}

/** Only the pins that are still resolving a live collision. */
export function activePins(pins: CategoryPin[], categories: Category[]): CategoryPin[] {
  return (pins || []).filter(p => pinStatus(p, categories).active);
}

/**
 * The pins, expressed as rules the server-side classifier understands.
 *
 * The webui and aw-transform are two separate classifiers, and 4.4d is the standing
 * lesson about letting two screens answer the same question differently. So a pin is
 * not special-cased server-side: it is sent as an ordinary category rule that matches
 * one exact app label and carries a priority nothing else can reach. aw-query has
 * parsed `priority` on a rule since upstream #663; this is the first thing to send it.
 */
export function pinsForQuery(
  pins: CategoryPin[],
  categories: Category[]
): [string[], Rule & { priority: number }][] {
  return activePins(pins, categories).map(p => [
    p.category,
    {
      type: 'regex' as const,
      regex: '^' + escapeRegex(p.label) + '$',
      select_keys: ['app'],
      priority: PIN_PRIORITY,
    },
  ]);
}

/**
 * The collisions among a set of activity labels that the owner has not answered yet.
 * A label already pinned is never asked about again -- that is the whole point.
 */
export function unansweredConflicts(
  labels: string[],
  categories: Category[],
  pins?: CategoryPin[]
): { label: string; tied: Category[] }[] {
  const answered = new Set((pins || []).map(p => p.label));
  const seen = new Set<string>();
  const out: { label: string; tied: Category[] }[] = [];
  for (const label of labels) {
    if (!label || seen.has(label) || answered.has(label)) continue;
    seen.add(label);
    const tied = tiedCategories(matchingCategories(label, categories));
    if (tied.length > 1) out.push({ label, tied });
  }
  return out;
}

export function matchString(
  str: string,
  categories: Category[] | null,
  event?: IEvent,
  pins?: CategoryPin[]
): Category | null {
  if (!categories) {
    console.log(
      'Categories not passed, loading... (if you see this outside of a test, you should probably pass them)'
    );
    categories = loadClasses();
  }

  // Find the matching categories.
  // If several categories match the event, the deepest category will be chosen.
  const matchingCats = matchingCategories(str, categories, event);
  if (matchingCats.length === 0) return null;

  // If the owner answered this exact collision, their answer outranks depth -- but only
  // while the collision is still there to answer (see pinStatus).
  const pin = pinFor(str, pins);
  if (pin) {
    const tied = tiedCategories(matchingCats);
    if (tied.length > 1) {
      const chosen = tied.find(c => _.isEqual(c.name, pin.category));
      if (chosen) return chosen;
    }
  }
  return pickDeepest(matchingCats);
}

// this is used only in tests
export function classifyEvents(events: IEvent[], categories: Category[]): IEvent[] {
  const regexes: [Category, RegExp][] = categories
    .filter(c => c.rule.type == 'regex')
    .map(c => {
      const re = RegExp(c.rule.regex, c.rule.ignore_case ? 'i' : '');
      return [c, re];
    });

  return events.map((e: IEvent) => {
    const matchingCats = regexes.filter(([category, re]) => {
      const keys = normalizeSelectKeys(category.rule.select_keys) || CLASSIFY_KEYS;
      return keys.some(key => {
        const value = e.data[key];
        return typeof value === 'string' && re.test(value);
      });
    });
    e.data.$category =
      matchingCats.length > 0
        ? pickDeepest(matchingCats.map(([category]) => category)).name
        : UNCATEGORIZED;
    return e;
  });
}
