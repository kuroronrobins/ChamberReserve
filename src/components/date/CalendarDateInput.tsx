import { Calendar } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import {
  formatDateKeyJa,
  getTodayDateKey,
  isDateKey,
  startOfMonthKey,
} from '../../utils/dateKey';
import DatePickerPopover from './DatePickerPopover';

export interface CalendarDateInputProps {
  id?: string;
  label: string;
  value: string;
  onChange: (dateKey: string) => void;
  minDate?: string;
  maxDate?: string;
  disabledDateKeys?: string[];
  compact?: boolean;
  className?: string;
}

function getInitialVisibleMonth(value: string): string {
  return startOfMonthKey(isDateKey(value) ? value : getTodayDateKey());
}

export default function CalendarDateInput({
  id,
  label,
  value,
  onChange,
  minDate,
  maxDate,
  disabledDateKeys,
  compact = false,
  className = '',
}: CalendarDateInputProps) {
  const generatedId = useId();
  const buttonId = id ?? `calendar-date-${generatedId}`;
  const labelId = `${buttonId}-label`;
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => getInitialVisibleMonth(value));
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | undefined>();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const displayValue = isDateKey(value) ? formatDateKeyJa(value) : '日付未設定';

  const updatePopoverPosition = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(352, Math.max(280, viewportWidth - 32));
    const maxLeft = Math.max(16, viewportWidth - width - 16);
    const left = Math.min(Math.max(16, rect.left), maxLeft);
    const estimatedHeight = Math.min(392, viewportHeight - 32);
    const belowTop = rect.bottom + 8;
    const top = belowTop + estimatedHeight > viewportHeight
      ? Math.max(16, viewportHeight - estimatedHeight - 16)
      : belowTop;
    setPopoverStyle({
      left,
      position: 'fixed',
      top,
      width,
      zIndex: 80,
    });
  }, []);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    updatePopoverPosition();
    window.addEventListener('resize', updatePopoverPosition);
    window.addEventListener('scroll', updatePopoverPosition, true);
    return () => {
      window.removeEventListener('resize', updatePopoverPosition);
      window.removeEventListener('scroll', updatePopoverPosition, true);
    };
  }, [open, updatePopoverPosition]);

  useEffect(() => {
    if (open) {
      return undefined;
    }
    setVisibleMonth(getInitialVisibleMonth(value));
    return undefined;
  }, [open, value]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  const openPicker = () => {
    setVisibleMonth(getInitialVisibleMonth(value));
    setOpen(true);
  };

  const handleSelect = (dateKey: string) => {
    onChange(dateKey);
    setOpen(false);
    window.requestAnimationFrame(() => buttonRef.current?.focus());
  };

  return (
    <div ref={rootRef} className={`grid gap-1 text-sm font-semibold text-slate-700 ${className}`}>
      <span id={labelId}>{label}</span>
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        className={[
          'inline-flex h-10 items-center justify-between gap-3 border border-chamber-line bg-white px-3 text-left font-semibold text-chamber-ink transition hover:border-chamber-reserved',
          compact ? 'min-w-[12rem]' : 'w-full',
        ].join(' ')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={labelId}
        onClick={() => (open ? setOpen(false) : openPicker())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            openPicker();
          }
        }}
      >
        <span>{displayValue}</span>
        <Calendar size={17} aria-hidden="true" />
      </button>
      {open ? (
        <div style={popoverStyle}>
          <DatePickerPopover
            value={value}
            visibleMonth={visibleMonth}
            onVisibleMonthChange={setVisibleMonth}
            onSelect={handleSelect}
            onClose={() => {
              setOpen(false);
              window.requestAnimationFrame(() => buttonRef.current?.focus());
            }}
            minDate={minDate}
            maxDate={maxDate}
            disabledDateKeys={disabledDateKeys}
          />
        </div>
      ) : null}
    </div>
  );
}
