import { monthlyOccurrenceDate, monthlyStartDate } from './recurrence';

describe('monthlyOccurrenceDate', () => {
  it('keeps a date-only first month on its calendar day', () => {
    expect(monthlyStartDate('2027-01-31').toISOString()).toBe('2027-01-31T12:00:00.000Z');
    expect(Number.isNaN(monthlyStartDate('2027-02-31').getTime())).toBe(true);
  });
  it('uses the original day after a short month', () => {
    const start = new Date('2027-01-31T12:00:00.000Z');
    expect(monthlyOccurrenceDate(start, 1).toISOString()).toBe('2027-02-28T12:00:00.000Z');
    expect(monthlyOccurrenceDate(start, 2).toISOString()).toBe('2027-03-31T12:00:00.000Z');
  });

  it('respects leap years', () => {
    expect(monthlyOccurrenceDate(new Date('2028-01-31T00:00:00.000Z'), 1).toISOString())
      .toBe('2028-02-29T00:00:00.000Z');
  });
});
