/**
 * Turning an Android Activity class into something readable (roadmap 4.4h).
 *
 * Android's watcher records `classname` -- the Activity class actually on screen, e.g.
 * `com.whatsapp.calling.ui.VoipActivityV2`. That is the only per-screen detail Android
 * has: the platform never gives a window title, so `title` is filled with the app name
 * and a "Top Window Titles" panel on Android would be a second copy of Top Applications.
 * `classname` is the real thing, and on a measured day sixteen of forty-one apps had more
 * than one screen -- eighteen minutes of WhatsApp *call* sitting inside a total that said
 * only "WhatsApp".
 *
 * A panel full of raw class paths is worse than no panel, so the name is cleaned. How
 * much cleaning is safe is the whole question here, because **two classes that clean to
 * the same string would read as the same screen when they are not**:
 *
 *  - The package prefix is dropped and the remainder split on camel case. That is
 *    reversible enough to stay honest: `HomeActivity` and `Home` do not collide, because
 *    the `Activity` suffix is kept rather than stripped as noise.
 *  - Two apps can each have a `MainActivity`, and both rows will read "Main Activity".
 *    They are separate rows with separate totals, coloured by app, and the raw class path
 *    is on the row's hover text -- so nothing is merged, and the full value is one hover
 *    away for anyone writing a category rule against it.
 *  - An obfuscated class (`com.foo.a`) cleans to a single meaningless letter, which is
 *    less useful than the path it came from, so those are left exactly as they are.
 *
 * The raw string is never what gets written anywhere: a category rule matching a screen
 * has to match what is stored, and this only ever changes what is *displayed*.
 */

/** Whether a cleaned simple name is too short to identify anything. */
function tooShort(name: string): boolean {
  return name.length <= 2;
}

/**
 * The display name for one `classname`, or the raw value when cleaning it would lose more
 * than it gains. An empty classname falls back to `app`, so a row always has a label.
 */
export function prettyScreenName(classname?: string | null, app?: string): string {
  const raw = (classname || '').trim();
  if (!raw) return app || '';

  // Inner classes (`Outer$Inner`) read as two names, not one run-on word.
  const parts = raw.split('$');
  const simple = parts[0].split('.').filter(Boolean).pop() || '';
  if (!simple || tooShort(simple)) return raw;

  const words = [simple, ...parts.slice(1)].map(splitCamelCase).filter(Boolean).join(' · ');
  return words || raw;
}

/** `VoipActivityV2` -> `Voip Activity V2`, `HTTPServerActivity` -> `HTTP Server Activity`. */
function splitCamelCase(s: string): string {
  return s
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();
}

/**
 * The whole row label for a per-screen row: the app, then the screen inside it.
 *
 * The owner's request, on first reading the Top Screens panel: *"can the top screen have the
 * app before it? like youtube main activity"*. The panel is sorted by time across every app,
 * so consecutive rows are routinely from different apps, and half a dozen of them read
 * "Main Activity" with nothing to say whose. The colour already encodes the app, but a colour
 * is not a name.
 *
 * An em dash rather than the ` · ` {@link prettyScreenName} uses for inner classes, so the two
 * levels of nesting stay distinguishable: `WhatsApp — Calling · Voip Activity V2`.
 *
 * The app is left off when the screen name *is* the app -- which is what happens when a
 * classname is missing altogether -- rather than printing it twice.
 */
export function screenRowName(classname?: string | null, app?: string): string {
  const inside = prettyScreenName(classname, app);
  if (!app || !inside || inside === app) return inside || app || '';
  return `${app} — ${inside}`;
}
