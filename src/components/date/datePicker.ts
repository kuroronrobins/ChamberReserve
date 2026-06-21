import {
  addDaysToDateKey,
  addMonthsToDateKey,
  getTodayDateKey,
  parseDateKey,
  startOfMonthKey,
} from '../../utils/dateKey';

export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

export interface CalendarDayCell {
  dateKey: string;
  day: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isDisabled: boolean;
}

export interface CalendarMonthOptions {
  visibleMonth: string;
  selectedDate?: string;
  todayDate?: string;
  minDate?: string;
  maxDate?: string;
  disabledDateKeys?: string[];
}

export type CalendarFocusMove =
  | 'previous-day'
  | 'next-day'
  | 'previous-week'
  | 'next-week'
  | 'week-start'
  | 'week-end'
  | 'previous-month'
  | 'next-month';

export function getVisibleMonthForDate(dateKey: string): string {
  return startOfMonthKey(dateKey);
}

export function moveVisibleMonth(visibleMonth: string, offset: number): string {
  return startOfMonthKey(addMonthsToDateKey(visibleMonth, offset));
}

export function isDateDisabled(dateKey: string, options: Pick<CalendarMonthOptions, 'minDate' | 'maxDate' | 'disabledDateKeys'>): boolean {
  if (options.minDate && dateKey < options.minDate) {
    return true;
  }
  if (options.maxDate && dateKey > options.maxDate) {
    return true;
  }
  return Boolean(options.disabledDateKeys?.includes(dateKey));
}

export function buildCalendarMonth(options: CalendarMonthOptions): CalendarDayCell[][] {
  const visibleMonth = startOfMonthKey(options.visibleMonth);
  const todayDate = options.todayDate ?? getTodayDateKey();
  const monthStart = parseDateKey(visibleMonth);
  const gridStart = addDaysToDateKey(visibleMonth, -monthStart.getDay());
  const weeks: CalendarDayCell[][] = [];

  for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
    const week: CalendarDayCell[] = [];
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const dateKey = addDaysToDateKey(gridStart, weekIndex * 7 + dayIndex);
      const date = parseDateKey(dateKey);
      week.push({
        dateKey,
        day: date.getDate(),
        inCurrentMonth: startOfMonthKey(dateKey) === visibleMonth,
        isToday: dateKey === todayDate,
        isSelected: dateKey === options.selectedDate,
        isDisabled: isDateDisabled(dateKey, options),
      });
    }
    weeks.push(week);
  }

  return weeks;
}

export function moveFocusedDateKey(dateKey: string, move: CalendarFocusMove): string {
  if (move === 'previous-day') {
    return addDaysToDateKey(dateKey, -1);
  }
  if (move === 'next-day') {
    return addDaysToDateKey(dateKey, 1);
  }
  if (move === 'previous-week') {
    return addDaysToDateKey(dateKey, -7);
  }
  if (move === 'next-week') {
    return addDaysToDateKey(dateKey, 7);
  }
  if (move === 'previous-month') {
    return addMonthsToDateKey(dateKey, -1);
  }
  if (move === 'next-month') {
    return addMonthsToDateKey(dateKey, 1);
  }

  const dayOfWeek = parseDateKey(dateKey).getDay();
  if (move === 'week-start') {
    return addDaysToDateKey(dateKey, -dayOfWeek);
  }
  return addDaysToDateKey(dateKey, 6 - dayOfWeek);
}
