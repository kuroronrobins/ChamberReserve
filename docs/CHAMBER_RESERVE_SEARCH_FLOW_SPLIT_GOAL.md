# ChamberReserve Search Flow Split Goal

```text
/goal ChamberReserve の空き検索 UI を、条件入力画面と候補表示画面に分離し、ブラウザで「編集中の条件」と「検索済み条件に対する候補」が混同されない状態にしてください。

# Objective
条件入力ページと候補表示ページを分ける。候補一覧は明示的に検索実行された submittedSearch にだけ紐づけ、searchDraft の編集中には表示しない。検索結果画面には提出済み条件サマリーを必ず表示し、候補 0 件時も何の条件に対する結果か分かるようにする。

# Read First
- AGENTS.md
- docs/CHAMBER_RESERVE_SYSTEM_SPEC.md
- docs/CHAMBER_RESERVE_LONG_TERM_IMPLEMENTATION_PLAN.md
- docs/GOAL_IMPLEMENTATION_POLICY.md
- docs/CHAMBER_RESERVE_SEARCH_FLOW_SPLIT_START.md
- package.json
- src/App.tsx
- src/domain/reservationRules.ts
- src/components/

# Scope
- 空き検索を conditions / results の2ステップに分ける。
- searchDraft と submittedSearch と candidateResults を状態として分離する。
- 条件入力画面では候補一覧を表示しない。
- 検索ボタン実行時だけ submittedSearch を作り候補を生成する。
- 候補表示画面に提出済み条件サマリー、候補一覧、候補詳細、予約確定導線を置く。
- 条件変更、新規検索、必要なら日付シフト再検索の遷移を整理する。
- サイクル試験と温湿度指定の表示項目が混ざらないようにする。
- 既存の予約確定、PIN編集/削除、利用後削除不可、管理者一時利用停止の導線を壊さない。

# Out of Scope
- サーバーAPIの新設。
- SQLite永続化変更。
- URLルーティング導入。
- アカウント管理、仮押さえ、通知連携。
- 新しいチャンバー種別ルールの追加。
- TeamPlannerの業務概念、タスク、ガント、休暇、メンバー管理の移植。

# Constraints
- 最初の画面はチャンバー選択ではなく条件入力起点の空き検索にする。
- 候補一覧には予約可能な候補だけを出す。
- 候補表示は submittedSearch に対応させ、searchDraft の編集中値を直接参照しない。
- 条件入力へ戻ったら古い候補を表示しない。
- 候補表示画面では、表示中の候補がどの条件に対するものかサマリーで明示する。
- サイクル試験ではサイクル条件だけを入力し、温湿度指定の入力と混在させない。
- 温湿度指定では開始日時と利用時間から終了日時を自動表示し、サイクル入力と混在させない。
- 既存の未コミット変更を戻さない。

# Checkpoints
1. 現在の検索状態を棚卸しし、searchDraft / submittedSearch / candidateResults / selectedCandidateId に分類する。
2. SearchConditionView を作り、条件入力だけを表示して候補一覧を外す。
3. SearchResultsView と SearchConditionSummary を作り、提出済み条件に対する候補表示へ分離する。
4. 条件変更、新規検索、日付シフト再検索が古い候補を誤表示しないようにする。
5. テスト、ビルド、ブラウザ確認を実施し、結果を PASS / FAIL / BLOCKED / NOT_RUN で整理する。

# Validation
- npm run test
- npm run test:server
- npm run build
- python main.py --check
- python main.py --no-open
- ブラウザで、初期表示が条件入力のみで候補一覧がないこと、検索後に候補表示画面と条件サマリーが出ること、条件変更で候補が消えること、再検索でサマリーと候補が更新されること、サイクル試験と温湿度指定が混在しないこと、候補から予約確定できること、PIN編集/削除と管理者一時利用停止の既存導線が壊れていないこと、モバイル幅で操作不能な見切れがないことを確認する。

# Progress
チェックポイントごとに、変更ファイル、検証結果、残件、ブロック有無を短く報告する。

# Stop When
docs/CHAMBER_RESERVE_SEARCH_FLOW_SPLIT_START.md の完了条件を満たし、テスト、ビルド、ブラウザ確認の結果を PASS / FAIL / BLOCKED / NOT_RUN で報告できたら完了。
```
