import type {
  BlockCell,
  Chamber,
  ChamberConfigRevision,
  CycleProgramStep,
  FixedConditionConfig,
  TemperatureCycleConfig,
  UserManagedConditionConfig,
} from './types.ts';

export const BLOCK_ROWS = 3;
export const BLOCK_COLUMNS = 4;

export const BLOCKS: BlockCell[] = Array.from({ length: BLOCK_ROWS }, (_, rowIndex) =>
  Array.from({ length: BLOCK_COLUMNS }, (_, colIndex) => {
    const row = rowIndex + 1;
    const col = colIndex + 1;
    const rowLabel = ['上段', '中段', '下段'][rowIndex];
    return {
      id: `r${row}c${col}` as const,
      row,
      col,
      label: `${rowLabel}-${col}`,
    };
  }),
).flat();

export const STANDARD_CYCLE_STEPS: CycleProgramStep[] = [
  {
    id: 'step-01-ramp-high',
    stepNo: 1,
    kind: 'transition',
    durationMinutes: 120,
    temperature: { fromC: 25, toC: 65 },
    humidity: { mode: 'rh', fromRh: 93, toRh: 93 },
    access: 'available',
    label: '25C搬入から高温へ遷移',
  },
  {
    id: 'step-02-hold-high',
    stepNo: 2,
    kind: 'equilibrium',
    durationMinutes: 210,
    temperature: { fromC: 65, toC: 65 },
    humidity: { mode: 'rh', fromRh: 93, toRh: 93 },
    access: 'unavailable',
    label: '高温高湿保持',
  },
  {
    id: 'step-03-ramp-25',
    stepNo: 3,
    kind: 'transition',
    durationMinutes: 120,
    temperature: { fromC: 65, toC: 25 },
    humidity: { mode: 'rh', fromRh: 93, toRh: 93 },
    access: 'unavailable',
    label: '25Cへ遷移',
  },
  {
    id: 'step-04-hold-25',
    stepNo: 4,
    kind: 'equilibrium',
    durationMinutes: 30,
    temperature: { fromC: 25, toC: 25 },
    humidity: { mode: 'rh', fromRh: 93, toRh: 93 },
    access: 'unavailable',
    label: '25C保持',
  },
  {
    id: 'step-05-ramp-high',
    stepNo: 5,
    kind: 'transition',
    durationMinutes: 120,
    temperature: { fromC: 25, toC: 65 },
    humidity: { mode: 'rh', fromRh: 93, toRh: 93 },
    access: 'unavailable',
    label: '高温へ再遷移',
  },
  {
    id: 'step-06-hold-high',
    stepNo: 6,
    kind: 'equilibrium',
    durationMinutes: 210,
    temperature: { fromC: 65, toC: 65 },
    humidity: { mode: 'rh', fromRh: 93, toRh: 93 },
    access: 'unavailable',
    label: '高温高湿保持',
  },
  {
    id: 'step-07-ramp-25',
    stepNo: 7,
    kind: 'transition',
    durationMinutes: 120,
    temperature: { fromC: 65, toC: 25 },
    humidity: { mode: 'rh', fromRh: 93, toRh: 93 },
    access: 'unavailable',
    label: '25Cへ遷移',
  },
  {
    id: 'step-08-hold-25',
    stepNo: 8,
    kind: 'equilibrium',
    durationMinutes: 120,
    temperature: { fromC: 25, toC: 25 },
    humidity: { mode: 'rh', fromRh: 93, toRh: 93 },
    access: 'unavailable',
    label: '25C保持',
  },
  {
    id: 'step-09-ramp-cold',
    stepNo: 9,
    kind: 'transition',
    durationMinutes: 30,
    temperature: { fromC: 25, toC: -10 },
    humidity: { mode: 'off' },
    access: 'unavailable',
    label: '低温へ遷移',
  },
  {
    id: 'step-10-hold-cold',
    stepNo: 10,
    kind: 'equilibrium',
    durationMinutes: 180,
    temperature: { fromC: -10, toC: -10 },
    humidity: { mode: 'off' },
    access: 'unavailable',
    label: '低温保持',
  },
  {
    id: 'step-11-ramp-25',
    stepNo: 11,
    kind: 'transition',
    durationMinutes: 90,
    temperature: { fromC: -10, toC: 25 },
    humidity: { mode: 'off' },
    access: 'unavailable',
    label: '25Cへ復帰',
  },
  {
    id: 'step-12-unload-25',
    stepNo: 12,
    kind: 'equilibrium',
    durationMinutes: 90,
    temperature: { fromC: 25, toC: 25 },
    humidity: { mode: 'rh', fromRh: 93, toRh: 93 },
    access: 'available',
    label: '25C搬出可能',
  },
];

function sumStepMinutes(steps: CycleProgramStep[]): number {
  return steps.reduce((total, step) => total + step.durationMinutes, 0);
}

export const DEFAULT_TEMPERATURE_CYCLE_CONFIG: TemperatureCycleConfig = {
  type: 'temperature_cycle',
  programName: 'JIS C 0028 24h温湿度サイクル',
  step1StartTime: '09:00',
  cyclePeriodMinutes: sumStepMinutes(STANDARD_CYCLE_STEPS),
  accessCondition: { temperatureC: 25, humidityRh: 93 },
  steps: STANDARD_CYCLE_STEPS,
};

export const DEFAULT_FIXED_CONDITION_CONFIG: FixedConditionConfig = {
  type: 'fixed_condition',
  condition: { temperatureC: 25, humidityRh: 93 },
  availabilityPolicy: { type: 'always' },
};

export const DEFAULT_USER_MANAGED_CONFIG: UserManagedConditionConfig = {
  type: 'user_managed_condition',
  temperatureRange: { minC: -40, maxC: 85, stepC: 1 },
  humidityRange: { minRh: 20, maxRh: 95, stepRh: 1 },
  simultaneousUseRule: 'exact_match_required',
};

export function buildInitialConfigRevision(
  chamberId: string,
  config: TemperatureCycleConfig | FixedConditionConfig | UserManagedConditionConfig = DEFAULT_TEMPERATURE_CYCLE_CONFIG,
): ChamberConfigRevision {
  return {
    id: `${chamberId}-config-r1`,
    chamberId,
    revision: 1,
    status: 'active',
    ownership: config.type === 'user_managed_condition' ? 'user_managed' : 'admin_managed',
    adminManagedKind: config.type === 'user_managed_condition' ? undefined : config.type,
    effectiveFrom: '2026-06-21T00:00:00+09:00',
    config,
    cyclePeriodMinutes: config.type === 'temperature_cycle' ? config.cyclePeriodMinutes : undefined,
    createdAt: '2026-06-21T00:00:00+09:00',
    updatedAt: '2026-06-21T00:00:00+09:00',
    publishedAt: '2026-06-21T00:00:00+09:00',
  };
}

export const CHAMBERS: Chamber[] = [
  {
    id: 'tc-01',
    name: 'TC-01 温湿度サイクルチャンバー',
    type: 'temperature_cycle',
    location: '評価室 A',
    blockLayout: { rows: BLOCK_ROWS, columns: BLOCK_COLUMNS },
    activeConfigRevisionId: 'tc-01-config-r1',
    activeConfigRevision: buildInitialConfigRevision('tc-01'),
  },
  {
    id: 'tc-02',
    name: 'TC-02 温湿度サイクルチャンバー',
    type: 'temperature_cycle',
    location: '評価室 B',
    blockLayout: { rows: BLOCK_ROWS, columns: BLOCK_COLUMNS },
    activeConfigRevisionId: 'tc-02-config-r1',
    activeConfigRevision: buildInitialConfigRevision('tc-02'),
  },
  {
    id: 'tc-03',
    name: 'TC-03 温湿度サイクルチャンバー',
    type: 'temperature_cycle',
    location: '信頼性評価室',
    blockLayout: { rows: BLOCK_ROWS, columns: BLOCK_COLUMNS },
    activeConfigRevisionId: 'tc-03-config-r1',
    activeConfigRevision: buildInitialConfigRevision('tc-03'),
  },
];

export const CHAMBER: Chamber = CHAMBERS[0];
