import { BLOCK_COLUMNS, BLOCK_ROWS, BLOCKS, CHAMBER, CHAMBERS, DEFAULT_TEMPERATURE_CYCLE_CONFIG } from './chamber.ts';
import { addDaysToDateKey, parseDateKey, toDateKey } from '../utils/dateKey.ts';
import type {
  BlockId,
  Candidate,
  Chamber,
  ChamberConditionConfig,
  CycleCount,
  CycleProgramStep,
  CycleWindow,
  EnvironmentCondition,
  FixedConditionConfig,
  PlacementMode,
  Reservation,
  ReservationDraft,
  ReservationStatus,
  ResolvedCycleProgramStep,
  SearchRequest,
  Suspension,
  SuspensionDraft,
  TemperatureCycleConfig,
  UserManagedConditionConfig,
  UserManagedReservationCondition,
} from './types.ts';

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export const DEFAULT_CYCLE_COUNT: CycleCount = 1;
export const DEFAULT_SEARCH_CYCLE_COUNT: CycleCount = 10;
export const MIN_CYCLE_COUNT = 1;
export const MAX_CYCLE_COUNT = 99;
export const CYCLE_COUNT_STEP = 1;

export function normalizeCycleCount(value: unknown): CycleCount {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_SEARCH_CYCLE_COUNT;
  }
  const clamped = Math.min(MAX_CYCLE_COUNT, Math.max(MIN_CYCLE_COUNT, numeric));
  return Math.round(clamped);
}

export function describeCycleCount(cycleCount: CycleCount): string {
  return `${normalizeCycleCount(cycleCount)} サイクル`;
}

export { addDaysToDateKey, parseDateKey, toDateKey } from '../utils/dateKey.ts';

export function timeOfDayToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return 0;
  }
  return hours * 60 + minutes;
}

export function minutesToTimeOfDay(value: number): string {
  const normalized = ((Math.round(value) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function atMinute(dateKey: string, minuteOfDay: number): Date {
  const base = parseDateKey(dateKey);
  base.setMinutes(base.getMinutes() + minuteOfDay);
  return base;
}

function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * MINUTE_MS).toISOString();
}

export function calculateCyclePeriodMinutes(steps: CycleProgramStep[]): number {
  return steps.reduce((total, step) => total + Number(step.durationMinutes || 0), 0);
}

export function normalizeTemperatureCycleConfig(config: TemperatureCycleConfig): TemperatureCycleConfig {
  const steps = config.steps
    .slice()
    .sort((a, b) => a.stepNo - b.stepNo)
    .map((step, index) => {
      const legacyAccessRole = (step as CycleProgramStep & { accessRole?: 'load' | 'unload' | 'none' }).accessRole;
      return {
        ...step,
        access: step.access ?? (legacyAccessRole && legacyAccessRole !== 'none' ? 'available' : 'unavailable'),
        stepNo: index + 1,
        durationMinutes: Math.max(1, Math.round(Number(step.durationMinutes) || 1)),
      };
    });
  return {
    ...config,
    steps,
    cyclePeriodMinutes: calculateCyclePeriodMinutes(steps),
  };
}

export function resolveStepTimes(
  config: TemperatureCycleConfig,
  dateKey: string,
  cycleOffset = 0,
): ResolvedCycleProgramStep[] {
  const normalized = normalizeTemperatureCycleConfig(config);
  let elapsed = normalized.cyclePeriodMinutes * cycleOffset;
  const step1Start = atMinute(dateKey, timeOfDayToMinutes(normalized.step1StartTime)).toISOString();
  return normalized.steps.map((step) => {
    const startAt = addMinutesIso(step1Start, elapsed);
    const endAt = addMinutesIso(startAt, step.durationMinutes);
    const result: ResolvedCycleProgramStep = {
      ...step,
      startAt,
      endAt,
      startMinute: elapsed,
      endMinute: elapsed + step.durationMinutes,
    };
    elapsed += step.durationMinutes;
    return result;
  });
}

export function buildCycleSchedule(config: TemperatureCycleConfig, dateKey: string, repeatCount = 1): ResolvedCycleProgramStep[] {
  return Array.from({ length: normalizeCycleCount(repeatCount) }, (_, cycleIndex) =>
    resolveStepTimes(config, dateKey, cycleIndex),
  ).flat();
}

export function validateCycleProgram(config: TemperatureCycleConfig): string[] {
  const errors: string[] = [];
  if (!config.programName.trim()) {
    errors.push('プログラム名を入力してください。');
  }
  if (!/^\d{2}:\d{2}$/.test(config.step1StartTime)) {
    errors.push('ステップ1開始時刻は HH:mm で入力してください。');
  }
  if (config.steps.length === 0) {
    errors.push('サイクルステップを1件以上入力してください。');
  }
  for (const step of config.steps) {
    if (step.durationMinutes <= 0) {
      errors.push(`ステップ${step.stepNo}の時間は1分以上にしてください。`);
    }
    if (step.kind === 'equilibrium' && step.temperature.fromC !== step.temperature.toC) {
      errors.push(`ステップ${step.stepNo}は平衡状態ですが温度from/toが一致していません。`);
    }
    if (step.kind === 'transition' && step.temperature.fromC === step.temperature.toC) {
      errors.push(`ステップ${step.stepNo}は遷移状態ですが温度from/toが同じです。`);
    }
    if (step.humidity.mode === 'rh') {
      if (step.humidity.fromRh === undefined || step.humidity.toRh === undefined) {
        errors.push(`ステップ${step.stepNo}の湿度を入力してください。`);
      }
      if (step.kind === 'equilibrium' && step.humidity.fromRh !== step.humidity.toRh) {
        errors.push(`ステップ${step.stepNo}は平衡状態ですが湿度from/toが一致していません。`);
      }
    }
  }
  return errors;
}

function matchesAccessCondition(step: ResolvedCycleProgramStep, condition: EnvironmentCondition): boolean {
  const temperatureMatches = step.temperature.fromC === condition.temperatureC
    && step.temperature.toC === condition.temperatureC;
  if (!temperatureMatches) {
    return false;
  }
  if (condition.humidityRh === undefined) {
    return true;
  }
  return step.humidity.mode === 'rh'
    && step.humidity.fromRh === condition.humidityRh
    && step.humidity.toRh === condition.humidityRh;
}

function isSteadyAccessStep(step: ResolvedCycleProgramStep, config: TemperatureCycleConfig): boolean {
  return step.access === 'available'
    && step.kind === 'equilibrium'
    && matchesAccessCondition(step, config.accessCondition);
}

function findFirstSteadyAccessStep(
  steps: ResolvedCycleProgramStep[],
  config: TemperatureCycleConfig,
): ResolvedCycleProgramStep | undefined {
  return steps.find((step) => isSteadyAccessStep(step, config));
}

function findLastSteadyAccessStep(
  steps: ResolvedCycleProgramStep[],
  config: TemperatureCycleConfig,
): ResolvedCycleProgramStep | undefined {
  return [...steps].reverse().find((step) => isSteadyAccessStep(step, config));
}

export function buildCycleWindow(
  dateKey: string,
  config: TemperatureCycleConfig = DEFAULT_TEMPERATURE_CYCLE_CONFIG,
  cycleCount: CycleCount = DEFAULT_CYCLE_COUNT,
): CycleWindow {
  const normalized = normalizeTemperatureCycleConfig(config);
  const normalizedCycleCount = normalizeCycleCount(cycleCount);
  const previousCycle = resolveStepTimes(normalized, dateKey, -1);
  const firstCycle = resolveStepTimes(normalized, dateKey);
  const finalCycle = resolveStepTimes(normalized, dateKey, normalizedCycleCount - 1);
  const step1Start = firstCycle[0]?.startAt ?? atMinute(dateKey, timeOfDayToMinutes(normalized.step1StartTime)).toISOString();
  const occupiedEndAt = addMinutesIso(step1Start, normalized.cyclePeriodMinutes * normalizedCycleCount);
  const loadStep = findLastSteadyAccessStep(previousCycle, normalized)
    ?? findFirstSteadyAccessStep(firstCycle, normalized)
    ?? firstCycle[0];
  const unloadStep = findLastSteadyAccessStep(finalCycle, normalized) ?? finalCycle[finalCycle.length - 1];
  const loadStart = loadStep?.startAt ?? step1Start;
  const loadEnd = loadStep?.endAt ?? addMinutesIso(loadStart, Math.min(60, normalized.cyclePeriodMinutes));
  const unloadStart = unloadStep?.startAt ?? occupiedEndAt;
  const unloadEnd = unloadStep?.endAt ?? occupiedEndAt;
  return {
    loadStart,
    loadEnd,
    runStart: loadEnd,
    runEnd: unloadStart,
    unloadStart,
    unloadEnd,
  };
}

export function buildFixedConditionWindow(dateKey: string, config: FixedConditionConfig): CycleWindow {
  const startMinute = config.availabilityPolicy.type === 'daily_window' && config.availabilityPolicy.startTime
    ? timeOfDayToMinutes(config.availabilityPolicy.startTime)
    : 9 * 60;
  const endMinute = config.availabilityPolicy.type === 'daily_window' && config.availabilityPolicy.endTime
    ? timeOfDayToMinutes(config.availabilityPolicy.endTime)
    : 17 * 60;
  const start = atMinute(dateKey, startMinute).toISOString();
  const end = atMinute(dateKey, endMinute <= startMinute ? endMinute + 24 * 60 : endMinute).toISOString();
  return {
    loadStart: start,
    loadEnd: start,
    runStart: start,
    runEnd: end,
    unloadStart: end,
    unloadEnd: end,
  };
}

export function buildEnvironmentWindow(dateKey: string, startTime = '09:00', durationHours = 8): CycleWindow {
  const durationMinutes = Math.max(15, Math.round(Number(durationHours || 8) * 60));
  const start = atMinute(dateKey, timeOfDayToMinutes(startTime)).toISOString();
  const end = addMinutesIso(start, durationMinutes);
  return {
    loadStart: start,
    loadEnd: start,
    runStart: start,
    runEnd: end,
    unloadStart: end,
    unloadEnd: end,
  };
}

export function getWindowStart(window: CycleWindow): string {
  return window.loadStart;
}

export function getWindowEnd(window: CycleWindow): string {
  return window.unloadEnd;
}

export function getReservationStart(reservation: Reservation): string {
  return reservation.occupiedStartAt;
}

export function getReservationEnd(reservation: Reservation): string {
  return reservation.occupiedEndAt;
}

export function windowsOverlap(
  first: { startAt: string; endAt: string },
  second: { startAt: string; endAt: string },
): boolean {
  return new Date(first.startAt).getTime() < new Date(second.endAt).getTime()
    && new Date(second.startAt).getTime() < new Date(first.endAt).getTime();
}

export function cycleWindowsOverlap(first: CycleWindow, second: CycleWindow): boolean {
  return windowsOverlap(
    { startAt: getWindowStart(first), endAt: getWindowEnd(first) },
    { startAt: getWindowStart(second), endAt: getWindowEnd(second) },
  );
}

export function hasSteadyAccessWindows(window: CycleWindow): boolean {
  const loadStart = new Date(window.loadStart).getTime();
  const loadEnd = new Date(window.loadEnd).getTime();
  const runStart = new Date(window.runStart).getTime();
  const runEnd = new Date(window.runEnd).getTime();
  const unloadStart = new Date(window.unloadStart).getTime();
  const unloadEnd = new Date(window.unloadEnd).getTime();
  return loadEnd >= loadStart
    && runStart === loadEnd
    && unloadStart === runEnd
    && unloadEnd >= unloadStart
    && unloadEnd > loadStart;
}

export function getBlock(blockId: BlockId) {
  const cell = BLOCKS.find((block) => block.id === blockId);
  if (!cell) {
    throw new Error(`Unknown block id: ${blockId}`);
  }
  return cell;
}

export function blocksOverlap(first: BlockId[], second: BlockId[] | 'all'): boolean {
  if (second === 'all') {
    return first.length > 0;
  }
  const secondSet = new Set(second);
  return first.some((blockId) => secondSet.has(blockId));
}

export function isContiguousBlockSet(blockIds: BlockId[]): boolean {
  if (blockIds.length === 0) {
    return false;
  }
  const selected = new Set(blockIds);
  const visited = new Set<BlockId>();
  const queue: BlockId[] = [blockIds[0]];

  while (queue.length > 0) {
    const current = queue.shift() as BlockId;
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    const { row, col } = getBlock(current);
    const neighbors = [
      `r${row - 1}c${col}`,
      `r${row + 1}c${col}`,
      `r${row}c${col - 1}`,
      `r${row}c${col + 1}`,
    ] as BlockId[];
    for (const neighbor of neighbors) {
      if (selected.has(neighbor) && !visited.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }

  return visited.size === selected.size;
}

function uniqueSortedBlocks(blockIds: BlockId[]): BlockId[] {
  return Array.from(new Set(blockIds)).sort((a, b) => {
    const blockA = getBlock(a);
    const blockB = getBlock(b);
    return blockA.row === blockB.row ? blockA.col - blockB.col : blockA.row - blockB.row;
  });
}

export function generateShapePlacements(blockIds: BlockId[]): BlockId[][] {
  const uniqueBlocks = uniqueSortedBlocks(blockIds);
  if (!isContiguousBlockSet(uniqueBlocks)) {
    return [];
  }

  const cells = uniqueBlocks.map(getBlock);
  const minRow = Math.min(...cells.map((cell) => cell.row));
  const minCol = Math.min(...cells.map((cell) => cell.col));
  const shape = cells.map((cell) => ({
    row: cell.row - minRow,
    col: cell.col - minCol,
  }));
  const maxRowOffset = Math.max(...shape.map((cell) => cell.row));
  const maxColOffset = Math.max(...shape.map((cell) => cell.col));
  const placements: BlockId[][] = [];

  for (let baseRow = 1; baseRow <= BLOCK_ROWS - maxRowOffset; baseRow += 1) {
    for (let baseCol = 1; baseCol <= BLOCK_COLUMNS - maxColOffset; baseCol += 1) {
      placements.push(
        shape.map((cell) => `r${baseRow + cell.row}c${baseCol + cell.col}` as BlockId),
      );
    }
  }

  return placements.map(uniqueSortedBlocks);
}

export function isReservationDeleted(reservation: Reservation): boolean {
  return Boolean(reservation.deletedAt);
}

export function resolveReservationStatus(reservation: Reservation, nowIso: string): ReservationStatus {
  if (reservation.deletedAt) {
    return 'deleted';
  }
  if ((reservation.impactedBySuspensionIds ?? []).length > 0) {
    return 'impacted';
  }
  const now = new Date(nowIso).getTime();
  const start = new Date(getReservationStart(reservation)).getTime();
  const end = new Date(getReservationEnd(reservation)).getTime();
  if (now < start) {
    return 'reserved';
  }
  if (now <= end) {
    return 'in_use';
  }
  return 'completed';
}

export function canDeleteReservation(reservation: Reservation, nowIso: string): boolean {
  return resolveReservationStatus(reservation, nowIso) !== 'completed'
    && resolveReservationStatus(reservation, nowIso) !== 'deleted';
}

export function conditionsEqual(first?: UserManagedReservationCondition, second?: UserManagedReservationCondition): boolean {
  if (!first || !second) {
    return false;
  }
  return first.temperatureC === second.temperatureC
    && (first.humidityRh ?? null) === (second.humidityRh ?? null);
}

export function validateUserManagedRequestedCondition(
  config: UserManagedConditionConfig,
  requestedCondition?: UserManagedReservationCondition,
): boolean {
  if (!requestedCondition) {
    return false;
  }
  if (requestedCondition.temperatureC < config.temperatureRange.minC
    || requestedCondition.temperatureC > config.temperatureRange.maxC) {
    return false;
  }
  if (config.humidityRange) {
    if (requestedCondition.humidityRh === undefined) {
      return false;
    }
    return requestedCondition.humidityRh >= config.humidityRange.minRh
      && requestedCondition.humidityRh <= config.humidityRange.maxRh;
  }
  return true;
}

export function canShareUserManagedReservation(
  existingReservation: Reservation,
  requestedCondition?: UserManagedReservationCondition,
): boolean {
  return conditionsEqual(existingReservation.requestedCondition, requestedCondition);
}

export function getUnavailableBlocksForWindow(
  window: CycleWindow,
  reservations: Reservation[],
  suspensions: Suspension[],
  chamberId?: string,
): Set<BlockId> {
  const unavailable = new Set<BlockId>();
  for (const reservation of reservations) {
    if (isReservationDeleted(reservation)) {
      continue;
    }
    if (chamberId && reservation.chamberId !== chamberId) {
      continue;
    }
    if (windowsOverlap(
      { startAt: getWindowStart(window), endAt: getWindowEnd(window) },
      { startAt: getReservationStart(reservation), endAt: getReservationEnd(reservation) },
    )) {
      reservation.blocks.forEach((blockId) => unavailable.add(blockId));
    }
  }
  for (const suspension of suspensions) {
    if (chamberId && suspension.chamberId !== chamberId) {
      continue;
    }
    if (!windowsOverlap({ startAt: getWindowStart(window), endAt: getWindowEnd(window) }, suspension)) {
      continue;
    }
    const blocked = suspension.blocks === 'all' ? BLOCKS.map((block) => block.id) : suspension.blocks;
    blocked.forEach((blockId) => unavailable.add(blockId));
  }
  return unavailable;
}

function getChamberConfig(chamber: Chamber): ChamberConditionConfig {
  return chamber.activeConfigRevision.config;
}

export function isPlacementAvailable(
  blocks: BlockId[],
  window: CycleWindow,
  reservations: Reservation[],
  suspensions: Suspension[],
  chamber: Chamber = CHAMBER,
  requestedCondition?: UserManagedReservationCondition,
): boolean {
  if (!hasSteadyAccessWindows(window)) {
    return false;
  }
  const config = getChamberConfig(chamber);
  for (const reservation of reservations) {
    if (isReservationDeleted(reservation)) {
      continue;
    }
    if (reservation.chamberId !== chamber.id) {
      continue;
    }
    if (!windowsOverlap(
      { startAt: getWindowStart(window), endAt: getWindowEnd(window) },
      { startAt: getReservationStart(reservation), endAt: getReservationEnd(reservation) },
    )) {
      continue;
    }
    if (config.type === 'user_managed_condition' && !canShareUserManagedReservation(reservation, requestedCondition)) {
      return false;
    }
    if (blocksOverlap(blocks, reservation.blocks)) {
      return false;
    }
  }
  for (const suspension of suspensions) {
    if (suspension.chamberId !== chamber.id) {
      continue;
    }
    if (windowsOverlap({ startAt: getWindowStart(window), endAt: getWindowEnd(window) }, suspension)
      && blocksOverlap(blocks, suspension.blocks)) {
      return false;
    }
  }
  return true;
}

export function findAvailablePlacements(
  request: SearchRequest,
  window: CycleWindow,
  reservations: Reservation[],
  suspensions: Suspension[],
  chamber: Chamber = CHAMBER,
  requestedCondition?: UserManagedReservationCondition,
): BlockId[][] {
  if (!isContiguousBlockSet(request.selectedBlocks)) {
    return [];
  }
  const placements = request.placementMode === 'exact'
    ? [uniqueSortedBlocks(request.selectedBlocks)]
    : generateShapePlacements(request.selectedBlocks);
  return placements.filter((blocks) =>
    isPlacementAvailable(blocks, window, reservations, suspensions, chamber, requestedCondition),
  );
}

export function canCommitCandidate(
  candidate: Candidate,
  reservations: Reservation[],
  suspensions: Suspension[],
  chambers: Chamber[] = CHAMBERS,
): boolean {
  const chamber = chambers.find((item) => item.id === candidate.chamberId) ?? CHAMBER;
  return isPlacementAvailable(
    candidate.blocks,
    candidate.window,
    reservations,
    suspensions,
    chamber,
    candidate.requestedCondition,
  );
}

export function generateReservationId(dateKey: string, reservations: Reservation[]): string {
  const prefix = dateKey.replace(/^20/, '').replaceAll('-', '');
  const existingCount = reservations.filter((reservation) => reservation.id.includes(prefix)).length;
  return `CR-${prefix}-${String(existingCount + 1).padStart(3, '0')}`;
}

export function generatePin(reservations: Reservation[]): string {
  const value = 4100 + reservations.length * 37;
  return String(value % 10000).padStart(4, '0');
}

export function createReservation(
  draft: ReservationDraft,
  reservations: Reservation[],
  nowIso: string,
): Reservation {
  return {
    id: generateReservationId(toDateKey(new Date(draft.candidate.occupiedStartAt)), reservations),
    chamberId: draft.candidate.chamberId,
    testName: draft.testName,
    requester: draft.requester,
    contactNote: draft.contactNote,
    blocks: draft.candidate.blocks,
    occupiedStartAt: draft.candidate.occupiedStartAt,
    occupiedEndAt: draft.candidate.occupiedEndAt,
    requestedCondition: draft.requestedCondition ?? draft.candidate.requestedCondition,
    pin: generatePin(reservations),
    createdAt: nowIso,
  };
}

export function getAffectedReservations(
  draft: SuspensionDraft,
  reservations: Reservation[],
): Reservation[] {
  return reservations.filter((reservation) => {
    if (isReservationDeleted(reservation) || reservation.chamberId !== draft.chamberId) {
      return false;
    }
    return windowsOverlap(
      { startAt: draft.startAt, endAt: draft.endAt },
      { startAt: getReservationStart(reservation), endAt: getReservationEnd(reservation) },
    ) && blocksOverlap(reservation.blocks, draft.blocks);
  });
}

export function applySuspensionImpact(reservations: Reservation[], suspension: Suspension): Reservation[] {
  return reservations.map((reservation) => {
    if (!suspension.affectedReservationIds.includes(reservation.id)) {
      return reservation;
    }
    const impactedBySuspensionIds = Array.from(
      new Set([...(reservation.impactedBySuspensionIds ?? []), suspension.id]),
    );
    return {
      ...reservation,
      impactedBySuspensionIds,
    };
  });
}

export function describePlacementMode(mode: PlacementMode): string {
  return mode === 'exact' ? '位置まで指定' : 'サイズだけ指定';
}

export function describeChamberConfig(config: ChamberConditionConfig): string {
  if (config.type === 'temperature_cycle') {
    return `温湿度サイクル / ${config.programName}`;
  }
  if (config.type === 'fixed_condition') {
    return `一定温湿度 / ${conditionToLabel(config.condition)}`;
  }
  return `ユーザー温湿度管理 / ${config.temperatureRange.minC}-${config.temperatureRange.maxC}C`;
}

export function conditionToLabel(condition?: EnvironmentCondition): string {
  if (!condition) {
    return '未指定';
  }
  return `${condition.temperatureC}C${condition.humidityRh === undefined ? '' : ` / ${condition.humidityRh}%RH`}`;
}
