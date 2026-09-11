const queries = require('~/queries');

// test data
const hostname = 'testhost';
const bid_window = 'aw-watcher-window_' + hostname;
const bid_afk = 'aw-watcher-afk_' + hostname;
const bid_browsers = [];
const filter_afk = true;
const always_active_pattern = /meow|nyaan|specials: \w(\\)/.toString().substring(1).slice(0, -1);
const queryParams = {
  bid_window,
  bid_afk,
  bid_browsers,
  filter_afk,
  categories: [],
  filter_categories: true,
  include_audible: true,
  always_active_pattern,
};

function expectBracketsClosed(query) {
  // Checks that there are matching parens, brackets, braces, etc
  // Doesn't actually check placement, just matching open/closed count.

  // parens
  const openParens = query.match(/\(/g);
  const closeParens = query.match(/\)/g);
  expect(openParens && openParens.length).toEqual(closeParens && closeParens.length);

  // brackets
  const openBrackets = query.match(/\[/g);
  const closeBrackets = query.match(/\]/g);
  expect(openBrackets && openBrackets.length).toEqual(closeBrackets && closeBrackets.length);

  // braces
  const openBraces = query.match(/\{/g);
  const closeBraces = query.match(/\}/g);
  expect(openBraces && openBraces.length).toEqual(closeBraces && closeBraces.length);
}

test('generate fullDesktopQuery', () => {
  let query = queries.fullDesktopQuery(queryParams).join('\n');
  expect(query).toMatchSnapshot();
  expectBracketsClosed(query);

  query = queries.activityQuery([bid_afk]).join('\n');
  expect(query).toMatchSnapshot();
  expectBracketsClosed(query);
});

describe('not-counted categories (roadmap 4.6)', () => {
  const excluded = [['Excluded'], ['Excluded', 'Launcher']];

  it('excludes them after categorising and before anything is summed', () => {
    const q = queries
      .fullDesktopQuery({ ...queryParams, not_counted_categories: excluded })
      .join('\n');
    const categorize = q.indexOf('categorize(');
    const exclude = q.indexOf('exclude_keyvals(events, "$category"');
    const sum = q.indexOf('sum_durations(');
    expect(categorize).toBeGreaterThan(-1);
    expect(exclude).toBeGreaterThan(categorize);
    expect(sum).toBeGreaterThan(exclude);
    expect(q).toContain(JSON.stringify(excluded));
  });

  it('adds nothing at all when nothing is excluded', () => {
    const q = queries.fullDesktopQuery(queryParams).join('\n');
    expect(q).not.toContain('exclude_keyvals');
    expect(
      queries.fullDesktopQuery({ ...queryParams, not_counted_categories: [] }).join('\n')
    ).not.toContain('exclude_keyvals');
  });

  it('excludes on Android too, where the day has no afk bucket to hide behind', () => {
    const q = queries.appQuery('aw-watcher-android_test', [], [], false, excluded).join('\n');
    expect(q).toContain('exclude_keyvals(events, "$category"');
  });
});
