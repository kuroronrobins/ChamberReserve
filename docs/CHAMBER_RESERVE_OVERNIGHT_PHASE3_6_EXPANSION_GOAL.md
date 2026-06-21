# ChamberReserve Overnight Phase 3.6 Expansion Goal

次の `/goal` を睡眠中の長時間実装開始時に使用する。

```text
/goal ChamberReserveの約8倍ボリューム長時間実装として、Phase 3.6「チャンバー管理設定基盤 + 検索入口整流」を完了してください。

# Objective
docs/CHAMBER_RESERVE_OVERNIGHT_PHASE3_6_EXPANSION_START.md を唯一の詳細開始文書として、検索入口の4 x 3ブロック指定を希望ブロック条件へ整流し、その後に管理者がチャンバーごとの温湿度管理方式と設定版を draft / active / archived で管理できる基盤を完成させる。公開済みactive設定は候補検索、予約確定、予約ボード、PIN編集/削除、一時利用停止表示へ反映する。

# Read First
- AGENTS.md
- docs/CHAMBER_RESERVE_SYSTEM_SPEC.md
- docs/CHAMBER_RESERVE_LONG_TERM_IMPLEMENTATION_PLAN.md
- docs/GOAL_IMPLEMENTATION_POLICY.md
- docs/CHAMBER_RESERVE_OVERNIGHT_PHASE3_6_EXPANSION_START.md
- docs/CHAMBER_RESERVE_SEARCH_BLOCK_INTENT_INPUT_START.md
- docs/CHAMBER_RESERVE_CHAMBER_ADMIN_CONFIGURATION_START.md
- package.json

# Scope
- 既存worktree差分を監査し、ユーザー差分やdocsアーカイブ整理を戻さない。
- 既存実装がある場合は再実装せず、足りない箇所を補完する。
- Search Block Intent Inputを先に完了する。
- チャンバー設定版のdomain型、pure helper、SQLite永続化、server API、client API、App state、管理UIを完成させる。
- 温度サイクル型、一定温湿度型、ユーザー温湿度管理型の候補検索/予約確定ルールを整える。
- 予約データは占有開始/終了時刻を中心にし、設定変更で既存予約の占有時間を変えない。
- 実装サマリー docs/CHAMBER_RESERVE_OVERNIGHT_PHASE3_6_EXPANSION_IMPLEMENTATION_SUMMARY.md を作成する。

# Out of Scope
- アカウント管理、認証、権限管理、通知連携、仮押さえ、実機制御、バックアップ本格実装、高度な監査ログ。
- TeamPlannerの業務概念、タスク/Gantt/leave/roles/authの持ち込み。
- 新規外部依存の追加。ただし明確な理由がある場合は最小限にし、理由を報告する。

# Checkpoints
1. Baseline audit and worktree hygiene.
2. Search block intent input completion.
3. Domain model and reservation rule hardening.
4. SQLite config revision persistence.
5. Server API completion.
6. Client API and App state wiring.
7. Admin configuration UI.
8. Search/reservation/board/suspension integration.
9. Validation and browser proof.
10. Implementation summary and handoff.

# Validation
- npm run test
- npm run test:server
- npm run build
- python main.py --check
- python main.py --no-open
- Browser proof: initial search has no selected blocks, empty-block search shows an input error, valid block intent returns candidates, admin config draft/edit/publish/archive works, fixed-condition and user-managed condition candidates are filtered correctly, reservation confirm/PIN edit/board/suspension still work, desktop and mobile layouts do not overlap.

# Progress
At each checkpoint, report changed files, PASS / FAIL / BLOCKED / NOT_RUN evidence, residual risk, and the next checkpoint.

# Stop When
Stop only when all checkpoints are complete and validation is reported, or when the same blocker recurs three times and cannot be resolved without user input. Do not stop at the first passing subset. Do not revert unrelated or user-made changes.
```
