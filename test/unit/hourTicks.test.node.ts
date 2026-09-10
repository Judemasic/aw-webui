import { hourTicksFor } from '~/util/time';

/**
 * The timeline axis counts minutes from the start of the *window*, and the window starts
 * at the owner's `Start of day`. Labelling tick n as hour n is only right when that
 * setting is midnight -- and its default is 04:00.
 */
describe('hourTicksFor', () => {
  it('labels a midnight day the obvious way', () => {
    const { firstTick, labelFor } = hourTicksFor('00:00');
    expect(firstTick).toBe(0);
    expect(labelFor(0)).toBe('00');
    expect(labelFor(60)).toBe('01');
    expect(labelFor(13 * 60)).toBe('13');
  });

  it('labels a 04:00 day by the clock, not by the offset from the start', () => {
    const { firstTick, labelFor } = hourTicksFor('04:00');
    expect(firstTick).toBe(0);
    expect(labelFor(0)).toBe('04');
    expect(labelFor(60)).toBe('05');
  });

  it('wraps past midnight', () => {
    const { labelFor } = hourTicksFor('04:00');
    expect(labelFor(20 * 60)).toBe('00'); // 04:00 + 20h
    expect(labelFor(21 * 60)).toBe('01');
    expect(labelFor(24 * 60)).toBe('04'); // the far edge is the next day's start
  });

  it('puts ticks on real hour boundaries when the offset has minutes', () => {
    // 06:30 + 30min is 07:00, so the first tick is at minute 30 and reads "07" --
    // not a tick at minute 0 labelled "06" when the clock says 06:30.
    const { firstTick, labelFor } = hourTicksFor('06:30');
    expect(firstTick).toBe(30);
    expect(labelFor(30)).toBe('07');
    expect(labelFor(90)).toBe('08');
  });

  it('never produces a label outside 00-23', () => {
    for (const clock of ['00:00', '04:00', '06:30', '23:45', '12:00']) {
      const { labelFor } = hourTicksFor(clock);
      for (let t = 0; t <= 24 * 60; t += 15) {
        expect(Number(labelFor(t))).toBeGreaterThanOrEqual(0);
        expect(Number(labelFor(t))).toBeLessThanOrEqual(23);
      }
    }
  });

  it('survives junk rather than rendering NaN', () => {
    expect(hourTicksFor('').labelFor(0)).toBe('00');
    expect(hourTicksFor('nonsense').labelFor(0)).toBe('00');
    expect(hourTicksFor(undefined as any).labelFor(0)).toBe('00');
  });
});
