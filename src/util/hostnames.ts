export function preferKnownHostnames(hosts: string[]): string[] {
  const knownHosts = hosts.filter(host => host !== 'unknown');
  return knownHosts.length > 0
    ? [...knownHosts, ...hosts.filter(host => host === 'unknown')]
    : hosts;
}

export function knownHostnames(hosts: string[]): string[] {
  return hosts.filter(host => Boolean(host) && host !== 'unknown');
}

export function selectSoleKnownHostname(hosts: string[]): string | undefined {
  const known = knownHostnames(hosts);
  return known.length === 1 ? known[0] : undefined;
}

export type CategoryBuilderHostnameEmptyKind = 'no-hosts' | 'hostname-unselected' | null;

export function categoryBuilderHostnameEmptyKind(
  hosts: string[],
  hostname?: string | null
): CategoryBuilderHostnameEmptyKind {
  if (hostname) {
    return null;
  }
  return hosts.filter(Boolean).length === 0 ? 'no-hosts' : 'hostname-unselected';
}

/** One entry in the Activity menu: a machine with a day worth opening. */
export interface ActivityViewEntry {
  name: string;
  hostname: string;
  type: 'android' | 'default';
  pathUrl: string;
  icon: 'mobile' | 'desktop';
}

/** The minimum of a bucket this needs; the real `IBucket` has far more. */
interface BucketLike {
  id: string;
  type: string;
  hostname: string;
}

/**
 * Which hosts get an entry in the Activity menu.
 *
 * The rule is **a host earns an entry only if it has activity to show** — window or
 * android data. Anything else has no Activity page that could be anything but empty.
 *
 * That rule is not pedantry. `aw-stopwatch` is created by aw-webui rather than by a
 * watcher, and on Android it was stamped with the device's **UUID** where every watcher
 * bucket carries the device's name. The sync then carried that UUID to the other device
 * as a peer, so both devices listed a machine called `7b54cfe9-ec39-4ec3-…` that had
 * never existed — one bucket, no events, and a page that could only ever be blank.
 * Filtering on data rather than on the name makes such a host unlistable whatever it is
 * called, and keeps it unlistable if it syncs back.
 *
 * `unknown` is excluded for the same reason it always was: it is the absence of a
 * hostname, not a host.
 */
export function activityViewsFromBuckets(buckets: BucketLike[]): ActivityViewEntry[] {
  const types_by_host: Record<string, { afk: boolean; window: boolean; android: boolean }> = {};
  for (const b of buckets || []) {
    if (!b || !b.hostname) continue;
    const t = (types_by_host[b.hostname] ||= { afk: false, window: false, android: false });
    t.afk ||= b.type == 'afkstatus';
    t.window ||= b.type == 'currentwindow';
    t.android ||= b.type == 'currentwindow' && b.id.includes('android');
  }

  const views: ActivityViewEntry[] = [];
  for (const [hostname, types] of Object.entries(types_by_host)) {
    if (!types.window && !types.android) continue;
    if (types.android) {
      views.push({
        name: `${hostname} (Android)`,
        hostname,
        type: 'android',
        pathUrl: `/activity/${hostname}`,
        icon: 'mobile',
      });
    } else if (hostname != 'unknown') {
      views.push({
        name: hostname,
        hostname,
        type: 'default',
        pathUrl: `/activity/${hostname}`,
        icon: 'desktop',
      });
    }
  }
  return views;
}
