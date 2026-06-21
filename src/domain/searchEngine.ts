import { CHAMBERS } from './chamber.ts';
import { addDaysToDateKey, toDateKey } from '../utils/dateKey.ts';
import type {
  BlockId,
  Candidate,
  Chamber,
  CycleCount,
  CycleWindow,
  FixedConditionConfig,
  Reservation,
  SearchConditionMode,
  SearchRequest,
  Suspension,
  UserManagedReservationCondition,
} from './types.ts';
import {
  buildCycleWindow,
  buildEnvironmentWindow,
  buildFixedConditionWindow,
  conditionToLabel,
  generateShapePlacements,
  getBlock,
  getWindowEnd,
  getWindowStart,
  isContiguousBlockSet,
  isPlacementAvailable,
  normalizeCycleCount,
  validateUserManagedRequestedCondition,
} from './reservationRules.ts';

export const DEFAULT_CANDIDATE_SEARCH_WINDOW_DAYS = 4;

export type SizeModeCandidatePolicy = 'representative-per-bucket' | 'all-placements';

export type CandidateUnavailableReasonCode =
  | 'empty_blocks'
  | 'non_contiguous_blocks'
  | 'no_matching_chamber'
  | 'exact_location_unavailable'
  | 'no_contiguous_placement';

export interface CandidateUnavailableReason {
  dateKey: string;
  code: CandidateUnavailableReasonCode;
  message: string;
}

export interface CandidateSearchResult {
  requestedDate: string;
  requestedDateCandidates: Candidate[];
  alternativeDateCandidates: Candidate[];
  candidates: Candidate[];
  requestedDateAvailable: boolean;
  unavailableReasons: CandidateUnavailableReason[];
}

export interface CandidateSearchRankContext {
  request: SearchRequest;
  reservations: Reservation[];
  suspensions: Suspension[];
  chambers: Chamber[];
  searchWindowDays: number;
  sizeModeCandidatePolicy: SizeModeCandidatePolicy;
}

export type CandidateRanker = (
  candidates: readonly Candidate[],
  context: CandidateSearchRankContext,
) => Candidate[];

export interface CandidateSearchEngineContext {
  reservations: Reservation[];
  suspensions: Suspension[];
  chambers?: Chamber[];
  searchWindowDays?: number;
  maxResults?: number;
  sizeModeCandidatePolicy?: SizeModeCandidatePolicy;
  rankCandidates?: CandidateRanker;
}

export interface CandidateSearchWindow {
  window: CycleWindow;
  conditionSummary: string;
  requestedCondition?: UserManagedReservationCondition;
}

interface ResolvedCandidateSearchContext extends CandidateSearchRankContext {
  maxResults?: number;
  rankCandidates?: CandidateRanker;
}

interface CandidatePlacementOption {
  blocks: BlockId[];
  placementIndex: number;
  representativeReason?: Candidate['representativeReason'];
}

export function resolveSearchConditionMode(request: SearchRequest): SearchConditionMode {
  return request.conditionMode ?? (request.requestedCondition ? 'environment' : 'cycle');
}

export function buildSearchDateKeys(desiredDate: string, searchWindowDays = DEFAULT_CANDIDATE_SEARCH_WINDOW_DAYS): string[] {
  const days = normalizeSearchWindowDays(searchWindowDays);
  return Array.from({ length: days }, (_, offset) => addDaysToDateKey(desiredDate, offset));
}

export function buildCandidateSearchWindow(
  request: SearchRequest,
  chamber: Chamber,
  dateKey: string,
): CandidateSearchWindow | null {
  const config = chamber.activeConfigRevision.config;
  const conditionMode = resolveSearchConditionMode(request);
  if (config.type === 'temperature_cycle') {
    if (conditionMode !== 'cycle') {
      return null;
    }
    return {
      window: buildCycleWindow(dateKey, config, normalizeCycleCount(request.cycleCount)),
      conditionSummary: `管理者管理 / 温湿度サイクル / ${config.programName}`,
    };
  }

  if (conditionMode !== 'environment') {
    return null;
  }

  const environmentWindow = buildEnvironmentWindow(
    dateKey,
    request.environmentStartTime,
    request.environmentDurationHours,
  );
  if (config.type === 'fixed_condition') {
    if (!conditionMatchesFixedCondition(config, request.requestedCondition)) {
      return null;
    }
    if (!fixedAvailabilityContains(environmentWindow, dateKey, config)) {
      return null;
    }
    return {
      window: environmentWindow,
      conditionSummary: `管理者管理 / 一定温湿度 ${conditionToLabel(config.condition)}`,
    };
  }

  if (!validateUserManagedRequestedCondition(config, request.requestedCondition)) {
    return null;
  }
  return {
    window: environmentWindow,
    requestedCondition: request.requestedCondition,
    conditionSummary: `ユーザー温湿度管理 ${conditionToLabel(request.requestedCondition)}`,
  };
}

export function findCandidatePlacements(
  request: SearchRequest,
  candidateWindow: CandidateSearchWindow,
  context: Pick<ResolvedCandidateSearchContext, 'reservations' | 'suspensions'>,
  chamber: Chamber,
): BlockId[][] {
  return findCandidatePlacementOptions(request, candidateWindow, context, chamber).map((placement) => placement.blocks);
}

export function findCandidatePlacementOptions(
  request: SearchRequest,
  candidateWindow: CandidateSearchWindow,
  context: Pick<ResolvedCandidateSearchContext, 'reservations' | 'suspensions'>,
  chamber: Chamber,
): CandidatePlacementOption[] {
  if (!isContiguousBlockSet(request.selectedBlocks)) {
    return [];
  }
  const placements = request.placementMode === 'exact'
    ? [{ blocks: sortBlocks(request.selectedBlocks), placementIndex: 1 }]
    : generateShapePlacements(request.selectedBlocks).map((blocks, index) => ({
      blocks,
      placementIndex: index + 1,
    }));
  return placements.filter((placement) =>
    isPlacementAvailable(
      placement.blocks,
      candidateWindow.window,
      context.reservations,
      context.suspensions,
      chamber,
      candidateWindow.requestedCondition,
    ),
  );
}

export function selectRepresentativePlacement(
  placements: CandidatePlacementOption[],
  request: SearchRequest,
): CandidatePlacementOption | null {
  if (placements.length === 0) {
    return null;
  }
  if (request.placementMode === 'exact') {
    return { ...placements[0], representativeReason: 'exact_location' };
  }
  const requestedLocation = placements.find((placement) => sameBlockSet(placement.blocks, request.selectedBlocks));
  if (requestedLocation) {
    return { ...requestedLocation, representativeReason: 'requested_location' };
  }
  return {
    ...placements.slice().sort((first, second) =>
      comparePlacementDistance(first.blocks, second.blocks, request.selectedBlocks),
    )[0],
    representativeReason: 'nearest_available',
  };
}

export function buildReservationCandidate(
  request: SearchRequest,
  chamber: Chamber,
  dateKey: string,
  candidateWindow: CandidateSearchWindow,
  blocks: BlockId[],
  placementIndex: number,
  cycleCount: CycleCount,
  metadata: Pick<Candidate, 'availablePlacementCount' | 'hiddenPlacementCount' | 'representativeReason'> = {},
): Candidate {
  return {
    id: buildCandidateId(request, chamber, dateKey, placementIndex, cycleCount),
    chamberId: chamber.id,
    dateKey,
    window: candidateWindow.window,
    occupiedStartAt: getWindowStart(candidateWindow.window),
    occupiedEndAt: getWindowEnd(candidateWindow.window),
    blocks,
    placementMode: request.placementMode,
    placementIndex,
    requestedCycleSpan: chamber.activeConfigRevision.config.type === 'temperature_cycle' ? cycleCount : undefined,
    requestedCondition: candidateWindow.requestedCondition,
    conditionSummary: candidateWindow.conditionSummary,
    chamberConfigRevisionId: chamber.activeConfigRevisionId,
    ...metadata,
  };
}

export function buildCandidateId(
  request: SearchRequest,
  chamber: Chamber,
  dateKey: string,
  placementIndex: number,
  cycleCount: CycleCount,
): string {
  const configToken = chamber.activeConfigRevisionId.replaceAll('-', '');
  return `${chamber.id}-${dateKey}-${configToken}-c${String(cycleCount).replace('.', 'p')}-${request.placementMode}-${placementIndex}`;
}

export function searchReservationCandidates(
  request: SearchRequest,
  context: CandidateSearchEngineContext,
): Candidate[] {
  return searchReservationCandidateResult(request, context).candidates;
}

export function searchReservationCandidateResult(
  request: SearchRequest,
  context: CandidateSearchEngineContext,
): CandidateSearchResult {
  if (request.selectedBlocks.length === 0) {
    return buildCandidateSearchResult(request, [], [
      {
        dateKey: request.desiredDate,
        code: 'empty_blocks',
        message: '希望ブロック条件を1つ以上選択してください。',
      },
    ]);
  }

  if (!isContiguousBlockSet(request.selectedBlocks)) {
    return buildCandidateSearchResult(request, [], [
      {
        dateKey: request.desiredDate,
        code: 'non_contiguous_blocks',
        message: 'ブロックは連続した範囲で選択してください。',
      },
    ]);
  }

  const resolved = resolveCandidateSearchContext(request, context);
  const cycleCount = normalizeCycleCount(request.cycleCount);
  const candidates: Candidate[] = [];

  for (const dateKey of buildSearchDateKeys(request.desiredDate, resolved.searchWindowDays)) {
    for (const chamber of resolved.chambers) {
      const candidateWindow = buildCandidateSearchWindow(request, chamber, dateKey);
      if (!candidateWindow) {
        continue;
      }
      const placementOptions = findCandidatePlacementOptions(request, candidateWindow, resolved, chamber);
      const selectedPlacements = selectDisplayPlacements(placementOptions, request, resolved.sizeModeCandidatePolicy);
      selectedPlacements.forEach((placement) => {
        candidates.push(buildReservationCandidate(
          request,
          chamber,
          dateKey,
          candidateWindow,
          placement.blocks,
          placement.placementIndex,
          cycleCount,
          {
            availablePlacementCount: placementOptions.length,
            hiddenPlacementCount: Math.max(0, placementOptions.length - 1),
            representativeReason: placement.representativeReason,
          },
        ));
      });
    }
  }

  const ranked = resolved.rankCandidates
    ? resolved.rankCandidates([...candidates], resolved)
    : candidates;
  const capped = typeof resolved.maxResults === 'number' ? ranked.slice(0, resolved.maxResults) : [...ranked];
  return buildCandidateSearchResult(request, capped, inferUnavailableReasonsForRequestedDate(request, resolved, capped));
}

function resolveCandidateSearchContext(
  request: SearchRequest,
  context: CandidateSearchEngineContext,
): ResolvedCandidateSearchContext {
  return {
    request,
    reservations: context.reservations,
    suspensions: context.suspensions,
    chambers: context.chambers ?? CHAMBERS,
    searchWindowDays: normalizeSearchWindowDays(context.searchWindowDays),
    maxResults: normalizeMaxResults(context.maxResults),
    sizeModeCandidatePolicy: context.sizeModeCandidatePolicy ?? 'representative-per-bucket',
    rankCandidates: context.rankCandidates,
  };
}

function normalizeSearchWindowDays(value?: number): number {
  if (value === undefined) {
    return DEFAULT_CANDIDATE_SEARCH_WINDOW_DAYS;
  }
  if (!Number.isFinite(value)) {
    return DEFAULT_CANDIDATE_SEARCH_WINDOW_DAYS;
  }
  return Math.max(1, Math.floor(value));
}

function normalizeMaxResults(value?: number): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.floor(value));
}

function conditionMatchesFixedCondition(
  config: FixedConditionConfig,
  requestedCondition?: UserManagedReservationCondition,
): boolean {
  if (!requestedCondition) {
    return false;
  }
  return requestedCondition.temperatureC === config.condition.temperatureC
    && (requestedCondition.humidityRh ?? null) === (config.condition.humidityRh ?? null);
}

function fixedAvailabilityContains(window: CycleWindow, dateKey: string, config: FixedConditionConfig): boolean {
  if (config.availabilityPolicy.type === 'always') {
    return true;
  }
  const allowed = buildFixedConditionWindow(dateKey, config);
  return new Date(window.loadStart).getTime() >= new Date(allowed.loadStart).getTime()
    && new Date(window.unloadEnd).getTime() <= new Date(allowed.unloadEnd).getTime();
}

function selectDisplayPlacements(
  placements: CandidatePlacementOption[],
  request: SearchRequest,
  policy: SizeModeCandidatePolicy,
): CandidatePlacementOption[] {
  if (request.placementMode === 'exact' || policy === 'all-placements') {
    return placements.map((placement) => ({
      ...placement,
      representativeReason: request.placementMode === 'exact' ? 'exact_location' : placement.representativeReason,
    }));
  }
  const representative = selectRepresentativePlacement(placements, request);
  return representative ? [representative] : [];
}

function buildCandidateSearchResult(
  request: SearchRequest,
  candidates: Candidate[],
  unavailableReasons: CandidateUnavailableReason[],
): CandidateSearchResult {
  const requestedDateCandidates = candidates.filter((candidate) => candidateDateKey(candidate) === request.desiredDate);
  const alternativeDateCandidates = candidates.filter((candidate) => candidateDateKey(candidate) !== request.desiredDate);
  const requestedDateAvailable = requestedDateCandidates.length > 0;
  return {
    requestedDate: request.desiredDate,
    requestedDateCandidates,
    alternativeDateCandidates,
    candidates: requestedDateAvailable ? requestedDateCandidates : alternativeDateCandidates,
    requestedDateAvailable,
    unavailableReasons: requestedDateAvailable ? [] : unavailableReasons,
  };
}

function inferUnavailableReasonsForRequestedDate(
  request: SearchRequest,
  context: ResolvedCandidateSearchContext,
  candidates: Candidate[],
): CandidateUnavailableReason[] {
  if (candidates.some((candidate) => candidateDateKey(candidate) === request.desiredDate)) {
    return [];
  }
  const candidateWindows = context.chambers
    .map((chamber) => buildCandidateSearchWindow(request, chamber, request.desiredDate))
    .filter(Boolean);
  if (candidateWindows.length === 0) {
    return [{
      dateKey: request.desiredDate,
      code: 'no_matching_chamber',
      message: '希望日は条件に合うチャンバーがありません。',
    }];
  }
  if (request.placementMode === 'exact') {
    return [{
      dateKey: request.desiredDate,
      code: 'exact_location_unavailable',
      message: '希望日は指定した位置が空いていません。',
    }];
  }
  return [{
    dateKey: request.desiredDate,
    code: 'no_contiguous_placement',
    message: '希望日は必要サイズを満たす連続した空きブロックがありません。',
  }];
}

function candidateDateKey(candidate: Candidate): string {
  return candidate.dateKey ?? toDateKey(new Date(candidate.occupiedStartAt));
}

function sortBlocks(blockIds: BlockId[]): BlockId[] {
  return [...blockIds].sort((first, second) => {
    const firstCell = getBlock(first);
    const secondCell = getBlock(second);
    return firstCell.row === secondCell.row ? firstCell.col - secondCell.col : firstCell.row - secondCell.row;
  });
}

function sameBlockSet(first: BlockId[], second: BlockId[]): boolean {
  return blockSetKey(first) === blockSetKey(second);
}

function blockSetKey(blockIds: BlockId[]): string {
  return sortBlocks(blockIds).join(',');
}

function comparePlacementDistance(first: BlockId[], second: BlockId[], requestedBlocks: BlockId[]): number {
  const requestedCenter = blockCenter(requestedBlocks);
  const firstCenter = blockCenter(first);
  const secondCenter = blockCenter(second);
  const firstDistance = Math.abs(firstCenter.row - requestedCenter.row) + Math.abs(firstCenter.col - requestedCenter.col);
  const secondDistance = Math.abs(secondCenter.row - requestedCenter.row) + Math.abs(secondCenter.col - requestedCenter.col);
  if (firstDistance !== secondDistance) {
    return firstDistance - secondDistance;
  }
  const firstAnchor = blockAnchor(first);
  const secondAnchor = blockAnchor(second);
  if (firstAnchor.row !== secondAnchor.row) {
    return firstAnchor.row - secondAnchor.row;
  }
  if (firstAnchor.col !== secondAnchor.col) {
    return firstAnchor.col - secondAnchor.col;
  }
  return blockSetKey(first).localeCompare(blockSetKey(second));
}

function blockCenter(blockIds: BlockId[]): { row: number; col: number } {
  const cells = blockIds.map(getBlock);
  return {
    row: cells.reduce((total, cell) => total + cell.row, 0) / cells.length,
    col: cells.reduce((total, cell) => total + cell.col, 0) / cells.length,
  };
}

function blockAnchor(blockIds: BlockId[]): { row: number; col: number } {
  const cells = blockIds.map(getBlock);
  return {
    row: Math.min(...cells.map((cell) => cell.row)),
    col: Math.min(...cells.map((cell) => cell.col)),
  };
}
