import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Gauge,
  Pencil,
  Save,
  Search,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import BlockGrid from './components/BlockGrid';
import ChamberBlockMap from './components/ChamberBlockMap';
import CycleAccessWindows from './components/CycleAccessWindows';
import CycleTimeline from './components/CycleTimeline';
import StatusBadge from './components/StatusBadge';
import CalendarDateInput from './components/date/CalendarDateInput';
import SearchFlow, { type SearchStep, type SubmittedSearchState } from './components/search/SearchFlow';
import {
  createChamberConfigRevisionApi,
  createReservationApi,
  createSuspensionApi,
  deleteReservationApi,
  fetchCandidateResult,
  fetchServerState,
  lookupReservationApi,
  publishChamberConfigRevisionApi,
  updateReservationApi,
} from './api/client';
import {
  BLOCKS,
  CHAMBER,
  CHAMBERS,
  DEFAULT_FIXED_CONDITION_CONFIG,
  DEFAULT_TEMPERATURE_CYCLE_CONFIG,
  DEFAULT_USER_MANAGED_CONFIG,
} from './domain/chamber';
import { DEMO_NOW_ISO, INITIAL_RESERVATIONS, INITIAL_SUSPENSIONS } from './domain/mockData';
import type {
  AdminManagedConditionKind,
  BlockId,
  Candidate,
  Chamber,
  ChamberConditionConfig,
  ChamberConfigRevision,
  CycleWindow,
  CycleCount,
  CycleProgramStep,
  FixedConditionConfig,
  PlacementMode,
  Reservation,
  SearchRequest,
  SearchConditionMode,
  Suspension,
  SuspensionDraft,
  TemperatureCycleConfig,
  UserManagedReservationCondition,
} from './domain/types';
import {
  applySuspensionImpact,
  buildCycleWindow,
  buildEnvironmentWindow,
  calculateCyclePeriodMinutes,
  canCommitCandidate,
  canDeleteReservation,
  CYCLE_COUNT_STEP,
  createReservation,
  DEFAULT_SEARCH_CYCLE_COUNT,
  describeChamberConfig,
  describeCycleCount,
  describePlacementMode,
  getAffectedReservations,
  isContiguousBlockSet,
  MAX_CYCLE_COUNT,
  MIN_CYCLE_COUNT,
  minutesToTimeOfDay,
  normalizeCycleCount,
  resolveReservationStatus,
  resolveStepTimes,
  validateCycleProgram,
  windowsOverlap,
} from './domain/reservationRules';
import { searchReservationCandidateResult, type CandidateSearchResult } from './domain/searchEngine';
import { addDaysToDateKey, parseDateKey } from './utils/dateKey';
import { formatBlockList, formatCycleWindow, formatDateRange, formatDateTime } from './utils/format';

type ViewKey = 'search' | 'board' | 'edit' | 'admin';

const DEFAULT_DESIRED_DATE = '2026-06-24';
const DEFAULT_ENVIRONMENT_START_TIME = '09:00';
const DEFAULT_ENVIRONMENT_DURATION_HOURS = 8;
const DEFAULT_REQUESTED_TEMPERATURE_C = 25;
const DEFAULT_REQUESTED_HUMIDITY_RH = 93;
const DEFAULT_SELECTED_BLOCKS: BlockId[] = [];
const DEFAULT_TEST_NAME = '電源制御基板サイクル評価';
const DEFAULT_REQUESTER_NAME = '田中';

const DEPARTMENTS = ['評価技術', '信頼性評価', '品質保証', '製品開発', '生産技術', '設備保全'];

const navItems: Array<{ key: ViewKey; label: string; icon: LucideIcon }> = [
  { key: 'search', label: '空き検索', icon: Search },
  { key: 'board', label: '予約ボード', icon: CalendarDays },
  { key: 'edit', label: 'PIN編集', icon: Pencil },
  { key: 'admin', label: '管理', icon: ShieldAlert },
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function combineLocalDateTime(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

function dayWindow(dateKey: string) {
  const start = parseDateKey(dateKey).toISOString();
  const end = new Date(parseDateKey(dateKey).getTime() + 24 * 60 * 60 * 1000).toISOString();
  return { startAt: start, endAt: end };
}

function chamberLabel(chambers: Chamber[], chamberId: string): string {
  const chamber = chambers.find((item) => item.id === chamberId);
  return chamber ? `${chamber.name} / ${chamber.location}` : chamberId;
}

function configOwnershipLabel(config: ChamberConditionConfig): string {
  return config.type === 'user_managed_condition' ? 'ユーザー温湿度管理' : '管理者管理';
}

function collectSuspendedBlocks(suspensions: Suspension[], startAt: string, endAt: string, chamberId?: string): BlockId[] {
  const blocks = new Set<BlockId>();
  for (const suspension of suspensions) {
    if (chamberId && suspension.chamberId !== chamberId) {
      continue;
    }
    if (!windowsOverlap({ startAt, endAt }, suspension)) {
      continue;
    }
    const targetBlocks = suspension.blocks === 'all' ? BLOCKS.map((block) => block.id) : suspension.blocks;
    targetBlocks.forEach((blockId) => blocks.add(blockId));
  }
  return Array.from(blocks);
}

function collectReservationBlocks(
  reservations: Reservation[],
  startAt: string,
  endAt: string,
  status: 'normal' | 'impacted',
  chamberId?: string,
): BlockId[] {
  const blocks = new Set<BlockId>();
  for (const reservation of reservations) {
    if (reservation.deletedAt) {
      continue;
    }
    if (chamberId && reservation.chamberId !== chamberId) {
      continue;
    }
    const isImpacted = (reservation.impactedBySuspensionIds ?? []).length > 0;
    if ((status === 'impacted') !== isImpacted) {
      continue;
    }
    if (!windowsOverlap(
      { startAt, endAt },
      { startAt: reservation.occupiedStartAt, endAt: reservation.occupiedEndAt },
    )) {
      continue;
    }
    reservation.blocks.forEach((blockId) => blocks.add(blockId));
  }
  return Array.from(blocks);
}

function sortReservationsByStart(reservations: Reservation[]): Reservation[] {
  return [...reservations].sort(
    (a, b) => new Date(a.occupiedStartAt).getTime() - new Date(b.occupiedStartAt).getTime(),
  );
}

function normalizeConfigForPublish(config: ChamberConditionConfig): ChamberConditionConfig {
  if (config.type !== 'temperature_cycle') {
    return config;
  }
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

function previewWindowForChamber(
  dateKey: string,
  searchMode: SearchConditionMode,
  chamber: Chamber,
  cycleCount: CycleCount,
  environmentStartTime: string,
  environmentDurationHours: number,
) {
  if (searchMode === 'environment') {
    return buildEnvironmentWindow(dateKey, environmentStartTime, environmentDurationHours);
  }
  const config = chamber.activeConfigRevision.config;
  if (config.type === 'temperature_cycle') {
    return buildCycleWindow(dateKey, config, cycleCount);
  }
  return buildCycleWindow(dateKey, DEFAULT_TEMPERATURE_CYCLE_CONFIG, cycleCount);
}

function chamberMatchesSearchMode(chamber: Chamber, searchMode: SearchConditionMode): boolean {
  const config = chamber.activeConfigRevision.config;
  return searchMode === 'cycle'
    ? config.type === 'temperature_cycle'
    : config.type !== 'temperature_cycle';
}

function messageForCandidateResult(result: CandidateSearchResult): string {
  if (result.requestedDateCandidates.length > 0) {
    return `希望日に${result.requestedDateCandidates.length}件の候補があります。`;
  }
  if (result.alternativeDateCandidates.length > 0) {
    return `希望日は予約可能な枠がありません。近い日付に${result.alternativeDateCandidates.length}件の候補があります。`;
  }
  return result.unavailableReasons[0]?.message ?? 'この条件では予約可能な候補がありません。';
}

function removeCandidateFromSearchResult(result: CandidateSearchResult, candidateId: string): CandidateSearchResult {
  const requestedDateCandidates = result.requestedDateCandidates.filter((candidate) => candidate.id !== candidateId);
  const alternativeDateCandidates = result.alternativeDateCandidates.filter((candidate) => candidate.id !== candidateId);
  const requestedDateAvailable = requestedDateCandidates.length > 0;
  return {
    ...result,
    requestedDateCandidates,
    alternativeDateCandidates,
    requestedDateAvailable,
    candidates: requestedDateAvailable ? requestedDateCandidates : alternativeDateCandidates,
  };
}

function createLocalConfigRevision(chamber: Chamber, config: ChamberConditionConfig): ChamberConfigRevision {
  const revision = (Number(chamber.activeConfigRevision.revision) || 1) + 1;
  const nowIso = new Date().toISOString();
  return {
    id: `${chamber.id}-config-r${revision}`,
    chamberId: chamber.id,
    revision,
    status: 'active',
    ownership: config.type === 'user_managed_condition' ? 'user_managed' : 'admin_managed',
    adminManagedKind: config.type === 'user_managed_condition' ? undefined : config.type,
    effectiveFrom: nowIso,
    config,
    cyclePeriodMinutes: config.type === 'temperature_cycle' ? config.cyclePeriodMinutes : undefined,
    createdAt: nowIso,
    updatedAt: nowIso,
    publishedAt: nowIso,
  };
}

export default function App() {
  const [activeView, setActiveView] = useState<ViewKey>('search');
  const [chambers, setChambers] = useState<Chamber[]>(CHAMBERS);
  const [configRevisions, setConfigRevisions] = useState<ChamberConfigRevision[]>(
    CHAMBERS.map((chamber) => chamber.activeConfigRevision),
  );
  const [reservations, setReservations] = useState<Reservation[]>(INITIAL_RESERVATIONS);
  const [suspensions, setSuspensions] = useState<Suspension[]>(INITIAL_SUSPENSIONS);
  const [dataMode, setDataMode] = useState<'server' | 'local'>('local');

  const [desiredDate, setDesiredDate] = useState(DEFAULT_DESIRED_DATE);
  const [searchMode, setSearchMode] = useState<SearchConditionMode>('cycle');
  const [cycleCount, setCycleCount] = useState<CycleCount>(DEFAULT_SEARCH_CYCLE_COUNT);
  const [requestedTemperatureC, setRequestedTemperatureC] = useState(DEFAULT_REQUESTED_TEMPERATURE_C);
  const [requestedHumidityRh, setRequestedHumidityRh] = useState(DEFAULT_REQUESTED_HUMIDITY_RH);
  const [environmentStartTime, setEnvironmentStartTime] = useState(DEFAULT_ENVIRONMENT_START_TIME);
  const [environmentDurationHours, setEnvironmentDurationHours] = useState(DEFAULT_ENVIRONMENT_DURATION_HOURS);
  const [placementMode, setPlacementMode] = useState<PlacementMode>('size');
  const [selectedBlocks, setSelectedBlocks] = useState<BlockId[]>(DEFAULT_SELECTED_BLOCKS);
  const [testName, setTestName] = useState('電源基板サイクル評価');
  const [requesterName, setRequesterName] = useState('田中');
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [contactNote, setContactNote] = useState('');
  const [searchStep, setSearchStep] = useState<SearchStep>('conditions');
  const [submittedSearch, setSubmittedSearch] = useState<SubmittedSearchState | null>(null);
  const [candidateSearchResult, setCandidateSearchResult] = useState<CandidateSearchResult | null>(null);
  const [candidateResults, setCandidateResults] = useState<Candidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [lastReservation, setLastReservation] = useState<Reservation | null>(null);
  const [searchMessage, setSearchMessage] = useState('');

  const [editLookupId, setEditLookupId] = useState('');
  const [editPin, setEditPin] = useState('');
  const [activeEditId, setActiveEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({
    testName: '',
    name: '',
    department: DEPARTMENTS[0],
    contactNote: '',
  });
  const [editMessage, setEditMessage] = useState('');

  const [boardDate, setBoardDate] = useState('2026-06-24');
  const [boardChamberId, setBoardChamberId] = useState(CHAMBER.id);

  const [suspensionReason, setSuspensionReason] = useState('点検');
  const [suspensionStartDate, setSuspensionStartDate] = useState('2026-06-24');
  const [suspensionStartTime, setSuspensionStartTime] = useState('09:00');
  const [suspensionEndDate, setSuspensionEndDate] = useState('2026-06-25');
  const [suspensionEndTime, setSuspensionEndTime] = useState('17:00');
  const [suspensionAllBlocks, setSuspensionAllBlocks] = useState(false);
  const [suspensionBlocks, setSuspensionBlocks] = useState<BlockId[]>(['r1c1']);
  const [suspensionChamberId, setSuspensionChamberId] = useState(CHAMBER.id);
  const [adminMessage, setAdminMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchServerState()
      .then((state) => {
        if (cancelled) {
          return;
        }
        setChambers(state.chambers);
        setConfigRevisions(state.configRevisions ?? state.chambers.map((chamber) => chamber.activeConfigRevision));
        setReservations(state.reservations);
        setSuspensions(state.suspensions);
        if (state.chambers.length > 0) {
          setBoardChamberId((current) =>
            state.chambers.some((chamber) => chamber.id === current) ? current : state.chambers[0].id,
          );
          setSuspensionChamberId((current) =>
            state.chambers.some((chamber) => chamber.id === current) ? current : state.chambers[0].id,
          );
        }
        setDataMode('server');
      })
      .catch(() => {
        if (!cancelled) {
          setDataMode('local');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const requestedCondition = useMemo<UserManagedReservationCondition>(() => ({
    temperatureC: requestedTemperatureC,
    humidityRh: requestedHumidityRh,
  }), [requestedHumidityRh, requestedTemperatureC]);

  const primarySearchChamber = useMemo(
    () => chambers.find((chamber) => chamberMatchesSearchMode(chamber, searchMode)) ?? chambers[0] ?? CHAMBER,
    [chambers, searchMode],
  );
  const searchWindow = useMemo(
    () => previewWindowForChamber(
      desiredDate,
      searchMode,
      primarySearchChamber,
      cycleCount,
      environmentStartTime,
      environmentDurationHours,
    ),
    [cycleCount, desiredDate, environmentDurationHours, environmentStartTime, primarySearchChamber, searchMode],
  );
  const selectionIsContiguous = selectedBlocks.length === 0 || isContiguousBlockSet(selectedBlocks);
  const searchValidationMessage = selectedBlocks.length === 0
    ? '希望ブロックを1つ以上選択してください。'
    : !selectionIsContiguous
      ? 'ブロックは連続した範囲で選択してください。'
      : !testName || !requesterName || !department
        ? '検索条件を入力してください。'
        : '';
  const canSearch = searchValidationMessage === '';
  const candidates = searchStep === 'results' ? candidateResults : [];

  const boardChamber = useMemo(
    () => chambers.find((chamber) => chamber.id === boardChamberId) ?? chambers[0] ?? CHAMBER,
    [boardChamberId, chambers],
  );
  const boardRange = useMemo(() => dayWindow(boardDate), [boardDate]);
  const boardSuspendedBlocks = useMemo(
    () => collectSuspendedBlocks(suspensions, boardRange.startAt, boardRange.endAt, boardChamberId),
    [boardChamberId, boardRange.endAt, boardRange.startAt, suspensions],
  );
  const boardImpactedBlocks = useMemo(
    () => collectReservationBlocks(reservations, boardRange.startAt, boardRange.endAt, 'impacted', boardChamberId),
    [boardChamberId, boardRange.endAt, boardRange.startAt, reservations],
  );
  const boardReservedBlocks = useMemo(
    () => collectReservationBlocks(reservations, boardRange.startAt, boardRange.endAt, 'normal', boardChamberId),
    [boardChamberId, boardRange.endAt, boardRange.startAt, reservations],
  );
  const boardReservations = useMemo(
    () =>
      sortReservationsByStart(reservations).filter((reservation) =>
        reservation.chamberId === boardChamberId
        && !reservation.deletedAt
        && windowsOverlap(
          { startAt: boardRange.startAt, endAt: boardRange.endAt },
          { startAt: reservation.occupiedStartAt, endAt: reservation.occupiedEndAt },
        ),
      ),
    [boardChamberId, boardRange.endAt, boardRange.startAt, reservations],
  );

  const suspensionDraft = useMemo<SuspensionDraft>(() => ({
    chamberId: suspensionChamberId,
    reason: suspensionReason,
    startAt: combineLocalDateTime(suspensionStartDate, suspensionStartTime),
    endAt: combineLocalDateTime(suspensionEndDate, suspensionEndTime),
    blocks: suspensionAllBlocks ? 'all' : suspensionBlocks,
  }), [
    suspensionAllBlocks,
    suspensionBlocks,
    suspensionChamberId,
    suspensionEndDate,
    suspensionEndTime,
    suspensionReason,
    suspensionStartDate,
    suspensionStartTime,
  ]);
  const affectedReservations = useMemo(
    () => getAffectedReservations(suspensionDraft, reservations),
    [reservations, suspensionDraft],
  );

  const activeReservation = activeEditId
    ? reservations.find((reservation) => reservation.id === activeEditId) ?? null
    : null;

  function handleSelectedBlocksChange(blocks: BlockId[]) {
    setSelectedBlocks(blocks);
    if (
      searchMessage === '希望ブロックを1つ以上選択してください。'
      || searchMessage === 'ブロックは連続した範囲で選択してください。'
    ) {
      setSearchMessage('');
    }
  }

  function buildCurrentSearchRequest(): SearchRequest {
    return {
      desiredDate,
      selectedBlocks,
      placementMode,
      conditionMode: searchMode,
      cycleCount,
      environmentStartTime: searchMode === 'environment' ? environmentStartTime : undefined,
      environmentDurationHours: searchMode === 'environment' ? environmentDurationHours : undefined,
      requestedCondition: searchMode === 'environment' ? requestedCondition : undefined,
    };
  }

  function createSubmittedSearchSnapshot(
    request: SearchRequest,
    details: Pick<SubmittedSearchState, 'testName' | 'requesterName' | 'department' | 'contactNote'>,
  ): SubmittedSearchState {
    const submittedMode = request.conditionMode ?? 'cycle';
    const submittedChamber = chambers.find((chamber) => chamberMatchesSearchMode(chamber, submittedMode)) ?? chambers[0] ?? CHAMBER;
    const submittedWindow = previewWindowForChamber(
      request.desiredDate,
      submittedMode,
      submittedChamber,
      request.cycleCount,
      request.environmentStartTime ?? DEFAULT_ENVIRONMENT_START_TIME,
      request.environmentDurationHours ?? DEFAULT_ENVIRONMENT_DURATION_HOURS,
    );
    return {
      id: `search-${Date.now()}`,
      request: {
        ...request,
        selectedBlocks: [...request.selectedBlocks],
        requestedCondition: request.requestedCondition ? { ...request.requestedCondition } : undefined,
      },
      searchMode: submittedMode,
      desiredDate: request.desiredDate,
      cycleCount: request.cycleCount,
      environmentStartTime: request.environmentStartTime,
      environmentDurationHours: request.environmentDurationHours,
      requestedCondition: request.requestedCondition ? { ...request.requestedCondition } : undefined,
      placementMode: request.placementMode,
      selectedBlocks: [...request.selectedBlocks],
      testName: details.testName,
      requesterName: details.requesterName,
      department: details.department,
      contactNote: details.contactNote,
      previewWindow: submittedWindow,
      submittedAt: new Date().toISOString(),
    };
  }

  async function loadCandidateResultForSubmittedSearch(submitted: SubmittedSearchState): Promise<CandidateSearchResult> {
    try {
      return dataMode === 'server'
        ? await fetchCandidateResult(submitted.request)
        : searchReservationCandidateResult(submitted.request, { reservations, suspensions, chambers });
    } catch {
      setDataMode('local');
      return searchReservationCandidateResult(submitted.request, { reservations, suspensions, chambers });
    }
  }

  async function showSubmittedSearchResults(submitted: SubmittedSearchState) {
    setSubmittedSearch(submitted);
    setSearchStep('results');
    setLastReservation(null);
    setSelectedCandidateId(null);
    const result = await loadCandidateResultForSubmittedSearch(submitted);
    setCandidateSearchResult(result);
    setCandidateResults(result.candidates);
    setSelectedCandidateId(result.candidates[0]?.id ?? null);
    setSearchMessage(messageForCandidateResult(result));
  }

  async function runSearch() {
    setLastReservation(null);
    if (!canSearch) {
      setCandidateResults([]);
      setCandidateSearchResult(null);
      setSubmittedSearch(null);
      setSelectedCandidateId(null);
      setSearchStep('conditions');
      setSearchMessage(searchValidationMessage || '検索条件を入力してください。');
      return;
    }
    const request = buildCurrentSearchRequest();
    const submitted = createSubmittedSearchSnapshot(request, {
      testName,
      requesterName,
      department,
      contactNote,
    });
    setSubmittedSearch(submitted);
    setSearchStep('results');
    setSelectedCandidateId(null);
    try {
      const result = dataMode === 'server'
        ? await fetchCandidateResult(submitted.request)
        : searchReservationCandidateResult(submitted.request, { reservations, suspensions, chambers });
      setCandidateSearchResult(result);
      setCandidateResults(result.candidates);
      setSelectedCandidateId(result.candidates[0]?.id ?? null);
      setSearchMessage(messageForCandidateResult(result));
    } catch {
      const result = searchReservationCandidateResult(submitted.request, { reservations, suspensions, chambers });
      setCandidateSearchResult(result);
      setCandidateResults(result.candidates);
      setSelectedCandidateId(result.candidates[0]?.id ?? null);
      setDataMode('local');
      setSearchMessage(messageForCandidateResult(result));
    }
  }

  async function confirmReservation(candidate: Candidate) {
    if (!submittedSearch) {
      setSearchMessage('検索済み条件が見つかりません。条件を入力して再検索してください。');
      setSearchStep('conditions');
      return;
    }
    const submitted = submittedSearch;
    if (!canCommitCandidate(candidate, reservations, suspensions, chambers)) {
      setSearchMessage('候補の空き状況が変わりました。再検索してください。');
      await showSubmittedSearchResults(submitted);
      return;
    }
    const conditionForReservation = submitted.searchMode === 'environment' && candidate.requestedCondition
      ? submitted.requestedCondition
      : undefined;
    try {
      const created = dataMode === 'server'
        ? await createReservationApi({
          candidateId: candidate.id,
          desiredDate: submitted.request.desiredDate,
          selectedBlocks: submitted.request.selectedBlocks,
          placementMode: submitted.request.placementMode,
          conditionMode: submitted.searchMode,
          cycleCount: submitted.request.cycleCount,
          environmentStartTime: submitted.request.environmentStartTime,
          environmentDurationHours: submitted.request.environmentDurationHours,
          requestedCondition: conditionForReservation,
          requester: { name: submitted.requesterName, department: submitted.department },
          testName: submitted.testName,
          contactNote: submitted.contactNote,
        })
        : createReservation({
          candidate,
          requester: { name: submitted.requesterName, department: submitted.department },
          testName: submitted.testName,
          contactNote: submitted.contactNote,
          requestedCondition: conditionForReservation,
        }, reservations, DEMO_NOW_ISO);
      setReservations((current) => [created, ...current]);
      setLastReservation(created);
      setSearchMessage(`予約を確定しました。編集PIN: ${created.pin}`);
      setCandidateResults((current) => current.filter((item) => item.id !== candidate.id));
      setCandidateSearchResult((current) => current ? removeCandidateFromSearchResult(current, candidate.id) : current);
    } catch {
      setSearchMessage('予約確定に失敗しました。再検索してください。');
      await showSubmittedSearchResults(submitted);
    }
  }

  function returnToSearchConditions({ restoreSubmitted = true }: { restoreSubmitted?: boolean } = {}) {
    if (restoreSubmitted && submittedSearch) {
      setDesiredDate(submittedSearch.request.desiredDate);
      setSearchMode(submittedSearch.searchMode);
      setCycleCount(submittedSearch.request.cycleCount);
      setRequestedTemperatureC(submittedSearch.requestedCondition?.temperatureC ?? DEFAULT_REQUESTED_TEMPERATURE_C);
      setRequestedHumidityRh(submittedSearch.requestedCondition?.humidityRh ?? DEFAULT_REQUESTED_HUMIDITY_RH);
      setEnvironmentStartTime(submittedSearch.request.environmentStartTime ?? DEFAULT_ENVIRONMENT_START_TIME);
      setEnvironmentDurationHours(submittedSearch.request.environmentDurationHours ?? DEFAULT_ENVIRONMENT_DURATION_HOURS);
      setPlacementMode(submittedSearch.request.placementMode);
      setSelectedBlocks([...submittedSearch.request.selectedBlocks]);
      setTestName(submittedSearch.testName);
      setRequesterName(submittedSearch.requesterName);
      setDepartment(submittedSearch.department);
      setContactNote(submittedSearch.contactNote);
    }
    setSearchStep('conditions');
    setSubmittedSearch(null);
    setCandidateSearchResult(null);
    setCandidateResults([]);
    setSelectedCandidateId(null);
    setSearchMessage('');
    setLastReservation(null);
  }

  function startNewSearch() {
    setDesiredDate(DEFAULT_DESIRED_DATE);
    setSearchMode('cycle');
    setCycleCount(DEFAULT_SEARCH_CYCLE_COUNT);
    setRequestedTemperatureC(DEFAULT_REQUESTED_TEMPERATURE_C);
    setRequestedHumidityRh(DEFAULT_REQUESTED_HUMIDITY_RH);
    setEnvironmentStartTime(DEFAULT_ENVIRONMENT_START_TIME);
    setEnvironmentDurationHours(DEFAULT_ENVIRONMENT_DURATION_HOURS);
    setPlacementMode('size');
    setSelectedBlocks([]);
    setTestName(DEFAULT_TEST_NAME);
    setRequesterName(DEFAULT_REQUESTER_NAME);
    setDepartment(DEPARTMENTS[0]);
    setContactNote('');
    returnToSearchConditions({ restoreSubmitted: false });
  }

  async function shiftSubmittedSearchDate(dayOffset: number) {
    if (!submittedSearch) {
      return;
    }
    const nextDate = addDaysToDateKey(submittedSearch.request.desiredDate, dayOffset);
    const nextRequest: SearchRequest = {
      ...submittedSearch.request,
      desiredDate: nextDate,
      selectedBlocks: [...submittedSearch.request.selectedBlocks],
      requestedCondition: submittedSearch.request.requestedCondition
        ? { ...submittedSearch.request.requestedCondition }
        : undefined,
    };
    setDesiredDate(nextDate);
    const nextSubmitted = createSubmittedSearchSnapshot(nextRequest, {
      testName: submittedSearch.testName,
      requesterName: submittedSearch.requesterName,
      department: submittedSearch.department,
      contactNote: submittedSearch.contactNote,
    });
    await showSubmittedSearchResults(nextSubmitted);
  }

  async function lookupEditReservation() {
    const reservation = reservations.find((item) => item.id === editLookupId && item.pin === editPin && !item.deletedAt);
    if (dataMode === 'server') {
      try {
        const serverReservation = await lookupReservationApi({ reservationId: editLookupId, pin: editPin });
        setActiveEditId(serverReservation.id);
        setEditDraft({
          testName: serverReservation.testName,
          name: serverReservation.requester.name,
          department: serverReservation.requester.department,
          contactNote: serverReservation.contactNote ?? '',
        });
        setEditMessage('');
        return;
      } catch {
        setEditMessage('予約IDまたはPINが一致しません。');
        return;
      }
    }
    if (!reservation) {
      setEditMessage('予約IDまたはPINが一致しません。');
      return;
    }
    setActiveEditId(reservation.id);
    setEditDraft({
      testName: reservation.testName,
      name: reservation.requester.name,
      department: reservation.requester.department,
      contactNote: reservation.contactNote ?? '',
    });
    setEditMessage('');
  }

  async function saveEditReservation() {
    if (!activeReservation) {
      return;
    }
    try {
      const updated = dataMode === 'server'
        ? await updateReservationApi({
          reservationId: activeReservation.id,
          pin: editPin,
          testName: editDraft.testName,
          requester: { name: editDraft.name, department: editDraft.department },
          contactNote: editDraft.contactNote,
        })
        : {
          ...activeReservation,
          testName: editDraft.testName,
          requester: { name: editDraft.name, department: editDraft.department },
          contactNote: editDraft.contactNote,
          updatedAt: DEMO_NOW_ISO,
        };
      setReservations((current) => current.map((reservation) => reservation.id === updated.id ? updated : reservation));
      setEditMessage('予約内容を更新しました。');
    } catch {
      setEditMessage('更新できませんでした。PINと予約状態を確認してください。');
    }
  }

  async function deleteEditReservation() {
    if (!activeReservation) {
      return;
    }
    if (!canDeleteReservation(activeReservation, DEMO_NOW_ISO)) {
      setEditMessage('利用後の予約は削除できません。');
      return;
    }
    try {
      const deleted = dataMode === 'server'
        ? await deleteReservationApi({ reservationId: activeReservation.id, pin: editPin })
        : { ...activeReservation, deletedAt: DEMO_NOW_ISO, updatedAt: DEMO_NOW_ISO };
      setReservations((current) => current.map((reservation) => reservation.id === deleted.id ? deleted : reservation));
      setActiveEditId(null);
      setEditMessage('予約を削除しました。');
    } catch {
      setEditMessage('削除できませんでした。PINと予約状態を確認してください。');
    }
  }

  async function createSuspension() {
    try {
      const result = dataMode === 'server'
        ? await createSuspensionApi(suspensionDraft)
        : {
          suspension: {
            id: `SP-${String(suspensions.length + 1).padStart(3, '0')}`,
            ...suspensionDraft,
            createdAt: DEMO_NOW_ISO,
            affectedReservationIds: affectedReservations.map((reservation) => reservation.id),
          } as Suspension,
          affectedReservations,
        };
      setSuspensions((current) => [result.suspension, ...current]);
      setReservations((current) => applySuspensionImpact(current, result.suspension));
      setAdminMessage(`${result.affectedReservations.length}件の予約に影響を付与して一時停止しました。`);
    } catch {
      setAdminMessage('一時利用停止を登録できませんでした。');
    }
  }

  async function publishChamberConfig(chamberId: string, draftConfig: ChamberConditionConfig) {
    const chamber = chambers.find((item) => item.id === chamberId);
    if (!chamber) {
      throw new Error('chamber_not_found');
    }
    const config = normalizeConfigForPublish(draftConfig);
    if (dataMode === 'server') {
      const draft = await createChamberConfigRevisionApi(chamberId, config);
      const result = await publishChamberConfigRevisionApi(chamberId, draft.id);
      setChambers(result.chambers);
      setConfigRevisions(result.configRevisions);
      setCandidateResults([]);
      setCandidateSearchResult(null);
      setSubmittedSearch(null);
      setSelectedCandidateId(null);
      setSearchStep('conditions');
      return;
    }
    const revision = createLocalConfigRevision(chamber, config);
    setConfigRevisions((current) => [revision, ...current.filter((item) => item.id !== revision.id)]);
    setChambers((current) => current.map((item) => item.id === chamberId
      ? {
        ...item,
        type: config.type,
        activeConfigRevisionId: revision.id,
        activeConfigRevision: revision,
      }
      : item,
    ));
    setCandidateResults([]);
    setCandidateSearchResult(null);
    setSubmittedSearch(null);
    setSelectedCandidateId(null);
    setSearchStep('conditions');
  }

  return (
    <div className="min-h-screen bg-[#edf1ee] text-chamber-ink lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <aside className="border-b border-chamber-line bg-[#f8faf8] lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="grid gap-5 p-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-chamber-steel">ChamberReserve</div>
            <h1 className="mt-2 text-2xl font-semibold leading-tight">環境試験予約</h1>
            <div className="mt-2 inline-flex border border-chamber-line bg-white px-2 py-1 text-xs font-semibold text-slate-600">
              {dataMode === 'server' ? 'Server state' : 'Browser state'}
            </div>
          </div>
          <nav className="grid gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeView === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={[
                    'flex items-center gap-3 border px-3 py-3 text-left text-sm font-semibold transition',
                    active
                      ? 'border-chamber-reserved bg-chamber-reserved text-white'
                      : 'border-chamber-line bg-white text-chamber-ink hover:border-chamber-reserved',
                  ].join(' ')}
                  onClick={() => setActiveView(item.key)}
                >
                  <Icon size={18} />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="grid gap-2 border border-chamber-line bg-white p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">公開チャンバー</span>
              <span className="font-semibold">{chambers.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">予約</span>
              <span className="font-semibold">{reservations.filter((reservation) => !reservation.deletedAt).length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">設定版</span>
              <span className="font-semibold">{configRevisions.length}</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-w-0">
        {activeView === 'search' ? (
          <SearchFlow
            searchStep={searchStep}
            submittedSearch={submittedSearch}
            desiredDate={desiredDate}
            setDesiredDate={setDesiredDate}
            searchMode={searchMode}
            setSearchMode={setSearchMode}
            cycleCount={cycleCount}
            setCycleCount={setCycleCount}
            requestedTemperatureC={requestedTemperatureC}
            setRequestedTemperatureC={setRequestedTemperatureC}
            requestedHumidityRh={requestedHumidityRh}
            setRequestedHumidityRh={setRequestedHumidityRh}
            environmentStartTime={environmentStartTime}
            setEnvironmentStartTime={setEnvironmentStartTime}
            environmentDurationHours={environmentDurationHours}
            setEnvironmentDurationHours={setEnvironmentDurationHours}
            placementMode={placementMode}
            setPlacementMode={setPlacementMode}
            selectedBlocks={selectedBlocks}
            setSelectedBlocks={handleSelectedBlocksChange}
            selectionIsContiguous={selectionIsContiguous}
            testName={testName}
            setTestName={setTestName}
            requesterName={requesterName}
            setRequesterName={setRequesterName}
            department={department}
            setDepartment={setDepartment}
            contactNote={contactNote}
            setContactNote={setContactNote}
            candidates={candidates}
            candidateResult={candidateSearchResult}
            chambers={chambers}
            searchWindow={searchWindow}
            searchMessage={searchMessage}
            lastReservation={lastReservation}
            selectedCandidateId={selectedCandidateId}
            setSelectedCandidateId={setSelectedCandidateId}
            onSearch={runSearch}
            onConfirm={confirmReservation}
            onChangeConditions={returnToSearchConditions}
            onNewSearch={startNewSearch}
            onShiftSearchDate={shiftSubmittedSearchDate}
          />
        ) : null}

        {activeView === 'board' ? (
          <BoardView
            chambers={chambers}
            boardChamber={boardChamber}
            boardChamberId={boardChamberId}
            setBoardChamberId={setBoardChamberId}
            boardDate={boardDate}
            setBoardDate={setBoardDate}
            boardReservedBlocks={boardReservedBlocks}
            boardSuspendedBlocks={boardSuspendedBlocks}
            boardImpactedBlocks={boardImpactedBlocks}
            reservations={boardReservations}
          />
        ) : null}

        {activeView === 'edit' ? (
          <EditView
            chambers={chambers}
            editLookupId={editLookupId}
            setEditLookupId={setEditLookupId}
            editPin={editPin}
            setEditPin={setEditPin}
            onLookup={lookupEditReservation}
            activeReservation={activeReservation}
            editDraft={editDraft}
            setEditDraft={setEditDraft}
            editMessage={editMessage}
            onSave={saveEditReservation}
            onDelete={deleteEditReservation}
          />
        ) : null}

        {activeView === 'admin' ? (
          <AdminView
            chambers={chambers}
            configRevisions={configRevisions}
            onPublishConfig={publishChamberConfig}
            suspensionChamberId={suspensionChamberId}
            setSuspensionChamberId={setSuspensionChamberId}
            suspensionReason={suspensionReason}
            setSuspensionReason={setSuspensionReason}
            suspensionStartDate={suspensionStartDate}
            setSuspensionStartDate={setSuspensionStartDate}
            suspensionStartTime={suspensionStartTime}
            setSuspensionStartTime={setSuspensionStartTime}
            suspensionEndDate={suspensionEndDate}
            setSuspensionEndDate={setSuspensionEndDate}
            suspensionEndTime={suspensionEndTime}
            setSuspensionEndTime={setSuspensionEndTime}
            suspensionAllBlocks={suspensionAllBlocks}
            setSuspensionAllBlocks={setSuspensionAllBlocks}
            suspensionBlocks={suspensionBlocks}
            setSuspensionBlocks={setSuspensionBlocks}
            affectedReservations={affectedReservations}
            adminMessage={adminMessage}
            onCreateSuspension={createSuspension}
          />
        ) : null}
      </main>
    </div>
  );
}

interface SearchViewProps {
  desiredDate: string;
  setDesiredDate: (value: string) => void;
  searchMode: SearchConditionMode;
  setSearchMode: (value: SearchConditionMode) => void;
  cycleCount: CycleCount;
  setCycleCount: (value: CycleCount) => void;
  requestedTemperatureC: number;
  setRequestedTemperatureC: (value: number) => void;
  requestedHumidityRh: number;
  setRequestedHumidityRh: (value: number) => void;
  environmentStartTime: string;
  setEnvironmentStartTime: (value: string) => void;
  environmentDurationHours: number;
  setEnvironmentDurationHours: (value: number) => void;
  placementMode: PlacementMode;
  setPlacementMode: (value: PlacementMode) => void;
  selectedBlocks: BlockId[];
  setSelectedBlocks: (value: BlockId[]) => void;
  selectionIsContiguous: boolean;
  testName: string;
  setTestName: (value: string) => void;
  requesterName: string;
  setRequesterName: (value: string) => void;
  department: string;
  setDepartment: (value: string) => void;
  contactNote: string;
  setContactNote: (value: string) => void;
  candidates: Candidate[];
  chambers: Chamber[];
  searchWindow: ReturnType<typeof buildCycleWindow>;
  searchMessage: string;
  lastReservation: Reservation | null;
  onSearch: () => void;
  onConfirm: (candidate: Candidate) => void;
}

function SearchView({
  desiredDate,
  setDesiredDate,
  searchMode,
  setSearchMode,
  cycleCount,
  setCycleCount,
  requestedTemperatureC,
  setRequestedTemperatureC,
  requestedHumidityRh,
  setRequestedHumidityRh,
  environmentStartTime,
  setEnvironmentStartTime,
  environmentDurationHours,
  setEnvironmentDurationHours,
  placementMode,
  setPlacementMode,
  selectedBlocks,
  setSelectedBlocks,
  selectionIsContiguous,
  testName,
  setTestName,
  requesterName,
  setRequesterName,
  department,
  setDepartment,
  contactNote,
  setContactNote,
  candidates,
  chambers,
  searchWindow,
  searchMessage,
  lastReservation,
  onSearch,
  onConfirm,
}: SearchViewProps) {
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedCandidateId) ?? candidates[0] ?? null,
    [candidates, selectedCandidateId],
  );

  useEffect(() => {
    setSelectedCandidateId((current) =>
      current && candidates.some((candidate) => candidate.id === current) ? current : candidates[0]?.id ?? null,
    );
  }, [candidates]);

  return (
    <section className="grid gap-5 p-5 xl:p-7">
      <header className="grid gap-3 border-b border-chamber-line pb-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <div className="inline-flex items-center gap-2 border border-chamber-line bg-white px-2 py-1 text-xs font-semibold text-slate-600">
            <Gauge size={14} />
            {searchMode === 'cycle' ? '4 x 3 ブロック / サイクルアクセス窓' : '4 x 3 ブロック / 温湿度一致検索'}
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-normal">空き検索</h2>
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <Metric label="候補" value={`${candidates.length}`} />
          <Metric label="希望ブロック" value={selectedBlocks.length > 0 ? `${selectedBlocks.length}ブロック` : '未選択'} />
          <Metric label="条件" value={searchMode === 'cycle' ? describeCycleCount(cycleCount) : `${requestedTemperatureC}C / ${requestedHumidityRh}%RH`} />
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="grid gap-5">
          <Panel title="検索条件" icon={Search}>
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <CalendarDateInput label="希望日" value={desiredDate} onChange={setDesiredDate} />
                <Segmented
                  label="試験条件"
                  value={searchMode}
                  options={[
                    { value: 'cycle', label: 'サイクル試験' },
                    { value: 'environment', label: '温湿度指定' },
                  ]}
                  onChange={(value) => setSearchMode(value as SearchConditionMode)}
                />
              </div>
              {searchMode === 'cycle' ? (
                <div className="grid gap-3">
                  <Field label="サイクル数">
                    <div className="grid grid-cols-[44px_1fr_44px] gap-2">
                      <button
                        type="button"
                        className="border border-chamber-line bg-white text-lg font-semibold"
                        onClick={() => setCycleCount(normalizeCycleCount(cycleCount - CYCLE_COUNT_STEP))}
                        aria-label="サイクル数を減らす"
                      >
                        -
                      </button>
                      <input
                        className="h-10 w-full border border-chamber-line px-3"
                        type="number"
                        min={MIN_CYCLE_COUNT}
                        max={MAX_CYCLE_COUNT}
                        step={CYCLE_COUNT_STEP}
                        value={cycleCount}
                        onChange={(event) => setCycleCount(normalizeCycleCount(event.target.value))}
                      />
                      <button
                        type="button"
                        className="border border-chamber-line bg-white text-lg font-semibold"
                        onClick={() => setCycleCount(normalizeCycleCount(cycleCount + CYCLE_COUNT_STEP))}
                        aria-label="サイクル数を増やす"
                      >
                        +
                      </button>
                    </div>
                    <div className="text-xs font-semibold text-slate-500">
                      標準は10サイクル。1日1サイクルの完了回数を整数で指定します。
                    </div>
                  </Field>
                  <CycleAccessWindows window={searchWindow} compact />
                </div>
              ) : (
                <div className="grid gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="開始時刻">
                      <input className="h-10 w-full border border-chamber-line px-3" type="time" value={environmentStartTime} onChange={(event) => setEnvironmentStartTime(event.target.value)} />
                    </Field>
                    <Field label="占有時間">
                      <input
                        className="h-10 w-full border border-chamber-line px-3"
                        type="number"
                        min="0.25"
                        step="0.25"
                        value={environmentDurationHours}
                        onChange={(event) => setEnvironmentDurationHours(Math.max(0.25, Number(event.target.value) || 0.25))}
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                  <Field label="希望温度">
                    <input className="h-10 w-full border border-chamber-line px-3" type="number" value={requestedTemperatureC} onChange={(event) => setRequestedTemperatureC(Number(event.target.value))} />
                  </Field>
                  <Field label="希望湿度">
                    <input className="h-10 w-full border border-chamber-line px-3" type="number" value={requestedHumidityRh} onChange={(event) => setRequestedHumidityRh(Number(event.target.value))} />
                  </Field>
                  </div>
                  <div className="border border-chamber-line bg-white px-3 py-2">
                    <div className="text-xs font-semibold text-slate-500">終了日時</div>
                    <div className="text-sm font-semibold">{formatDateTime(searchWindow.unloadEnd)}</div>
                  </div>
                </div>
              )}
              <Segmented
                label="ブロック指定"
                value={placementMode}
                options={[
                  { value: 'size', label: 'サイズだけ' },
                  { value: 'exact', label: '位置まで' },
                ]}
                onChange={(value) => setPlacementMode(value as PlacementMode)}
              />
              {searchMode === 'cycle' ? (
                <CycleTimeline window={searchWindow} dense />
              ) : (
                <div className="border border-chamber-line bg-white px-3 py-2">
                  <div className="text-xs font-semibold text-slate-500">占有時間</div>
                  <div className="text-sm font-semibold">{formatDateRange(searchWindow.loadStart, searchWindow.unloadEnd)}</div>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="希望ブロック条件" icon={SlidersHorizontal}>
            <BlockGrid
              size="large"
              selectedBlocks={selectedBlocks}
              onChange={setSelectedBlocks}
              title="希望ブロック"
            />
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
              <Legend tone="bg-chamber-reserved" label="選択中" />
            </div>
            <div className="mt-3 border border-chamber-line bg-white px-3 py-2 text-sm font-semibold text-slate-600">
              ここでは必要な形と大きさを指定します。予約済みや一時停止は候補生成時にチャンバーごとに判定します。
            </div>
            {selectedBlocks.length > 0 && !selectionIsContiguous ? (
              <div className="mt-3 border border-chamber-blocked bg-white px-3 py-2 text-sm font-semibold text-chamber-blocked">
                断片化したブロックは候補化しません。
              </div>
            ) : null}
          </Panel>
        </div>

        <div className="grid gap-5">
          <Panel title="予約情報" icon={ClipboardCheck}>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="試験名">
                <input className="h-10 w-full border border-chamber-line px-3" value={testName} onChange={(event) => setTestName(event.target.value)} />
              </Field>
              <Field label="申請者">
                <input className="h-10 w-full border border-chamber-line px-3" value={requesterName} onChange={(event) => setRequesterName(event.target.value)} />
              </Field>
              <Field label="所属部署">
                <select className="h-10 w-full border border-chamber-line px-3" value={department} onChange={(event) => setDepartment(event.target.value)}>
                  {DEPARTMENTS.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label="備考">
                <input className="h-10 w-full border border-chamber-line px-3" value={contactNote} onChange={(event) => setContactNote(event.target.value)} />
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" className="inline-flex items-center gap-2 bg-chamber-reserved px-4 py-2 font-semibold text-white" onClick={onSearch}>
                <Search size={18} />
                検索
              </button>
              {searchMessage ? <span className="text-sm font-semibold text-slate-700">{searchMessage}</span> : null}
            </div>
            {lastReservation ? (
              <div className="mt-4 border border-chamber-reserved bg-chamber-access px-4 py-3">
                <div className="text-sm font-semibold">予約ID {lastReservation.id}</div>
                <div className="mt-1 text-2xl font-semibold tracking-[0.16em]">PIN {lastReservation.pin}</div>
              </div>
            ) : null}
          </Panel>

          {selectedCandidate ? (
            <Panel title="選択中候補" icon={Gauge}>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="grid content-start gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="border border-chamber-line bg-chamber-panel px-2 py-1 text-xs font-semibold">
                      {chamberLabel(chambers, selectedCandidate.chamberId)}
                    </span>
                    <span className="border border-chamber-line bg-white px-2 py-1 text-xs font-semibold">
                      {describePlacementMode(selectedCandidate.placementMode)}
                    </span>
                    {selectedCandidate.requestedCycleSpan ? (
                      <span className="border border-chamber-line bg-white px-2 py-1 text-xs font-semibold">
                        {describeCycleCount(selectedCandidate.requestedCycleSpan)}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-lg font-semibold">{selectedCandidate.conditionSummary}</div>
                  <div className="text-sm text-slate-600">{formatCycleWindow(selectedCandidate.window)}</div>
                  <div className="text-sm font-semibold">{formatBlockList(selectedCandidate.blocks)}</div>
                  <button
                    type="button"
                    className="mt-2 inline-flex w-fit items-center justify-center gap-2 bg-chamber-reserved px-4 py-2 font-semibold text-white"
                    onClick={() => onConfirm(selectedCandidate)}
                  >
                    <Check size={18} />
                    予約確定
                  </button>
                </div>
                <BlockGrid readonly size="large" candidateBlocks={selectedCandidate.blocks} title="候補ブロック" />
              </div>
            </Panel>
          ) : null}

          <Panel title="候補一覧" icon={ClipboardList}>
            <div className="grid gap-3">
              {candidates.length === 0 ? (
                <div className="border border-dashed border-chamber-line bg-white px-4 py-8 text-center text-sm font-semibold text-slate-500">
                  検索後に予約可能な候補だけを表示します。
                </div>
              ) : (
                candidates.map((candidate) => (
                  <CandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    chamberName={chamberLabel(chambers, candidate.chamberId)}
                    selected={candidate.id === selectedCandidate?.id}
                    onSelect={() => setSelectedCandidateId(candidate.id)}
                    onConfirm={() => onConfirm(candidate)}
                  />
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>
    </section>
  );
}

function CandidateCard({
  candidate,
  chamberName,
  selected,
  onSelect,
  onConfirm,
}: {
  candidate: Candidate;
  chamberName: string;
  selected: boolean;
  onSelect: () => void;
  onConfirm: () => void;
}) {
  return (
    <article className={[
      'grid gap-3 border bg-white p-4 shadow-sm xl:grid-cols-[minmax(0,1fr)_220px]',
      selected ? 'border-chamber-reserved' : 'border-chamber-line',
    ].join(' ')}>
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="border border-chamber-line bg-chamber-panel px-2 py-1 text-xs font-semibold">{chamberName}</span>
          <span className="border border-chamber-line bg-white px-2 py-1 text-xs font-semibold">{describePlacementMode(candidate.placementMode)}</span>
          {candidate.requestedCycleSpan ? (
            <span className="border border-chamber-line bg-white px-2 py-1 text-xs font-semibold">{describeCycleCount(candidate.requestedCycleSpan)}</span>
          ) : null}
        </div>
        <div className="text-lg font-semibold">{candidate.conditionSummary}</div>
        <div className="text-sm text-slate-600">{formatCycleWindow(candidate.window)}</div>
        {candidate.requestedCycleSpan ? (
          <CycleTimeline window={candidate.window} dense />
        ) : (
          <div className="border border-chamber-line bg-chamber-panel px-3 py-2 text-sm font-semibold">
            占有時間 {formatDateRange(candidate.occupiedStartAt, candidate.occupiedEndAt)}
          </div>
        )}
      </div>
      <div className="grid gap-3">
        <ChamberBlockMap readonly density="inline" surface="chamber" candidateBlocks={candidate.blocks} />
        <div className="text-sm font-semibold">{formatBlockList(candidate.blocks)}</div>
        <button type="button" className="inline-flex items-center justify-center gap-2 border border-chamber-line bg-white px-4 py-2 font-semibold text-chamber-ink" onClick={onSelect}>
          {selected ? '表示中' : '詳細表示'}
        </button>
        <button type="button" className="inline-flex items-center justify-center gap-2 bg-chamber-reserved px-4 py-2 font-semibold text-white" onClick={onConfirm}>
          <Check size={18} />
          予約確定
        </button>
      </div>
    </article>
  );
}

interface BoardViewProps {
  chambers: Chamber[];
  boardChamber: Chamber;
  boardChamberId: string;
  setBoardChamberId: (value: string) => void;
  boardDate: string;
  setBoardDate: (value: string) => void;
  boardReservedBlocks: BlockId[];
  boardSuspendedBlocks: BlockId[];
  boardImpactedBlocks: BlockId[];
  reservations: Reservation[];
}

function BoardView({
  chambers,
  boardChamber,
  boardChamberId,
  setBoardChamberId,
  boardDate,
  setBoardDate,
  boardReservedBlocks,
  boardSuspendedBlocks,
  boardImpactedBlocks,
  reservations,
}: BoardViewProps) {
  return (
    <section className="grid gap-5 p-5 xl:p-7">
      <header className="grid gap-3 border-b border-chamber-line pb-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <h2 className="text-3xl font-semibold">予約ボード</h2>
          <div className="mt-2 text-sm font-semibold text-slate-600">{boardChamber.name} / {describeChamberConfig(boardChamber.activeConfigRevision.config)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="border border-chamber-line bg-white px-2 py-2" onClick={() => setBoardDate(addDaysToDateKey(boardDate, -1))} aria-label="前日">
            <ChevronLeft size={18} />
          </button>
          <CalendarDateInput label="表示日" value={boardDate} onChange={setBoardDate} compact />
          <button type="button" className="border border-chamber-line bg-white px-2 py-2" onClick={() => setBoardDate(addDaysToDateKey(boardDate, 1))} aria-label="翌日">
            <ChevronRight size={18} />
          </button>
        </div>
      </header>
      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Panel title="チャンバー" icon={CalendarDays}>
          <Field label="表示対象">
            <select className="h-10 w-full border border-chamber-line px-3" value={boardChamberId} onChange={(event) => setBoardChamberId(event.target.value)}>
              {chambers.map((chamber) => (
                <option key={chamber.id} value={chamber.id}>{chamber.name}</option>
              ))}
            </select>
          </Field>
          <div className="mt-4">
            <BlockGrid
              size="large"
              readonly
              reservedBlocks={boardReservedBlocks}
              suspendedBlocks={boardSuspendedBlocks}
              impactedBlocks={boardImpactedBlocks}
              title="利用状況"
            />
          </div>
        </Panel>
        <Panel title="予約一覧" icon={ClipboardList}>
          <div className="grid gap-3">
            {reservations.length === 0 ? (
              <div className="border border-dashed border-chamber-line bg-white px-4 py-8 text-center text-sm font-semibold text-slate-500">
                この日の予約はありません。
              </div>
            ) : (
              reservations.map((reservation) => (
                <ReservationRow key={reservation.id} reservation={reservation} chambers={chambers} />
              ))
            )}
          </div>
        </Panel>
      </div>
    </section>
  );
}

function ReservationRow({ reservation, chambers }: { reservation: Reservation; chambers: Chamber[] }) {
  const status = resolveReservationStatus(reservation, DEMO_NOW_ISO);
  return (
    <article className="grid gap-3 border border-chamber-line bg-white p-4 md:grid-cols-[minmax(0,1fr)_180px]">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={status} />
          <span className="text-xs font-semibold text-slate-500">{reservation.id}</span>
        </div>
        <div className="text-lg font-semibold">{reservation.testName}</div>
        <div className="text-sm text-slate-600">{chamberLabel(chambers, reservation.chamberId)} / {reservation.requester.name} / {reservation.requester.department}</div>
        <div className="text-sm font-semibold">{formatDateRange(reservation.occupiedStartAt, reservation.occupiedEndAt)}</div>
        {reservation.requestedCondition ? (
          <div className="text-sm text-slate-600">予約条件 {reservation.requestedCondition.temperatureC}C / {reservation.requestedCondition.humidityRh}%RH</div>
        ) : null}
      </div>
      <div className="grid gap-2">
        <ChamberBlockMap readonly density="compact" surface="chamber" selectedBlocks={reservation.blocks} />
        <div className="text-sm font-semibold">{formatBlockList(reservation.blocks)}</div>
      </div>
    </article>
  );
}

interface EditViewProps {
  chambers: Chamber[];
  editLookupId: string;
  setEditLookupId: (value: string) => void;
  editPin: string;
  setEditPin: (value: string) => void;
  onLookup: () => void;
  activeReservation: Reservation | null;
  editDraft: { testName: string; name: string; department: string; contactNote: string };
  setEditDraft: (value: { testName: string; name: string; department: string; contactNote: string }) => void;
  editMessage: string;
  onSave: () => void;
  onDelete: () => void;
}

function EditView({
  chambers,
  editLookupId,
  setEditLookupId,
  editPin,
  setEditPin,
  onLookup,
  activeReservation,
  editDraft,
  setEditDraft,
  editMessage,
  onSave,
  onDelete,
}: EditViewProps) {
  const deleteAllowed = activeReservation ? canDeleteReservation(activeReservation, DEMO_NOW_ISO) : false;
  return (
    <section className="grid gap-5 p-5 xl:p-7">
      <header className="border-b border-chamber-line pb-5">
        <h2 className="text-3xl font-semibold">PIN編集</h2>
      </header>
      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Panel title="予約検索" icon={Pencil}>
          <div className="grid gap-3">
            <Field label="予約ID">
              <input className="h-10 w-full border border-chamber-line px-3" value={editLookupId} onChange={(event) => setEditLookupId(event.target.value)} />
            </Field>
            <Field label="4桁PIN">
              <input className="h-10 w-full border border-chamber-line px-3 tracking-[0.24em]" maxLength={4} value={editPin} onChange={(event) => setEditPin(event.target.value.replace(/\D/g, '').slice(0, 4))} />
            </Field>
            <button type="button" className="inline-flex items-center justify-center gap-2 bg-chamber-reserved px-4 py-2 font-semibold text-white" onClick={onLookup}>
              <Search size={18} />
              照合
            </button>
            {editMessage ? <div className="border border-chamber-line bg-white px-3 py-2 text-sm font-semibold">{editMessage}</div> : null}
          </div>
        </Panel>

        <Panel title="編集内容" icon={Save}>
          {!activeReservation ? (
            <div className="border border-dashed border-chamber-line bg-white px-4 py-8 text-center text-sm font-semibold text-slate-500">
              予約IDとPINを照合してください。
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="試験名">
                  <input className="h-10 w-full border border-chamber-line px-3" value={editDraft.testName} onChange={(event) => setEditDraft({ ...editDraft, testName: event.target.value })} />
                </Field>
                <Field label="申請者">
                  <input className="h-10 w-full border border-chamber-line px-3" value={editDraft.name} onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })} />
                </Field>
                <Field label="所属部署">
                  <select className="h-10 w-full border border-chamber-line px-3" value={editDraft.department} onChange={(event) => setEditDraft({ ...editDraft, department: event.target.value })}>
                    {DEPARTMENTS.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </Field>
                <Field label="備考">
                  <input className="h-10 w-full border border-chamber-line px-3" value={editDraft.contactNote} onChange={(event) => setEditDraft({ ...editDraft, contactNote: event.target.value })} />
                </Field>
              </div>
              <div className="border border-chamber-line bg-white p-3">
                <div className="text-sm font-semibold">{activeReservation.id} / {chamberLabel(chambers, activeReservation.chamberId)}</div>
                <div className="mt-1 text-sm text-slate-600">{formatDateRange(activeReservation.occupiedStartAt, activeReservation.occupiedEndAt)}</div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" className="inline-flex items-center gap-2 bg-chamber-reserved px-4 py-2 font-semibold text-white" onClick={onSave}>
                  <Save size={18} />
                  保存
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 border border-chamber-blocked bg-white px-4 py-2 font-semibold text-chamber-blocked disabled:border-slate-300 disabled:text-slate-400"
                  onClick={onDelete}
                  disabled={!deleteAllowed}
                >
                  <Trash2 size={18} />
                  削除
                </button>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </section>
  );
}

interface AdminViewProps {
  chambers: Chamber[];
  configRevisions: ChamberConfigRevision[];
  onPublishConfig: (chamberId: string, config: ChamberConditionConfig) => Promise<void>;
  suspensionChamberId: string;
  setSuspensionChamberId: (value: string) => void;
  suspensionReason: string;
  setSuspensionReason: (value: string) => void;
  suspensionStartDate: string;
  setSuspensionStartDate: (value: string) => void;
  suspensionStartTime: string;
  setSuspensionStartTime: (value: string) => void;
  suspensionEndDate: string;
  setSuspensionEndDate: (value: string) => void;
  suspensionEndTime: string;
  setSuspensionEndTime: (value: string) => void;
  suspensionAllBlocks: boolean;
  setSuspensionAllBlocks: (value: boolean) => void;
  suspensionBlocks: BlockId[];
  setSuspensionBlocks: (value: BlockId[]) => void;
  affectedReservations: Reservation[];
  adminMessage: string;
  onCreateSuspension: () => void;
}

function AdminView({
  chambers,
  configRevisions,
  onPublishConfig,
  suspensionChamberId,
  setSuspensionChamberId,
  suspensionReason,
  setSuspensionReason,
  suspensionStartDate,
  setSuspensionStartDate,
  suspensionStartTime,
  setSuspensionStartTime,
  suspensionEndDate,
  setSuspensionEndDate,
  suspensionEndTime,
  setSuspensionEndTime,
  suspensionAllBlocks,
  setSuspensionAllBlocks,
  suspensionBlocks,
  setSuspensionBlocks,
  affectedReservations,
  adminMessage,
  onCreateSuspension,
}: AdminViewProps) {
  const [selectedChamberId, setSelectedChamberId] = useState(chambers[0]?.id ?? CHAMBER.id);
  const selectedChamber = chambers.find((chamber) => chamber.id === selectedChamberId) ?? chambers[0] ?? CHAMBER;
  const [draftConfig, setDraftConfig] = useState<ChamberConditionConfig>(clone(selectedChamber.activeConfigRevision.config));
  const [configMessage, setConfigMessage] = useState('');

  useEffect(() => {
    const current = chambers.find((chamber) => chamber.id === selectedChamberId) ?? chambers[0] ?? CHAMBER;
    setDraftConfig(clone(normalizeConfigForPublish(current.activeConfigRevision.config)));
    setConfigMessage('');
  }, [chambers, selectedChamberId]);

  const activeRevisions = configRevisions.filter((revision) => revision.chamberId === selectedChamber.id);
  const ownership = draftConfig.type === 'user_managed_condition' ? 'user_managed' : 'admin_managed';
  const adminKind: AdminManagedConditionKind = draftConfig.type === 'fixed_condition' ? 'fixed_condition' : 'temperature_cycle';

  const setOwnership = (value: 'admin_managed' | 'user_managed') => {
    setConfigMessage('');
    if (value === 'user_managed') {
      setDraftConfig(clone(DEFAULT_USER_MANAGED_CONFIG));
      return;
    }
    setDraftConfig(clone(DEFAULT_TEMPERATURE_CYCLE_CONFIG));
  };

  const setAdminKind = (value: AdminManagedConditionKind) => {
    setConfigMessage('');
    setDraftConfig(value === 'fixed_condition' ? clone(DEFAULT_FIXED_CONDITION_CONFIG) : clone(DEFAULT_TEMPERATURE_CYCLE_CONFIG));
  };

  const publish = async () => {
    const normalized = normalizeConfigForPublish(draftConfig);
    const errors = normalized.type === 'temperature_cycle' ? validateCycleProgram(normalized) : [];
    if (errors.length > 0) {
      setConfigMessage(errors.join(' / '));
      return;
    }
    try {
      await onPublishConfig(selectedChamber.id, normalized);
      setConfigMessage('設定を公開しました。');
    } catch {
      setConfigMessage('設定を公開できませんでした。');
    }
  };

  return (
    <section className="grid gap-5 p-5 xl:p-7">
      <header className="border-b border-chamber-line pb-5">
        <h2 className="text-3xl font-semibold">管理</h2>
      </header>

      <div className="grid gap-5">
        <Panel title="チャンバー管理" icon={Settings2}>
          <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="grid content-start gap-4">
              <Field label="対象チャンバー">
                <select className="h-10 w-full border border-chamber-line px-3" value={selectedChamberId} onChange={(event) => setSelectedChamberId(event.target.value)}>
                  {chambers.map((chamber) => (
                    <option key={chamber.id} value={chamber.id}>{chamber.name}</option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-2 border border-chamber-line bg-white p-3 text-sm">
                <div className="font-semibold">{selectedChamber.name}</div>
                <div className="text-slate-600">{selectedChamber.location}</div>
                <div className="text-slate-600">{configOwnershipLabel(selectedChamber.activeConfigRevision.config)}</div>
                <div className="font-semibold">{describeChamberConfig(selectedChamber.activeConfigRevision.config)}</div>
              </div>
              <div className="grid gap-2 border border-chamber-line bg-white p-3 text-xs text-slate-600">
                {activeRevisions.slice(0, 4).map((revision) => (
                  <div key={revision.id} className="flex items-center justify-between gap-3">
                    <span>rev.{revision.revision}</span>
                    <span className="font-semibold">{revision.status}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              <Segmented
                label="管理方式"
                value={ownership}
                options={[
                  { value: 'admin_managed', label: '管理者管理' },
                  { value: 'user_managed', label: 'ユーザー温湿度管理' },
                ]}
                onChange={(value) => setOwnership(value as 'admin_managed' | 'user_managed')}
              />
              {ownership === 'admin_managed' ? (
                <Segmented
                  label="管理者管理の種別"
                  value={adminKind}
                  options={[
                    { value: 'temperature_cycle', label: '温湿度サイクル' },
                    { value: 'fixed_condition', label: '一定温湿度' },
                  ]}
                  onChange={(value) => setAdminKind(value as AdminManagedConditionKind)}
                />
              ) : null}

              {draftConfig.type === 'temperature_cycle' ? (
                <TemperatureCycleEditor config={draftConfig} onChange={setDraftConfig} />
              ) : null}
              {draftConfig.type === 'fixed_condition' ? (
                <FixedConditionEditor config={draftConfig} onChange={setDraftConfig} />
              ) : null}
              {draftConfig.type === 'user_managed_condition' ? (
                <UserManagedConditionEditor config={draftConfig} onChange={setDraftConfig} />
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="inline-flex items-center gap-2 bg-chamber-reserved px-4 py-2 font-semibold text-white" onClick={publish}>
                  <Save size={18} />
                  設定公開
                </button>
                {configMessage ? <span className="text-sm font-semibold text-slate-700">{configMessage}</span> : null}
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="一時利用停止" icon={ShieldAlert}>
          <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
            <div className="grid content-start gap-3">
              <Field label="対象チャンバー">
                <select className="h-10 w-full border border-chamber-line px-3" value={suspensionChamberId} onChange={(event) => setSuspensionChamberId(event.target.value)}>
                  {chambers.map((chamber) => (
                    <option key={chamber.id} value={chamber.id}>{chamber.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="理由">
                <input className="h-10 w-full border border-chamber-line px-3" value={suspensionReason} onChange={(event) => setSuspensionReason(event.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <CalendarDateInput label="開始日" value={suspensionStartDate} onChange={setSuspensionStartDate} />
                <Field label="開始時刻">
                  <input className="h-10 w-full border border-chamber-line px-3" type="time" value={suspensionStartTime} onChange={(event) => setSuspensionStartTime(event.target.value)} />
                </Field>
                <CalendarDateInput label="終了日" value={suspensionEndDate} onChange={setSuspensionEndDate} minDate={suspensionStartDate} />
                <Field label="終了時刻">
                  <input className="h-10 w-full border border-chamber-line px-3" type="time" value={suspensionEndTime} onChange={(event) => setSuspensionEndTime(event.target.value)} />
                </Field>
              </div>
              <label className="inline-flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={suspensionAllBlocks} onChange={(event) => setSuspensionAllBlocks(event.target.checked)} />
                全ブロック
              </label>
              {!suspensionAllBlocks ? (
                <BlockGrid size="large" selectedBlocks={suspensionBlocks} onChange={setSuspensionBlocks} title="停止ブロック" />
              ) : null}
              <button type="button" className="inline-flex items-center justify-center gap-2 border border-chamber-blocked bg-white px-4 py-2 font-semibold text-chamber-blocked" onClick={onCreateSuspension}>
                <ShieldAlert size={18} />
                一時停止を確定
              </button>
              {adminMessage ? <div className="border border-chamber-line bg-white px-3 py-2 text-sm font-semibold">{adminMessage}</div> : null}
            </div>

            <div className="grid content-start gap-3">
              <div className="text-sm font-semibold text-slate-600">影響予約 {affectedReservations.length}件</div>
              {affectedReservations.length === 0 ? (
                <div className="border border-dashed border-chamber-line bg-white px-4 py-8 text-center text-sm font-semibold text-slate-500">
                  影響する予約はありません。
                </div>
              ) : (
                affectedReservations.map((reservation) => (
                  <ReservationRow key={reservation.id} reservation={reservation} chambers={chambers} />
                ))
              )}
            </div>
          </div>
        </Panel>
      </div>
    </section>
  );
}

function TemperatureCycleEditor({ config, onChange }: { config: TemperatureCycleConfig; onChange: (config: TemperatureCycleConfig) => void }) {
  const normalized = normalizeConfigForPublish(config) as TemperatureCycleConfig;
  const period = calculateCyclePeriodMinutes(config.steps);
  const updateStep = (stepId: string, updater: (step: CycleProgramStep) => CycleProgramStep) => {
    const nextSteps = normalized.steps.map((step) => step.id === stepId ? updater(step) : step);
    onChange({
      ...normalized,
      steps: nextSteps,
      cyclePeriodMinutes: calculateCyclePeriodMinutes(nextSteps),
    });
  };

  return (
    <div className="grid gap-4 border border-chamber-line bg-white p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_160px_160px]">
        <Field label="プログラム名">
          <input className="h-10 w-full border border-chamber-line px-3" value={config.programName} onChange={(event) => onChange({ ...config, programName: event.target.value })} />
        </Field>
        <Field label="ステップ1開始">
          <input
            className="h-10 w-full border border-chamber-line px-3"
            type="text"
            inputMode="numeric"
            placeholder="09:00"
            value={config.step1StartTime}
            onChange={(event) => {
              if (/^\d{2}:\d{2}$/.test(event.target.value)) {
                onChange({ ...config, step1StartTime: event.target.value });
              }
            }}
          />
        </Field>
        <Field label="周期">
          <div className="grid h-10 place-items-center border border-chamber-line bg-chamber-panel px-3 text-sm font-semibold">{period}分</div>
        </Field>
      </div>
      <CycleProgramGraph config={normalized} />
      <div className="overflow-x-auto">
        <table className="min-w-[920px] w-full border-collapse text-sm">
          <thead>
            <tr className="bg-chamber-panel text-left">
              <th className="border border-chamber-line px-2 py-2">Step</th>
              <th className="border border-chamber-line px-2 py-2">状態</th>
              <th className="border border-chamber-line px-2 py-2">温度 from/to</th>
              <th className="border border-chamber-line px-2 py-2">湿度</th>
              <th className="border border-chamber-line px-2 py-2">時間</th>
              <th className="border border-chamber-line px-2 py-2">出し入れ</th>
            </tr>
          </thead>
          <tbody>
            {normalized.steps.map((step) => (
              <tr key={step.id}>
                <td className="border border-chamber-line px-2 py-2 font-semibold">{step.stepNo}</td>
                <td className="border border-chamber-line px-2 py-2">
                  <select className="h-9 w-full border border-chamber-line px-2" value={step.kind} onChange={(event) => updateStep(step.id, (item) => ({ ...item, kind: event.target.value as CycleProgramStep['kind'] }))}>
                    <option value="equilibrium">平衡</option>
                    <option value="transition">遷移</option>
                  </select>
                </td>
                <td className="border border-chamber-line px-2 py-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input className="h-9 border border-chamber-line px-2" type="number" value={step.temperature.fromC} onChange={(event) => updateStep(step.id, (item) => ({ ...item, temperature: { ...item.temperature, fromC: Number(event.target.value) } }))} />
                    <input className="h-9 border border-chamber-line px-2" type="number" value={step.temperature.toC} onChange={(event) => updateStep(step.id, (item) => ({ ...item, temperature: { ...item.temperature, toC: Number(event.target.value) } }))} />
                  </div>
                </td>
                <td className="border border-chamber-line px-2 py-2">
                  <div className="grid grid-cols-[72px_1fr_1fr] gap-2">
                    <select className="h-9 border border-chamber-line px-2" value={step.humidity.mode} onChange={(event) => updateStep(step.id, (item) => ({ ...item, humidity: event.target.value === 'off' ? { mode: 'off' } : { mode: 'rh', fromRh: 93, toRh: 93 } }))}>
                      <option value="rh">RH</option>
                      <option value="off">OFF</option>
                    </select>
                    <input className="h-9 border border-chamber-line px-2 disabled:bg-slate-100" type="number" disabled={step.humidity.mode === 'off'} value={step.humidity.fromRh ?? ''} onChange={(event) => updateStep(step.id, (item) => ({ ...item, humidity: { mode: 'rh', fromRh: Number(event.target.value), toRh: item.humidity.toRh ?? Number(event.target.value) } }))} />
                    <input className="h-9 border border-chamber-line px-2 disabled:bg-slate-100" type="number" disabled={step.humidity.mode === 'off'} value={step.humidity.toRh ?? ''} onChange={(event) => updateStep(step.id, (item) => ({ ...item, humidity: { mode: 'rh', fromRh: item.humidity.fromRh ?? Number(event.target.value), toRh: Number(event.target.value) } }))} />
                  </div>
                </td>
                <td className="border border-chamber-line px-2 py-2">
                  <div className="grid grid-cols-[1fr_72px] gap-2">
                    <input className="w-full" type="range" min={15} max={360} step={15} value={step.durationMinutes} onChange={(event) => updateStep(step.id, (item) => ({ ...item, durationMinutes: Number(event.target.value) }))} />
                    <input className="h-9 border border-chamber-line px-2" type="number" min={1} value={step.durationMinutes} onChange={(event) => updateStep(step.id, (item) => ({ ...item, durationMinutes: Number(event.target.value) }))} />
                  </div>
                </td>
                <td className="border border-chamber-line px-2 py-2">
                  <select className="h-9 w-full border border-chamber-line px-2" value={step.access} onChange={(event) => updateStep(step.id, (item) => ({ ...item, access: event.target.value as CycleProgramStep['access'] }))}>
                    <option value="available">可能</option>
                    <option value="unavailable">不可</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CycleProgramGraph({ config }: { config: TemperatureCycleConfig }) {
  const steps = resolveStepTimes(config, '2026-06-24');
  const period = Math.max(1, calculateCyclePeriodMinutes(config.steps));
  const tempValues = config.steps.flatMap((step) => [step.temperature.fromC, step.temperature.toC]);
  const tempMin = Math.min(-20, ...tempValues);
  const tempMax = Math.max(80, ...tempValues);
  const x = (minute: number) => 56 + (minute / period) * 848;
  const yTemp = (value: number) => 190 - ((value - tempMin) / Math.max(1, tempMax - tempMin)) * 130;
  const yHumidity = (value: number) => 216 - (value / 100) * 126;
  const tempPoints = steps.flatMap((step) => [
    `${x(step.startMinute)},${yTemp(step.temperature.fromC)}`,
    `${x(step.endMinute)},${yTemp(step.temperature.toC)}`,
  ]).join(' ');
  const humidityPoints = steps.flatMap((step) => {
    const from = step.humidity.mode === 'off' ? 0 : step.humidity.fromRh ?? 0;
    const to = step.humidity.mode === 'off' ? 0 : step.humidity.toRh ?? from;
    return [`${x(step.startMinute)},${yHumidity(from)}`, `${x(step.endMinute)},${yHumidity(to)}`];
  }).join(' ');

  return (
    <div className="border border-chamber-line bg-[#fbfcfa] p-3">
      <svg viewBox="0 0 960 260" className="h-auto w-full" role="img" aria-label="温湿度サイクルグラフ">
        <rect x="0" y="0" width="960" height="260" fill="#fbfcfa" />
        {[0, 6, 12, 18, 24].map((hour) => {
          const minute = (hour / 24) * period;
          return (
            <g key={hour}>
              <line x1={x(minute)} x2={x(minute)} y1="34" y2="220" stroke="#d8dfdc" />
              <text x={x(minute)} y="238" textAnchor="middle" fontSize="12" fill="#526169">{minutesToTimeOfDay(minute)}</text>
            </g>
          );
        })}
        {steps.map((step) => {
          const startX = x(step.startMinute);
          const width = Math.max(2, x(step.endMinute) - startX);
          return (
            <g key={step.id}>
              <rect x={startX} y="36" width={width} height="184" fill={step.kind === 'transition' ? '#eef4f1' : '#ffffff'} stroke="#d8dfdc" />
              <text x={startX + width / 2} y="54" textAnchor="middle" fontSize="11" fontWeight="600" fill="#40525a">{step.stepNo}</text>
            </g>
          );
        })}
        <polyline points={tempPoints} fill="none" stroke="#b94736" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={humidityPoints} fill="none" stroke="#1f7a78" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        <text x="58" y="24" fontSize="12" fontWeight="700" fill="#b94736">Temperature</text>
        <text x="168" y="24" fontSize="12" fontWeight="700" fill="#1f7a78">Humidity</text>
        <text x="904" y="24" textAnchor="end" fontSize="12" fontWeight="700" fill="#172026">{period} min / cycle</text>
      </svg>
    </div>
  );
}

function FixedConditionEditor({ config, onChange }: { config: FixedConditionConfig; onChange: (config: FixedConditionConfig) => void }) {
  return (
    <div className="grid gap-3 border border-chamber-line bg-white p-4 md:grid-cols-2">
      <Field label="温度">
        <input className="h-10 w-full border border-chamber-line px-3" type="number" value={config.condition.temperatureC} onChange={(event) => onChange({ ...config, condition: { ...config.condition, temperatureC: Number(event.target.value) } })} />
      </Field>
      <Field label="湿度">
        <input className="h-10 w-full border border-chamber-line px-3" type="number" value={config.condition.humidityRh ?? ''} onChange={(event) => onChange({ ...config, condition: { ...config.condition, humidityRh: Number(event.target.value) } })} />
      </Field>
      <Field label="利用可能">
        <select className="h-10 w-full border border-chamber-line px-3" value={config.availabilityPolicy.type} onChange={(event) => onChange({ ...config, availabilityPolicy: event.target.value === 'daily_window' ? { type: 'daily_window', startTime: '09:00', endTime: '17:00' } : { type: 'always' } })}>
          <option value="always">常時</option>
          <option value="daily_window">日次時間帯</option>
        </select>
      </Field>
      {config.availabilityPolicy.type === 'daily_window' ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="開始">
            <input className="h-10 w-full border border-chamber-line px-3" type="time" value={config.availabilityPolicy.startTime ?? '09:00'} onChange={(event) => onChange({ ...config, availabilityPolicy: { ...config.availabilityPolicy, startTime: event.target.value } })} />
          </Field>
          <Field label="終了">
            <input className="h-10 w-full border border-chamber-line px-3" type="time" value={config.availabilityPolicy.endTime ?? '17:00'} onChange={(event) => onChange({ ...config, availabilityPolicy: { ...config.availabilityPolicy, endTime: event.target.value } })} />
          </Field>
        </div>
      ) : null}
    </div>
  );
}

function UserManagedConditionEditor({ config, onChange }: { config: typeof DEFAULT_USER_MANAGED_CONFIG; onChange: (config: typeof DEFAULT_USER_MANAGED_CONFIG) => void }) {
  return (
    <div className="grid gap-3 border border-chamber-line bg-white p-4 md:grid-cols-3">
      <Field label="温度下限">
        <input className="h-10 w-full border border-chamber-line px-3" type="number" value={config.temperatureRange.minC} onChange={(event) => onChange({ ...config, temperatureRange: { ...config.temperatureRange, minC: Number(event.target.value) } })} />
      </Field>
      <Field label="温度上限">
        <input className="h-10 w-full border border-chamber-line px-3" type="number" value={config.temperatureRange.maxC} onChange={(event) => onChange({ ...config, temperatureRange: { ...config.temperatureRange, maxC: Number(event.target.value) } })} />
      </Field>
      <Field label="温度刻み">
        <input className="h-10 w-full border border-chamber-line px-3" type="number" value={config.temperatureRange.stepC} onChange={(event) => onChange({ ...config, temperatureRange: { ...config.temperatureRange, stepC: Number(event.target.value) } })} />
      </Field>
      <Field label="湿度下限">
        <input className="h-10 w-full border border-chamber-line px-3" type="number" value={config.humidityRange?.minRh ?? 20} onChange={(event) => onChange({ ...config, humidityRange: { minRh: Number(event.target.value), maxRh: config.humidityRange?.maxRh ?? 95, stepRh: config.humidityRange?.stepRh ?? 1 } })} />
      </Field>
      <Field label="湿度上限">
        <input className="h-10 w-full border border-chamber-line px-3" type="number" value={config.humidityRange?.maxRh ?? 95} onChange={(event) => onChange({ ...config, humidityRange: { minRh: config.humidityRange?.minRh ?? 20, maxRh: Number(event.target.value), stepRh: config.humidityRange?.stepRh ?? 1 } })} />
      </Field>
      <Field label="湿度刻み">
        <input className="h-10 w-full border border-chamber-line px-3" type="number" value={config.humidityRange?.stepRh ?? 1} onChange={(event) => onChange({ ...config, humidityRange: { minRh: config.humidityRange?.minRh ?? 20, maxRh: config.humidityRange?.maxRh ?? 95, stepRh: Number(event.target.value) } })} />
      </Field>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="border border-chamber-line bg-[#f8faf8] p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Icon size={18} />
        <h3 className="text-base font-semibold">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm font-semibold text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-chamber-line bg-white px-3 py-2">
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function Legend({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-3 w-3 border border-chamber-line ${tone}`} />
      {label}
    </span>
  );
}

function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1 text-sm font-semibold text-slate-700">
      <span>{label}</span>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={[
                'border px-3 py-2 text-sm font-semibold transition',
                active ? 'border-chamber-reserved bg-chamber-reserved text-white' : 'border-chamber-line bg-white text-chamber-ink hover:border-chamber-reserved',
              ].join(' ')}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
