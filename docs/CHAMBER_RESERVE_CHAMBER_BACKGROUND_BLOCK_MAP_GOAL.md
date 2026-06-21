# ChamberReserve Chamber Background Block Map Goal

```text
/goal ChamberReserve の「チャンバー背景付き 4 x 3 ブロック選択UI」を、採用済み背景画像の上に操作レイヤーを重ねる形で実装し、ブラウザで確認できる状態まで進めてください。

# Objective
採用済みの開口状態チャンバー正面模式図を背景に使い、背景には枠を焼き込まず、React側の4 x 3 button gridで選択/候補/予約済み/一時停止/影響予約を表現する。

# Read First
- AGENTS.md
- docs/CHAMBER_RESERVE_SYSTEM_SPEC.md
- docs/CHAMBER_RESERVE_LONG_TERM_IMPLEMENTATION_PLAN.md
- docs/GOAL_IMPLEMENTATION_POLICY.md
- docs/CHAMBER_RESERVE_PHASE3_5_UI_UX_REFINEMENT_START.md
- docs/CHAMBER_RESERVE_PHASE3_5_IMPLEMENTATION_SUMMARY.md
- docs/CHAMBER_RESERVE_CHAMBER_BACKGROUND_BLOCK_MAP_START.md
- package.json
- src/App.tsx
- src/components/BlockGrid.tsx
- src/assets/espec-ar-front-background.svg

# Scope
- large表示のBlockGridまたは新規ChamberFrontBlockMapで、背景SVG + 4 x 3操作レイヤーを実装する。
- オーバーレイ基準は x=280 y=126 width=540 height=405 とし、CSS比率で維持する。
- 検索条件、選択中候補詳細、予約ボード、管理者一時利用停止で背景付き表示が破綻しないよう接続する。
- compact候補ミニマップは視認性優先でplain表示を維持してよい。
- 背景付き4 x 3のブラウザ確認スクリプト/スクリーンショットと実装サマリーを残す。

# Out of Scope
- 予約ロジック、API、SQLiteスキーマ、新チャンバー種別、CRUD、通知、認証、仮押さえ、高度なPINセキュリティ。
- 背景画像への4 x 3枠の焼き込み。
- 新規外部依存の追加。

# Constraints
- 最初の画面は条件検索のまま。
- 4 x 3はチャンバー全体の正面投影として扱う。
- 断片化候補、25°C搬入/運転/搬出、4桁PIN編集/削除、利用後削除不可、管理者一時利用停止を壊さない。
- 既存の未コミット変更を戻さない。

# Validation
- npm run test
- npm run test:server
- npm run build
- python main.py --check
- python main.py --no-open
- ブラウザで、背景表示、4 x 3枠の庫内収まり、棚と行境界の対応、右/下はみ出しなし、選択/候補/予約済み/一時停止/影響予約、予約確定/PIN、予約ボード、管理者一時利用停止、モバイル幅を確認する。

# Progress
- チェックポイントごとに、変更内容、検証結果、残件、ブロック有無を短く報告する。

# Stop When
- docs/CHAMBER_RESERVE_CHAMBER_BACKGROUND_BLOCK_MAP_START.md の完了条件を満たし、テスト、ビルド、ランタイム、ブラウザ確認の結果を PASS / FAIL / BLOCKED / NOT_RUN で報告できたら完了。
```
