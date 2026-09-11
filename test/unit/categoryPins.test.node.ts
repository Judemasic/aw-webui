/**
 * Roadmap 4.4e — how two rules that both match are resolved.
 *
 * Depth settles most collisions. What it cannot settle is two categories at the *same*
 * depth: `_.maxBy` returns the first element holding the maximum, so the winner was the
 * stored array order — arbitrary from the owner's point of view, and invisible. A pin
 * answers one collision for one activity label, and nothing else.
 */
import {
  CategoryPin,
  PIN_PRIORITY,
  activePins,
  matchString,
  matchingCategories,
  pinStatus,
  pinsForQuery,
  tiedCategories,
  unansweredConflicts,
} from '~/util/classes';

// Two siblings at depth 0 that both match anything containing "youtube". This is the
// owner's own example: Fun and Work, neither deeper than the other.
const SIBLINGS = [
  { name: ['Fun'], rule: { type: 'regex' as const, regex: 'youtube', ignore_case: true } },
  { name: ['Work'], rule: { type: 'regex' as const, regex: 'youtube', ignore_case: true } },
];

describe('detecting the tie', () => {
  it('reports both siblings as tied', () => {
    const tied = tiedCategories(matchingCategories('youtube G', SIBLINGS));
    expect(tied.map(c => c.name[0]).sort()).toEqual(['Fun', 'Work']);
  });

  it('is not a tie when one match is deeper', () => {
    const cats = [
      { name: ['Media'], rule: { type: 'regex' as const, regex: 'youtube', ignore_case: true } },
      {
        name: ['Media', 'Fun'],
        rule: { type: 'regex' as const, regex: 'youtube', ignore_case: true },
      },
    ];
    const tied = tiedCategories(matchingCategories('youtube G', cats));
    expect(tied.map(c => c.name.join('>'))).toEqual(['Media>Fun']);
  });

  it('lists only unanswered collisions, once per label', () => {
    const pins: CategoryPin[] = [{ label: 'YouTube Morphe', category: ['Fun'] }];
    const conflicts = unansweredConflicts(
      ['YouTube Morphe', 'youtube G', 'youtube G', 'Firefox'],
      SIBLINGS,
      pins
    );
    expect(conflicts.map(c => c.label)).toEqual(['youtube G']);
  });
});

describe('a pin answers one label, not the rule pair', () => {
  it('applies to the pinned label', () => {
    const pins: CategoryPin[] = [{ label: 'youtube G', category: ['Work'] }];
    expect(matchString('youtube G', SIBLINGS, undefined, pins).name).toEqual(['Work']);
  });

  it('leaves a different colliding label alone', () => {
    // The whole reason `priority` is not the answer: pinning "youtube G" to Work must
    // not drag "YouTube Morphe" along with it.
    const pins: CategoryPin[] = [{ label: 'youtube G', category: ['Work'] }];
    expect(matchString('YouTube Morphe', SIBLINGS, undefined, pins).name).toEqual(['Fun']);
  });

  it('does nothing without pins', () => {
    // Array order decides, as it always has — the behaviour this step makes visible
    // rather than changes.
    expect(matchString('youtube G', SIBLINGS).name).toEqual(['Fun']);
  });

  it('never invents a category that does not match', () => {
    const pins: CategoryPin[] = [{ label: 'youtube G', category: ['Sleep'] }];
    expect(matchString('youtube G', SIBLINGS, undefined, pins).name).toEqual(['Fun']);
  });
});

describe('a pin goes inert rather than silently applying forever', () => {
  const pin: CategoryPin = { label: 'youtube G', category: ['Work'] };

  it('is active while the collision exists', () => {
    expect(pinStatus(pin, SIBLINGS).active).toBe(true);
  });

  it('stops applying once the rules no longer collide', () => {
    const noLongerColliding = [
      SIBLINGS[0],
      { name: ['Work'], rule: { type: 'regex' as const, regex: 'gitlab' } },
    ];
    expect(pinStatus(pin, noLongerColliding).active).toBe(false);
    expect(matchString('youtube G', noLongerColliding, undefined, [pin]).name).toEqual(['Fun']);
  });

  it('is still listed when inert, so it can be found and removed', () => {
    const noLongerColliding = [
      SIBLINGS[0],
      { name: ['Work'], rule: { type: 'regex' as const, regex: 'gitlab' } },
    ];
    // activePins is what gets *applied*; the stored list is what gets *shown*.
    expect(activePins([pin], noLongerColliding)).toEqual([]);
    expect(pinStatus(pin, noLongerColliding).tied.map(c => c.name[0])).toEqual(['Fun']);
  });
});

describe('the server-side classifier is given the same answer', () => {
  const pins: CategoryPin[] = [{ label: 'youtube G', category: ['Work'] }];

  it('sends a pin as an exact-match rule outranking every depth', () => {
    const rules = pinsForQuery(pins, SIBLINGS);
    expect(rules).toHaveLength(1);
    const [category, rule] = rules[0];
    expect(category).toEqual(['Work']);
    expect(rule.regex).toBe('^youtube G$');
    expect(rule.select_keys).toEqual(['app']);
    expect(rule.priority).toBe(PIN_PRIORITY);
    // Exact, so it cannot reach the other colliding label.
    expect(new RegExp(rule.regex).test('YouTube Morphe')).toBe(false);
    expect(new RegExp(rule.regex).test('youtube G')).toBe(true);
  });

  it('escapes regex metacharacters in the label', () => {
    const tricky = [
      { name: ['Fun'], rule: { type: 'regex' as const, regex: 'c\\+\\+' } },
      { name: ['Work'], rule: { type: 'regex' as const, regex: 'c\\+\\+' } },
    ];
    const [[, rule]] = pinsForQuery([{ label: 'c++ (dev)', category: ['Work'] }], tricky);
    expect(new RegExp(rule.regex).test('c++ (dev)')).toBe(true);
    expect(new RegExp(rule.regex).test('cc (dev)')).toBe(false);
  });

  it('sends nothing for a pin whose collision is gone', () => {
    const noLongerColliding = [
      SIBLINGS[0],
      { name: ['Work'], rule: { type: 'regex' as const, regex: 'gitlab' } },
    ];
    expect(pinsForQuery(pins, noLongerColliding)).toEqual([]);
  });
});
