# ChamberReserve Custom Date Picker Goal

```text
/goal ChamberReserve の日付指定 UI を、TeamPlanner と同じ方針の独自カレンダー選択機能へ置き換え、ブラウザで検索、予約ボード、管理者一時利用停止の日付操作を確認できる状態まで実装してください。

# Objective
ブラウザ標準の input type="date" を使わず、保守しやすい共通 CalendarDateInput / DatePickerPopover と日付キー helper を導入する。希望日、予約ボード日付、管理者一時利用停止の開始日/終了日を共通カレンダーで選べるようにし、既存の予約検索、終了日時計算、影響予約表示を壊さない。

# Read First
- AGENTS.md
- docs/CHAMBER_RESERVE_SYSTEM_SPEC.md
- docs/CHAMBER_RESERVE_LONG_TERM_IMPLEMENTATION_PLAN.md
- docs/GOAL_IMPLEMENTATION_POLICY.md
- docs/CHAMBER_RESERVE_CUSTOM_DATE_PICKER_START.md
- package.json
- src/App.tsx
- src/domain/reservationRules.ts
- src/utils/format.ts

# Scope
- src/utils/dateKey.ts を作成または既存の日付キー処理を整理する。
- src/components/date/ 配下に CalendarDateInput、DatePickerPopover、datePicker helper を実装する。
- 空き検索の desiredDate、予約ボードの boardDate、管理者一時利用停止の suspensionStartDate / suspensionEndDate を共通カレンダー入力へ置き換える。
- 月移動と日付選択を分離し、日付セル選択時だけ onChange する。
- モバイル/デスクトップでポップオーバーが見切れず操作できるようにする。
- 日付キー helper とカレンダーグリッドの単体テストを追加する。

# Out of Scope
- 時刻入力の独自 UI 化。
- 日時範囲ピッカー化。
- サーバー API 追加。
- SQLite スキーマ変更。
- 予約保存データ構造変更。
- 外部 date picker ライブラリ追加。
- TeamPlanner の業務概念、Gantt、タスク、休暇、メンバー、権限 UI の移植。

# Constraints
- 既存の未コミット変更を戻さない。
- TeamPlanner から持ち込むのは日付入力 UI の方針だけにする。
- App.tsx に大きなカレンダー実装を直接増やさず、共通コンポーネントへ分割する。
- 予約ロジックへ渡す日付値は YYYY-MM-DD のままにする。
- new Date("YYYY-MM-DD") による UTC 解釈のズレを避ける。
- 月移動、今日へ移動、開閉だけでは検索条件を変更しない。
- input type="date" を残さない。input type="time" は今回維持する。

# Checkpoints
1. 日付キー helper を整理し、月末/うるう年/月またぎのテストを追加する。
2. 6週 x 7日のカレンダーグリッド helper を実装し、月移動と選択の分離をテストする。
3. CalendarDateInput / DatePickerPopover を実装し、キーボード操作と外側クリック/ESCクローズを入れる。
4. 空き検索、予約ボード、管理者一時利用停止の日付入力を置き換える。
5. テスト、ビルド、ランチャー、ブラウザ確認を行い、結果を PASS / FAIL / BLOCKED / NOT_RUN で整理する。

# Validation
- npm run test
- npm run test:server
- npm run build
- python main.py --check
- python main.py --no-open
- ブラウザで、空き検索の日付選択と終了日時再計算、温湿度指定の日付選択、予約ボードの日付変更、管理者一時利用停止の開始/終了日選択と影響予約表示、モバイル幅での見切れなし、キーボード操作を確認する。

# Progress
チェックポイントごとに、変更ファイル、検証結果、残件、ブロック有無を短く報告する。

# Stop When
docs/CHAMBER_RESERVE_CUSTOM_DATE_PICKER_START.md の完了条件を満たし、input type="date" が残っておらず、テスト、ビルド、ランチャー、ブラウザ確認の結果を PASS / FAIL / BLOCKED / NOT_RUN で報告できたら完了。
```
