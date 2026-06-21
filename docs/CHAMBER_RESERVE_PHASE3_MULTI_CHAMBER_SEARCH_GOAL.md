# ChamberReserve Phase 3 Multi Chamber Search Goal

```text
/goal ChamberReserve Phase 3「複数チャンバー候補検索」を、条件検索から複数の温度サイクル型チャンバー候補を比較して予約確定できる状態にしてください。

# Objective
Phase 2 の API / SQLite / UI を、複数の温度サイクル型チャンバー横断候補検索に拡張する。最初の画面は引き続きチャンバー選択ではなく条件検索にする。

# Read First
- AGENTS.md
- docs/CHAMBER_RESERVE_SYSTEM_SPEC.md
- docs/CHAMBER_RESERVE_LONG_TERM_IMPLEMENTATION_PLAN.md
- docs/GOAL_IMPLEMENTATION_POLICY.md
- docs/CHAMBER_RESERVE_PHASE2_IMPLEMENTATION_SUMMARY.md
- docs/CHAMBER_RESERVE_PHASE3_MULTI_CHAMBER_SEARCH_START.md

# Scope
- 複数の温度サイクル型チャンバー seed。
- SQLite chambers 複数行読み書き。
- チャンバー横断候補生成。
- 予約/一時利用停止の競合判定を chamberId 単位に分離。
- 候補カード、予約ボード、編集画面にチャンバー名を表示。
- 管理者一時利用停止の対象チャンバー選択。
- Phase 3 テストとブラウザ確認。

# Out of Scope
- 固定条件型。
- 自由温湿度型。
- チャンバー登録 CRUD。
- live DB / 本番運用。
- アカウント、仮押さえ、通知、高度な PIN セキュリティ。

# Validation
- npm run test
- npm run test:server
- npm run build
- python main.py --check
- python main.py --no-open
- ブラウザで複数チャンバー候補、予約確定、PIN編集/削除、予約ボードのチャンバー表示、管理者一時利用停止の対象チャンバー選択を確認する。

# Stop When
Phase 3開始文書の完了条件を満たし、検証結果を PASS / FAIL / BLOCKED / NOT_RUN で報告できたら完了。
```
