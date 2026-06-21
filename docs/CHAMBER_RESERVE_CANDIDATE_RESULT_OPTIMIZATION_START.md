# ChamberReserve Candidate Result Optimization Start

## Purpose

候補表示を「配置場所の列挙」から「利用者が予約判断できる選択肢」へ変更する。

現在の候補表示では、サイズだけ指定した場合に、同じ日付、同じチャンバー、同じ時間窓に対して複数の配置場所が候補として並ぶ。その結果、利用者には実質的に同じ予約枠が大量に表示され、どれを選べばよいか判断しづらい。

この実装では、検索エンジン内では必要な配置候補をすべて評価しつつ、候補一覧には代表候補だけを出す。複数チャンバーで予約可能な場合は、チャンバーごとの選択肢として表示してよい。

## Background

ChamberReserve の候補一覧は、利用者が次を判断するための画面である。

- どの日付で予約できるか。
- どのチャンバーで予約できるか。
- どの時間窓で予約できるか。
- 予約確定してよいか。

一方で、サイズだけ指定した場合の具体的な庫内位置は、利用者が選ぶ主判断ではない。必要サイズが入る空き場所があるなら、システムが代表配置を決めて候補として提示すればよい。

場所にこだわる利用者には、既存の「場所まで指定」を使わせる。

## Read First

- `AGENTS.md`
- `docs/CHAMBER_RESERVE_SYSTEM_SPEC.md`
- `docs/CHAMBER_RESERVE_LONG_TERM_IMPLEMENTATION_PLAN.md`
- `docs/GOAL_IMPLEMENTATION_POLICY.md`
- `docs/CHAMBER_RESERVE_SEARCH_ENGINE_EXTRACTION_IMPLEMENTATION_SUMMARY.md`
- `src/domain/searchEngine.ts`
- `src/domain/reservationRules.ts`
- `src/domain/searchEngine.test.ts`
- `src/domain/reservationRules.test.ts`
- `server/service.ts`
- `src/api/client.ts`
- `src/App.tsx`
- `src/components/search/SearchFlow.tsx`
- `tmp_validation/chamber_background_block_map_check.cjs`

## Core Product Decision

候補一覧の表示単位は、次の単位にする。

```text
日付 x チャンバー x 時間窓 x 条件 = 1候補
```

サイズだけ指定では、同じ単位の中に複数の配置場所があっても一覧には1件だけ表示する。

場所まで指定では、利用者が指定した位置そのものが空いている場合だけ候補を表示する。

複数チャンバーで同じ条件が取れる場合は、それぞれ別候補として表示する。

## Candidate Model

### Internal Placement Candidate

検索エンジン内部では、従来どおり配置可能なブロック候補をすべて計算する。

例:

- `r1c1,r1c2`
- `r1c2,r1c3`
- `r2c1,r2c2`

これは空き判定と代表候補選定のために必要だが、そのまま候補一覧へ出さない。

### Display Candidate

候補一覧に出すのは、予約判断単位の display candidate だけにする。

display candidate は、内部配置候補のうち代表1件を持つ。

必要なら candidate に次の補助情報を持たせる。

- `availablePlacementCount`: 同じ候補単位の中で配置可能だった場所の数。
- `hiddenPlacementCount`: 一覧に出していない配置候補数。
- `representativeReason`: 代表配置の選定理由。

これらは UI に必ず表示しなくてよい。表示する場合は「他にも配置可能」程度に留める。

## Grouping Rule

候補生成後、次のキーでグルーピングする。

```text
dateKey
chamberId
occupiedStartAt
occupiedEndAt
conditionSummary
chamberConfigRevisionId
requestedCycleSpan
requestedCondition
```

注意:

- `placementIndex` や `blocks` は grouping key に入れない。
- `placementMode === "exact"` の場合も同じ仕組みに通してよいが、実質的に1配置だけになる。
- `requestedCondition` は温湿度指定チャンバーで条件が違う候補を混ぜないために含める。

## Representative Placement Rule

`placementMode === "size"` の場合、同じ grouping key の中から代表配置を1件選ぶ。

優先順位:

1. 利用者が画面で選んだ位置そのものが空いている場合は、その位置を採用する。
2. 空いていない場合は、利用者が選んだ形状に最も近い配置を採用する。
3. 近さが同じ場合は、上段、左列の順に安定して1件を選ぶ。

近さの計算:

- 選択ブロック集合の中心点を計算する。
- 配置候補ブロック集合の中心点を計算する。
- 行方向差分と列方向差分のマンハッタン距離を使う。
- 距離が同じ場合は、最小行、最小列、ブロックID文字列で tie-break する。

この方法により、利用者が選んだ場所が空いていれば直感どおりそこが候補になる。空いていない場合も、できるだけ近い場所が自動で選ばれる。

## Desired Date Handling

希望日が埋まっている場合、代替候補だけを通常候補のように混ぜて表示しない。

UI では次を分ける。

1. 希望日の結果。
2. 近い日付の代替候補。

表示例:

```text
希望日 2026/06/24 は、この条件で予約可能な枠がありません。

近い日付の候補
- 2026/06/25 TC-01 予約可能
- 2026/06/25 TC-02 予約可能
```

希望日に候補がある場合:

- 希望日の候補を最優先で表示する。
- 代替日候補は初期表示しない、または控えめな折りたたみ表示にする。

希望日に候補がない場合:

- 希望日に候補がないことを明示する。
- その下に、探索範囲内の近い日付候補を表示する。
- 代替候補の見出しに「近い日付の候補」と出す。

## Search Result Shape

候補配列だけでは、希望日が空いていないことと代替候補があることを UI が区別しづらい。

検索エンジンに structured result を追加する。

例:

```ts
interface CandidateSearchResult {
  requestedDate: string;
  requestedDateCandidates: Candidate[];
  alternativeDateCandidates: Candidate[];
  candidates: Candidate[];
  requestedDateAvailable: boolean;
  unavailableReasons: CandidateUnavailableReason[];
}
```

既存互換のため、`searchReservationCandidates(request, context): Candidate[]` は残してよい。

新しい UI と API では、可能なら次の新関数を使う。

```ts
searchReservationCandidateResult(request, context): CandidateSearchResult
```

互換方針:

- 予約確定処理は同じ代表候補選定アルゴリズムで再検索する。
- `candidate.id` は代表配置に対して安定して生成する。
- 既存 API が `candidates` だけを返している場合も壊さず、追加情報をオプションで返す。

## Unavailable Reason

希望日に候補がない場合、理由は短く表示する。

初期実装で扱う理由:

- `non_contiguous_blocks`: 選択ブロックが連続していない。
- `no_matching_chamber`: 条件に合うチャンバーがない。
- `exact_location_unavailable`: 場所まで指定した位置が空いていない。
- `no_contiguous_placement`: サイズを満たす連続空きがない。
- `blocked_by_suspension`: 一時利用停止と重なる。
- `blocked_by_reservation`: 既存予約と重なる。

理由判定が難しい場合は、最初は代表的な1つまたは汎用メッセージでもよい。ただし、UI には次の行動が分かる文にする。

例:

- `場所まで指定した位置は空いていません。サイズだけ指定に切り替えると候補が見つかる可能性があります。`
- `希望日は連続した空きブロックがありません。近い日付の候補を表示しています。`

## UI Behavior

### Search Results Layout

候補表示画面は次の構成にする。

1. 検索条件サマリー。
2. 希望日の結果。
3. 近い日付の候補。
4. 選択中候補の詳細。

希望日に候補がある場合:

- 「希望日の候補」として候補を表示する。
- サイズだけ指定では、同じ日付、同じチャンバー、同じ時間窓につき1件だけ表示する。

希望日に候補がない場合:

- 希望日が取れないことを上部で明示する。
- 代替候補を下に表示する。
- 候補がない理由と次の操作を短く出す。

### Candidate Card

候補カードには次を表示する。

- 日付。
- チャンバー名。
- 予約可能時間。
- 搬入、運転、搬出時間。
- 代表配置のブロック表示。
- 配置モード。
- 予約確定ボタン。

サイズだけ指定の場合、同じチャンバー内の他配置候補は一覧に出さない。

必要なら小さく次を表示する。

```text
代表配置を自動選択 / 他にも2箇所配置可能
```

ただし、これは主情報にしない。

## Domain Implementation Plan

### 1. Search Engine Options

`src/domain/searchEngine.ts` に候補集約方針を追加する。

候補:

```ts
type SizeModeCandidatePolicy = 'representative-per-bucket' | 'all-placements';
```

初期値は `representative-per-bucket` とする。

`all-placements` はテストや将来の詳細表示用に残してよいが、通常 UI では使わない。

### 2. Placement Grouping

次の helper を追加する。

- `buildCandidateGroupKey(candidate)`
- `groupCandidatesByReservationSlot(candidates)`
- `selectRepresentativeCandidate(candidates, request)`
- `rankRepresentativePlacement(candidate, request)`

または、candidate を作る前に placement の段階で集約してもよい。

実装方針:

- 既存の `findCandidatePlacements` は全配置を返すままにする。
- `placementMode === "size"` のときだけ、同一 bucket 内で代表1件に絞る。
- `placementMode === "exact"` は指定位置のみを候補化する。

### 3. Stable Candidate ID

代表候補に選ばれた配置に対して、既存と同じように `candidate.id` を生成する。

注意:

- 候補IDは予約確定時の再検索で再現できる必要がある。
- 代表配置の選定は deterministic にする。
- 予約や一時利用停止が変わった場合は候補IDが消えてもよい。これは既存の競合再確認の考え方と一致する。

### 4. Structured Search Result

可能なら `searchReservationCandidateResult` を追加する。

```ts
export function searchReservationCandidateResult(
  request: SearchRequest,
  context: CandidateSearchEngineContext,
): CandidateSearchResult
```

`searchReservationCandidates` は次の互換 wrapper にする。

```ts
return searchReservationCandidateResult(request, context).candidates;
```

### 5. Server API

`server/service.ts` は structured result を扱えるようにする。

方針:

- 既存の `searchCandidates` は Candidate[] を返す互換口として残す。
- 新しく `searchCandidateResult` を追加する。
- `POST /api/reservation-candidates` は互換のため `candidates` を返しつつ、追加で `result` または `summary` を返してよい。

例:

```json
{
  "ok": true,
  "candidates": [],
  "result": {
    "requestedDateAvailable": false,
    "requestedDateCandidates": [],
    "alternativeDateCandidates": []
  }
}
```

### 6. API Client

`src/api/client.ts` に structured result 用の関数を追加する。

- `fetchCandidateResult(request)`
- 既存の `fetchCandidates(request)` は互換で残す。

### 7. UI

`src/App.tsx` と `src/components/search/SearchFlow.tsx` は、候補配列だけでなく structured result を保持する。

状態例:

```ts
const [candidateResult, setCandidateResult] = useState<CandidateSearchResult | null>(null);
```

表示候補:

- 希望日に候補がある場合: `candidateResult.requestedDateCandidates`
- 希望日に候補がない場合: `candidateResult.alternativeDateCandidates`

選択中候補:

- 表示中候補の先頭を初期選択する。
- 希望日なしで代替候補を表示している場合、候補カードに代替日であることが分かる日付表示を出す。

## Test Plan

### Domain Tests

`src/domain/searchEngine.test.ts` に追加する。

- サイズだけ指定で、同じ日付、同じチャンバー、同じ時間窓の複数配置が1候補にまとまる。
- サイズだけ指定で、選択位置が空いている場合はその位置が代表になる。
- サイズだけ指定で、選択位置が埋まっている場合は最も近い配置が代表になる。
- 複数チャンバーで空きがある場合は、チャンバーごとに候補が出る。
- 場所まで指定では、指定位置が埋まっていれば候補が出ない。
- 希望日が埋まっていて翌日が空いている場合、`requestedDateCandidates` は空、`alternativeDateCandidates` は存在する。
- 断片化したブロック選択は候補を返さない。

### Server Tests

`server/service.test.ts` に追加する。

- API/service でも代表候補だけ返る。
- 予約確定時の再検索で、代表候補IDが再現される。
- 競合が入った場合は従来どおり `candidate_unavailable` または `candidate_conflict` になる。

### Browser Tests

`tmp_validation/chamber_background_block_map_check.cjs` または新規検証スクリプトで確認する。

- サイズだけ指定で検索したとき、同じ日付、同じチャンバーの候補が大量に並ばない。
- 複数チャンバーは候補として残る。
- 希望日が埋まっている場合、希望日なしメッセージと近い日付候補が分かれて表示される。
- 候補カードと選択中候補のチャンバー表示が一致する。
- 代表配置のブロック表示がチャンバー背景上に正しく出る。
- 代表候補から予約確定して PIN が表示される。
- モバイル幅で候補なしメッセージ、代替候補、候補カードが横にはみ出さない。

## Validation Commands

実装完了時に次を実行する。

```powershell
npm run test
npm run test:server
npm run build
python main.py --check
python main.py --no-open
node tmp_validation\chamber_background_block_map_check.cjs
```

ブラウザ確認も必須とする。

## Out of Scope

- アカウント管理。
- 仮押さえ。
- 通知連携。
- 新しいチャンバー種別の追加。
- SQLite schema の大規模変更。
- 奥行き、高さ、重量、通風クリアランス判定。
- 利用者が隠れた全配置候補から手動選択する詳細モード。
- 候補表示以外の大規模 UI 再設計。

## Completion Criteria

- サイズだけ指定で、同一日付、同一チャンバー、同一時間窓の候補が1件にまとまる。
- 複数チャンバーの選択肢は残る。
- 希望日が埋まっている場合、希望日の不可と代替日候補が分かれて表示される。
- 代表配置の選定が deterministic で、予約確定時の再検索でも同じ候補IDを再現できる。
- 既存の断片化禁止、25°C搬入/搬出、予約確定、PIN、予約ボード、一時利用停止を壊さない。
- テスト、ビルド、ランタイム、ブラウザ確認を PASS / FAIL / BLOCKED / NOT_RUN で報告できる。
