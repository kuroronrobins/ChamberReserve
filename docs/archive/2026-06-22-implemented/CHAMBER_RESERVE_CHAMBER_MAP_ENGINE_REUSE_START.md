# ChamberReserve Chamber Map Engine Reuse Start

作成日: 2026-06-22

## 目的

候補表示にも、採用済みチャンバー正面模式図を使った 4 x 3 表示エンジンを適用する。

ただし、候補カード用に似た JSX や状態判定を複製しない。チャンバー正面図上で「どのブロックが選択中か」「どのブロックが候補か」「どのブロックが予約済み/一時停止/影響予約/操作不可か」を決める処理を独立したコードに切り出し、検索入力、選択中候補、候補カード、予約ボード、予約行、管理者一時利用停止が必要に応じて同じ処理と同じ表示エンジンを参照する構成にする。

## 背景

直前の背景付きブロックマップ実装では、`BlockGrid` の large 表示にチャンバー背景と 4 x 3 操作レイヤーを組み込んだ。検索入力、選択中候補、予約ボード、管理者一時利用停止では背景付き表示を使えるようになったが、候補カードや予約行の小さいミニマップはまだ plain 表示である。

このまま候補カードにも似た背景付きマップを直接書くと、次の問題が起きる。

- 選択/候補/予約済み/一時停止/影響予約の優先順位が表示箇所ごとにずれる。
- クリック、ドラッグ、readonly、disabled の判定が重複する。
- 棚線と枠の干渉、選択色、モバイル幅などの視覚調整を複数箇所へ反映する必要がある。
- 将来の複数チャンバー、固定条件型、自由温湿度型で表示仕様が増えたときに破綻しやすい。

今回の実装は、見た目を候補カードへ広げるだけではなく、4 x 3 チャンバー表示を再利用可能な小さな基盤へ整理することを目的にする。

## 長期計画上の位置づけ

- Phase 3.5 後続の UI/UX リファインとして扱う。
- Phase 4 以降のチャンバー種別拡張前に、チャンバー正面図表示の共通境界を固める。
- 予約判定、API、SQLiteスキーマ、PIN仕様を変更するフェーズではない。

## Read First

- `AGENTS.md`
- `docs/CHAMBER_RESERVE_SYSTEM_SPEC.md`
- `docs/CHAMBER_RESERVE_LONG_TERM_IMPLEMENTATION_PLAN.md`
- `docs/GOAL_IMPLEMENTATION_POLICY.md`
- `docs/CHAMBER_RESERVE_PHASE3_5_UI_UX_REFINEMENT_START.md`
- `docs/CHAMBER_RESERVE_PHASE3_5_IMPLEMENTATION_SUMMARY.md`
- `docs/CHAMBER_RESERVE_CHAMBER_BACKGROUND_BLOCK_MAP_START.md`
- `docs/CHAMBER_RESERVE_CHAMBER_BACKGROUND_BLOCK_MAP_IMPLEMENTATION_SUMMARY.md`
- `package.json`
- `src/App.tsx`
- `src/components/BlockGrid.tsx`
- `src/domain/chamber.ts`
- `src/domain/reservationRules.ts`
- `src/domain/types.ts`
- `tmp_validation/chamber_background_block_map_check.cjs`

## 現状の課題

`src/components/BlockGrid.tsx` は、現在次の責務を同時に持っている。

- 表示データの受け取り。
- `selectedBlocks`、`candidateBlocks`、`reservedBlocks`、`suspendedBlocks`、`impactedBlocks`、`disabledBlocks` の Set 化。
- ブロック状態の優先順位判定。
- 操作可能/不可判定。
- クリック/ドラッグ選択の更新。
- plain 表示の描画。
- chamber 背景付き表示の描画。
- 状態ごとの Tailwind class 定義。

候補カードに背景付き表示を追加する前に、この責務を分離する。

## 実装方針

### 1. ブロック状態エンジンを pure helper として独立させる

新規ファイルを作る。

推奨パス:

- `src/domain/blockMapEngine.ts`

このファイルは React、DOM、Tailwind、SVG asset を import しない。対象は 4 x 3 ブロックの状態判定と選択更新だけに限定する。

提供する型と関数の例:

```ts
export type BlockTone =
  | 'empty'
  | 'selected'
  | 'reserved'
  | 'suspended'
  | 'candidate'
  | 'impact'
  | 'disabled';

export interface BlockMapStateInput {
  selectedBlocks?: BlockId[];
  candidateBlocks?: BlockId[];
  reservedBlocks?: BlockId[];
  suspendedBlocks?: BlockId[];
  impactedBlocks?: BlockId[];
  disabledBlocks?: BlockId[];
  readonly?: boolean;
}

export interface ResolvedBlockCellState {
  block: BlockCell;
  tone: BlockTone;
  selected: boolean;
  disabled: boolean;
}

export function resolveBlockTone(blockId: BlockId, input: BlockMapStateInput): BlockTone;
export function resolveBlockMap(input: BlockMapStateInput): ResolvedBlockCellState[];
export function canToggleBlock(blockId: BlockId, input: BlockMapStateInput): boolean;
export function toggleBlockSelection(blockId: BlockId, selectedBlocks: BlockId[], input: BlockMapStateInput): BlockId[];
export function applyBlockDragIntent(blockId: BlockId, intent: 'add' | 'remove', selectedBlocks: BlockId[], input: BlockMapStateInput): BlockId[];
```

優先順位は現行仕様を維持する。

```text
suspended > impact > reserved > selected > candidate > disabled > empty
```

この優先順位をテストで固定する。特に予約済み、一時停止、影響予約、disabled はクリックしても選択状態に変わらないことを確認する。

### 2. 表示エンジンを共通コンポーネントへ分離する

新規コンポーネントを作る。

推奨パス:

- `src/components/ChamberBlockMap.tsx`

このコンポーネントは `blockMapEngine` の解決済み状態を使って描画する。`BlockGrid` に残っている chamber 背景付き描画をここへ移す。

想定 props:

```ts
interface ChamberBlockMapProps extends BlockMapStateInput {
  title?: string;
  surface?: 'plain' | 'chamber';
  density?: 'large' | 'inline' | 'compact';
  interactive?: boolean;
  onChange?: (blocks: BlockId[]) => void;
}
```

`density` の使い分け:

- `large`: 検索入力、選択中候補、予約ボード、管理者一時利用停止。行/列ラベル、十分な高さ、ドラッグ選択あり。
- `inline`: 候補カード。採用済みチャンバー背景を使うが、カード内に収まる高さに抑える。状態表示は同じ。
- `compact`: 予約行など一覧内の最小表示。背景付き表示を原則使うが、表示幅が狭すぎる場合は同じエンジンの plain fallback を許可する。

重要なのは、`density` ごとに JSX を複製しないこと。サイズ、ラベル表示、余白、文字サイズだけを class map で切り替える。

### 3. `BlockGrid` は互換 wrapper に縮小する

既存呼び出しを一度に壊さないため、`BlockGrid` は残してよい。ただし責務は薄くする。

推奨方針:

- `BlockGrid` は props を受け取り、`ChamberBlockMap` へ渡す wrapper にする。
- `compact` や `size` は `density` へ変換する。
- tone 判定、クリック更新、背景付き JSX を `BlockGrid` 内に残さない。
- 将来 `BlockGrid` 名を廃止する場合も、今回のゴールではリネームを目的にしない。

### 4. 候補カードへチャンバー表示エンジンを適用する

`CandidateCard` の小さい plain `BlockGrid` を、共通のチャンバー表示エンジンに置き換える。

期待する見た目:

- 候補カード内でも、採用済みの開口状態チャンバー背景が見える。
- 候補ブロックは同じ色と同じ優先順位で表示される。
- 選択中候補の大きいプレビューと候補カードの小さい表示で、同じブロックが同じ意味に見える。
- カード内の表示は情報密度を優先し、操作は原則「詳細表示」「予約確定」ボタンに集約する。

候補カード内のマップは readonly でよい。候補カード内のマップを直接クリックして予約する挙動は追加しない。

### 5. 予約行にも同じエンジンを使う

`ReservationRow` の compact plain 表示も、同じ `ChamberBlockMap` か `BlockGrid` wrapper 経由にする。

予約行は背景付き compact 表示を基本にする。ただし次の条件では plain fallback を許可する。

- 320px 付近のモバイル幅で文字やボタンが重なる。
- 一覧行の高さが過剰に増える。
- 背景が小さすぎて状態判別に寄与しない。

fallback する場合でも、状態判定は必ず `blockMapEngine` を使う。

### 6. 表示定数を一箇所に集める

背景付き表示の座標や class map をコンポーネント近くに集約する。

推奨:

- `CHAMBER_FRONT_OVERLAY_RECT`
- `CHAMBER_BLOCK_DENSITY_CLASS`
- `plainToneClass`
- `chamberToneClass`

オーバーレイ基準は現行を維持する。

```text
left: 29.1667%
top: 17.5%
width: 56.25%
height: 56.25%
```

棚線とセル枠が重ならないよう、背景付きグリッドには現行の `gap` と強い選択状態を維持する。

### 7. テストを追加する

純粋関数化した `blockMapEngine` に focused test を追加する。

推奨パス:

- `src/domain/blockMapEngine.test.ts`

テスト観点:

- tone 優先順位。
- readonly では toggle されない。
- reserved/suspended/disabled は toggle されない。
- selected をクリックすると解除される。
- empty/candidate をクリックすると selected になる。
- drag add/remove が同じ helper で動く。
- 入力配列を mutate しない。

### 8. ブラウザ検証を更新する

`tmp_validation/chamber_background_block_map_check.cjs` を更新し、候補カードでも採用済みチャンバー表示エンジンが使われていることを確認する。

追加確認:

- 検索後の候補カード内に背景付きマップが表示される。
- 候補カードのマップが `data-chamber-block-overlay="true"` または新しい検証用 data 属性を持つ。
- 候補カード、選択中候補、検索入力の同じ候補ブロックが一致する。
- クリック選択は検索入力側でのみ動き、候補カード側は readonly として予約候補の表示に徹する。
- モバイル幅で候補カード内のマップが横スクロールを起こさない。

## Scope

- `src/domain/blockMapEngine.ts` の追加。
- `src/domain/blockMapEngine.test.ts` の追加。
- `src/components/ChamberBlockMap.tsx` の追加。
- `src/components/BlockGrid.tsx` の責務縮小。
- `src/App.tsx` の候補カード、選択中候補、予約ボード、管理者一時利用停止、予約行の呼び出し調整。
- `tmp_validation/chamber_background_block_map_check.cjs` の候補表示検証追加。
- 実装サマリーへの追記。

## Out of Scope

- 予約候補生成ロジックの変更。
- API変更。
- SQLiteスキーマ変更。
- 新しいチャンバー種別の追加。
- 候補カード内マップの直接クリック予約。
- アカウント、通知、仮押さえ、PIN仕様強化。
- 新規外部依存の追加。
- 背景画像への4 x 3枠の焼き込み。

## 守る仕様

- 最初の画面は条件検索。
- 4 x 3 はチャンバー全体の正面投影。
- 断片化したブロック割り当ては候補に出さない。
- 温度サイクル型の 25°C 搬入、運転期間、25°C 搬出を弱めない。
- 予約確定後に予約IDと4桁PINを表示する。
- 予約済み、一時停止、影響予約は通常選択より優先して表示する。
- 管理者一時利用停止は通常予約より優先する。
- 既存の未コミット変更を戻さない。

## 実装チェックポイント

### Checkpoint 1: 状態エンジン抽出

- `blockMapEngine` を追加する。
- `BlockGrid` から tone 判定と toggle/drag 判定を移す。
- focused test を追加する。

完了条件:

- 状態優先順位と操作可否がテストで固定される。
- React や Tailwind に依存しない pure helper になっている。

### Checkpoint 2: 表示エンジン分離

- `ChamberBlockMap` を追加する。
- 背景付き描画と plain 描画を同じ状態エンジンで動かす。
- `density` で large/inline/compact の見た目を切り替える。

完了条件:

- 同じ候補ブロックが、検索入力、選択中候補、候補カードで同じ意味に見える。
- JSX の大きな複製がない。

### Checkpoint 3: 呼び出し更新

- 検索入力、選択中候補、候補カード、予約ボード、予約行、管理者一時利用停止を共通表示エンジンへ接続する。
- `BlockGrid` wrapper 経由でもよいが、状態判定は重複させない。

完了条件:

- 候補カードにも採用済みチャンバー表示が出る。
- 予約行と管理画面の状態表示が壊れない。

### Checkpoint 4: レスポンシブと視覚確認

- デスクトップとモバイルで候補カード内のチャンバー表示を確認する。
- 棚線と枠線の干渉を再発させない。
- クリックした選択状態が明確に見える。

完了条件:

- 横スクロールが出ない。
- 候補カードの高さが過剰に増えない。
- 選択/候補/予約済み/一時停止/影響予約が区別できる。

### Checkpoint 5: 検証と記録

- テスト、ビルド、ランタイム、ブラウザ検証を通す。
- 実装サマリーに変更点と証跡を追記する。

完了条件:

- `npm run test`: PASS。
- `npm run test:server`: PASS。
- `npm run build`: PASS。
- `python main.py --check`: PASS。
- `python main.py --no-open`: PASS。
- ブラウザ確認: PASS。

## ブラウザ確認シナリオ

- 初期表示は空き検索。
- 検索入力の利用ブロックが背景付きで表示される。
- 検索入力のセルをクリックすると選択状態が明確に変わる。
- 検索後、選択中候補に背景付きマップが表示される。
- 検索後、候補カード内にも背景付きマップが表示される。
- 候補カード内マップは readonly であり、表示専用である。
- 候補カードの表示ブロックと選択中候補の表示ブロックが一致する。
- 予約確定後に予約IDと4桁PINが表示される。
- 予約ボードで予約済みブロックが背景付きで見える。
- 管理者一時利用停止で停止ブロックと影響予約が見える。
- モバイル幅で候補カード、選択中候補、検索入力が横スクロールしない。

## 完了条件

- 候補カードにも採用済みチャンバー表示エンジンが適用されている。
- ブロック状態判定と選択更新が独立した pure helper になっている。
- 表示コンポーネントは helper を参照し、状態判定を複製していない。
- `BlockGrid` は互換 wrapper か薄い呼び出し口に縮小されている。
- 検索入力、選択中候補、候補カード、予約ボード、予約行、管理者一時利用停止の表示意味が揃っている。
- 既存の予約ロジック、API、SQLite、PIN、管理者一時停止を壊していない。
- 検証結果を `PASS` / `FAIL` / `BLOCKED` / `NOT_RUN` で報告できる。
