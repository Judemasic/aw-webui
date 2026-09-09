// A ULID generator, for decision and tombstone ids (roadmap 4.1; see
// `aw-android/docs/05_DATA_MODEL.md` §4).
//
// Why a ULID and not a UUID: `decisions.jsonl` files from several devices are
// concatenated and merged, and `id` is the final tiebreak in that merge. A ULID
// sorts lexicographically by creation time, so the merged stream is in time order
// for free and the tiebreak is stable rather than arbitrary. A v4 UUID would give
// neither.
//
// Deliberately dependency-free and deliberately not monotonic: two ids generated in
// the same millisecond may sort either way. The merge algorithm already breaks that
// tie on `created_by` before it ever reaches `id`, so monotonicity would buy nothing
// and the state it needs (a remembered last timestamp) is exactly the kind of thing
// that goes wrong across a page reload.

// Crockford base32: no I, L, O or U, so an id read aloud or typed back cannot be
// ambiguous. The alphabet is part of the format, not a choice.
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_LEN = 10;
const RAND_LEN = 16;

function encodeTime(now: number): string {
  let out = '';
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    // eslint-disable-next-line no-bitwise
    const mod = now % 32;
    out = ENCODING[mod] + out;
    now = (now - mod) / 32;
  }
  return out;
}

function encodeRandom(): string {
  // crypto.getRandomValues where it exists — this runs in an Android WebView as well
  // as a desktop browser, and Math.random() there is not seeded per-tab the way a
  // desktop browser's is. Fall back rather than throw: a slightly weaker id is far
  // better than a resolution the owner cannot save.
  const bytes = new Uint8Array(RAND_LEN);
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < RAND_LEN; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = '';
  for (let i = 0; i < RAND_LEN; i++) out += ENCODING[bytes[i] % 32];
  return out;
}

/** A 26-character ULID. `prefix` is prepended verbatim (`d_` / `t_`). */
export function ulid(prefix = ''): string {
  return prefix + encodeTime(Date.now()) + encodeRandom();
}
