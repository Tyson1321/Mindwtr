import { describe, expect, it } from 'vitest';
import { formatCalendarISOWeek, formatCalendarISOWeekRange, getCalendarISOWeek } from './calendar-week-number';

describe('ISO calendar week numbers', () => {
    it.each([
        [2026, 10, 15, 2026, 42], [2021, 1, 1, 2020, 53], [2021, 1, 3, 2020, 53],
        [2021, 1, 4, 2021, 1], [2024, 12, 30, 2025, 1], [2026, 12, 31, 2026, 53], [2027, 1, 1, 2026, 53],
    ])('assigns %i-%i-%i to ISO %i week %i', (year, month, day, isoYear, week) => {
        expect(getCalendarISOWeek(new Date(year, month - 1, day, 12))).toEqual({ year: isoYear, week });
    });
    it('formats compact month labels and full week-year labels', () => {
        const date = new Date(2021, 0, 1);
        expect(formatCalendarISOWeek(date, 'zh-CN')).toBe('2020年第53周');
        expect(formatCalendarISOWeek(date, 'zh-TW', false)).toBe('第53周');
        expect(formatCalendarISOWeek(date, 'en-US')).toBe('2020 W53');
        expect(formatCalendarISOWeek(date, 'en-US', false)).toBe('W53');
    });
    it('covers Sunday-first and cross-year timelines', () => {
        expect(formatCalendarISOWeekRange([new Date(2026, 9, 11), new Date(2026, 9, 17)], 'zh-CN')).toBe('2026年第41周 / 2026年第42周');
        expect(formatCalendarISOWeekRange([new Date(2026, 9, 12), new Date(2026, 9, 18)], 'en')).toBe('2026 W42');
        expect(formatCalendarISOWeekRange([new Date(2020, 11, 28), new Date(2021, 0, 4)], 'en')).toBe('2020 W53 / 2021 W01');
        expect(formatCalendarISOWeekRange([])).toBe('');
    });
    it('handles dates on daylight-saving transitions', () => {
        expect(getCalendarISOWeek(new Date(2026, 2, 8, 1))).toEqual(getCalendarISOWeek(new Date(2026, 2, 8, 23)));
    });
    it('rejects invalid dates', () => expect(() => getCalendarISOWeek(new Date('invalid'))).toThrow('Invalid calendar date'));
});
