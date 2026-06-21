# ChamberReserve Chamber Admin Configuration Start

作成日: 2026-06-22

## 目的

チャンバーごとに、温湿度条件を「ユーザー温湿度管理」にするか「管理者管理」にするかを管理者画面で切り替えられるようにする。

管理者管理の場合は、管理者がチャンバーごとの設定情報を入力する。設定方式は、温湿度サイクル、一定温湿度を扱えるようにする。ユーザー温湿度管理の場合は、利用者が予約時に温度と湿度を指定できる範囲を管理者が定義する。

特に温湿度サイクル型では、ステップ1の開始時刻を決めると、以降のステップ開始/終了時刻が相対時間から自動計算されるようにする。管理者が温度、湿度、時間を入力する際には、表だけでなく温度/湿度の時間推移グラフで視覚的に確認、調整できるUIにする。

## 背景

Phase 3.5 時点では、温度サイクル型の標準条件、サイクル実施量、25°C 搬入/搬出窓を検索/予約フロー側で扱っている。

今後はこの考え方を改め、予約にはサイクル数、温湿度条件、サイクルステップを保存しない。予約は、どのチャンバーのどのブロックを何時から何時まで占有するかだけを基本データにする。

温湿度条件、サイクル周期、ステップ、一定温湿度、ユーザーが指定できる範囲は、チャンバー側の設定として管理する。

## 設計原則

- 予約は占有情報を中心にする。
- サイクルチャンバーと一定温湿度チャンバーでは、予約に温湿度条件やサイクル数を保存しない。
- ユーザー温湿度管理チャンバーだけ、予約時の要求温湿度を競合判定のために保存する。
- チャンバー設定は版管理する。既存予約の意味は、設定変更によって変えない。
- 管理者が編集中の設定は `draft`、公開中の設定は `active`、過去設定は `archived` として扱う。
- 新規候補生成だけが、公開中の最新チャンバー設定を参照する。
- 温湿度サイクルのステップは相対時間で保存し、実時刻はステップ1開始時刻から計算する。
- サイクル周期はステップ時間合計から算出し、検索/表示しやすいように設定データにも保存する。

## データモデル方針

### Chamber

チャンバー本体は、物理的な装置情報と現在有効な設定版への参照だけを持つ。

```ts
interface Chamber {
  id: string;
  name: string;
  location: string;
  blockLayout: {
    rows: number;
    columns: number;
  };
  activeConfigRevisionId: string;
}
```

### ChamberConfigRevision

チャンバー設定は版として保存する。

```ts
type ChamberConditionOwnership = 'admin_managed' | 'user_managed';

type AdminManagedConditionKind = 'temperature_cycle' | 'fixed_condition';

interface ChamberConfigRevision {
  id: string;
  chamberId: string;
  revision: number;
  status: 'draft' | 'active' | 'archived';
  ownership: ChamberConditionOwnership;
  adminManagedKind?: AdminManagedConditionKind;
  effectiveFrom: string;
  effectiveTo?: string;
  config: ChamberConditionConfig;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}
```

### ChamberConditionConfig

```ts
type ChamberConditionConfig =
  | TemperatureCycleConfig
  | FixedConditionConfig
  | UserManagedConditionConfig;
```

### TemperatureCycleConfig

温湿度サイクルは、管理者管理の一種として扱う。

```ts
interface TemperatureCycleConfig {
  type: 'temperature_cycle';
  programName: string;
  step1StartTime: string; // HH:mm
  cyclePeriodMinutes: number;
  accessCondition: EnvironmentCondition;
  steps: CycleProgramStep[];
}
```

`cyclePeriodMinutes` はステップ時間合計から計算される。画面上では周期として表示し、保存時にも検証済みの値として保持する。

### CycleProgramStep

```ts
type CycleStepKind = 'equilibrium' | 'transition';

type HumidityMode = 'rh' | 'off';

interface CycleProgramStep {
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
```

平衡状態は `fromC === toC`、遷移状態は `fromC !== toC` を基本にする。ただし管理者画面では `kind` を明示して、表示と検証メッセージを分かりやすくする。

湿度が `OFF` のステップは `humidity.mode = 'off'` として保存する。相対湿度を使う場合は `humidity.mode = 'rh'` とし、平衡なら `fromRh === toRh`、遷移なら差分を持てるようにする。

### FixedConditionConfig

一定温湿度も管理者管理の一種として扱う。

```ts
interface FixedConditionConfig {
  type: 'fixed_condition';
  condition: EnvironmentCondition;
  availabilityPolicy: {
    type: 'always' | 'daily_window';
    startTime?: string;
    endTime?: string;
  };
}
```

### UserManagedConditionConfig

ユーザー温湿度管理では、ユーザーが予約時に指定できる範囲を管理者が定義する。

```ts
interface UserManagedConditionConfig {
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
```

同時利用は、要求温湿度が完全一致する予約だけ許可する。許容幅は設けない。

### Reservation

サイクルチャンバーと一定温湿度チャンバーでは、予約は占有情報だけを保存する。

```ts
interface Reservation {
  id: string;
  chamberId: string;
  blocks: BlockId[];
  occupiedStartAt: string;
  occupiedEndAt: string;
  testName: string;
  requester: {
    name: string;
    department: string;
  };
  pin: string;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string;
}
```

ユーザー温湿度管理チャンバーだけ、予約に `requestedCondition` を追加する。

```ts
interface UserManagedReservationCondition {
  temperatureC: number;
  humidityRh?: number;
}
```

## SQLite 方針

初期実装では、チャンバー設定を `config_json` として保存する。検索、表示、候補生成で頻繁に使う最小項目だけ列として持つ。

```sql
chambers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  block_rows INTEGER NOT NULL,
  block_columns INTEGER NOT NULL,
  active_config_revision_id TEXT
)

chamber_config_revisions (
  id TEXT PRIMARY KEY,
  chamber_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  status TEXT NOT NULL,
  ownership TEXT NOT NULL,
  admin_managed_kind TEXT,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  config_json TEXT NOT NULL,
  cycle_period_minutes INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
)
```

後でサイクルステップを横断検索、集計、監査したくなった場合だけ、`cycle_program_steps` を正規化する。

## API 方針

管理者向け:

- `GET /api/admin/chambers`
- `GET /api/admin/chambers/:id/config-revisions`
- `POST /api/admin/chambers/:id/config-revisions`
- `PATCH /api/admin/chambers/:id/config-revisions/:revisionId`
- `POST /api/admin/chambers/:id/config-revisions/:revisionId/publish`
- `POST /api/admin/chambers/:id/config-revisions/:revisionId/archive`
- `POST /api/admin/chamber-config/validate`

利用者向け:

- `GET /api/chambers` は公開中設定の要約を返す。
- `POST /api/reservation-candidates` は公開中設定を使って候補を生成する。
- `POST /api/reservations` は確定時に公開中設定と占有競合を再判定する。

## ドメインロジック方針

追加する純粋関数:

```ts
calculateCyclePeriodMinutes(steps)
validateCycleProgram(config)
buildCycleSchedule(config, dateKey)
resolveStepTimes(config, step1StartAt)
buildOccupancyWindowFromCycle(config, desiredDate, requestedCycleSpan)
buildOccupancyWindowFromFixedCondition(config, desiredDate)
validateUserManagedRequestedCondition(config, requestedCondition)
canShareUserManagedReservation(existingReservation, requestedCondition)
```

`requestedCycleSpan` は検索時の入力として扱う。確定予約には保存しない。確定時に計算された `occupiedStartAt` と `occupiedEndAt` だけを保存する。

Phase 3.5 で導入した `cycleCount` は、次の実装で予約永続データから外す。必要なら検索フォーム内の一時入力として残し、候補生成時に占有終了時刻を計算するためだけに使う。

## 管理者画面方針

### 画面構成

- 左: チャンバー一覧、設定状態、公開中/編集中の表示。
- 中央: 選択中チャンバーの基本情報と管理方式。
- 右: 設定プレビュー、温湿度グラフ、公開前バリデーション。

### 管理方式切り替え

最上位で次を選ぶ。

- 管理者管理
- ユーザー温湿度管理

管理者管理を選んだ場合は、次を選ぶ。

- 温湿度サイクル
- 一定温湿度

### 温湿度サイクル編集UI

温湿度サイクルでは、表とグラフを同期させる。

表で編集する項目:

- ステップ番号
- 平衡状態/遷移状態
- 温度 from/to
- 湿度 RH/OFF、from/to
- 時間
- 出し入れ可能/不可ステップ
- ラベル

自動計算する項目:

- 各ステップの開始時刻
- 各ステップの終了時刻
- 1サイクル周期
- 24時間を超える/不足する場合の警告
- 出し入れ可能窓

グラフで表示する項目:

- X軸: 時間。
- 上段: 温度推移。
- 下段: 湿度推移。
- 平衡状態は水平線。
- 遷移状態は斜線。
- 湿度OFFは別色または破線。
- 出し入れ可能ステップは背景帯で強調。
- ステップ境界はドラッグ可能なハンドルとして扱う。

グラフ操作の最小要件:

- ステップ境界を動かすと前後ステップの時間が変わる。
- 表の時間を編集するとグラフが更新される。
- ステップ1開始時刻を変えると全ステップの実時刻が更新される。
- 不正な時間、負の時間、範囲外温湿度は保存できない。

### 一定温湿度編集UI

- 温度、湿度、利用可能時間帯を入力する。
- 条件カードと簡易タイムラインで、いつ使えるかを表示する。

### ユーザー温湿度管理UI

- 温度範囲、湿度範囲、刻み幅を入力する。
- 同時利用条件は「完全一致のみ」として表示し、初期実装では変更不可にする。
- 予約画面でユーザーが入力する温湿度範囲のプレビューを表示する。

## 候補生成への反映

### 温湿度サイクル

- 公開中の `TemperatureCycleConfig` を使う。
- ステップ1開始時刻と希望日からサイクルスケジュールを作る。
- 出し入れは `access = 'available'` のステップだけ許可する。
- 候補は `occupiedStartAt` / `occupiedEndAt` とブロック空きだけで判定する。

### 一定温湿度

- ユーザーの検索条件が管理者設定の温湿度に合う場合だけ候補にする。
- 候補は利用可能時間帯とブロック空きで判定する。

### ユーザー温湿度管理

- ユーザー入力が管理者設定の範囲内である場合だけ候補にする。
- 同時利用は、既存予約の `requestedCondition` と完全一致する場合だけ許可する。
- 完全一致しない場合は、同じチャンバー/同じブロック/同じ時間帯では候補にしない。

## 検証方針

- ドメインテスト:
  - サイクルステップ合計から周期を計算できる。
  - ステップ1開始時刻から全ステップの開始/終了を計算できる。
  - 平衡/遷移/OFF湿度をバリデーションできる。
  - 管理者管理/ユーザー温湿度管理ごとに候補判定が分かれる。
  - 予約はサイクル数やサイクルステップを保存せず、占有開始/終了だけで競合判定できる。
- サーバーテスト:
  - 設定版の draft/active/archive が保存できる。
  - publish時に既存activeがarchiveされる。
  - 公開中設定から候補生成できる。
- ブラウザ確認:
  - チャンバーごとに管理方式を切り替えられる。
  - 温湿度サイクルを表とグラフで編集できる。
  - ステップ1開始時刻変更で全ステップ時刻が更新される。
  - 一定温湿度設定を保存できる。
  - ユーザー温湿度管理の範囲を設定できる。
  - 設定変更後の検索候補が公開中設定を参照する。

## 完了条件

- 管理者画面にチャンバー管理タブまたは管理セクションが追加されている。
- チャンバーごとに「管理者管理」「ユーザー温湿度管理」を切り替えられる。
- 管理者管理で「温湿度サイクル」「一定温湿度」を切り替えられる。
- 温湿度サイクル設定を、ステップ表と温湿度時間グラフで編集できる。
- ステップ1開始時刻から以降のステップ時刻と周期が自動計算される。
- 設定は draft/active/archive として保存できる。
- 予約データからサイクル数の永続保持を外し、サイクル/固定条件型は占有開始/終了を中心に競合判定する。
- `npm run test`、`npm run test:server`、`npm run build`、ブラウザ確認結果を PASS / FAIL / BLOCKED / NOT_RUN で報告できる。
