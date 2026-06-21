export type BlockId = `r${number}c${number}`;

export type PlacementMode = 'size' | 'exact';

export type CycleCount = number;

export type SearchConditionMode = 'cycle' | 'environment';

export type ReservationStatus = 'reserved' | 'in_use' | 'completed' | 'deleted' | 'impacted';

export interface BlockCell {
  id: BlockId;
  row: number;
  col: number;
  label: string;
}

export interface EnvironmentCondition {
  temperatureC: number;
  humidityRh?: number;
}

export type CycleStepKind = 'equilibrium' | 'transition';

export type HumidityMode = 'rh' | 'off';

export interface CycleProgramStep {
  id: string;
  stepNo: number;
  kind: CycleStepKind;
  durationMinutes: number;
  temperature: {
    fromC: number;
    toC: number;
  };
  humidity: {
    mode: HumidityMode;
    fromRh?: number;
    toRh?: number;
  };
  access: 'available' | 'unavailable';
  label?: string;
}

export interface ResolvedCycleProgramStep extends CycleProgramStep {
  startAt: string;
  endAt: string;
  startMinute: number;
  endMinute: number;
}

export interface TemperatureCycleConfig {
  type: 'temperature_cycle';
  programName: string;
  step1StartTime: string;
  cyclePeriodMinutes: number;
  accessCondition: EnvironmentCondition;
  steps: CycleProgramStep[];
}

export interface FixedConditionConfig {
  type: 'fixed_condition';
  condition: EnvironmentCondition;
  availabilityPolicy: {
    type: 'always' | 'daily_window';
    startTime?: string;
    endTime?: string;
  };
}

export interface UserManagedConditionConfig {
  type: 'user_managed_condition';
  temperatureRange: {
    minC: number;
    maxC: number;
    stepC: number;
  };
  humidityRange?: {
    minRh: number;
    maxRh: number;
    stepRh: number;
  };
  simultaneousUseRule: 'exact_match_required';
}

export type ChamberConditionConfig =
  | TemperatureCycleConfig
  | FixedConditionConfig
  | UserManagedConditionConfig;

export type ChamberConditionOwnership = 'admin_managed' | 'user_managed';

export type AdminManagedConditionKind = 'temperature_cycle' | 'fixed_condition';

export interface ChamberConfigRevision {
  id: string;
  chamberId: string;
  revision: number;
  status: 'draft' | 'active' | 'archived';
  ownership: ChamberConditionOwnership;
  adminManagedKind?: AdminManagedConditionKind;
  effectiveFrom: string;
  effectiveTo?: string;
  config: ChamberConditionConfig;
  cyclePeriodMinutes?: number;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface CycleWindow {
  loadStart: string;
  loadEnd: string;
  runStart: string;
  runEnd: string;
  unloadStart: string;
  unloadEnd: string;
}

export interface Chamber {
  id: string;
  name: string;
  type: ChamberConditionConfig['type'];
  location: string;
  blockLayout: {
    rows: number;
    columns: number;
  };
  activeConfigRevisionId: string;
  activeConfigRevision: ChamberConfigRevision;
}

export interface Requester {
  name: string;
  department: string;
  contact?: string;
}

export interface UserManagedReservationCondition {
  temperatureC: number;
  humidityRh?: number;
}

export interface Reservation {
  id: string;
  chamberId: string;
  testName: string;
  requester: Requester;
  contactNote?: string;
  blocks: BlockId[];
  occupiedStartAt: string;
  occupiedEndAt: string;
  requestedCondition?: UserManagedReservationCondition;
  pin: string;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string;
  impactedBySuspensionIds?: string[];
}

export interface Suspension {
  id: string;
  chamberId: string;
  reason: string;
  startAt: string;
  endAt: string;
  blocks: BlockId[] | 'all';
  createdAt: string;
  affectedReservationIds: string[];
}

export interface Candidate {
  id: string;
  chamberId: string;
  dateKey?: string;
  window: CycleWindow;
  occupiedStartAt: string;
  occupiedEndAt: string;
  blocks: BlockId[];
  placementMode: PlacementMode;
  placementIndex: number;
  requestedCycleSpan?: CycleCount;
  requestedCondition?: UserManagedReservationCondition;
  conditionSummary: string;
  chamberConfigRevisionId: string;
  availablePlacementCount?: number;
  hiddenPlacementCount?: number;
  representativeReason?: 'exact_location' | 'requested_location' | 'nearest_available';
}

export interface SearchRequest {
  desiredDate: string;
  selectedBlocks: BlockId[];
  placementMode: PlacementMode;
  conditionMode?: SearchConditionMode;
  cycleCount: CycleCount;
  environmentStartTime?: string;
  environmentDurationHours?: number;
  requestedCondition?: UserManagedReservationCondition;
}

export interface ReservationDraft {
  candidate: Candidate;
  requester: Requester;
  testName: string;
  contactNote?: string;
  requestedCondition?: UserManagedReservationCondition;
}

export interface SuspensionDraft {
  chamberId: string;
  reason: string;
  startAt: string;
  endAt: string;
  blocks: BlockId[] | 'all';
}
