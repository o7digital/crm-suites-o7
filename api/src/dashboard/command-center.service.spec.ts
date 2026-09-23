import { BadRequestException } from '@nestjs/common';
import { calendarWindow } from './command-center.service';
describe('Command Center calendar windows', () => {
  it('uses local midnight and Monday-to-Monday weeks', () => {
    const window = calendarWindow(
      new Date('2026-09-07T16:00:00Z'),
      'America/Mexico_City',
    );
    expect(window.today.toISOString()).toBe('2026-09-07T06:00:00.000Z');
    expect(window.weekEnd.toISOString()).toBe('2026-09-14T06:00:00.000Z');
  });
  it('handles 23-hour DST days and rejects invalid timezones', () => {
    const window = calendarWindow(
      new Date('2026-03-08T16:00:00Z'),
      'America/New_York',
    );
    expect(window.tomorrow.getTime() - window.today.getTime()).toBe(
      23 * 3600000,
    );
    expect(() => calendarWindow(new Date(), 'not/a/timezone')).toThrow(
      BadRequestException,
    );
  });
});
