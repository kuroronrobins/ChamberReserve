import { describe, expect, it } from 'vitest';
import {
  buildCalendarMonth,
  isDateDisabled,
  moveFocusedDateKey,
  moveVisibleMonth,
  WEEKDAY_LABELS,
} from './datePicker';

describe('datePicker helpers', () => {
  it('builds a stable six-week calendar grid', () => {
    const weeks = buildCalendarMonth({
      visibleMonth: '2026-06-24',
      selectedDate: '2026-06-24',
      todayDate: '2026-06-22',
    });

    expect(weeks).toHaveLength(6);
    expect(weeks.flat()).toHaveLength(42);
    expect(weeks[0][0].dateKey).toBe('2026-05-31');
    expect(weeks[0][1].dateKey).toBe('2026-06-01');
    expect(weeks.flat().find((cell) => cell.dateKey === '2026-06-24')?.isSelected).toBe(true);
    expect(weeks.flat().find((cell) => cell.dateKey === '2026-06-22')?.isToday).toBe(true);
  });

  it('marks month-outside and disabled days without changing selected state', () => {
    const weeks = buildCalendarMonth({
      visibleMonth: '2026-06-01',
      selectedDate: '2026-06-24',
      todayDate: '2026-06-22',
      minDate: '2026-06-10',
      maxDate: '2026-06-30',
      disabledDateKeys: ['2026-06-20'],
    });
    const cells = weeks.flat();

    expect(cells.find((cell) => cell.dateKey === '2026-05-31')?.inCurrentMonth).toBe(false);
    expect(cells.find((cell) => cell.dateKey === '2026-06-09')?.isDisabled).toBe(true);
    expect(cells.find((cell) => cell.dateKey === '2026-06-20')?.isDisabled).toBe(true);
    expect(cells.find((cell) => cell.dateKey === '2026-06-24')?.isSelected).toBe(true);
  });

  it('centralizes month and keyboard date movement', () => {
    expect(moveVisibleMonth('2026-06-24', 1)).toBe('2026-07-01');
    expect(moveVisibleMonth('2026-06-24', -1)).toBe('2026-05-01');
    expect(moveFocusedDateKey('2026-06-24', 'previous-day')).toBe('2026-06-23');
    expect(moveFocusedDateKey('2026-06-24', 'next-week')).toBe('2026-07-01');
    expect(moveFocusedDateKey('2026-06-24', 'week-start')).toBe('2026-06-21');
    expect(moveFocusedDateKey('2026-06-24', 'week-end')).toBe('2026-06-27');
  });

  it('keeps disabled checks as pure date-key comparisons', () => {
    expect(WEEKDAY_LABELS).toEqual(['日', '月', '火', '水', '木', '金', '土']);
    expect(isDateDisabled('2026-06-09', { minDate: '2026-06-10' })).toBe(true);
    expect(isDateDisabled('2026-07-01', { maxDate: '2026-06-30' })).toBe(true);
    expect(isDateDisabled('2026-06-20', { disabledDateKeys: ['2026-06-20'] })).toBe(true);
    expect(isDateDisabled('2026-06-21', { minDate: '2026-06-10', maxDate: '2026-06-30' })).toBe(false);
  });
});
