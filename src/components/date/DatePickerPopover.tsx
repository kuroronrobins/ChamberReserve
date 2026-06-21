import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  addMonthsToDateKey,
  formatDateKeyJa,
  formatMonthLabelJa,
  getTodayDateKey,
  isDateKey,
  startOfMonthKey,
} from '../../utils/dateKey';
import {
  buildCalendarMonth,
  getVisibleMonthForDate,
  isDateDisabled,
  moveFocusedDateKey,
  moveVisibleMonth,
  WEEKDAY_LABELS,
  type CalendarFocusMove,
} from './datePicker';

export interface DatePickerPopoverProps {
  value: string;
  visibleMonth: string;
  onVisibleMonthChange: (dateKey: string) => void;
  onSelect: (dateKey: string) => void;
  onClose: () => void;
  minDate?: string;
  maxDate?: string;
  disabledDateKeys?: string[];
}

const keyToMove: Record<string, CalendarFocusMove | undefined> = {
  ArrowLeft: 'previous-day',
  ArrowRight: 'next-day',
  ArrowUp: 'previous-week',
  ArrowDown: 'next-week',
  Home: 'week-start',
  End: 'week-end',
  PageUp: 'previous-month',
  PageDown: 'next-month',
};

export default function DatePickerPopover({
  value,
  visibleMonth,
  onVisibleMonthChange,
  onSelect,
  onClose,
  minDate,
  maxDate,
  disabledDateKeys,
}: DatePickerPopoverProps) {
  const todayDate = useMemo(() => getTodayDateKey(), []);
  const initialFocus = isDateKey(value) ? value : startOfMonthKey(visibleMonth);
  const [focusedDate, setFocusedDate] = useState(initialFocus);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const weeks = useMemo(
    () => buildCalendarMonth({
      visibleMonth,
      selectedDate: value,
      todayDate,
      minDate,
      maxDate,
      disabledDateKeys,
    }),
    [disabledDateKeys, maxDate, minDate, todayDate, value, visibleMonth],
  );

  const disabledOptions = useMemo(
    () => ({ minDate, maxDate, disabledDateKeys }),
    [disabledDateKeys, maxDate, minDate],
  );

  useEffect(() => {
    const target = rootRef.current?.querySelector<HTMLButtonElement>(`[data-date-key="${focusedDate}"]`);
    target?.focus();
  }, [focusedDate, visibleMonth]);

  const focusDate = (dateKey: string) => {
    if (isDateDisabled(dateKey, disabledOptions)) {
      return;
    }
    setFocusedDate(dateKey);
    const nextMonth = getVisibleMonthForDate(dateKey);
    if (nextMonth !== startOfMonthKey(visibleMonth)) {
      onVisibleMonthChange(nextMonth);
    }
  };

  const selectDate = (dateKey: string) => {
    if (isDateDisabled(dateKey, disabledOptions)) {
      return;
    }
    onSelect(dateKey);
  };

  const moveMonth = (offset: number) => {
    onVisibleMonthChange(moveVisibleMonth(visibleMonth, offset));
    const nextFocus = addMonthsToDateKey(focusedDate, offset);
    if (!isDateDisabled(nextFocus, disabledOptions)) {
      setFocusedDate(nextFocus);
    }
  };

  const moveToTodayMonth = () => {
    onVisibleMonthChange(getVisibleMonthForDate(todayDate));
    if (!isDateDisabled(todayDate, disabledOptions)) {
      setFocusedDate(todayDate);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectDate(focusedDate);
      return;
    }
    const move = keyToMove[event.key];
    if (!move) {
      return;
    }
    event.preventDefault();
    focusDate(moveFocusedDateKey(focusedDate, move));
  };

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label="日付を選択"
      className="max-h-[calc(100vh-32px)] overflow-y-auto overscroll-contain border border-chamber-line bg-white p-3 shadow-xl"
      onKeyDown={handleKeyDown}
    >
      <div className="grid grid-cols-[36px_1fr_36px] items-center gap-2">
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center border border-chamber-line bg-white text-chamber-ink hover:border-chamber-reserved"
          onClick={() => moveMonth(-1)}
          aria-label="前月"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="text-center text-sm font-semibold text-chamber-ink">{formatMonthLabelJa(visibleMonth)}</div>
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center border border-chamber-line bg-white text-chamber-ink hover:border-chamber-reserved"
          onClick={() => moveMonth(1)}
          aria-label="翌月"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <button
        type="button"
        className="mt-2 h-9 w-full border border-chamber-line bg-chamber-panel px-3 text-sm font-semibold text-chamber-ink hover:border-chamber-reserved"
        onClick={moveToTodayMonth}
      >
        今日の月へ移動
      </button>

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-500" aria-hidden="true">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>

      <div role="grid" aria-label={formatMonthLabelJa(visibleMonth)} className="mt-1 grid grid-cols-7 gap-1">
        {weeks.flat().map((cell) => {
          const cellClassName = [
            'h-9 border text-sm font-semibold transition',
            cell.isSelected
              ? 'border-chamber-reserved bg-chamber-reserved text-white'
              : cell.isToday
                ? 'border-chamber-reserved bg-white text-chamber-reserved'
                : cell.inCurrentMonth
                  ? 'border-chamber-line bg-white text-chamber-ink'
                  : 'border-chamber-line bg-slate-50 text-slate-400',
            cell.isDisabled ? 'cursor-not-allowed opacity-40' : 'hover:border-chamber-reserved hover:bg-chamber-access',
          ].join(' ');
          return (
            <button
              key={cell.dateKey}
              type="button"
              data-date-key={cell.dateKey}
              role="gridcell"
              tabIndex={cell.dateKey === focusedDate ? 0 : -1}
              className={cellClassName}
              disabled={cell.isDisabled}
              aria-pressed={cell.isSelected}
              aria-label={formatDateKeyJa(cell.dateKey)}
              onClick={() => selectDate(cell.dateKey)}
              onFocus={() => setFocusedDate(cell.dateKey)}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
