import type { CycleWindow } from '../domain/types';
import { formatDateRange } from '../utils/format';

interface CycleTimelineProps {
  window: CycleWindow;
  dense?: boolean;
}

export default function CycleTimeline({ window, dense }: CycleTimelineProps) {
  const textClass = dense ? 'text-[11px] leading-snug text-slate-700' : 'text-sm leading-snug text-slate-700';
  const labelClass = dense ? 'text-xs font-semibold text-chamber-ink' : 'text-sm font-semibold text-chamber-ink';
  const cellClass = dense ? 'px-3 py-2' : 'px-4 py-3';

  return (
    <div className="grid gap-2" data-testid="cycle-timeline">
      <div className="grid grid-cols-[1fr_2.1fr_1fr] overflow-hidden border border-chamber-line bg-white text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
        <div className={`bg-chamber-access ${cellClass}`}>
          <div className={labelClass}>25°C 搬入可能</div>
          <div className={textClass}>{formatDateRange(window.loadStart, window.loadEnd)}</div>
        </div>
        <div className={`border-x border-chamber-line bg-chamber-run ${cellClass}`}>
          <div className={labelClass}>運転期間</div>
          <div className={textClass}>{formatDateRange(window.runStart, window.runEnd)}</div>
        </div>
        <div className={`bg-chamber-unload ${cellClass}`}>
          <div className={labelClass}>25°C 搬出可能</div>
          <div className={textClass}>{formatDateRange(window.unloadStart, window.unloadEnd)}</div>
        </div>
      </div>
    </div>
  );
}
