import {
  COMBINED_HOST,
  COMBINED_UNAVAILABLE_TYPES,
  combinedBrowser,
  combinedByPeriod,
  combinedEditor,
  combinedStopwatch,
  combinedToActivity,
  dayBounds,
  CombinedTimelineResponse,
} from '~/util/combinedActivity';

const classes: any = [
  { name: ['Work'], rule: { type: 'regex', regex: 'vim|Ghidra' }, data: { color: '#A5D6A7' } },
  { name: ['Comms'], rule: { type: 'regex', regex: 'Slack' }, data: { color: '#80CBC4' } },
];

const seg = (o: any) => ({
  start: '2026-09-10T09:00:00Z',
  end: '2026-09-10T09:10:00Z',
  seconds: 600,
  label: 'vim',
  device: 'phone',
  ...o,
});

const res = (combined: any[], seconds?: number): CombinedTimelineResponse => ({
  combined,
  combined_seconds: seconds ?? combined.reduce((a, s) => a + s.seconds, 0),
});

describe('combinedToActivity', () => {
  it('sums an app across the day, biggest first', () => {
    const out = combinedToActivity(
      res([
        seg({ label: 'vim', seconds: 300 }),
        seg({ label: 'Slack', seconds: 400 }),
        seg({ label: 'vim', seconds: 600 }),
      ]),
      classes
    );
    expect(out.app_events.map(e => [e.data.app, e.duration])).toEqual([
      ['vim', 900],
      ['Slack', 400],
    ]);
  });

  it('groups by category, not by app', () => {
    const out = combinedToActivity(
      res([seg({ label: 'vim', seconds: 300 }), seg({ label: 'Ghidra', seconds: 300 })]),
      classes
    );
    // Both are Work, so the category list has one entry holding both.
    const work = out.cat_events.find(e => e.data.$category.join('>') === 'Work');
    expect(work.duration).toBe(600);
  });

  it('calls an unmatched app Uncategorized rather than dropping it', () => {
    const out = combinedToActivity(res([seg({ label: 'SomethingElse' })]), classes);
    expect(out.cat_events[0].data.$category).toEqual(['Uncategorized']);
  });

  it('leaves ignored time out of every breakdown', () => {
    // "This counts as nothing" has to mean nothing everywhere, or the parts stop
    // adding up to the total the server reports.
    const out = combinedToActivity(
      res([seg({ label: 'vim', seconds: 300 }), seg({ label: 'Slack', ignored: true })], 300),
      classes
    );
    expect(out.app_events.map(e => e.data.app)).toEqual(['vim']);
    expect(out.duration).toBe(300);
  });

  it("takes the day's total from the server, not by re-summing rows", () => {
    // The server truncates once; summing the per-row integers loses a second every
    // time smoothing joined two blocks. Roadmap 4.5b.
    const out = combinedToActivity(
      res([seg({ seconds: 100 }), seg({ seconds: 100 })], 201),
      classes
    );
    expect(out.duration).toBe(201);
  });

  it('counts what is still unanswered, ignoring what was dropped', () => {
    const out = combinedToActivity(
      res([
        seg({ unresolved: true, seconds: 60 }),
        seg({ unresolved: true, seconds: 120 }),
        seg({ unresolved: true, ignored: true, seconds: 999 }),
        seg({ seconds: 60 }),
      ]),
      classes
    );
    expect(out.unresolved_count).toBe(2);
    expect(out.unresolved_seconds).toBe(180);
  });

  it('counts the devices that actually contributed', () => {
    const out = combinedToActivity(
      res([seg({ device: 'a' }), seg({ device: 'b' }), seg({ device: 'a' })]),
      classes
    );
    expect(out.device_count).toBe(2);
  });

  it('survives an empty day', () => {
    const out = combinedToActivity({ combined: [], combined_seconds: 0 }, classes);
    expect(out.app_events).toEqual([]);
    expect(out.duration).toBe(0);
    expect(out.device_count).toBe(0);
  });
});

describe('dayBounds', () => {
  it('honours the start-of-day offset and spans exactly one day', () => {
    const { start, end } = dayBounds('2026-09-10', '04:00');
    expect(new Date(end).getTime() - new Date(start).getTime()).toBe(24 * 3600 * 1000);
    expect(new Date(start).getHours()).toBe(4);
  });

  it('starts a day at the offset, not at midnight', () => {
    // The bug this exists to stop: Combined used a plain startOf('day') while Activity
    // used the offset, so the same date meant two different 24-hour windows and the two
    // screens disagreed about the day's total and its unanswered count.
    expect(new Date(dayBounds('2026-09-10', '06:30').start).getHours()).toBe(6);
    expect(new Date(dayBounds('2026-09-10', '06:30').start).getMinutes()).toBe(30);
  });

  it('spans exactly one day whatever the offset', () => {
    for (const off of ['00:00', '03:00', '04:00', '12:00', '23:00']) {
      const { start, end } = dayBounds('2026-09-10', off);
      expect(new Date(end).getTime() - new Date(start).getTime()).toBe(24 * 3600 * 1000);
    }
  });
});

describe('COMBINED_HOST', () => {
  it('is a stable sentinel the route and the nav both use', () => {
    expect(COMBINED_HOST).toBe('combined');
  });
});

describe('combinedByPeriod', () => {
  // Hours of a 04:00-offset day, as the store's subPeriodsOf writes them.
  const hours = (from: number, to: number) =>
    Array.from({ length: to - from }, (_, i) => {
      const h = String(from + i).padStart(2, '0');
      const next = String(from + i + 1).padStart(2, '0');
      return `2026-09-10T${h}:00:00Z/2026-09-10T${next}:00:00Z`;
    });

  it('puts a segment in the hour it happened in', () => {
    const out = combinedByPeriod(res([seg({ seconds: 600 })]), hours(8, 11), classes);
    const secondsIn = (p: string) => out[p].cat_events.reduce((a, e) => a + e.duration, 0);
    expect(secondsIn(hours(9, 10)[0])).toBeCloseTo(600);
    expect(secondsIn(hours(8, 9)[0])).toBe(0);
  });

  it('splits a segment that spans an hour boundary, rather than picking a side', () => {
    // 09:50 -> 10:10, twenty minutes, ten of them in each hour.
    const out = combinedByPeriod(
      res([
        seg({
          start: '2026-09-10T09:50:00Z',
          end: '2026-09-10T10:10:00Z',
          seconds: 1200,
        }),
      ]),
      hours(9, 11),
      classes
    );
    const secondsIn = (p: string) => out[p].cat_events.reduce((a, e) => a + e.duration, 0);
    expect(secondsIn(hours(9, 10)[0])).toBeCloseTo(600);
    expect(secondsIn(hours(10, 11)[0])).toBeCloseTo(600);
  });

  it('keeps the bars summing to the day total', () => {
    // The property that matters: whatever the boundaries do to individual segments,
    // the chart and the day's "Time active" figure have to agree.
    const day = res([
      seg({ start: '2026-09-10T08:30:00Z', end: '2026-09-10T09:30:00Z', seconds: 3600 }),
      seg({
        start: '2026-09-10T09:30:00Z',
        end: '2026-09-10T11:45:00Z',
        seconds: 8100,
        label: 'Slack',
      }),
      seg({ start: '2026-09-10T11:45:00Z', end: '2026-09-10T12:00:00Z', seconds: 900 }),
    ]);
    const out = combinedByPeriod(day, hours(0, 24), classes);
    const total = Object.values(out)
      .flatMap(p => p.cat_events)
      .reduce((a, e) => a + e.duration, 0);
    expect(total).toBeCloseTo(day.combined_seconds);
  });

  it('leaves ignored time out of every bar', () => {
    const out = combinedByPeriod(
      res([seg({ seconds: 600, ignored: true }), seg({ seconds: 300 })]),
      hours(9, 10),
      classes
    );
    expect(out[hours(9, 10)[0]].cat_events.reduce((a, e) => a + e.duration, 0)).toBeCloseTo(300);
  });

  it('stacks a bar by category, biggest first', () => {
    const out = combinedByPeriod(
      res([seg({ label: 'Slack', seconds: 300 }), seg({ label: 'vim', seconds: 900 })]),
      hours(9, 10),
      classes
    );
    expect(out[hours(9, 10)[0]].cat_events.map(e => e.data.$category)).toEqual([
      ['Work'],
      ['Comms'],
    ]);
  });

  it('keeps an empty period rather than dropping it, so bar n stays under label n', () => {
    const out = combinedByPeriod(res([seg({ seconds: 600 })]), hours(8, 11), classes);
    expect(Object.keys(out)).toEqual(hours(8, 11));
    expect(out[hours(8, 9)[0]].cat_events).toEqual([]);
  });

  it('survives a day with no segments at all', () => {
    const out = combinedByPeriod({ combined: [], combined_seconds: 0 }, hours(0, 24), classes);
    expect(Object.keys(out)).toHaveLength(24);
    expect(Object.values(out).every(p => p.cat_events.length === 0)).toBe(true);
  });

  it('no longer marks the barchart unavailable on the combined day', () => {
    expect(COMBINED_UNAVAILABLE_TYPES.has('timeline_barchart')).toBe(false);
    // The ones that stay unavailable do so for a reason the segments cannot fix: both of these
    // read a host's raw buckets directly, and the combined host owns none.
    expect(COMBINED_UNAVAILABLE_TYPES.has('top_titles')).toBe(true);
    expect(COMBINED_UNAVAILABLE_TYPES.has('sunburst_clock')).toBe(true);
  });

  it('no longer marks browser, editor and the clock unavailable', () => {
    // Roadmap 4.10c: these come out of the same response now, masked by the time each device
    // actually won.
    for (const type of [
      'top_domains',
      'top_urls',
      'top_browser_titles',
      'top_editor_files',
      'top_editor_languages',
      'top_editor_projects',
      'top_stopwatches',
    ]) {
      expect(COMBINED_UNAVAILABLE_TYPES.has(type)).toBe(false);
    }
  });
});

describe('per-screen rows on the combined day (roadmap 4.4i)', () => {
  const withScreen = (o: any) =>
    seg({ detail: { app: o.label || 'vim', classname: o.classname }, ...o });

  it('splits one app into the screens inside it', () => {
    const out = combinedToActivity(
      res([
        withScreen({
          label: 'WhatsApp',
          classname: 'com.whatsapp.home.ui.HomeActivity',
          seconds: 600,
        }),
        withScreen({
          label: 'WhatsApp',
          classname: 'com.whatsapp.calling.ui.VoipActivityV2',
          seconds: 1080,
        }),
        withScreen({
          label: 'WhatsApp',
          classname: 'com.whatsapp.home.ui.HomeActivity',
          seconds: 300,
        }),
      ]),
      classes
    );
    expect(out.title_events.map(e => [e.data.app, e.data.classname, e.duration])).toEqual([
      ['WhatsApp', 'com.whatsapp.calling.ui.VoipActivityV2', 1080],
      ['WhatsApp', 'com.whatsapp.home.ui.HomeActivity', 900],
    ]);
    // The app total is unchanged: screens are a breakdown of it, not extra time.
    expect(out.app_events.map(e => e.duration)).toEqual([1980]);
  });

  it('has no rows at all for a day whose devices report no screen', () => {
    // A desktop-only combined day. No panel is the right answer; an empty one would read as
    // "you opened no screens", which is a claim about the day rather than about the data.
    const out = combinedToActivity(res([seg({ seconds: 600 })]), classes);
    expect(out.title_events).toEqual([]);
  });

  it('leaves ignored time out of the screens too', () => {
    const out = combinedToActivity(
      res([
        withScreen({
          label: 'WhatsApp',
          classname: 'com.whatsapp.Conversation',
          seconds: 600,
          ignored: true,
        }),
        withScreen({ label: 'WhatsApp', classname: 'com.whatsapp.Conversation', seconds: 60 }),
      ]),
      classes
    );
    expect(out.title_events.map(e => e.duration)).toEqual([60]);
  });

  it('no longer marks the screens panel unavailable on the combined day', () => {
    expect(COMBINED_UNAVAILABLE_TYPES.has('top_bundle_ids')).toBe(false);
    // Titles stay unavailable: on Android a title is the app name by construction (4.4f).
    expect(COMBINED_UNAVAILABLE_TYPES.has('top_titles')).toBe(true);
  });
});

describe('per-screen rows after the coarser merge (roadmap 4.5c)', () => {
  it('sums the shares of a block rather than crediting its dominant screen', () => {
    // One block of Photos that went Home -> Story -> Home. Before 4.5c this arrived as three
    // blocks; now it is one, and all 215s would land on Home if `shares` were ignored.
    const out = combinedToActivity(
      res([
        seg({
          label: 'Photos',
          seconds: 215,
          detail: { app: 'Photos', classname: 'HomeActivity' },
          shares: [
            { detail: { app: 'Photos', classname: 'HomeActivity' }, seconds: 200 },
            { detail: { app: 'Photos', classname: 'StoryViewActivity' }, seconds: 15 },
          ],
        }),
      ]),
      classes
    );
    expect(out.title_events.map(e => [e.data.classname, e.duration])).toEqual([
      ['HomeActivity', 200],
      ['StoryViewActivity', 15],
    ]);
  });

  it('falls back to the screen on the block itself when no shares arrived', () => {
    // A response from a server that predates 4.5c must still fill the panel.
    const out = combinedToActivity(
      res([seg({ label: 'Photos', seconds: 60, detail: { classname: 'HomeActivity' } })]),
      classes
    );
    expect(out.title_events.map(e => [e.data.app, e.data.classname, e.duration])).toEqual([
      ['Photos', 'HomeActivity', 60],
    ]);
  });

  it('adds the screens of one app up across separate blocks', () => {
    const out = combinedToActivity(
      res([
        seg({
          label: 'Photos',
          seconds: 30,
          shares: [{ detail: { classname: 'HomeActivity' }, seconds: 30 }],
        }),
        seg({
          label: 'Photos',
          seconds: 20,
          shares: [{ detail: { classname: 'HomeActivity' }, seconds: 20 }],
        }),
      ]),
      classes
    );
    expect(out.title_events.map(e => e.duration)).toEqual([50]);
  });

  it('says nothing at all on a day with no screens', () => {
    const out = combinedToActivity(res([seg({ label: 'vim', seconds: 60 })]), classes);
    expect(out.title_events).toEqual([]);
  });
});

describe('what the exclusion rules ate (roadmap 4.6b)', () => {
  it('sums the blocks a rule emptied, per category', () => {
    const out = combinedToActivity(
      res([
        seg({ label: 'vim', seconds: 600 }),
        seg({ label: 'Slack', seconds: 100, ignored: true, not_counted: true }),
        seg({ label: 'Slack', seconds: 50, ignored: true, not_counted: true }),
      ]),
      classes
    );
    expect(out.not_counted).toEqual([{ name: ['Comms'], seconds: 150 }]);
  });

  it('does not count a block the owner answered "I was away" about', () => {
    // That is a decision, not a rule, and it has its own undo. Mixing the two would offer to
    // revoke a rule that was never what stopped this block counting.
    const out = combinedToActivity(
      res([seg({ label: 'Slack', seconds: 100, ignored: true })]),
      classes
    );
    expect(out.not_counted).toEqual([]);
  });

  it('counts an excluded sliver that smoothing drew inside a block that counts', () => {
    // Roadmap 4.5d. The block is vim, it counts, and its own `seconds` is 600 -- but drawn inside
    // it are 30 seconds of Slack that a rule excludes. Reading the block would report the rule as
    // eating nothing at all; the shares carry the verdict with the seconds.
    const out = combinedToActivity(
      res([
        seg({
          label: 'vim',
          seconds: 600,
          shares: [
            { label: 'vim', seconds: 600 },
            { label: 'Slack', seconds: 30, not_counted: true },
          ],
        }),
      ]),
      classes
    );
    expect(out.not_counted).toEqual([{ name: ['Comms'], seconds: 30 }]);
  });

  it('still ignores an answered block when it carries shares', () => {
    // `ignored` without `not_counted` is the owner saying "I was away", which has its own undo.
    // The shares path must not quietly start listing those as a revocable rule.
    const out = combinedToActivity(
      res([
        seg({
          label: 'Slack',
          seconds: 0,
          ignored: true,
          shares: [{ label: 'Slack', seconds: 100, not_counted: true }],
        }),
      ]),
      classes
    );
    expect(out.not_counted).toEqual([]);
  });

  it('does not count time an excluded app merely competed for', () => {
    // The block still counts -- the launcher simply stopped being a competitor for it -- so the
    // rule is not eating this time and must not be shown as if it were.
    const out = combinedToActivity(
      res([seg({ label: 'vim', seconds: 600, excluded_labels: ['One UI Home'] })]),
      classes
    );
    expect(out.not_counted).toEqual([]);
  });
});

describe('per-window rows on a desktop combined day', () => {
  // A desktop has no Activity class and names the window instead. Taking `classname` alone meant
  // every desktop share was dropped and the panel vanished on a PC -- the data was always there.
  const withTitle = (o: any) =>
    seg({ detail: { app: o.label || 'Code.exe', title: o.title }, ...o });

  it('splits one app into the windows inside it', () => {
    const out = combinedToActivity(
      res([
        withTitle({ label: 'Code.exe', title: 'lib.rs', seconds: 600 }),
        withTitle({ label: 'Code.exe', title: 'main.rs', seconds: 1080 }),
        withTitle({ label: 'Code.exe', title: 'lib.rs', seconds: 300 }),
      ]),
      classes
    );
    expect(out.title_events.map(e => [e.data.app, e.data.title, e.duration])).toEqual([
      ['Code.exe', 'main.rs', 1080],
      ['Code.exe', 'lib.rs', 900],
    ]);
    expect(out.app_events.map(e => e.duration)).toEqual([1980]);
  });

  it('prefers the screen where a device reports both', () => {
    // A window title changes with every document; a screen does not, so it is the steadier name.
    const out = combinedToActivity(
      res([
        seg({
          label: 'WhatsApp',
          detail: { app: 'WhatsApp', classname: 'com.whatsapp.HomeActivity', title: 'Chats' },
          seconds: 60,
        }),
      ]),
      classes
    );
    expect(out.title_events.map(e => [e.data.classname, e.data.title])).toEqual([
      ['com.whatsapp.HomeActivity', undefined],
    ]);
  });

  it('carries a phone and a PC in the same day without merging them', () => {
    const out = combinedToActivity(
      res([
        seg({
          label: 'WhatsApp',
          detail: { app: 'WhatsApp', classname: 'com.whatsapp.HomeActivity' },
          seconds: 60,
        }),
        seg({ label: 'Code.exe', detail: { app: 'Code.exe', title: 'lib.rs' }, seconds: 120 }),
      ]),
      classes
    );
    expect(out.title_events.length).toBe(2);
    expect(out.title_events.map(e => e.data.app)).toEqual(['Code.exe', 'WhatsApp']);
  });
});

describe('what was inside the app on the combined day (roadmap 4.10c)', () => {
  const withDetails = (details: any): CombinedTimelineResponse => ({
    combined: [],
    combined_seconds: 0,
    details,
  });

  describe('browser', () => {
    const day = withDetails({
      'web.tab.current': [
        { data: { url: 'https://github.com/a', title: 'A' }, seconds: 100 },
        { data: { url: 'https://github.com/b', title: 'B' }, seconds: 50 },
        { data: { url: 'https://news.example/x', title: 'X' }, seconds: 200 },
      ],
    });

    it('adds URLs up into domains, biggest first', () => {
      const out = combinedBrowser(day);
      expect(out.domains.map(e => e.data.$domain)).toEqual(['news.example', 'github.com']);
      expect(out.domains.map(e => e.duration)).toEqual([200, 150]);
    });

    it('keeps each URL its own row, and colours it by its domain', () => {
      const out = combinedBrowser(day);
      expect(out.urls).toHaveLength(3);
      expect(out.urls[0].data.url).toBe('https://news.example/x');
      expect(out.urls[0].data.$domain).toBe('news.example');
    });

    it('carries $duration, which is what the summary panel reads', () => {
      expect(combinedBrowser(day).urls[0].data.$duration).toBe(200);
    });

    it('reports the day total as the sum of what it was given', () => {
      expect(combinedBrowser(day).duration).toBe(350);
    });

    it('sums the same page arriving from two devices into one row', () => {
      const out = combinedBrowser(
        withDetails({
          'web.tab.current': [
            { data: { url: 'https://same/page', title: 'T' }, seconds: 10 },
            { data: { url: 'https://same/page', title: 'T', $device: 'other' }, seconds: 5 },
          ],
        })
      );
      expect(out.urls).toHaveLength(1);
      expect(out.urls[0].duration).toBe(15);
    });

    it('does not fall over on a URL that is not one', () => {
      // A browser extension will happily record `about:blank` or a half-typed address, and one
      // bad row must not take the panel down with it.
      const out = combinedBrowser(
        withDetails({
          'web.tab.current': [
            { data: { url: 'about:blank', title: 'New tab' }, seconds: 7 },
            { data: { url: 'not a url at all' }, seconds: 3 },
            { data: { url: 'https://real.example/p' }, seconds: 5 },
          ],
        })
      );
      expect(out.domains.map(e => e.data.$domain)).toEqual(['real.example']);
      // Still counted where it can be: the URL list keeps all three.
      expect(out.urls).toHaveLength(3);
    });

    it('is empty, not broken, on a server that does not send details', () => {
      const out = combinedBrowser({ combined: [], combined_seconds: 0 });
      expect(out.urls).toEqual([]);
      expect(out.domains).toEqual([]);
      expect(out.duration).toBe(0);
    });
  });

  describe('editor', () => {
    const day = withDetails({
      'app.editor.activity': [
        { data: { file: 'a.rs', language: 'rust', project: 'aw' }, seconds: 60 },
        { data: { file: 'b.rs', language: 'rust', project: 'aw' }, seconds: 30 },
        { data: { file: 'c.ts', language: 'typescript', project: 'webui' }, seconds: 100 },
      ],
    });

    it('rolls files up into languages and projects', () => {
      const out = combinedEditor(day);
      expect(out.files.map(e => e.data.file)).toEqual(['c.ts', 'a.rs', 'b.rs']);
      expect(out.languages.map(e => [e.data.language, e.duration])).toEqual([
        ['typescript', 100],
        ['rust', 90],
      ]);
      expect(out.projects.map(e => e.data.project)).toEqual(['webui', 'aw']);
    });

    it('keeps the language on a file row, which is what colours it', () => {
      expect(combinedEditor(day).files[0].data.language).toBe('typescript');
    });

    it('drops a row whose key the watcher never recorded', () => {
      // A file with no project is not a project called "".
      const out = combinedEditor(
        withDetails({ 'app.editor.activity': [{ data: { file: 'x.rs' }, seconds: 10 }] })
      );
      expect(out.files).toHaveLength(1);
      expect(out.projects).toEqual([]);
      expect(out.languages).toEqual([]);
    });
  });

  describe('the clock', () => {
    it('adds two runs of the same timer together', () => {
      const out = combinedStopwatch(
        withDetails({
          'general.stopwatch': [
            { data: { label: 'reading' }, seconds: 300 },
            { data: { label: 'reading', running: false }, seconds: 120 },
            { data: { label: 'exercise' }, seconds: 600 },
          ],
        })
      );
      expect(out.stopwatch_events.map(e => [e.data.label, e.duration])).toEqual([
        ['exercise', 600],
        ['reading', 420],
      ]);
    });

    it('is empty on a day with no timers', () => {
      expect(combinedStopwatch({ combined: [], combined_seconds: 0 }).stopwatch_events).toEqual([]);
    });
  });
});
