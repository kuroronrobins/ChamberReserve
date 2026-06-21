import { useEffect, useMemo, type ReactNode } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Gauge,
  RotateCcw,
  Search,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import BlockGrid from '../BlockGrid';
import ChamberBlockMap from '../ChamberBlockMap';
import CycleAccessWindows from '../CycleAccessWindows';
import CycleTimeline from '../CycleTimeline';
import CalendarDateInput from '../date/CalendarDateInput';
import type {
  BlockId,
  Candidate,
  Chamber,
  CycleCount,
  CycleWindow,
  PlacementMode,
  Reservation,
  SearchConditionMode,
  SearchRequest,
  UserManagedReservationCondition,
} from '../../domain/types';
import {
  CYCLE_COUNT_STEP,
  describeCycleCount,
  describePlacementMode,
  MAX_CYCLE_COUNT,
  MIN_CYCLE_COUNT,
  normalizeCycleCount,
} from '../../domain/reservationRules';
import { formatBlockList, formatCycleWindow, formatDateRange, formatDateTime } from '../../utils/format';
import { formatDateKeyJa, toDateKey } from '../../utils/dateKey';
import type { CandidateSearchResult } from '../../domain/searchEngine';

export type SearchStep = 'conditions' | 'results';

export interface SubmittedSearchState {
  id: string;
  request: SearchRequest;
  searchMode: SearchConditionMode;
  desiredDate: string;
  cycleCount: CycleCount;
  environmentStartTime?: string;
  environmentDurationHours?: number;
  requestedCondition?: UserManagedReservationCondition;
  placementMode: PlacementMode;
  selectedBlocks: BlockId[];
  testName: string;
  requesterName: string;
  department: string;
  contactNote: string;
  previewWindow: CycleWindow;
  submittedAt: string;
}

interface SearchFlowProps {
  searchStep: SearchStep;
  submittedSearch: SubmittedSearchState | null;
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
  candidateResult: CandidateSearchResult | null;
  chambers: Chamber[];
  searchWindow: CycleWindow;
  searchMessage: string;
  lastReservation: Reservation | null;
  selectedCandidateId: string | null;
  setSelectedCandidateId: (value: string | null) => void;
  onSearch: () => void;
  onConfirm: (candidate: Candidate) => void;
  onChangeConditions: () => void;
  onNewSearch: () => void;
  onShiftSearchDate: (dayOffset: number) => void;
}

export default function SearchFlow(props: SearchFlowProps) {
  if (props.searchStep === 'results' && props.submittedSearch) {
    return <SearchResultsView {...props} submittedSearch={props.submittedSearch} />;
  }
  return <SearchConditionView {...props} />;
}

function SearchConditionView({
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
  searchWindow,
  searchMessage,
  onSearch,
}: SearchFlowProps) {
  return (
    <section className="grid gap-5 p-5 xl:p-7">
      <SearchHeader
        title="空き検索"
        subtitle="試験条件を入力してから候補を検索します。候補一覧は検索実行後の画面にだけ表示します。"
        step="conditions"
        metrics={[
          { label: '画面', value: '条件入力' },
          { label: '希望ブロック', value: selectedBlocks.length > 0 ? `${selectedBlocks.length}ブロック` : '未選択' },
          { label: '条件', value: searchMode === 'cycle' ? describeCycleCount(cycleCount) : `${requestedTemperatureC}C / ${requestedHumidityRh}%RH` },
        ]}
      />

      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="grid gap-5">
          <Panel title="検索条件" icon={Search}>
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <CalendarDateInput label="希望日" value={desiredDate} onChange={setDesiredDate} />
                <Segmented
                  label="試験種別"
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
                  <CycleTimeline window={searchWindow} dense />
                </div>
              ) : (
                <div className="grid gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="開始時刻">
                      <input className="h-10 w-full border border-chamber-line px-3" type="time" value={environmentStartTime} onChange={(event) => setEnvironmentStartTime(event.target.value)} />
                    </Field>
                    <Field label="利用時間">
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
                    <Field label="温度">
                      <input className="h-10 w-full border border-chamber-line px-3" type="number" value={requestedTemperatureC} onChange={(event) => setRequestedTemperatureC(Number(event.target.value))} />
                    </Field>
                    <Field label="湿度">
                      <input className="h-10 w-full border border-chamber-line px-3" type="number" value={requestedHumidityRh} onChange={(event) => setRequestedHumidityRh(Number(event.target.value))} />
                    </Field>
                  </div>
                  <Metric label="終了予定" value={formatDateTime(searchWindow.unloadEnd)} />
                </div>
              )}

              <Segmented
                label="ブロック指定"
                value={placementMode}
                options={[
                  { value: 'size', label: 'サイズのみ' },
                  { value: 'exact', label: '位置まで指定' },
                ]}
                onChange={(value) => setPlacementMode(value as PlacementMode)}
              />
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
                断片化したブロックは候補化しません。連続した範囲で選択してください。
              </div>
            ) : null}
          </Panel>
        </div>

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
                {DEPARTMENTS_FOR_SEARCH.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label="用途メモ">
              <input className="h-10 w-full border border-chamber-line px-3" value={contactNote} onChange={(event) => setContactNote(event.target.value)} />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className="inline-flex items-center gap-2 bg-chamber-reserved px-4 py-2 font-semibold text-white" onClick={onSearch}>
              <Search size={18} />
              候補を検索
            </button>
            {searchMessage ? <span className="text-sm font-semibold text-slate-700">{searchMessage}</span> : null}
          </div>
        </Panel>
      </div>
    </section>
  );
}

function SearchResultsView({
  submittedSearch,
  candidates,
  candidateResult,
  chambers,
  searchMessage,
  lastReservation,
  selectedCandidateId,
  setSelectedCandidateId,
  onConfirm,
  onChangeConditions,
  onNewSearch,
  onShiftSearchDate,
}: SearchFlowProps & { submittedSearch: SubmittedSearchState }) {
  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedCandidateId) ?? candidates[0] ?? null,
    [candidates, selectedCandidateId],
  );
  const showingAlternatives = Boolean(
    candidateResult && !candidateResult.requestedDateAvailable && candidateResult.alternativeDateCandidates.length > 0,
  );
  const requestedDateLabel = formatDateKeyJa(submittedSearch.request.desiredDate);
  const candidatePanelTitle = showingAlternatives ? '近い日付の候補' : '希望日の候補';
  const unavailableMessage = candidateResult?.unavailableReasons[0]?.message
    ?? `希望日 ${requestedDateLabel} は、この条件で予約可能な枠がありません。`;

  useEffect(() => {
    setSelectedCandidateId(
      selectedCandidateId && candidates.some((candidate) => candidate.id === selectedCandidateId)
        ? selectedCandidateId
        : candidates[0]?.id ?? null,
    );
  }, [candidates, selectedCandidateId, setSelectedCandidateId]);

  return (
    <section className="grid gap-5 p-5 xl:p-7">
      <SearchHeader
        title="この条件で検索した候補"
        subtitle="下の候補は、上部の検索条件サマリーに対して生成された予約可能枠です。"
        step="results"
        metrics={[
          { label: '画面', value: '候補表示' },
          { label: '候補', value: `${candidates.length}` },
          { label: '条件', value: submittedSearch.searchMode === 'cycle' ? describeCycleCount(submittedSearch.cycleCount) : conditionLabel(submittedSearch.requestedCondition) },
        ]}
      />

      <div className="grid gap-5">
        <SearchConditionSummary submittedSearch={submittedSearch} />

        {candidateResult && !candidateResult.requestedDateAvailable ? (
          <section className="border border-chamber-blocked bg-white px-4 py-3">
            <div className="text-base font-semibold text-chamber-ink">
              希望日 {requestedDateLabel} は予約可能な枠がありません。
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-600">{unavailableMessage}</div>
            {candidateResult.alternativeDateCandidates.length > 0 ? (
              <div className="mt-2 text-sm font-semibold text-chamber-reserved">
                近い日付の予約可能候補を表示しています。
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button type="button" className="inline-flex items-center gap-2 border border-chamber-line bg-white px-4 py-2 font-semibold" onClick={onChangeConditions}>
            <ChevronLeft size={18} />
            条件を変更
          </button>
          <button type="button" className="inline-flex items-center gap-2 border border-chamber-line bg-white px-4 py-2 font-semibold" onClick={() => onShiftSearchDate(-1)}>
            <ChevronLeft size={18} />
            前日にずらす
          </button>
          <button type="button" className="inline-flex items-center gap-2 border border-chamber-line bg-white px-4 py-2 font-semibold" onClick={() => onShiftSearchDate(1)}>
            翌日にずらす
            <ChevronRight size={18} />
          </button>
          <button type="button" className="inline-flex items-center gap-2 border border-chamber-line bg-white px-4 py-2 font-semibold" onClick={onNewSearch}>
            <RotateCcw size={18} />
            新しく検索
          </button>
          {searchMessage ? <span className="grid place-items-center text-sm font-semibold text-slate-700">{searchMessage}</span> : null}
        </div>

        {lastReservation ? (
          <div className="border border-chamber-reserved bg-chamber-access px-4 py-3">
            <div className="text-sm font-semibold">予約ID {lastReservation.id}</div>
            <div className="mt-1 text-2xl font-semibold tracking-[0.16em]">PIN {lastReservation.pin}</div>
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Panel title={candidatePanelTitle} icon={ClipboardList}>
            <div className="grid gap-3">
              {candidates.length === 0 ? (
                <EmptyCandidateState message={candidateResult?.unavailableReasons[0]?.message} />
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

          <Panel title="選択中候補" icon={Gauge}>
            {selectedCandidate ? (
              <CandidateDetail
                candidate={selectedCandidate}
                chamberName={chamberLabel(chambers, selectedCandidate.chamberId)}
                onConfirm={() => onConfirm(selectedCandidate)}
              />
            ) : (
              <div className="border border-dashed border-chamber-line bg-white px-4 py-8 text-center text-sm font-semibold text-slate-500">
                候補を選択すると、期間とブロックを確認できます。
              </div>
            )}
          </Panel>
        </div>
      </div>
    </section>
  );
}

function SearchConditionSummary({ submittedSearch }: { submittedSearch: SubmittedSearchState }) {
  const isCycle = submittedSearch.searchMode === 'cycle';
  return (
    <Panel title="検索条件サマリー" icon={ClipboardCheck}>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="試験種別" value={isCycle ? 'サイクル試験' : '温湿度指定'} />
        <Metric label="期間" value={formatCycleWindow(submittedSearch.previewWindow)} />
        <Metric label={isCycle ? 'サイクル数' : '利用時間'} value={isCycle ? describeCycleCount(submittedSearch.cycleCount) : `${submittedSearch.environmentDurationHours ?? '-'}時間`} />
        <Metric label="必要ブロック" value={formatBlockList(submittedSearch.selectedBlocks)} />
        <Metric label="所属部署" value={submittedSearch.department} />
        <Metric label="温湿度" value={isCycle ? 'チャンバー設定' : conditionLabel(submittedSearch.requestedCondition)} />
      </div>
      <div className="mt-3 text-sm font-semibold text-slate-600">
        試験名: {submittedSearch.testName} / 申請者: {submittedSearch.requesterName}
      </div>
    </Panel>
  );
}

function CandidateDetail({
  candidate,
  chamberName,
  onConfirm,
}: {
  candidate: Candidate;
  chamberName: string;
  onConfirm: () => void;
}) {
  return (
    <div className="grid gap-4" data-testid="candidate-detail">
      <div className="grid content-start gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="border border-chamber-line bg-white px-2 py-1 text-xs font-semibold">{candidateDateLabel(candidate)}</span>
          <span className="border border-chamber-line bg-chamber-panel px-2 py-1 text-xs font-semibold">{chamberName}</span>
          <span className="border border-chamber-line bg-white px-2 py-1 text-xs font-semibold">{describePlacementMode(candidate.placementMode)}</span>
          {candidate.requestedCycleSpan ? (
            <span className="border border-chamber-line bg-white px-2 py-1 text-xs font-semibold">{describeCycleCount(candidate.requestedCycleSpan)}</span>
          ) : null}
        </div>
        <div className="text-lg font-semibold">{candidate.conditionSummary}</div>
        <div className="text-sm text-slate-600">{formatCycleWindow(candidate.window)}</div>
        <div className="text-sm font-semibold">{formatBlockList(candidate.blocks)}</div>
        <PlacementSummary candidate={candidate} />
        {candidate.requestedCycleSpan ? (
          <CycleTimeline window={candidate.window} dense />
        ) : (
          <div className="border border-chamber-line bg-chamber-panel px-3 py-2 text-sm font-semibold">
            利用時間 {formatDateRange(candidate.occupiedStartAt, candidate.occupiedEndAt)}
          </div>
        )}
      </div>
      <BlockGrid readonly size="large" candidateBlocks={candidate.blocks} title="候補ブロック" />
      <button
        type="button"
        className="inline-flex items-center justify-center gap-2 bg-chamber-reserved px-4 py-2 font-semibold text-white"
        onClick={onConfirm}
      >
        <Check size={18} />
        この候補で予約する
      </button>
    </div>
  );
}

function EmptyCandidateState({ message }: { message?: string }) {
  return (
    <div className="border border-dashed border-chamber-line bg-white px-4 py-8 text-center">
      <div className="text-base font-semibold text-chamber-ink">この条件では予約可能な候補がありません。</div>
      <div className="mt-2 text-sm font-semibold text-slate-500">
        {message ?? '希望日、利用時間、サイクル数、または使用ブロックを調整してください。'}
      </div>
    </div>
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
    ].join(' ')} data-candidate-id={candidate.id}>
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="border border-chamber-line bg-white px-2 py-1 text-xs font-semibold">{candidateDateLabel(candidate)}</span>
          <span className="border border-chamber-line bg-chamber-panel px-2 py-1 text-xs font-semibold">{chamberName}</span>
          <span className="border border-chamber-line bg-white px-2 py-1 text-xs font-semibold">{describePlacementMode(candidate.placementMode)}</span>
          {candidate.requestedCycleSpan ? (
            <span className="border border-chamber-line bg-white px-2 py-1 text-xs font-semibold">{describeCycleCount(candidate.requestedCycleSpan)}</span>
          ) : null}
        </div>
        <div className="text-lg font-semibold">{candidate.conditionSummary}</div>
        <div className="text-sm text-slate-600">{formatCycleWindow(candidate.window)}</div>
        <PlacementSummary candidate={candidate} />
        {candidate.requestedCycleSpan ? (
          <CycleTimeline window={candidate.window} dense />
        ) : (
          <div className="border border-chamber-line bg-chamber-panel px-3 py-2 text-sm font-semibold">
            利用時間 {formatDateRange(candidate.occupiedStartAt, candidate.occupiedEndAt)}
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

function PlacementSummary({ candidate }: { candidate: Candidate }) {
  if (candidate.placementMode !== 'size' || !candidate.availablePlacementCount || candidate.availablePlacementCount <= 1) {
    return null;
  }
  return (
    <div className="text-xs font-semibold text-slate-500">
      代表配置を自動選択 / 他にも{candidate.hiddenPlacementCount ?? candidate.availablePlacementCount - 1}箇所配置可能
    </div>
  );
}

function SearchHeader({
  title,
  subtitle,
  step,
  metrics,
}: {
  title: string;
  subtitle: string;
  step: SearchStep;
  metrics: Array<{ label: string; value: string }>;
}) {
  return (
    <header className="grid gap-3 border-b border-chamber-line pb-5 lg:grid-cols-[1fr_auto] lg:items-end">
      <div>
        <div className="inline-flex items-center gap-2 border border-chamber-line bg-white px-2 py-1 text-xs font-semibold text-slate-600">
          <Gauge size={14} />
          <span className={step === 'conditions' ? 'text-chamber-reserved' : undefined}>1 条件入力</span>
          <span className="text-slate-400">/</span>
          <span className={step === 'results' ? 'text-chamber-reserved' : undefined}>2 候補選択</span>
        </div>
        <h2 className="mt-3 text-3xl font-semibold tracking-normal">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-600">{subtitle}</p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        {metrics.map((metric) => (
          <Metric key={metric.label} label={metric.label} value={metric.value} />
        ))}
      </div>
    </header>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
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

function Field({ label, children }: { label: string; children: ReactNode }) {
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

function chamberLabel(chambers: Chamber[], chamberId: string): string {
  const chamber = chambers.find((item) => item.id === chamberId);
  return chamber ? `${chamber.name} / ${chamber.location}` : chamberId;
}

function conditionLabel(condition?: UserManagedReservationCondition): string {
  if (!condition) {
    return 'チャンバー設定';
  }
  return `${condition.temperatureC}C${condition.humidityRh === undefined ? '' : ` / ${condition.humidityRh}%RH`}`;
}

function candidateDateLabel(candidate: Candidate): string {
  return formatDateKeyJa(candidate.dateKey ?? toDateKey(new Date(candidate.occupiedStartAt)));
}

const DEPARTMENTS_FOR_SEARCH = ['評価技術', '信頼性評価', '品質保証', '製品開発', '生産技術', '設備保全'];
