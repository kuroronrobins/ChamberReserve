# ChamberReserve Custom Date Picker Start

作成日: 2026-06-22

## 目的

ChamberReserve の日付指定 UI からブラウザ標準の `input type="date"` を廃止し、TeamPlanner と同じ方針の独自カレンダー選択 UI を導入する。

ただし、取り込むのは日付入力 UI の設計方針と保守しやすい分割構造だけであり、TeamPlanner の業務概念、画面構造、Gantt、タスク、休暇、メンバー、権限モデルは持ち込まない。

この実装では、予約検索、予約ボード、管理者一時利用停止の日付指定を、同じ `YYYY-MM-DD` の日付キーを扱う共通コンポーネントへ置き換える。サーバー API、SQLite スキーマ、予約データ構造は変更しない。

## 背景

現在の ChamberReserve には次の日付入力がある。

- 空き検索の希望日: `desiredDate`
- 予約ボードの表示日: `boardDate`
- 管理者一時利用停止の開始日: `suspensionStartDate`
- 管理者一時利用停止の終了日: `suspensionEndDate`

これらはすべて `YYYY-MM-DD` 文字列として扱えばよく、時刻入力とは分離する。温湿度指定モードの開始時刻、管理者一時利用停止の開始/終了時刻、チャンバー設定の利用可能時刻などは今回の対象外で、既存の `input type="time"` のまま維持する。

ブラウザ標準の日付入力は OS やブラウザで見た目と操作が大きく変わり、予約サイトとしての一貫した体験を作りにくい。ChamberReserve では検索起点の操作が最初の画面であり、日付選択の品質が予約 UX 全体の印象に直結するため、独自カレンダーを共通化して導入する。

## 実装原則

1. `App.tsx` にカレンダー実装を直接増やさない。
2. 日付キー処理、カレンダーグリッド生成、ポップオーバー表示、入力表示を分割する。
3. 予約ロジックのデータ型は `YYYY-MM-DD` 文字列のまま維持する。
4. `Date` オブジェクトやロケール文字列を状態として保存しない。
5. 月移動と日付選択を分離する。前月/翌月/今日へ移動しても、日付セルを選ぶまで `onChange` しない。
6. 外部 date picker 依存は追加しない。React + TypeScript + Tailwind + lucide-react の範囲で実装する。
7. 表示文言は日本語で統一する。
8. モバイル幅でもポップオーバーが画面外へ切れず、背後のスクロールや左ペイン操作を妨げない。
9. TeamPlanner の UI パターンは参考にするが、ChamberReserve の予約検索、ボード、管理者停止に合う密度と見た目へ調整する。

## 推奨ファイル構成

```text
src/utils/dateKey.ts
src/components/date/CalendarDateInput.tsx
src/components/date/DatePickerPopover.tsx
src/components/date/datePicker.ts
src/components/date/datePicker.test.ts
```

### `src/utils/dateKey.ts`

日付キーの純粋関数を置く。

想定する責務:

- `isDateKey(value: string): boolean`
- `parseDateKey(value: string): Date`
- `toDateKey(date: Date): string`
- `addDaysToDateKey(value: string, days: number): string`
- `addMonthsToDateKey(value: string, months: number): string`
- `startOfMonthKey(value: string): string`
- `getTodayDateKey(): string`
- `formatDateKeyJa(value: string): string`
- `formatMonthLabelJa(value: string): string`

既存の `src/domain/reservationRules.ts` にある `parseDateKey` / `toDateKey` / `addDaysToDateKey` は、必要に応じてこのファイルへ移動する。移動する場合は、ドメイン側の既存 import を更新する。大きなリファクタになりそうな場合は、まず新ファイル側から再エクスポートまたは薄い委譲で段階的に寄せる。

注意点:

- `new Date("YYYY-MM-DD")` は UTC 解釈になりやすいため使わない。
- `new Date(year, monthIndex, day)` を使ってローカル日付として扱う。
- `YYYY-MM-DD` の生成はゼロ埋めを固定する。
- 月末から月移動するときは存在しない日を安全に丸める。

### `src/components/date/datePicker.ts`

カレンダー表示に必要な純粋関数を置く。

想定する責務:

- 月グリッドを 6 週 x 7 日で生成する。
- 各セルに `dateKey`, `day`, `inCurrentMonth`, `isToday`, `isSelected`, `isDisabled` を付与する。
- 曜日ラベルを日本語短縮表記で返す。
- キーボード操作で移動後の日付キーを返す。
- `minDate` / `maxDate` / `disabledDateKeys` を判定する。

ここには React state や DOM 操作を置かない。

### `src/components/date/DatePickerPopover.tsx`

ポップオーバー本体を担当する。

想定 props:

```ts
interface DatePickerPopoverProps {
  value: string;
  visibleMonth: string;
  onVisibleMonthChange: (dateKey: string) => void;
  onSelect: (dateKey: string) => void;
  onClose: () => void;
  minDate?: string;
  maxDate?: string;
  disabledDateKeys?: string[];
}
```

必要な UI:

- 月ラベル
- 前月/翌月ボタン
- 今日へ移動ボタン
- 曜日ヘッダー
- 日付セル 6 週 x 7 日
- 選択日、今日、月外日、無効日の状態表示
- Escape で閉じる
- Enter / Space で日付選択
- PageUp / PageDown で月移動
- 矢印キーで日付フォーカス移動

月移動ボタンや今日へ移動ボタンは `visibleMonth` だけを変える。日付セルを選んだときだけ `onSelect` を呼ぶ。

### `src/components/date/CalendarDateInput.tsx`

画面側が使う controlled component にする。

想定 props:

```ts
interface CalendarDateInputProps {
  id?: string;
  label: string;
  value: string;
  onChange: (dateKey: string) => void;
  minDate?: string;
  maxDate?: string;
  disabledDateKeys?: string[];
  compact?: boolean;
  className?: string;
}
```

責務:

- ラベル、現在値の表示、カレンダーアイコン、開閉状態を持つ。
- 表示値は `YYYY/MM/DD (曜)` のように、人が読みやすい形にする。
- 内部値は必ず `YYYY-MM-DD` のまま `onChange` へ渡す。
- `input type="date"` は使わない。
- ボタンとして操作できる見た目にし、フォーカスリングを明確にする。
- 外側クリック、Escape、日付選択で閉じる。
- ポップオーバーは小画面では親幅に収め、広い画面では入力の直下に配置する。

## 対象画面と置き換え方針

### 空き検索

`desiredDate` の入力を `CalendarDateInput` に置き換える。

確認すること:

- 初期表示が希望日を示す。
- 日付を選ぶと候補期間と終了日時が再計算される。
- サイクル試験、温湿度指定のどちらでも同じ日付入力を使う。
- サイクル数や温湿度入力とは共存しても混線しない。

### 予約ボード

`boardDate` の入力を `CalendarDateInput` に置き換える。

確認すること:

- 前日/翌日ボタンは維持する。
- カレンダーから選んだ日付でボード表示が変わる。
- 日付入力、前日/翌日、チャンバー選択の横並びが崩れない。

### 管理者一時利用停止

`suspensionStartDate` と `suspensionEndDate` を `CalendarDateInput` に置き換える。

確認すること:

- 開始日と終了日をそれぞれ選べる。
- 時刻入力は現状維持する。
- 終了日が開始日より前になった場合の扱いは既存ロジックを壊さない。可能であれば `minDate={suspensionStartDate}` を終了日に設定し、UI 上の誤入力を減らす。
- 日付変更後に影響予約プレビューが更新される。

## 見た目と UX

- ChamberReserve の予約業務向け UI として、白/薄いグレーの作業面、明確な枠線、控えめな選択色を使う。
- 日付セルは最小 36px 以上、モバイルでは 40px 程度を目安にする。
- 今日と選択日は別の意味として表示する。
- 月外日は薄くするが選択可能にするか、無効にするかを実装時に一貫させる。推奨は選択可能にして、選ぶとその月へ移動して閉じる。
- 無効日はクリック不可、キーボード選択不可にする。
- ポップオーバー内ホイール操作でページ全体がスクロールしないよう、必要に応じて `overscroll-contain` を付ける。
- カレンダーが開いても周辺の入力やボタンがレイアウトシフトしない。
- スクロールコンテナ内でもポップオーバー下部が操作不能にならないよう、表示位置と z-index を調整する。

## アクセシビリティ

- 開閉ボタンは `aria-haspopup="dialog"` と `aria-expanded` を持つ。
- ポップオーバーには `role="dialog"` またはカレンダーとして意味が分かるラベルを付ける。
- 日付セルは button として実装し、選択状態は `aria-pressed` または `aria-selected` 相当で表現する。
- キーボードだけで開く、月移動する、日付選択する、閉じる操作ができる。
- `Escape` で閉じる。
- 日付選択後は入力ボタンへフォーカスを戻す。

## 実装チェックポイント

### Checkpoint 1: 日付キー基盤

- `src/utils/dateKey.ts` を作成する。
- 既存の日付キー処理と重複しないように import を整理する。
- タイムゾーンで前日/翌日にずれない実装にする。
- 月末、うるう年、月またぎのテストを追加する。

完了条件:

- 日付キー処理が `YYYY-MM-DD` を安定して返す。
- 既存の予約候補生成テストが壊れていない。

### Checkpoint 2: カレンダー純粋ロジック

- `src/components/date/datePicker.ts` を作成する。
- 6 週 x 7 日の月グリッド生成を実装する。
- 今日、選択日、月外日、無効日の状態を計算する。
- 月移動と日付選択の責務を分離する。

完了条件:

- React なしで月グリッドの単体テストができる。
- 月移動だけでは値が変わらない仕様がテストで確認できる。

### Checkpoint 3: 共通 UI コンポーネント

- `DatePickerPopover.tsx` と `CalendarDateInput.tsx` を作成する。
- lucide-react の Calendar / ChevronLeft / ChevronRight を使う。
- 外側クリック、Escape、日付選択で閉じる。
- キーボード操作を実装する。

完了条件:

- `CalendarDateInput` は `value` と `onChange` だけで各画面に接続できる。
- 親画面はカレンダー内部 state を知らなくてよい。

### Checkpoint 4: 既存画面への置き換え

- 空き検索の希望日を置き換える。
- 予約ボードの日付を置き換える。
- 管理者一時利用停止の開始日/終了日を置き換える。
- `input type="date"` が残っていないことを確認する。

完了条件:

- 既存の検索、ボード、管理者停止の状態更新が維持される。
- 時刻入力は変更されていない。

### Checkpoint 5: テストとブラウザ確認

- `npm run test`
- `npm run test:server`
- `npm run build`
- `python main.py --check`
- `python main.py --no-open`
- ブラウザで対象画面を確認する。

完了条件:

- すべての検証結果を `PASS` / `FAIL` / `BLOCKED` / `NOT_RUN` で報告できる。
- ブラウザ確認で標準 date input が残っていない。

## ブラウザ確認シナリオ

1. 空き検索で希望日のカレンダーを開き、翌月へ移動し、任意の日を選択する。
2. サイクル試験で終了日時が選択日を基準に再計算されることを確認する。
3. 温湿度指定へ切り替え、同じ日付入力で開始時刻 + 占有時間の終了日時が更新されることを確認する。
4. 予約ボードで前日/翌日ボタンとカレンダー選択の両方が動くことを確認する。
5. 管理者一時利用停止で開始日と終了日をカレンダーから選び、影響予約プレビューが更新されることを確認する。
6. モバイル幅でカレンダーが画面外に切れず、下部の日付セルも操作できることを確認する。
7. キーボードでカレンダーを開き、矢印、PageUp/PageDown、Enter、Escape が動くことを確認する。

## Out of Scope

- 時刻入力の独自 UI 化。
- 日時範囲ピッカーの新規導入。
- 仮押さえ、通知、アカウント管理。
- サーバー API の新規追加。
- SQLite スキーマ変更。
- 予約保存データへの日付表示形式追加。
- TeamPlanner の業務概念、Gantt、休暇、メンバー、権限 UI の移植。
- 外部 date picker ライブラリの追加。

## 完了条件

- `input type="date"` を使わずに、希望日、予約ボード日付、管理者一時利用停止の開始/終了日を選択できる。
- 日付値はすべて `YYYY-MM-DD` のまま既存ロジックへ渡る。
- 月移動だけで予約検索条件が変わらない。
- 日付セル選択時だけ `onChange` が発火する。
- モバイル/デスクトップでカレンダーが見切れず操作できる。
- `npm run test`、`npm run test:server`、`npm run build`、`python main.py --check`、`python main.py --no-open`、ブラウザ確認の結果を `PASS` / `FAIL` / `BLOCKED` / `NOT_RUN` で報告できる。

## Phase Handoff

この作業が完了したら、以降の画面で日付入力が必要になった場合は `CalendarDateInput` を標準として使う。時刻や期間の独自入力が必要になった場合も、この日付入力と混ぜず、別コンポーネントとして扱う。
