# ChamberReserve Search Block Intent Input Goal

```text
/goal ChamberReserve の検索条件入力にある4 x 3ブロック選択を、複数チャンバー検索に合う「希望ブロック条件入力」へ修正してください。

# Objective
条件入力画面のブロック選択を、特定チャンバーの空き状況表示ではなく、複数チャンバー横断検索に渡す希望ブロック条件の入力として整理する。初期選択は0件にし、条件入力段階では予約済み/一時停止表示を出さず、未選択時の検索エラーを明確にする。

# Read First
- AGENTS.md
- docs/CHAMBER_RESERVE_SYSTEM_SPEC.md
- docs/CHAMBER_RESERVE_LONG_TERM_IMPLEMENTATION_PLAN.md
- docs/GOAL_IMPLEMENTATION_POLICY.md
- docs/archive/2026-06-22-implemented/CHAMBER_RESERVE_SEARCH_FLOW_SPLIT_START.md
- docs/archive/2026-06-22-implemented/CHAMBER_RESERVE_CANDIDATE_RESULT_OPTIMIZATION_START.md
- docs/archive/2026-06-22-implemented/CHAMBER_RESERVE_CHAMBER_MAP_ENGINE_REUSE_START.md
- docs/CHAMBER_RESERVE_SEARCH_BLOCK_INTENT_INPUT_START.md
- package.json
- src/App.tsx
- src/components/search/SearchFlow.tsx
- src/components/BlockGrid.tsx
- src/components/ChamberBlockMap.tsx
- src/domain/searchEngine.ts
- src/domain/reservationRules.ts

# Scope
- 初期表示と新規検索時の selectedBlocks を空にする。
- 条件変更で戻る場合は、直前の検索条件のブロック復元を許容する。
- 条件入力画面の BlockGrid から予約済み/一時停止由来の disabled 表示を外す。
- 条件入力画面の凡例から予約済み/一時停止を削除する。
- 条件入力画面の文言を「希望ブロック条件」寄りに変更する。
- 未選択時の検索メッセージを、断片化や一般必須項目不足と分ける。
- 既存の候補表示、予約確定、予約ボード、管理者一時利用停止のブロック表示を壊さない。

# Out of Scope
- 候補生成アルゴリズムの大規模変更。
- 代表候補選定ロジックの再設計。
- サーバーAPI、SQLite schema、PIN仕様の変更。
- 新しいチャンバー種別追加。
- 予約ボード、管理者一時利用停止画面の全面再設計。
- アカウント管理、仮押さえ、通知連携。
- 奥行き、高さ、重量、通風クリアランス判定。
- TeamPlanner の業務概念の持ち込み。

# Constraints
- 最初の画面はチャンバー選択ではなく条件検索のまま。
- 条件入力画面は、特定チャンバーの予約済み/一時停止を表示しない。
- 候補一覧には予約可能な候補だけを出す。
- 断片化候補を出さない。
- サイズのみ/位置まで指定の意味を保つ。
- 既存の未コミット変更を戻さない。

# Validation
- npm run test
- npm run test:server
- npm run build
- python main.py --check
- python main.py --no-open
- ブラウザで、初期ブロック未選択、予約済み/一時停止凡例なし、未選択検索メッセージ、1つ以上選択後の候補検索、サイズのみの複数チャンバー候補、位置まで指定、予約確定/PIN、予約ボード、管理者一時利用停止、モバイル幅の操作性を確認する。

# Progress
- チェックポイントごとに、変更ファイル、検証結果、残件、ブロック有無を短く報告する。

# Stop When
- docs/CHAMBER_RESERVE_SEARCH_BLOCK_INTENT_INPUT_START.md の Completion Criteria を満たし、テスト、ビルド、launcher check、ブラウザ確認の結果を PASS / FAIL / BLOCKED / NOT_RUN で報告できたら完了。
```
