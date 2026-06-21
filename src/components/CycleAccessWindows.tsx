import type { CycleWindow } from '../domain/types';
import { formatDateRange } from '../utils/format';

interface CycleAccessWindowsProps {
  window: CycleWindow;
  compact?: boolean;
}

export default function CycleAccessWindows({ window, compact }: CycleAccessWindowsProps) {
  const gridClass = compact ? 'grid gap-2' : 'grid gap-2 lg:grid-cols-2';
  const timeClass = compact ? 'text-base font-semibold' : 'text-lg font-semibold';

  return (
    <div className={gridClass} data-testid="cycle-access-windows">
      <section
        className="border-2 border-chamber-reserved bg-chamber-access px-3 py-3 shadow-[inset_0_4px_0_rgba(31,122,120,0.95)]"
        data-testid="cycle-load-window"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold text-chamber-reserved">搬入可能</div>
          <div className="border border-chamber-reserved bg-white px-2 py-0.5 text-[11px] font-semibold text-chamber-reserved">
            25°C 平衡
          </div>
        </div>
        <div className={`mt-2 text-chamber-ink ${timeClass}`}>
          {formatDateRange(window.loadStart, window.loadEnd)}
        </div>
      </section>

      <section
        className="border-2 border-chamber-impact bg-chamber-unload px-3 py-3 shadow-[inset_0_4px_0_rgba(183,121,31,0.95)]"
        data-testid="cycle-unload-window"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold text-chamber-impact">搬出可能</div>
          <div className="border border-chamber-impact bg-white px-2 py-0.5 text-[11px] font-semibold text-chamber-impact">
            25°C 平衡
          </div>
        </div>
        <div className={`mt-2 text-chamber-ink ${timeClass}`}>
          {formatDateRange(window.unloadStart, window.unloadEnd)}
        </div>
      </section>
    </div>
  );
}
