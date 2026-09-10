import moment, { Moment, Duration } from 'moment';
import { useSettingsStore } from '~/stores/settings';

function getStartOfDayOffset() {
  const settingsStore = useSettingsStore();
  return settingsStore.startOfDay;
}

function normalize_date(dateParam: Date) {
  return new Date(dateParam.getTime());
}

export function seconds_to_duration(seconds: number) {
  // Returns a human-readable duration string
  const hrs = Math.floor(seconds / 60 / 60);
  const min = Math.floor((seconds / 60) % 60);
  const sec = Math.floor(seconds % 60);
  const l = [];

  if (hrs > 0) {
    l.push(hrs + 'h');
    l.push(min + 'm');
  } else if (min > 0) {
    l.push(min + 'm');
  }
  l.push(sec + 's');

  return l.join(' ');
}

export function friendlydate(timestamp: string | Moment) {
  const now = moment();
  const m = moment.parseZone(timestamp);
  const sinceNow = moment.duration(m.diff(now));
  if (-sinceNow.asSeconds() <= 60) {
    return `${Math.round(-sinceNow.asSeconds())}s ago`;
  } else if (-sinceNow.asSeconds() <= 60 * 60 * 24) {
    return sinceNow.humanize(true);
  }
  return sinceNow.humanize(true);
}

export function get_day_start_with_offset(dateParam: Moment | string, offset?: string) {
  if (!offset) {
    offset = getStartOfDayOffset();
  }
  const dateMoment = dateParam ? moment(dateParam) : moment().startOf('day');
  const start_of_day_hours = parseInt(offset.split(':')[0]);
  const start_of_day_minutes = parseInt(offset.split(':')[1]);
  return dateMoment.hour(start_of_day_hours).minute(start_of_day_minutes).format();
}

// Return the startOfDay offset as a number of hours
export function get_hour_offset(offset?: string): number {
  if (!offset) {
    offset = getStartOfDayOffset();
  }
  const start_of_day_hours = parseInt(offset.split(':')[0]);
  const start_of_day_minutes = parseInt(offset.split(':')[1]);
  return start_of_day_hours + start_of_day_minutes / 60;
}

export function get_day_end_with_offset(date: Moment | string, offset?: string): string {
  if (!offset) {
    offset = getStartOfDayOffset();
  }
  return moment(get_day_start_with_offset(date, offset)).add(1, 'days').format();
}

export function get_day_period(date: Moment | string, offset?: string): string {
  if (!offset) {
    offset = getStartOfDayOffset();
  }
  return get_day_start_with_offset(date, offset) + '/' + get_day_end_with_offset(date, offset);
}

export function get_prev_day(datestr: string): Moment {
  return moment(datestr).add(-1, 'days');
}

export function get_next_day(datestr: string): Moment {
  return moment(datestr).add(1, 'days');
}

export function get_offset_duration(offset?: string): Duration {
  if (!offset) {
    offset = getStartOfDayOffset();
  }
  const [hours, minutes] = offset.split(':');
  return moment.duration({ hours: Number(hours), minutes: Number(minutes) });
}

export function get_today_with_offset(offset?: string): string {
  if (!offset) {
    offset = getStartOfDayOffset();
  }
  // Gets "today" in an offset-aware way
  const offset_dur = get_offset_duration(offset);
  return moment().subtract(offset_dur).startOf('day').format('YYYY-MM-DD');
}

export function format_weekday_short(dateParam: Date, locale?: string | string[]) {
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(normalize_date(dateParam));
}

export function format_day_of_month(dateParam: Date, locale?: string | string[]) {
  return new Intl.DateTimeFormat(locale, { day: 'numeric' }).format(normalize_date(dateParam));
}

export function get_short_month_labels(locale?: string | string[]) {
  return Array.from({ length: 12 }, (_, month) =>
    new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(2020, month, 1, 12))
  );
}

// Format a date as locale-aware short date (e.g. "Jun 15" in en-US, "15 jun" in sv-SE)
export function format_date_short(date: Date | string, locale?: string | string[]) {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(d);
}

// Format a date with weekday prefix (e.g. "Mon, Jun 15" in en-US, "mån 15 jun" in sv-SE)
export function format_date_with_weekday(date: Date | string, locale?: string | string[]) {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

// Format a time-of-day string locale-aware (e.g. "14:30:05" or "2:30:05 PM" per browser locale)
export function format_time_of_day(date: Date | string, locale?: string | string[]) {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d);
}

/**
 * Where the hour ticks go on a timeline whose minute 0 is not midnight.
 *
 * A day axis counts minutes from the start of the *window*. When the window starts at
 * the owner's `Start of day` -- 04:00 by default -- labelling tick *n* as hour *n* is
 * simply wrong, and ticks placed every 60 minutes from the start land at :30 past the
 * hour whenever the offset has minutes in it.
 *
 * So: `firstTick` is the first real hour boundary inside the window, and `labelFor`
 * gives the wall-clock hour at any tick.
 */
export function hourTicksFor(startClock: string): {
  firstTick: number;
  labelFor: (t: number) => string;
} {
  // Read the parts separately rather than destructuring a mapped split: a string with
  // no colon yields a one-element array, which leaves the minutes `undefined` and turns
  // every number downstream into NaN -- and a NaN tick renders as the label "NaN".
  const parts = String(startClock || '00:00').split(':');
  const sh = parseInt(parts[0], 10) || 0;
  const sm = parseInt(parts[1], 10) || 0;
  const skew = ((sm % 60) + 60) % 60;
  const firstTick = (60 - skew) % 60;
  return {
    firstTick,
    labelFor: (t: number) =>
      String((((sh + Math.ceil((t + skew) / 60)) % 24) + 24) % 24).padStart(2, '0'),
  };
}
