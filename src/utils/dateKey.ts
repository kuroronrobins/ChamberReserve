const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const weekdayFormatter = new Intl.DateTimeFormat('ja-JP', { weekday: 'short' });
const dateKeyFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const monthFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'long',
});

function parseDateKeyParts(value: string): { year: number; month: number; day: number } | null {
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return { year, month, day };
}

export function isDateKey(value: string): boolean {
  return parseDateKeyParts(value) !== null;
}

export function parseDateKey(value: string): Date {
  const parts = parseDateKeyParts(value);
  if (!parts) {
    throw new Error(`Invalid date key: ${value}`);
  }
  return new Date(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0);
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysToDateKey(value: string, days: number): string {
  return toDateKey(new Date(parseDateKey(value).getTime() + days * DAY_MS));
}

export function addMonthsToDateKey(value: string, months: number): string {
  const { year, month, day } = parseDateKeyParts(value) ?? (() => {
    throw new Error(`Invalid date key: ${value}`);
  })();
  const targetMonthStart = new Date(year, month - 1 + months, 1, 0, 0, 0, 0);
  const lastDay = new Date(targetMonthStart.getFullYear(), targetMonthStart.getMonth() + 1, 0).getDate();
  return toDateKey(new Date(targetMonthStart.getFullYear(), targetMonthStart.getMonth(), Math.min(day, lastDay)));
}

export function startOfMonthKey(value: string): string {
  const { year, month } = parseDateKeyParts(value) ?? (() => {
    throw new Error(`Invalid date key: ${value}`);
  })();
  return toDateKey(new Date(year, month - 1, 1, 0, 0, 0, 0));
}

export function getTodayDateKey(): string {
  return toDateKey(new Date());
}

export function formatDateKeyJa(value: string): string {
  const date = parseDateKey(value);
  return `${dateKeyFormatter.format(date)} (${weekdayFormatter.format(date)})`;
}

export function formatMonthLabelJa(value: string): string {
  return monthFormatter.format(parseDateKey(startOfMonthKey(value)));
}
