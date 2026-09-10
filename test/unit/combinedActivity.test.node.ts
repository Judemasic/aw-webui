import {
  COMBINED_HOST,
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

  it('defaults to midnight when no offset is given', () => {
    expect(new Date(dayBounds('2026-09-10', '').start).getHours()).toBe(0);
  });
});

describe('COMBINED_HOST', () => {
  it('is a stable sentinel the route and the nav both use', () => {
    expect(COMBINED_HOST).toBe('combined');
  });
});
