# ChamberReserve Candidate Result Optimization Goal

```text
/goal ChamberReserve の候補表示アルゴリズムを、サイズ指定時に同一日付・同一チャンバー・同一時間窓の配置候補を代表1件へ集約し、希望日が埋まっている場合は希望日の不可と近い日付の代替候補を分けて表示できる状態まで実装してください。

# Objective
候補一覧を「配置場所の列挙」ではなく「予約判断できる選択肢」に変更し、サイズだけ指定では日付 x チャンバー x 時間窓 x 条件ごとに代表候補1件だけを表示する。複数チャンバーの選択肢は残し、希望日が埋まっている場合は希望日なしメッセージと代替日候補を明確に分ける。

# Read First
- AGENTS.md
- docs/CHAMBER_RESERVE_SYSTEM_SPEC.md
- docs/CHAMBER_RESERVE_LONG_TERM_IMPLEMENTATION_PLAN.md
- docs/GOAL_IMPLEMENTATION_POLICY.md
- docs/CHAMBER_RESERVE_SEARCH_ENGINE_EXTRACTION_IMPLEMENTATION_SUMMARY.md
- docs/CHAMBER_RESERVE_CANDIDATE_RESULT_OPTIMIZATION_START.md
- package.json
- src/domain/searchEngine.ts
- src/domain/reservationRules.ts
- src/domain/searchEngine.test.ts
- server/service.ts
- src/api/client.ts
- src/App.tsx
- src/components/search/SearchFlow.tsx
- tmp_validation/chamber_background_block_map_check.cjs

# Scope
- searchEngine に、サイズ指定時の grouping と代表配置選定を実装する。
- 代表配置は、選択位置が空いていればそれを採用し、空いていなければ最も近い同形状配置を deterministic に選ぶ。
- 希望日候補と代替日候補を分けられる structured search result を追加する。
- 既存の Candidate[] 互換口は必要に応じて残す。
- UI/API/server/local fallback が同じ検索結果を使うように接続する。
- domain/server/browser 検証を追加または更新する。

# Out of Scope
- アカウント管理、仮押さえ、通知連携、新チャンバー種別追加。
- 奥行き、高さ、重量、通風クリアランス判定。
- 利用者が隠れた全配置候補から手動選択する詳細モード。
- 候補表示以外の大規模 UI 再設計。

# Constraints
- 最初の画面は条件検索のまま。
- 候補一覧には予約可能な候補だけを出す。
- 断片化候補、25°C搬入/運転/搬出、予約確定/PIN、予約ボード、一時利用停止を壊さない。
- 複数チャンバーで予約可能な場合は、チャンバーごとの候補を残す。
- 予約確定時の再検索で代表候補IDを再現できる deterministic な実装にする。
- 既存の未コミット変更を戻さない。

# Validation
- npm run test
- npm run test:server
- npm run build
- python main.py --check
- python main.py --no-open
- node tmp_validation\chamber_background_block_map_check.cjs
- ブラウザで、サイズ指定時に同一日付/同一チャンバー候補が大量表示されないこと、複数チャンバー候補が残ること、希望日なしと代替候補が分かれて表示されること、代表候補から予約確定/PIN表示まで動くこと、モバイル幅で崩れないことを確認する。

# Progress
- チェックポイントごとに、変更内容、検証結果、残件、ブロック有無を短く報告する。

# Stop When
- docs/CHAMBER_RESERVE_CANDIDATE_RESULT_OPTIMIZATION_START.md の Completion Criteria を満たし、テスト、ビルド、ランタイム、ブラウザ確認の結果を PASS / FAIL / BLOCKED / NOT_RUN で報告できたら完了。
```
