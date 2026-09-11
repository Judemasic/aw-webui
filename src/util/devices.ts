/**
 * Naming devices, in the two different ways a device has to be named.
 *
 * These were methods on `CombinedTimeline.vue` until roadmap 4.4a gave Activity a
 * resolution sheet of its own. A second copy of "what do we call this uuid" is exactly
 * the kind of thing that drifts, and the two callers here are the two screens 4.4d had
 * to reconcile after they drifted about something else. So: one implementation.
 */

/** A device track as `GET /api/0/combined/timeline` returns it. */
export interface DeviceRef {
  device: string;
  hostname?: string;
  is_own?: boolean;
}

/**
 * The name a decision's *signature* calls a device — its hostname, falling back to the
 * uuid.
 *
 * Not [[deviceLabel]], and the difference matters: a label can be a nickname typed on
 * *this* device, or the literal words "This device". Either would make a rule that no
 * peer can match, which is the one thing R18 forbids. A hostname is the same string on
 * every device.
 */
export function deviceRole(uuid: string, devices: DeviceRef[]): string {
  const d = (devices || []).find(x => x.device === uuid);
  return (d && d.hostname) || uuid;
}

/**
 * What to *show* the owner for a device: their own nickname first, then the hostname,
 * then a short readable stand-in.
 *
 * Returning the raw uuid was the 3.4 defect the combined view exists to fix — a
 * 36-character string is unreadable anywhere the question is *which device*.
 */
export function deviceLabel(
  uuid: string,
  devices: DeviceRef[],
  names?: Record<string, string>
): string {
  const named = names && names[uuid];
  if (named) return named;
  const d = (devices || []).find(x => x.device === uuid);
  if (d && d.hostname) return d.hostname;
  if (d && d.is_own) return 'This device';
  // Separators stripped first: a uuid's first four characters can include a dash, and
  // "Device AAA-" reads like a truncation bug rather than a name.
  return `Device ${(uuid || '')
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 4)
    .toUpperCase()}`;
}

/** The uuid of the device this app is running on, or '' before the fetch lands. */
export function ownDevice(devices: DeviceRef[]): string {
  const own = (devices || []).find(d => d.is_own);
  return own ? own.device : '';
}

/** One contended segment's competitors: the counted one first, then the rest. */
export function slicesOf(segment: {
  device: string;
  label: string;
  background?: { device: string; label: string }[];
}): { device: string; label: string; isForeground: boolean }[] {
  return [
    { device: segment.device, label: segment.label, isForeground: true },
    ...(segment.background || []).map(b => ({ ...b, isForeground: false })),
  ];
}

/**
 * The competitors to hand a `ResolutionSheet`.
 *
 * Every participant gets the *segment's* duration, not a shorter one: a contention
 * segment is by construction a window in which the whole set was active, so any
 * per-participant number would be the same number.
 *
 * Deduplicated on (device, label): a heartbeat-split event puts the same device/app
 * into `background` twice, which in a detail list is harmless repetition but in the
 * sheet would be two identical radio options — an unanswerable question — and would
 * write the same app into `deliberate_background` twice.
 */
export function participantsOf(
  segment: {
    device: string;
    label: string;
    seconds: number;
    background?: { device: string; label: string }[];
  },
  colorFor: (label: string) => string
): { device: string; label: string; minutes: number; color: string; isForeground: boolean }[] {
  const minutes = segment.seconds / 60;
  const seen = new Set<string>();
  const out = [];
  for (const sl of slicesOf(segment)) {
    const k = `${sl.device}|${sl.label}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      device: sl.device,
      label: sl.label,
      minutes,
      color: colorFor(sl.label),
      isForeground: sl.isForeground,
    });
  }
  return out;
}
