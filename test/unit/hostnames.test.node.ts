import {
  preferKnownHostnames,
  selectSoleKnownHostname,
  categoryBuilderHostnameEmptyKind,
  activityViewsFromBuckets,
} from '~/util/hostnames';

describe('preferKnownHostnames', () => {
  test('moves unknown to the end when a known host exists', () => {
    expect(preferKnownHostnames(['unknown', 'laptop_ori'])).toEqual(['laptop_ori', 'unknown']);
  });

  test('preserves the original order for known hosts', () => {
    expect(preferKnownHostnames(['desktop', 'laptop', 'unknown'])).toEqual([
      'desktop',
      'laptop',
      'unknown',
    ]);
  });

  test('keeps unknown when it is the only host', () => {
    expect(preferKnownHostnames(['unknown'])).toEqual(['unknown']);
  });
});

describe('selectSoleKnownHostname', () => {
  test('returns the only non-unknown host', () => {
    expect(selectSoleKnownHostname(['laptop'])).toBe('laptop');
  });

  test('returns the only known host even when unknown is also present', () => {
    expect(selectSoleKnownHostname(['unknown', 'laptop'])).toBe('laptop');
  });

  test('returns undefined when several known hosts exist', () => {
    expect(selectSoleKnownHostname(['laptop', 'desktop'])).toBeUndefined();
  });

  test('returns undefined when hosts is empty', () => {
    expect(selectSoleKnownHostname([])).toBeUndefined();
  });

  test('returns undefined when only unknown exists', () => {
    expect(selectSoleKnownHostname(['unknown'])).toBeUndefined();
  });

  test('ignores empty/falsy host strings', () => {
    expect(selectSoleKnownHostname(['', undefined as unknown as string, 'laptop'])).toBe('laptop');
  });
});

describe('categoryBuilderHostnameEmptyKind', () => {
  test('is null when a hostname is already selected', () => {
    expect(categoryBuilderHostnameEmptyKind(['laptop'], 'laptop')).toBeNull();
  });

  test('is no-hosts when there are no hosts at all', () => {
    expect(categoryBuilderHostnameEmptyKind([], undefined)).toBe('no-hosts');
  });

  test('is hostname-unselected when hosts exist but none is chosen', () => {
    expect(categoryBuilderHostnameEmptyKind(['laptop', 'desktop'], undefined)).toBe(
      'hostname-unselected'
    );
  });

  test('is hostname-unselected when only unknown is listed', () => {
    expect(categoryBuilderHostnameEmptyKind(['unknown'], undefined)).toBe('hostname-unselected');
  });

  test('treats empty string hostname as unselected when hosts exist', () => {
    expect(categoryBuilderHostnameEmptyKind(['laptop'], '')).toBe('hostname-unselected');
  });
});

describe('activityViewsFromBuckets', () => {
  const win = (hostname: string, id = 'aw-watcher-window') => ({
    id,
    type: 'currentwindow',
    hostname,
  });

  it('lists a host that has window data', () => {
    const views = activityViewsFromBuckets([win('laptop')]);
    expect(views.map(v => [v.hostname, v.type, v.icon])).toEqual([
      ['laptop', 'default', 'desktop'],
    ]);
  });

  it('marks an android host as android', () => {
    const views = activityViewsFromBuckets([win('phone', 'aw-watcher-android')]);
    expect(views[0].type).toBe('android');
    expect(views[0].name).toBe('phone (Android)');
    expect(views[0].pathUrl).toBe('/activity/phone');
  });

  it('does not list a host whose only bucket is a stopwatch', () => {
    // The real case: aw-stopwatch is created by aw-webui, not a watcher, and on Android
    // it carried the device's UUID rather than its name. Synced across, it put a machine
    // that never existed into the other device's Activity menu.
    const views = activityViewsFromBuckets([
      { id: 'aw-stopwatch-synced-from-7b54cfe9', type: 'general.stopwatch', hostname: '7b54cfe9' },
    ]);
    expect(views).toEqual([]);
  });

  it('still lists a real host that also happens to have a stopwatch', () => {
    const views = activityViewsFromBuckets([
      win('laptop'),
      { id: 'aw-stopwatch', type: 'general.stopwatch', hostname: 'laptop' },
    ]);
    expect(views.map(v => v.hostname)).toEqual(['laptop']);
  });

  it('does not list an afk-only host', () => {
    // An afk bucket with no window bucket cannot answer "what did I do".
    expect(
      activityViewsFromBuckets([{ id: 'aw-watcher-afk', type: 'afkstatus', hostname: 'x' }])
    ).toEqual([]);
  });

  it("still excludes 'unknown' when it somehow has window data", () => {
    expect(activityViewsFromBuckets([win('unknown')])).toEqual([]);
  });

  it('keeps an android host named unknown, as it always did', () => {
    // The android branch never checked the name; preserved deliberately rather than
    // tightened as a side effect of this fix.
    expect(activityViewsFromBuckets([win('unknown', 'aw-watcher-android')])).toHaveLength(1);
  });

  it('survives junk', () => {
    expect(activityViewsFromBuckets([])).toEqual([]);
    expect(activityViewsFromBuckets(null as any)).toEqual([]);
    expect(activityViewsFromBuckets([null as any, { id: 'a', type: 'b', hostname: '' }])).toEqual(
      []
    );
  });
});
