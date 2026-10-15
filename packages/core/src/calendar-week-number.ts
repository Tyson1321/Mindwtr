/** ISO 8601: Monday first; week 1 contains January 4. Avoid local elapsed hours across DST. */
export function getCalendarISOWeek(date: Date): { week: number; year: number } {
    const thursday = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    if (!Number.isFinite(thursday.getTime())) throw new Error('Invalid calendar date');
    thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
    const year = thursday.getUTCFullYear();
    const firstDay = new Date(Date.UTC(year, 0, 1));
    const week = Math.ceil(((thursday.getTime() - firstDay.getTime()) / 86400000 + 1) / 7);
    return { week, year };
}

export function formatCalendarISOWeek(date: Date, locale = 'en', includeYear = true): string {
    const { week, year } = getCalendarISOWeek(date);
    return /^zh/i.test(locale)
        ? `${includeYear ? year + '年' : ''}第${week}周`
        : `${includeYear ? year + ' ' : ''}W${String(week).padStart(2, '0')}`;
}

/** A Sunday-first or configurable timeline can span several ISO weeks. */
export function formatCalendarISOWeekRange(dates: Date[], locale = 'en'): string {
    if (!dates.length) return '';
    const first = formatCalendarISOWeek(dates[0], locale);
    const last = formatCalendarISOWeek(dates[dates.length - 1], locale);
    return first === last ? first : `${first} / ${last}`;
}
