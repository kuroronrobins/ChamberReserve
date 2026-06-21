# ChamberReserve Chamber Map Engine Reuse Goal

```text
/goal ChamberReserve の候補表示にも採用済みチャンバー正面表示エンジンを適用し、4 x 3ブロック状態判定と選択更新を再利用可能なコードへ分離してください。

# Objective
候補カード、選択中候補、検索入力、予約ボード、予約行、管理者一時利用停止が、重複実装ではなく共通のブロック状態エンジンと共通のチャンバー表示コンポーネントを参照する構成にする。

# Read First
- AGENTS.md
- docs/CHAMBER_RESERVE_SYSTEM_SPEC.md
- docs/CHAMBER_RESERVE_LONG_TERM_IMPLEMENTATION_PLAN.md
- docs/GOAL_IMPLEMENTATION_POLICY.md
- docs/CHAMBER_RESERVE_CHAMBER_BACKGROUND_BLOCK_MAP_START.md
- docs/CHAMBER_RESERVE_CHAMBER_BACKGROUND_BLOCK_MAP_IMPLEMENTATION_SUMMARY.md
- docs/CHAMBER_RESERVE_CHAMBER_MAP_ENGINE_REUSE_START.md
- package.json
- src/App.tsx
- src/components/BlockGrid.tsx
- src/domain/chamber.ts
- src/domain/reservationRules.ts
- tmp_validation/chamber_background_block_map_check.cjs

# Scope
- pure helperとして blockMapEngine を追加し、tone優先順位、操作可否、toggle/drag選択更新を移す。
- 共通の ChamberBlockMap 表示コンポーネントを追加し、large/inline/compactの表示密度を切り替える。
- BlockGrid は互換wrapperまたは薄い呼び出し口へ縮小する。
- 候補カードにも採用済みチャンバー背景表示を適用する。
- 検索入力、選択中候補、候補カード、予約ボード、予約行、管理者一時利用停止が同じ状態エンジンを参照するよう接続する。
- focused domain test とブラウザ検証を更新し、実装サマリーへ追記する。

# Out of Scope
- 予約候補生成ロジック、API、SQLiteスキーマ、PIN仕様、新チャンバー種別、通知、認証、仮押さえ。
- 候補カード内マップの直接クリック予約。
- 背景画像への4 x 3枠の焼き込み。
- 新規外部依存の追加。

# Constraints
- 最初の画面は条件検索のまま。
- 4 x 3はチャンバー全体の正面投影として扱う。
- suspended > impact > reserved > selected > candidate > disabled > empty の表示優先順位を守る。
- 断片化候補、25°C搬入/運転/搬出、予約確定/PIN、予約ボード、管理者一時利用停止を壊さない。
- 棚線とセル枠の干渉、選択状態の見えづらさを再発させない。
- 既存の未コミット変更を戻さない。

# Validation
- npm run test
- npm run test:server
- npm run build
- python main.py --check
- python main.py --no-open
- ブラウザで、検索入力のクリック選択、候補カードの背景付き表示、選択中候補とのブロック一致、予約確定/PIN、予約ボード、管理者一時利用停止、モバイル幅の横スクロールなしを確認する。

# Progress
- チェックポイントごとに、変更内容、検証結果、残件、ブロック有無を短く報告する。

# Stop When
- docs/CHAMBER_RESERVE_CHAMBER_MAP_ENGINE_REUSE_START.md の完了条件を満たし、テスト、ビルド、ランタイム、ブラウザ確認の結果を PASS / FAIL / BLOCKED / NOT_RUN で報告できたら完了。
```
