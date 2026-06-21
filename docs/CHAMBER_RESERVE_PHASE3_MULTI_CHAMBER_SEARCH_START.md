# ChamberReserve Phase 3 Multi Chamber Search Start

作成日: 2026-06-21

## 目的

Phase 2 の単一温度サイクル型チャンバー API / SQLite / UI を、複数の温度サイクル型チャンバー候補検索へ拡張する。
利用者の入口は引き続き条件検索であり、最初にチャンバーを選ばせない。

## 背景

Phase 2 では、予約候補検索、予約確定、PIN 編集/削除、予約ボード、管理者一時利用停止が API と SQLite に接続された。
Phase 3 では、同じ条件入力から複数チャンバーを横断して予約可能候補を返し、利用者が候補カード上でチャンバー、場所、日程を比較できる状態にする。

## Read First

- `AGENTS.md`
- `docs/CHAMBER_RESERVE_SYSTEM_SPEC.md`
- `docs/CHAMBER_RESERVE_LONG_TERM_IMPLEMENTATION_PLAN.md`
- `docs/GOAL_IMPLEMENTATION_POLICY.md`
- `docs/CHAMBER_RESERVE_PHASE2_IMPLEMENTATION_SUMMARY.md`
- `docs/CHAMBER_RESERVE_PHASE3_MULTI_CHAMBER_SEARCH_START.md`

## Scope

- 複数の温度サイクル型チャンバー seed データ。
- SQLite `chambers` の複数行読み書き。
- 候補生成をチャンバー横断に拡張。
- 予約・一時利用停止の競合判定を `chamberId` 単位に分離。
- 候補カードでチャンバー名、場所、使用ブロック、日程を比較できる UI。
- 予約確定時に候補の `chamberId` を保持して保存する。
- 予約ボードと編集画面でチャンバー名を表示する。
- 管理者一時利用停止で対象チャンバーを選べるようにする。
- Phase 3 用のサーバー側テストとブラウザ確認。

## Out of Scope

- 固定条件型チャンバー。
- 自由温湿度型チャンバー。
- チャンバー登録 CRUD 画面。
- live DB / 社内 LAN 本番運用。
- アカウント管理。
- 仮押さえ。
- 高度な PIN セキュリティ。
- メール、Teams、Slack 通知。
- 奥行き、高さ、重量、通風クリアランス管理。
- 自動バックアップ、復旧、利用率レポート。

## Rules

- 最初の画面はチャンバー選択ではなく条件検索。
- 候補一覧には予約可能な候補だけを出す。
- 複数チャンバー化しても、断片化候補を返さない。
- 温度サイクル型は 25°C 搬入 / 搬出期間を守る。
- 予約競合、一時利用停止競合は同じ `chamberId` 内だけで判定する。
- 管理者一時利用停止は通常予約より優先する。
- TeamPlanner の業務概念を持ち込まない。

## Validation

- `npm run test`
- `npm run test:server`
- `npm run build`
- `python main.py --check`
- `python main.py --no-open`
- ブラウザで、条件検索から複数チャンバー候補が表示されることを確認する。
- ブラウザで、別チャンバーの同じブロック予約が互いに競合しないことを確認する。
- ブラウザで、予約確定後に予約ボードと編集画面へチャンバー名が表示されることを確認する。
- ブラウザで、管理者一時利用停止の対象チャンバー選択と影響予約表示を確認する。

## Completion Conditions

- 条件検索が複数チャンバー横断候補を返す。
- 予約確定、PIN 編集/削除、一時利用停止が `chamberId` を保持して動く。
- サーバー側競合判定がチャンバー別に分離されている。
- テスト、ビルド、ブラウザ確認の結果を `PASS` / `FAIL` / `BLOCKED` / `NOT_RUN` で報告できる。

## Handoff

Phase 4 では固定条件型チャンバーに進む。
そのため Phase 3 完了時には、候補生成へチャンバー種別ごとの適合判定を追加する場所、DB に追加すべき固定条件項目、UI に追加すべき条件表示を整理する。
