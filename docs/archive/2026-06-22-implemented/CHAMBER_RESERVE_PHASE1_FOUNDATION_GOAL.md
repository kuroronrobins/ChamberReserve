# ChamberReserve Phase 1 UI/UX Foundation Goal

次の `/goal` を実装開始時に使用する。

```text
/goal ChamberReserve Phase 1「単一温度サイクル型チャンバーのUI/UX基盤」を、サーバー実装前にブラウザで空き検索から予約確定、PIN編集、管理者一時利用停止まで確認できる状態にしてください。

# Objective
単一の温度サイクル型チャンバーについて、条件検索起点の予約フロー、4 x 3ブロック選択、25°C定常期間ルール、4桁PIN編集、管理者一時利用停止のUI/UXを先に固める。

# Read First
- AGENTS.md
- docs/CHAMBER_RESERVE_SYSTEM_SPEC.md
- docs/CHAMBER_RESERVE_LONG_TERM_IMPLEMENTATION_PLAN.md
- docs/GOAL_IMPLEMENTATION_POLICY.md
- docs/CHAMBER_RESERVE_PHASE1_FOUNDATION_START.md
- docs/CHAMBER_RESERVE_PHASE1_UI_UX_EXECUTION_PLAN.md

# Scope
- React + Vite + TypeScript の最小アプリ基盤。
- モックデータまたはブラウザ内状態によるUI/UX確認。
- 空き検索、4 x 3ブロック選択、候補一覧、予約確定、予約編集/削除、予約ボード、管理者一時利用停止。
- 温度サイクル型の標準条件、搬入可能25°C定常期間、運転期間、搬出可能25°C定常期間。
- 断片化候補を出さない予約候補生成。
- 4桁PIN自動発行とPINによる変更/削除。
- Phase 1実行計画のチェックポイント順に進め、必要な場合だけPhase 1内で分割判断する。

# Out of Scope
- 複数チャンバー実運用。
- サーバーAPI。
- SQLite永続化。
- live DB。
- 本番起動、停止、再起動スクリプト。
- サーバー側の最終競合判定。
- 固定条件型、自由温湿度型。
- アカウント管理。
- 仮押さえ。
- 高度なPINセキュリティ。
- メール、Teams、Slack通知。
- 奥行き、高さ、重量、通風クリアランス管理。
- 自動バックアップや利用率レポート。

# Constraints
- TeamPlannerの業務概念を持ち込まない。
- 後続のサーバー実装でTeamPlannerとURL、ポート、DB、ログ、PIDファイルを分けられる構造を妨げない。
- 最初の画面はチャンバー選択ではなく空き検索にする。
- 候補一覧には予約可能な候補だけを出す。
- このフェーズではUI/UXを優先し、サーバーやDBを作り込まない。
- 既存の未コミット変更を戻さない。

# Validation
- npm run test
- npm run build
- ブラウザで空き検索、ブロック選択、予約確定、PIN編集/削除、利用後削除不可、管理者一時利用停止と影響予約表示を確認する。
- Phase 2へ渡すAPI、保存データ、サーバー側判定メモを整理する。

# Progress
チェックポイントごとに、変更ファイル、検証結果、残件、ブロック有無を短く報告する。

# Stop When
Phase 1開始文書のUI/UX完了条件を満たし、テスト、ビルド、ブラウザ確認の結果を PASS / FAIL / BLOCKED / NOT_RUN で報告できたら完了。
```
