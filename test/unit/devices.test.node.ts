/**
 * Roadmap 4.4a — naming devices, now that two screens do it.
 *
 * These were private methods on CombinedTimeline until Activity gained a resolution
 * sheet of its own. The point of the extraction is that there is one answer to "what do
 * we call this uuid", so these tests pin the parts that are easy to get subtly wrong.
 */
import { deviceLabel, deviceRole, ownDevice, participantsOf, slicesOf } from '~/util/devices';

const DEVICES = [
  { device: 'aaa11111-2222-3333-4444-555566667777', hostname: 'jude-phone', is_own: true },
  { device: 'bbb11111-2222-3333-4444-555566667777', hostname: 'jude-tablet' },
  { device: 'ccc11111-2222-3333-4444-555566667777' },
];

describe('deviceRole — what a decision signature matches on', () => {
  it('is the hostname, which means the same thing on every device', () => {
    expect(deviceRole(DEVICES[0].device, DEVICES)).toBe('jude-phone');
  });

  it('is never the owner-typed nickname, however a label would read', () => {
    // A nickname typed here would make a rule no peer could match (R18).
    expect(deviceRole(DEVICES[1].device, DEVICES)).toBe('jude-tablet');
  });

  it('falls back to the uuid rather than to a name that means nothing elsewhere', () => {
    expect(deviceRole(DEVICES[2].device, DEVICES)).toBe(DEVICES[2].device);
    expect(deviceRole('unknown-uuid', DEVICES)).toBe('unknown-uuid');
  });
});

describe('deviceLabel — what the owner is shown', () => {
  it('prefers a name the owner typed', () => {
    const names = { [DEVICES[1].device]: 'The tablet' };
    expect(deviceLabel(DEVICES[1].device, DEVICES, names)).toBe('The tablet');
  });

  it('falls back to the hostname', () => {
    expect(deviceLabel(DEVICES[1].device, DEVICES)).toBe('jude-tablet');
  });

  it('says "This device" for our own unnamed device', () => {
    expect(deviceLabel('ddd', [{ device: 'ddd', is_own: true }])).toBe('This device');
  });

  it('never shows a raw uuid, and never a name ending in a stray separator', () => {
    const label = deviceLabel(DEVICES[2].device, DEVICES);
    expect(label).toBe('Device CCC1');
    expect(label).not.toContain('-');
  });
});

describe('ownDevice', () => {
  it('is empty before the fetch lands rather than undefined', () => {
    expect(ownDevice([])).toBe('');
  });
  it('is the uuid flagged as ours', () => {
    expect(ownDevice(DEVICES)).toBe(DEVICES[0].device);
  });
});

describe('participantsOf — the competitors handed to the sheet', () => {
  const segment = {
    device: 'a',
    label: 'One UI Home',
    seconds: 600,
    background: [
      { device: 'b', label: 'ActivityWatch' },
      // A heartbeat-split event puts the same device/app in twice.
      { device: 'b', label: 'ActivityWatch' },
    ],
  };

  it('puts the counted activity first', () => {
    expect(slicesOf(segment)[0]).toEqual({
      device: 'a',
      label: 'One UI Home',
      isForeground: true,
    });
  });

  it('never offers the same option twice', () => {
    const ps = participantsOf(segment, () => '#fff');
    expect(ps.map(p => `${p.device}|${p.label}`)).toEqual(['a|One UI Home', 'b|ActivityWatch']);
  });

  it('gives every competitor the segment’s own duration', () => {
    // A contention segment is by construction a window the whole set was active for,
    // so any per-participant figure would be the same figure.
    const ps = participantsOf(segment, () => '#fff');
    expect(ps.map(p => p.minutes)).toEqual([10, 10]);
  });
});
