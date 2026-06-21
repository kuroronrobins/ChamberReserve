import { describe, expect, it } from 'vitest';
import {
  applyBlockDragIntent,
  canToggleBlock,
  resolveBlockMap,
  resolveBlockTone,
  toggleBlockSelection,
} from './blockMapEngine';
import type { BlockId } from './types';

describe('blockMapEngine', () => {
  it('resolves block tone by the shared priority order', () => {
    const blockId: BlockId = 'r2c2';
    const input = {
      selectedBlocks: [blockId],
      candidateBlocks: [blockId],
      reservedBlocks: [blockId],
      suspendedBlocks: [blockId],
      impactedBlocks: [blockId],
      disabledBlocks: [blockId],
    };

    expect(resolveBlockTone(blockId, input)).toBe('suspended');
    expect(resolveBlockTone(blockId, { ...input, suspendedBlocks: [] })).toBe('impact');
    expect(resolveBlockTone(blockId, { ...input, suspendedBlocks: [], impactedBlocks: [] })).toBe('reserved');
    expect(resolveBlockTone(blockId, { selectedBlocks: [blockId], candidateBlocks: [blockId], disabledBlocks: [blockId] })).toBe('selected');
    expect(resolveBlockTone(blockId, { candidateBlocks: [blockId], disabledBlocks: [blockId] })).toBe('candidate');
    expect(resolveBlockTone(blockId, { disabledBlocks: [blockId] })).toBe('disabled');
    expect(resolveBlockTone(blockId, {})).toBe('empty');
  });

  it('resolves all 12 chamber cells without mutating inputs', () => {
    const selectedBlocks: BlockId[] = ['r2c2', 'r2c3'];
    const resolved = resolveBlockMap({ selectedBlocks });

    expect(resolved).toHaveLength(12);
    expect(resolved.filter((cell) => cell.selected).map((cell) => cell.block.id)).toEqual(['r2c2', 'r2c3']);
    expect(selectedBlocks).toEqual(['r2c2', 'r2c3']);
  });

  it('toggles empty and selected blocks using immutable arrays', () => {
    const selectedBlocks: BlockId[] = ['r2c2'];
    const added = toggleBlockSelection('r2c3', selectedBlocks, {});
    const removed = toggleBlockSelection('r2c2', selectedBlocks, {});

    expect(added).toEqual(['r2c2', 'r2c3']);
    expect(removed).toEqual([]);
    expect(selectedBlocks).toEqual(['r2c2']);
  });

  it('blocks toggle for readonly, reserved, suspended, impacted, and disabled cells', () => {
    const blockId: BlockId = 'r2c2';
    const selectedBlocks: BlockId[] = ['r1c1'];

    expect(canToggleBlock(blockId, { readonly: true })).toBe(false);
    expect(canToggleBlock(blockId, { reservedBlocks: [blockId] })).toBe(false);
    expect(canToggleBlock(blockId, { suspendedBlocks: [blockId] })).toBe(false);
    expect(canToggleBlock(blockId, { impactedBlocks: [blockId] })).toBe(false);
    expect(canToggleBlock(blockId, { disabledBlocks: [blockId] })).toBe(false);
    expect(toggleBlockSelection(blockId, selectedBlocks, { readonly: true })).toEqual(selectedBlocks);
    expect(toggleBlockSelection(blockId, selectedBlocks, { reservedBlocks: [blockId] })).toEqual(selectedBlocks);
    expect(toggleBlockSelection(blockId, selectedBlocks, { suspendedBlocks: [blockId] })).toEqual(selectedBlocks);
    expect(toggleBlockSelection(blockId, selectedBlocks, { impactedBlocks: [blockId] })).toEqual(selectedBlocks);
    expect(toggleBlockSelection(blockId, selectedBlocks, { disabledBlocks: [blockId] })).toEqual(selectedBlocks);
  });

  it('applies drag add and remove through the same toggle rules', () => {
    const selectedBlocks: BlockId[] = ['r2c2'];
    const added = applyBlockDragIntent('r2c3', 'add', selectedBlocks, {});
    const removed = applyBlockDragIntent('r2c2', 'remove', selectedBlocks, {});
    const blocked = applyBlockDragIntent('r2c4', 'add', selectedBlocks, { disabledBlocks: ['r2c4'] });

    expect(added).toEqual(['r2c2', 'r2c3']);
    expect(removed).toEqual([]);
    expect(blocked).toEqual(selectedBlocks);
    expect(selectedBlocks).toEqual(['r2c2']);
  });
});
