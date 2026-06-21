import { BLOCKS } from '../domain/chamber';
import type { BlockId, CycleWindow } from '../domain/types';

const dateTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

export function formatDateRange(startIso: string, endIso: string): string {
  return `${formatDateTime(startIso)} - ${formatDateTime(endIso)}`;
}

export function formatCycleWindow(window: CycleWindow): string {
  return `${formatDateTime(window.loadStart)} - ${formatDateTime(window.unloadEnd)}`;
}

export function formatBlockList(blockIds: BlockId[]): string {
  const labels = blockIds.map((blockId) => BLOCKS.find((block) => block.id === blockId)?.label ?? blockId);
  return labels.join('、');
}
