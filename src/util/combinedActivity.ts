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
  unresolved?: boolean;
  ignored?: boolean;
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
  cat_events: IEvent[];
  active_events: IEvent[];
  duration: number;
  /** Segments still awaiting a decision — what the view offers to send you to resolve. */
  unresolved_count: number;
  unresolved_seconds: number;
  /** How many devices actually contributed time. */
  device_count: number;
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

  // Category lookup is memoised: a day is hundreds of segments over a handful of
  // distinct apps, and matchString compiles regexes.
  const catCache = new Map<string, string[]>();
  const categoryOf = (label: string): string[] => {
    const hit = catCache.get(label);
    if (hit) return hit;
    const matched = matchString(label || '', classes, undefined, pins);
    const name = matched ? matched.name : ['Uncategorized'];
    catCache.set(label, name);
    return name;
  };

  const app_events = topBy(
    counted,
    s => s.label || 'unknown',
    (app, seconds) => ({ app, $duration: seconds })
  );

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

  return {
    app_events,
    cat_events,
    active_events,
    // The server's own figure, not a re-sum of the rows: it is truncated once rather
    // than per block, which is the difference roadmap 4.5b had to fix.
    duration: res.combined_seconds ?? 0,
    unresolved_count: unresolved.length,
    unresolved_seconds: unresolved.reduce((a, s) => a + s.seconds, 0),
    device_count: new Set(counted.map(s => s.device)).size,
  };
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
 *  - **A combined segment's label is the app name alone.** The pipeline decides which
 *    *device* counted for a stretch of time, not which window, so titles, browser
 *    domains/URLs and editor files have no combined answer at all.
 *  - **Some visualizations read a host's raw buckets directly** (the sunburst clock, the
 *    chronological timeline), and the combined host owns no buckets.
 *
 * `timeline_barchart` is here for a third and softer reason: it needs category time
 * bucketed per sub-period, which means one combined request per period rather than one.
 * That is worth building; it is just not built.
 *
 * Shared between the visualization's own availability flag and the view-tab filter, so a
 * tab whose every panel would say "(no data)" does not appear at all — three dead tabs is
 * exactly the "too much on the UI" the combined view exists to avoid.
 */
export const COMBINED_UNAVAILABLE_TYPES = new Set([
  'top_titles',
  'top_bundle_ids',
  'top_domains',
  'top_urls',
  'top_browser_titles',
  'top_editor_files',
  'top_editor_languages',
  'top_editor_projects',
  'top_stopwatches',
  'sunburst_clock',
  'vis_timeline',
  'timeline_barchart',
]);

/** Whether a view has anything at all to show on the combined day. */
export function viewHasCombinedContent(view: { elements?: { type: string }[] }): boolean {
  const els = view?.elements || [];
  if (els.length === 0) return true; // an empty view is the owner's to fill
  return els.some(e => !COMBINED_UNAVAILABLE_TYPES.has(e.type));
}
