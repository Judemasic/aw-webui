/**
 * Turning the combined timeline into the shape the Activity view already speaks.
 *
 * The Activity view answers *"what did I do today"* from one host's bucket queries. The
 * same question across every synced device is what the `aw-combined` pipeline was built
 * for: it segments the day, decides which device counts for each stretch, and never
 * credits the same second twice (**R6**). What it hands back is a flat list of segments
 * — a start, an end, an app label, the device that won.
 *
 * Rather than fork the Activity view, this turns those segments into the same
 * `IEvent[]` lists the desktop query produces, so every existing summary, chart and
 * sunburst works on combined data without knowing anything changed.
 *
 * **What this genuinely cannot give**, because the combined track does not carry it:
 * window titles, browser domains and URLs, and editor files. A combined segment's label
 * is the app name alone. Those panels have no combined answer and must be hidden rather
 * than shown empty — an empty "Top titles" reads as "you opened no windows", which is a
 * lie about the data rather than an absence of it.
 */
import moment from 'moment';
import { IEvent } from '~/util/interfaces';
import { Category, CategoryPin, matchString } from '~/util/classes';
import { get_day_start_with_offset } from '~/util/time';

/**
 * The `:host` value that means "every device at once".
 *
 * The Activity route is `/activity/:host/...`, and rather than add a parallel route tree
 * for the combined view, this reserves one host name. It costs a real host called
 * `combined` the ability to have its own Activity page, which is a trade worth making:
 * hostnames here come from watcher buckets, and nothing has ever been called this.
 */
export const COMBINED_HOST = 'combined';

/** One row of `GET /api/0/combined/timeline`'s `combined` array. */
export interface CombinedSegment {
  start: string;
  end: string;
  seconds: number;
  label: string;
  device: string;
  /**
   * The winning activity's own fields, beyond its name (roadmap 4.4i). On Android this carries
   * `classname` -- the screen inside the app. The **dominant** one: since 4.5c a block may span
   * several screens of one app, and this names the one that held it longest. Use {@link shares}
   * for the breakdown.
   */
  detail?: Record<string, any>;
  /**
   * Every distinct screen (or window title) inside this block, with the seconds it held, longest
   * first (roadmap 4.5c). Fractional seconds, and they sum to the block's own `seconds`.
   *
   * This exists because ⑥ coalesce was made *coarser*: it used to require the winning activity's
   * whole `data` map to be equal, which drew a single stretch of Photos as four blocks the moment
   * a story was opened and closed. Merging on the app fixes the day view, and would have cost the
   * per-screen panels their accuracy had the detail not moved here.
   */
  shares?: { detail?: Record<string, any>; label?: string; seconds: number }[];
  /**
   * Seconds inside this block's span that no watcher actually recorded — holes of a few
   * milliseconds (occasionally a second or two) that ⑥ and ⑦ drew over so that one stretch draws
   * as one block. Already excluded from `seconds`; carried so the view can explain the difference
   * between a block's span and its total.
   */
  bridged_seconds?: number;
  unresolved?: boolean;
  ignored?: boolean;
  /** Roadmap 4.6 — `ignored` because a category rule says this never counts, not because the
   *  owner answered a question about it. Always arrives alongside `ignored`. */
  not_counted?: boolean;
  /** The other activities that were running in this window (the losers of the pick). */
  background?: { device: string; label: string }[];
}

export interface CombinedTimelineResponse {
  combined: CombinedSegment[];
  combined_seconds: number;
  devices?: { device: string; seconds?: number; hostname?: string; is_own?: boolean }[];
}

export interface CombinedActivityResult {
  app_events: IEvent[];
  /**
   * Per-screen rows, `(app, classname)`, for the Top Screens panel -- the same shape a per-device
   * Android query's `title_events` has, so the panel needs no combined-specific branch.
   */
  title_events: IEvent[];
  cat_events: IEvent[];
  active_events: IEvent[];
  duration: number;
  /** Segments still awaiting a decision — what the view offers to send you to resolve. */
  unresolved_count: number;
  unresolved_seconds: number;
  /** How many devices actually contributed time. */
  device_count: number;
  /**
   * What the owner's *"do not count this"* rules ate, per category, biggest first (roadmap 4.6b).
   *
   * Free here, unlike on a per-device page: the combined response still *carries* the blocks a rule
   * emptied — they draw muted — so the figure is a sum over data already in hand rather than a
   * second query asking the inverse question.
   */
  not_counted: { name: string[]; seconds: number }[];
}

/** Sum by a key, biggest first — the ordering every "top N" list in Activity expects. */
function topBy<T>(
  segments: CombinedSegment[],
  keyOf: (s: CombinedSegment) => T | null,
  dataOf: (key: T, seconds: number) => Record<string, any>
): IEvent[] {
  const totals = new Map<string, { key: T; seconds: number; first: string }>();
  for (const s of segments) {
    const key = keyOf(s);
    if (key === null) continue;
    const id = JSON.stringify(key);
    const hit = totals.get(id);
    if (hit) hit.seconds += s.seconds;
    else totals.set(id, { key, seconds: s.seconds, first: s.start });
  }
  return Array.from(totals.values())
    .sort((a, b) => b.seconds - a.seconds)
    .map(t => ({
      timestamp: t.first,
      duration: t.seconds,
      data: dataOf(t.key, t.seconds),
    }));
}

/**
 * A memoised label -> category-name lookup.
 *
 * A day is hundreds of segments over a handful of distinct apps, and `matchString`
 * compiles regexes on every call, so the cache is what keeps slicing a day into 24 hours
 * from recompiling the whole rule set 24 times over.
 */
function categoryMatcher(classes: Category[], pins?: CategoryPin[]): (label: string) => string[] {
  const cache = new Map<string, string[]>();
  return (label: string): string[] => {
    const hit = cache.get(label);
    if (hit) return hit;
    const matched = matchString(label || '', classes, undefined, pins);
    const name = matched ? matched.name : ['Uncategorized'];
    cache.set(label, name);
    return name;
  };
}

/**
 * `(app, classname)` rows with exact seconds, summed over every block's {@link
 * CombinedSegment.shares}.
 *
 * Kept separate from {@link topBy} because it sums *within* a segment rather than over segments:
 * one block can contribute to three rows. Ordering matches `topBy`'s — biggest first — and each
 * row's timestamp is the first block it appeared in, which is the shape `aw-summary` expects.
 */
function screenRows(counted: CombinedSegment[]): IEvent[] {
  const totals = new Map<
    string,
    { app: string; classname: string; seconds: number; first: string }
  >();
  for (const s of counted) {
    const app = s.label || 'unknown';
    const shares =
      s.shares && s.shares.length > 0 ? s.shares : [{ detail: s.detail, seconds: s.seconds }];
    for (const share of shares) {
      const classname = (share.detail || {}).classname;
      if (!classname) continue;
      const id = JSON.stringify([app, classname]);
      const hit = totals.get(id);
      if (hit) hit.seconds += share.seconds;
      else
        totals.set(id, {
          app,
          classname: String(classname),
          seconds: share.seconds,
          first: s.start,
        });
    }
  }
  return Array.from(totals.values())
    .sort((a, b) => b.seconds - a.seconds)
    .map(t => ({
      timestamp: t.first,
      duration: t.seconds,
      data: { app: t.app, classname: t.classname, $duration: t.seconds },
    }));
}

/**
 * Build the Activity view's inputs from one day of combined segments.
 *
 * `ignored` segments are dropped throughout: an `ignore` decision means *"this time
 * counts as nothing"*, and the day's own total already excludes them, so counting them
 * in the app or category breakdown would make the parts disagree with the whole.
 */
export function combinedToActivity(
  res: CombinedTimelineResponse,
  classes: Category[],
  pins?: CategoryPin[]
): CombinedActivityResult {
  const all = res.combined || [];
  const counted = all.filter(s => !s.ignored);

  const categoryOf = categoryMatcher(classes, pins);

  const app_events = topBy(
    counted,
    s => s.label || 'unknown',
    (app, seconds) => ({ app, $duration: seconds })
  );

  // The screen inside the app, where the winning device recorded one. Desktop events have no
  // `classname`, so a day of desktop activity simply produces no rows here rather than a panel
  // full of blanks -- which is the difference between "this device does not report screens" and
  // "you used no screens".
  //
  // Summed from `shares`, not from each block's dominant screen: a block may now cover several
  // screens of one app, and crediting all of it to the longest would move time between rows. A
  // response from before 4.5c (or a block that somehow carries no shares) falls back to `detail`,
  // which is exactly what the block would have carried then.
  const title_events = screenRows(counted);

  const cat_events = topBy(
    counted,
    s => categoryOf(s.label),
    ($category, seconds) => ({ $category, $duration: seconds })
  );

  // The non-afk events the timeline strip and the "active time" figure are drawn from.
  // One per segment, in order, carrying no detail — the same shape query_window_completed
  // receives from a desktop query.
  const active_events: IEvent[] = counted.map(s => ({
    timestamp: s.start,
    duration: s.seconds,
    data: {},
  }));

  const unresolved = all.filter(s => s.unresolved && !s.ignored);

  // Blocks a *rule* emptied, not ones the owner answered "I was away" about: the two are different
  // things to see, and only the first belongs to a rule that can be revoked. `excluded_labels` on a
  // block that still counts is deliberately not added up here — that time is not being eaten, the
  // excluded app merely stopped being a competitor for it.
  const notCountedTotals = new Map<string, { name: string[]; seconds: number }>();
  for (const s of all) {
    if (!s.not_counted) continue;
    const name = categoryOf(s.label);
    const id = JSON.stringify(name);
    const hit = notCountedTotals.get(id);
    if (hit) hit.seconds += s.seconds;
    else notCountedTotals.set(id, { name, seconds: s.seconds });
  }

  return {
    app_events,
    title_events,
    cat_events,
    active_events,
    // The server's own figure, not a re-sum of the rows: it is truncated once rather
    // than per block, which is the difference roadmap 4.5b had to fix.
    duration: res.combined_seconds ?? 0,
    unresolved_count: unresolved.length,
    unresolved_seconds: unresolved.reduce((a, s) => a + s.seconds, 0),
    device_count: new Set(counted.map(s => s.device)).size,
    not_counted: Array.from(notCountedTotals.values()).sort((a, b) => b.seconds - a.seconds),
  };
}

/**
 * Category time per sub-period, sliced out of the segments the day already fetched
 * (roadmap 4.4g).
 *
 * The Timeline barchart wants one bar per hour of a day (or per day of a week), each bar
 * stacked by category. 4.4 assumed that meant one combined request per bar -- 24 runs of
 * the whole contention pipeline for a single day -- and shelved the chart as too
 * expensive. It is not: every segment already carries `start`, `end` and `seconds`, so
 * the bars are a slice of a response that has already arrived, and this costs **no extra
 * requests at all**.
 *
 * Two things it is careful about, both of which have gone wrong before here:
 *
 *  - **A segment that spans a boundary is split, not assigned.** A 20-minute stretch from
 *    09:50 to 10:10 puts 10 minutes in each hour. Handing the whole thing to one side
 *    moves time between bars and makes the chart disagree with the day's own total.
 *  - **The split is proportional to the segment's own `seconds`**, not recomputed from
 *    the timestamps. The server truncates a segment's duration once; re-deriving it from
 *    `end - start` would reintroduce, per bar, the rounding that roadmap 4.5b removed.
 *    Sliced this way a segment's pieces always add back up to exactly `seconds`.
 *
 * `periods` are `start/end` strings as `timeperiodToStr` writes them, so the boundaries
 * are whatever the caller's period arithmetic produced -- which honours the owner's
 * start-of-day, the correction 4.4d had to make. Periods with no activity are kept with
 * an empty list rather than dropped, so bar *n* stays under label *n*.
 *
 * `ignored` segments are left out of every bar, for the reason
 * {@link combinedToActivity} already gives: an ignored stretch counts as nothing, and the
 * day's total excludes it.
 */
export function combinedByPeriod(
  res: CombinedTimelineResponse,
  periods: string[],
  classes: Category[],
  pins?: CategoryPin[]
): Record<string, { cat_events: IEvent[] }> {
  const categoryOf = categoryMatcher(classes, pins);
  const bounds = periods.map(p => {
    const [start, end] = p.split('/');
    return { period: p, start: Date.parse(start), end: Date.parse(end) };
  });

  // One accumulator per period, keyed by the category's serialised name.
  const totals = bounds.map(() => new Map<string, { name: string[]; seconds: number }>());

  for (const s of res.combined || []) {
    if (s.ignored) continue;
    const segStart = Date.parse(s.start);
    const segEnd = Date.parse(s.end);
    const span = segEnd - segStart;
    if (!(span > 0) || !(s.seconds > 0)) continue;
    const name = categoryOf(s.label);
    const id = JSON.stringify(name);

    for (let i = 0; i < bounds.length; i++) {
      const overlap = Math.min(segEnd, bounds[i].end) - Math.max(segStart, bounds[i].start);
      if (overlap <= 0) continue;
      const seconds = (overlap / span) * s.seconds;
      const acc = totals[i];
      const hit = acc.get(id);
      if (hit) hit.seconds += seconds;
      else acc.set(id, { name, seconds });
    }
  }

  const out: Record<string, { cat_events: IEvent[] }> = {};
  bounds.forEach((b, i) => {
    out[b.period] = {
      cat_events: Array.from(totals[i].values())
        .sort((a, c) => c.seconds - a.seconds)
        .map(t => ({
          timestamp: new Date(b.start).toISOString(),
          duration: t.seconds,
          data: { $category: t.name },
        })),
    };
  });
  return out;
}

/**
 * The day's bounds for a `YYYY-MM-DD`, honouring the owner's start-of-day offset.
 *
 * Every screen in the app has to agree on where a day begins, or the same day shows two
 * different totals depending on which screen is asked. The Combined timeline used
 * `moment(date).startOf('day')` -- plain midnight -- while Activity, the Timeline and the
 * day nav all honour the `Start of day` setting, so with the owner's 04:00 the two
 * screens were asking for windows four hours apart and disagreeing about the day by
 * roughly half an hour of activity and two unanswered overlaps.
 *
 * Midnight is also the wrong answer on its own terms: the setting exists because a
 * session that runs past midnight belongs to the evening it started in.
 */
export function dayBounds(date: string, startOfDay: string): { start: string; end: string } {
  const start = moment(get_day_start_with_offset(moment(date, 'YYYY-MM-DD'), startOfDay));
  return { start: start.toISOString(), end: start.clone().add(1, 'day').toISOString() };
}

/**
 * Visualizations the combined day cannot answer.
 *
 * Two different reasons, both permanent-ish rather than unimplemented:
 *
 *  - **A combined segment names one device's activity.** The pipeline decides which *device*
 *    counted for a stretch of time, not which window, so browser domains/URLs and editor files
 *    have no combined answer at all -- they live in buckets the combined track never reads.
 *
 *    `top_bundle_ids` used to be here too, on the grounds that a segment "carries an app label
 *    and nothing finer". That stopped being true in 4.4i: the response now carries the winning
 *    activity's own fields, so Android's `classname` -- the screen inside the app -- reaches the
 *    combined day exactly. Since 4.5c the exactness comes from each block's `shares` rather than
 *    from one screen per block, which is strictly more accurate. `top_titles` stays listed because on Android a
 *    title *is* the app name (4.4f) and a desktop's real titles would make a panel that is
 *    populated on some days and empty on others for reasons the owner cannot see.
 *  - **Some visualizations read a host's raw buckets directly** (the sunburst clock, the
 *    chronological timeline), and the combined host owns no buckets.
 *
 * `timeline_barchart` used to be listed here for a third and softer reason -- it needs
 * category time bucketed per sub-period, and that was assumed to mean one combined
 * request per bar. It does not: {@link combinedByPeriod} slices the bars out of the
 * segments the day already has, so the chart is drawn rather than hidden (roadmap 4.4g).
 *
 * Shared between the visualization's own availability flag and the view-tab filter, so a
 * tab whose every panel would say "(no data)" does not appear at all — three dead tabs is
 * exactly the "too much on the UI" the combined view exists to avoid.
 */
export const COMBINED_UNAVAILABLE_TYPES = new Set([
  'top_titles',
  'top_domains',
  'top_urls',
  'top_browser_titles',
  'top_editor_files',
  'top_editor_languages',
  'top_editor_projects',
  'top_stopwatches',
  'sunburst_clock',
  'vis_timeline',
]);

/** Whether a view has anything at all to show on the combined day. */
export function viewHasCombinedContent(view: { elements?: { type: string }[] }): boolean {
  const els = view?.elements || [];
  if (els.length === 0) return true; // an empty view is the owner's to fill
  return els.some(e => !COMBINED_UNAVAILABLE_TYPES.has(e.type));
}
