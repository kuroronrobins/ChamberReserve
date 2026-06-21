import { useState } from 'react';
import chamberFrontBackgroundUrl from '../assets/espec-ar-front-background.svg';
import {
  applyBlockDragIntent,
  resolveBlockMap,
  toggleBlockSelection,
  type BlockDragIntent,
  type BlockMapStateInput,
  type BlockTone,
} from '../domain/blockMapEngine';
import type { BlockId } from '../domain/types';

export type ChamberBlockMapSurface = 'plain' | 'chamber';
export type ChamberBlockMapDensity = 'large' | 'inline' | 'compact';

export interface ChamberBlockMapProps extends BlockMapStateInput {
  title?: string;
  surface?: ChamberBlockMapSurface;
  density?: ChamberBlockMapDensity;
  interactive?: boolean;
  onChange?: (blocks: BlockId[]) => void;
}

const CHAMBER_FRONT_OVERLAY_RECT = {
  left: '29.1667%',
  top: '17.5%',
  width: '56.25%',
  height: '56.25%',
};

const plainToneClass: Record<BlockTone, string> = {
  empty: 'border-chamber-line bg-white text-slate-700',
  selected: 'border-chamber-reserved bg-chamber-reserved text-white',
  reserved: 'border-slate-400 bg-slate-200 text-chamber-ink',
  suspended: 'border-chamber-blocked bg-[#f5d6cf] text-chamber-ink',
  candidate: 'border-chamber-reserved bg-chamber-access text-chamber-ink',
  impact: 'border-chamber-impact bg-[#f7e6b8] text-chamber-ink',
  disabled: 'border-slate-200 bg-slate-100 text-slate-400',
};

const chamberToneClass: Record<BlockTone, string> = {
  empty: 'border-[#5f8df4]/55 bg-white/10 text-slate-600 hover:bg-white/28',
  selected: 'border-[3px] border-[#006d77] bg-[#008a8a]/78 text-white shadow-[0_0_0_2px_rgba(255,255,255,0.9),inset_0_0_0_1px_rgba(255,255,255,0.9)]',
  reserved: 'border-slate-500/70 bg-slate-400/38 text-chamber-ink',
  suspended: 'border-chamber-blocked bg-[repeating-linear-gradient(135deg,rgba(185,71,54,0.36)_0,rgba(185,71,54,0.36)_6px,rgba(255,255,255,0.2)_6px,rgba(255,255,255,0.2)_12px)] text-chamber-ink',
  candidate: 'border-chamber-reserved bg-chamber-access/55 text-chamber-ink shadow-[inset_0_0_0_2px_rgba(255,255,255,0.46)]',
  impact: 'border-chamber-impact bg-[#f7e6b8]/68 text-chamber-ink',
  disabled: 'border-slate-300/55 bg-slate-100/35 text-slate-500',
};

const chamberDensityClass: Record<ChamberBlockMapDensity, {
  shell: string;
  axisGrid: string;
  axisText: string;
  rowAxis: string;
  stage: string;
  overlay: string;
  cell: string;
  label: string;
  check: string;
  showAxis: boolean;
}> = {
  large: {
    shell: 'grid gap-2',
    axisGrid: 'grid min-w-0 grid-cols-[34px_minmax(0,1fr)] gap-1.5 text-[11px] font-semibold text-slate-500 sm:grid-cols-[42px_minmax(0,1fr)] sm:gap-2',
    axisText: 'grid grid-cols-4 text-center',
    rowAxis: 'grid grid-rows-3 py-[17.5%] text-right',
    stage: 'relative aspect-[4/3] min-h-[210px] min-w-0 overflow-hidden border border-chamber-line bg-chamber-surface sm:min-h-[240px]',
    overlay: 'absolute grid grid-cols-4 grid-rows-3 gap-2',
    cell: 'min-h-0 px-1 text-[11px]',
    label: 'left-1.5 top-1 text-[10px]',
    check: 'bottom-1 right-1 h-4 w-4 text-[10px]',
    showAxis: true,
  },
  inline: {
    shell: 'grid gap-1.5',
    axisGrid: 'grid min-w-0 grid-cols-[26px_minmax(0,1fr)] gap-1 text-[9px] font-semibold text-slate-500',
    axisText: 'grid grid-cols-4 text-center',
    rowAxis: 'grid grid-rows-3 py-[17.5%] text-right',
    stage: 'relative aspect-[4/3] min-h-[128px] min-w-0 overflow-hidden border border-chamber-line bg-chamber-surface',
    overlay: 'absolute grid grid-cols-4 grid-rows-3 gap-1.5',
    cell: 'min-h-0 px-0.5 text-[9px]',
    label: 'left-1 top-0.5 text-[8px]',
    check: 'bottom-0.5 right-0.5 h-3.5 w-3.5 text-[9px]',
    showAxis: true,
  },
  compact: {
    shell: 'grid gap-1',
    axisGrid: 'grid min-w-0',
    axisText: 'hidden',
    rowAxis: 'hidden',
    stage: 'relative aspect-[4/3] min-h-[108px] min-w-0 overflow-hidden border border-chamber-line bg-chamber-surface',
    overlay: 'absolute grid grid-cols-4 grid-rows-3 gap-1',
    cell: 'min-h-0 px-0.5 text-[9px]',
    label: 'left-1 top-0.5 text-[8px]',
    check: 'bottom-0.5 right-0.5 h-3 w-3 text-[8px]',
    showAxis: false,
  },
};

const plainDensityClass: Record<ChamberBlockMapDensity, {
  shell: string;
  axis: string;
  grid: string;
  cell: string;
}> = {
  large: {
    shell: 'grid gap-2 border border-chamber-line bg-white p-4',
    axis: 'grid grid-cols-4 gap-2 text-center text-[11px] font-semibold text-slate-500',
    grid: 'grid grid-cols-4 gap-2',
    cell: 'aspect-[1.25] min-h-16 px-1 text-sm',
  },
  inline: {
    shell: 'grid gap-2',
    axis: 'grid grid-cols-4 gap-1 text-center text-[10px] font-semibold text-slate-500',
    grid: 'grid grid-cols-4 gap-1',
    cell: 'aspect-[1.1] min-h-10 px-1 text-[11px]',
  },
  compact: {
    shell: 'grid gap-2',
    axis: 'hidden',
    grid: 'grid grid-cols-4 gap-1',
    cell: 'aspect-[1.15] min-h-9 px-1 text-[11px]',
  },
};

const columnLabels = ['左1', '左2', '右2', '右1'];
const rowLabels = ['上段', '中段', '下段'];

export default function ChamberBlockMap({
  selectedBlocks = [],
  candidateBlocks = [],
  reservedBlocks = [],
  suspendedBlocks = [],
  impactedBlocks = [],
  disabledBlocks = [],
  readonly,
  title,
  surface = 'chamber',
  density = 'large',
  interactive,
  onChange,
}: ChamberBlockMapProps) {
  const [dragIntent, setDragIntent] = useState<BlockDragIntent | null>(null);
  const isInteractive = Boolean((interactive ?? Boolean(onChange)) && onChange && !readonly);
  const stateInput: BlockMapStateInput = {
    selectedBlocks,
    candidateBlocks,
    reservedBlocks,
    suspendedBlocks,
    impactedBlocks,
    disabledBlocks,
    readonly: !isInteractive,
  };
  const cells = resolveBlockMap(stateInput);

  const updateBlock = (blockId: BlockId, intent: BlockDragIntent | 'toggle') => {
    if (!isInteractive) {
      return;
    }
    const next = intent === 'toggle'
      ? toggleBlockSelection(blockId, selectedBlocks, stateInput)
      : applyBlockDragIntent(blockId, intent, selectedBlocks, stateInput);
    onChange?.(next);
  };

  const renderCell = (cell: (typeof cells)[number], chamberSurface: boolean) => {
    const { block, tone, selected, disabled } = cell;
    const isDisabled = !isInteractive || disabled;
    return (
      <button
        key={block.id}
        type="button"
        aria-pressed={selected}
        aria-label={block.label}
        className={[
          'relative grid place-items-center border text-center font-semibold leading-tight transition',
          chamberSurface ? chamberDensityClass[density].cell : plainDensityClass[density].cell,
          chamberSurface ? chamberToneClass[tone] : plainToneClass[tone],
          isDisabled ? 'cursor-default' : 'hover:brightness-95',
          chamberSurface ? 'focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-chamber-reserved focus-visible:ring-offset-1' : '',
        ].join(' ')}
        disabled={!isInteractive}
        title={block.label}
        onPointerDown={() => {
          const intent: BlockDragIntent = selected ? 'remove' : 'add';
          setDragIntent(intent);
          updateBlock(block.id, 'toggle');
        }}
        onPointerEnter={() => {
          if (dragIntent) {
            updateBlock(block.id, dragIntent);
          }
        }}
      >
        <span
          className={[
            chamberSurface ? `absolute ${chamberDensityClass[density].label} font-semibold` : '',
            chamberSurface && tone === 'selected' ? 'text-white drop-shadow-sm' : '',
            chamberSurface && tone !== 'selected' ? 'text-slate-600/78' : '',
          ].join(' ')}
        >
          {block.label}
        </span>
        {chamberSurface && tone === 'selected' ? (
          <span
            aria-hidden="true"
            className={[
              'absolute grid place-items-center bg-[#006d77] font-bold leading-none text-white shadow-[0_0_0_1px_rgba(255,255,255,0.95)]',
              chamberDensityClass[density].check,
            ].join(' ')}
          >
            ✓
          </span>
        ) : null}
      </button>
    );
  };

  if (surface === 'plain') {
    const densityClass = plainDensityClass[density];
    return (
      <div className={densityClass.shell}>
        {title ? (
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-700">{title}</div>
            {density === 'large' ? <div className="text-xs font-semibold text-slate-500">正面投影</div> : null}
          </div>
        ) : null}
        {density !== 'compact' ? (
          <div className={densityClass.axis}>
            {columnLabels.map((label) => <span key={label}>{label}</span>)}
          </div>
        ) : null}
        <div
          className={densityClass.grid}
          onPointerLeave={() => setDragIntent(null)}
          onPointerUp={() => setDragIntent(null)}
        >
          {cells.map((cell) => renderCell(cell, false))}
        </div>
      </div>
    );
  }

  const densityClass = chamberDensityClass[density];
  return (
    <div className={densityClass.shell}>
      {title ? (
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-700">{title}</div>
          {density !== 'compact' ? <div className="text-xs font-semibold text-slate-500">チャンバー正面</div> : null}
        </div>
      ) : null}
      <div className={densityClass.axisGrid}>
        {densityClass.showAxis ? <div /> : null}
        {densityClass.showAxis ? (
          <div className={densityClass.axisText}>
            {columnLabels.map((label) => <span key={label}>{label}</span>)}
          </div>
        ) : null}
        {densityClass.showAxis ? (
          <div className={densityClass.rowAxis}>
            {rowLabels.map((label) => <span key={label} className="flex items-center justify-end">{label}</span>)}
          </div>
        ) : null}
        <div className={densityClass.stage}>
          <img
            src={chamberFrontBackgroundUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full select-none object-contain"
            draggable={false}
          />
          <div
            className={densityClass.overlay}
            style={CHAMBER_FRONT_OVERLAY_RECT}
            onPointerLeave={() => setDragIntent(null)}
            onPointerUp={() => setDragIntent(null)}
            data-chamber-block-overlay="true"
            data-chamber-map-density={density}
          >
            {cells.map((cell) => renderCell(cell, true))}
          </div>
        </div>
      </div>
    </div>
  );
}
