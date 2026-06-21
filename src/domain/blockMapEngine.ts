import { BLOCKS } from './chamber';
import type { BlockCell, BlockId } from './types';

export type BlockTone = 'empty' | 'selected' | 'reserved' | 'suspended' | 'candidate' | 'impact' | 'disabled';
export type BlockDragIntent = 'add' | 'remove';

export interface BlockMapStateInput {
  selectedBlocks?: BlockId[];
  candidateBlocks?: BlockId[];
  reservedBlocks?: BlockId[];
  suspendedBlocks?: BlockId[];
  impactedBlocks?: BlockId[];
  disabledBlocks?: BlockId[];
  readonly?: boolean;
}

export interface ResolvedBlockCellState {
  block: BlockCell;
  tone: BlockTone;
  selected: boolean;
  disabled: boolean;
}

function toSet(blocks?: BlockId[]) {
  return new Set(blocks ?? []);
}

export function resolveBlockTone(blockId: BlockId, input: BlockMapStateInput): BlockTone {
  const selectedSet = toSet(input.selectedBlocks);
  const candidateSet = toSet(input.candidateBlocks);
  const reservedSet = toSet(input.reservedBlocks);
  const suspendedSet = toSet(input.suspendedBlocks);
  const impactedSet = toSet(input.impactedBlocks);
  const disabledSet = toSet(input.disabledBlocks);

  if (suspendedSet.has(blockId)) return 'suspended';
  if (impactedSet.has(blockId)) return 'impact';
  if (reservedSet.has(blockId)) return 'reserved';
  if (selectedSet.has(blockId)) return 'selected';
  if (candidateSet.has(blockId)) return 'candidate';
  if (disabledSet.has(blockId)) return 'disabled';
  return 'empty';
}

export function canToggleBlock(blockId: BlockId, input: BlockMapStateInput): boolean {
  if (input.readonly) {
    return false;
  }
  const reservedSet = toSet(input.reservedBlocks);
  const suspendedSet = toSet(input.suspendedBlocks);
  const impactedSet = toSet(input.impactedBlocks);
  const disabledSet = toSet(input.disabledBlocks);
  return !reservedSet.has(blockId) && !suspendedSet.has(blockId) && !impactedSet.has(blockId) && !disabledSet.has(blockId);
}

export function resolveBlockMap(input: BlockMapStateInput): ResolvedBlockCellState[] {
  const selectedSet = toSet(input.selectedBlocks);
  return BLOCKS.map((block) => ({
    block,
    tone: resolveBlockTone(block.id, input),
    selected: selectedSet.has(block.id),
    disabled: !canToggleBlock(block.id, input),
  }));
}

export function toggleBlockSelection(
  blockId: BlockId,
  selectedBlocks: BlockId[],
  input: BlockMapStateInput = {},
): BlockId[] {
  if (!canToggleBlock(blockId, input)) {
    return selectedBlocks.slice();
  }
  const next = new Set(selectedBlocks);
  if (next.has(blockId)) {
    next.delete(blockId);
  } else {
    next.add(blockId);
  }
  return Array.from(next);
}

export function applyBlockDragIntent(
  blockId: BlockId,
  intent: BlockDragIntent,
  selectedBlocks: BlockId[],
  input: BlockMapStateInput = {},
): BlockId[] {
  if (!canToggleBlock(blockId, input)) {
    return selectedBlocks.slice();
  }
  const next = new Set(selectedBlocks);
  if (intent === 'add') {
    next.add(blockId);
  } else {
    next.delete(blockId);
  }
  return Array.from(next);
}
