import { describe, expect, it } from 'vitest';
import {
  addDaysToDateKey,
  addMonthsToDateKey,
  formatDateKeyJa,
  formatMonthLabelJa,
  isDateKey,
  parseDateKey,
  startOfMonthKey,
  toDateKey,
} from './dateKey';

describe('dateKey helpers', () => {
  it('validates strict YYYY-MM-DD values', () => {
    expect(isDateKey('2026-06-24')).toBe(true);
    expect(isDateKey('2026-2-24')).toBe(false);
    expect(isDateKey('2026-02-29')).toBe(false);
    expect(isDateKey('2028-02-29')).toBe(true);
  });

  it('parses and formats local date keys without UTC date shifting', () => {
    const date = parseDateKey('2026-06-24');

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(5);
    expect(date.getDate()).toBe(24);
    expect(toDateKey(date)).toBe('2026-06-24');
  });

  it('adds days across month and leap-year boundaries', () => {
    expect(addDaysToDateKey('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysToDateKey('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysToDateKey('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('adds months by clamping invalid month-end dates', () => {
    expect(addMonthsToDateKey('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsToDateKey('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsToDateKey('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('formats Japanese display labels from date keys', () => {
    expect(startOfMonthKey('2026-06-24')).toBe('2026-06-01');
    expect(formatDateKeyJa('2026-06-24')).toContain('2026');
    expect(formatMonthLabelJa('2026-06-24')).toContain('2026');
  });
});
