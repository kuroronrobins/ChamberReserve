# ChamberReserve Phase 2 Server Persistence Goal

次の `/goal` を Phase 2 実装開始時に使用する。

```text
/goal ChamberReserve Phase 2「単一チャンバーのサーバーAPIとSQLite永続化」を、Phase 1 UIフローがページ再読み込み後も維持される実データとして動く状態にしてください。

# Objective
単一温度サイクル型チャンバーについて、予約候補検索、予約確定、PIN編集/削除、予約ボード、管理者一時利用停止を Node.js TypeScript API と SQLite 永続化に接続する。

# Read First
- AGENTS.md
- docs/CHAMBER_RESERVE_SYSTEM_SPEC.md
- docs/CHAMBER_RESERVE_LONG_TERM_IMPLEMENTATION_PLAN.md
- docs/GOAL_IMPLEMENTATION_POLICY.md
- docs/CHAMBER_RESERVE_PHASE1_FOUNDATION_START.md
- docs/CHAMBER_RESERVE_PHASE2_HANDOFF_FROM_PHASE1.md
- docs/CHAMBER_RESERVE_PHASE2_SERVER_PERSISTENCE_START.md

# Scope
- Node.js TypeScript API。
- SQLite 永続化。
- 単一温度サイクル型チャンバーの初期データ。
- 予約候補検索、予約作成、PIN lookup、PIN更新、PIN削除。
- 予約ボード。
- 管理者一時利用停止 preview / 確定。
- UI から API への接続。
- ページ再読み込み後の予約保持。
- サーバー側の最終競合再確認。

# Out of Scope
- 複数チャンバー実運用。
- 固定条件型、自由温湿度型。
- live DB / 本番LAN運用。
- バックアップ、復旧、集計、CSV。
- アカウント管理。
- 仮押さえ。
- 高度なPINセキュリティ。
- メール、Teams、Slack通知。
- 奥行き、高さ、重量、通風クリアランス管理。

# Constraints
- 最初の画面は条件検索にする。
- 候補一覧には予約可能な候補だけを返す。
- 断片化候補を返さない。
- 一時利用停止は予約より優先する。
- TeamPlanner の業務概念を持ち込まない。
- 既存の未コミット変更を戻さない。

# Validation
- npm run test
- npm run test:server
- npm run build
- python main.py --check
- python main.py --no-open
- ブラウザで予約作成、再読み込み後の保持、PIN編集/削除、利用後削除不可、管理者一時利用停止と影響予約表示を確認する。

# Progress
チェックポイントごとに、変更ファイル、検証結果、残件、ブロック有無を短く報告する。

# Stop When
Phase 2開始文書の完了条件を満たし、テスト、ビルド、ブラウザ確認の結果を PASS / FAIL / BLOCKED / NOT_RUN で報告できたら完了。
```
