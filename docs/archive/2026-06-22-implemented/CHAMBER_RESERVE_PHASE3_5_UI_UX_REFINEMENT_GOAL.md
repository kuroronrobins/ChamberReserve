# ChamberReserve Phase 3.5 UI/UX Refinement Goal

```text
/goal ChamberReserve Phase 3.5「候補比較 + 4 x 3ブロック選択UI/UXリファイン」を、第2案のUI方向性を基準にブラウザで確認できる状態まで実装してください。

# Objective
Phase 3の複数チャンバー候補検索を、汎用フォーム/カードではなくChamberReserve専用の候補比較画面へ作り替える。検索結果、25°C搬入、運転期間、25°C搬出、4 x 3ブロック、予約確定、PIN表示が一体で判断できるUIにする。

# Read First
- AGENTS.md
- docs/CHAMBER_RESERVE_SYSTEM_SPEC.md
- docs/CHAMBER_RESERVE_LONG_TERM_IMPLEMENTATION_PLAN.md
- docs/GOAL_IMPLEMENTATION_POLICY.md
- docs/CHAMBER_RESERVE_PHASE3_IMPLEMENTATION_SUMMARY.md
- docs/CHAMBER_RESERVE_PHASE3_5_UI_UX_REFINEMENT_START.md
- package.json
- src/App.tsx
- src/components/BlockGrid.tsx
- src/components/CycleTimeline.tsx
- src/components/StatusBadge.tsx
- src/domain/chamber.ts
- src/domain/reservationRules.ts

# Scope
- 検索画面を第2案「候補比較 + 4 x 3ブロック選択」基準に再構成する。
- 候補一覧を比較行/比較パネルにし、チャンバー名、25°C搬入、運転期間、25°C搬出、使用ブロック、配置種別、予約操作を表示する。
- 選択中候補に連動する大きな4 x 3ブロック詳細パネルを追加または再構成する。
- 予約確定後の予約IDと4桁PIN表示を候補選択の流れに接続する。
- 予約ボード、PIN編集、管理者一時利用停止は既存機能を壊さず、色と余白の最低限の整合を取る。
- ブラウザ確認スクリプトとPhase 3.5実装サマリーを整備する。

# Out of Scope
- 固定条件型チャンバー対応。
- 自由温湿度型チャンバー対応。
- サーバーAPIの新規機能追加。
- SQLiteスキーマ変更。
- 複数チャンバー登録CRUD。
- アカウント管理、仮押さえ、高度なPINセキュリティ、通知連携、利用率レポート。

# Constraints
- 最初の画面はチャンバー選択ではなく空き検索にする。
- 候補一覧には予約可能な候補だけを出す。
- 断片化候補を出さない。
- 温度サイクル型の25°C搬入、運転期間、25°C搬出を弱めない。
- 4桁PIN編集/削除、利用後削除不可、管理者一時利用停止の影響予約表示を維持する。
- TeamPlannerの業務概念を持ち込まない。
- URL、ポート、DB、ログ、PIDファイルの分離方針を妨げない。
- 既存の未コミット変更を戻さない。

# Checkpoints
1. デザイントークンと画面骨格を整える。
2. 検索条件パネルを検索後も扱いやすい形へ整理する。
3. 候補一覧を比較しやすい行/パネルへ変更する。
4. 選択中候補と連動する4 x 3ブロック詳細パネルを作る。
5. 予約確定、予約ID、4桁PIN、編集導線を自然につなぐ。
6. 予約ボード、PIN編集、管理者一時利用停止の既存フローを壊していないことを確認する。
7. デスクトップ/モバイルのブラウザ確認とPhase 3.5サマリーを残す。

# Validation
- npm run test
- npm run test:server
- npm run build
- python main.py --check
- python main.py --no-open
- ブラウザで、初期空き検索、候補比較、候補選択と4 x 3ブロック連動、予約確定、PIN編集/削除、利用後削除不可、管理者一時利用停止と影響予約表示、モバイル幅の崩れなしを確認する。

# Progress
チェックポイントごとに、変更ファイル、検証結果、残件、ブロック有無を短く報告する。

# Stop When
Phase 3.5開始文書の完了条件を満たし、テスト、ビルド、ランタイム、ブラウザ確認の結果を PASS / FAIL / BLOCKED / NOT_RUN で報告できたら完了。
```
