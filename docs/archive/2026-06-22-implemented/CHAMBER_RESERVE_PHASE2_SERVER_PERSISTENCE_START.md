# ChamberReserve Phase 2 Server Persistence Start

作成日: 2026-06-21

## 目的

Phase 1 で固めた単一温度サイクル型チャンバーの UI/UX を、Node.js TypeScript API と SQLite 永続化へ接続する。

利用者がブラウザで予約を作成、編集、削除し、ページを再読み込みしても予約データが保持される状態にする。管理者一時利用停止も保存し、影響予約をサーバー側で判定する。

## 背景

Phase 1 では、ブラウザ内状態とモックデータで次を確認した。

- 条件検索起点の予約導線。
- 4 x 3 ブロック選択。
- サイズだけ指定 / 場所まで指定。
- 断片化候補を出さない候補生成。
- 25°C 搬入 / 運転 / 25°C 搬出の表示。
- 4桁PIN による編集、削除。
- 利用後予約の削除不可。
- 管理者一時利用停止と影響予約表示。

Phase 2 では、これらをページ再読み込み後も維持される実データへ移す。

## 最初に読むファイル

- `AGENTS.md`
- `docs/CHAMBER_RESERVE_SYSTEM_SPEC.md`
- `docs/CHAMBER_RESERVE_LONG_TERM_IMPLEMENTATION_PLAN.md`
- `docs/GOAL_IMPLEMENTATION_POLICY.md`
- `docs/CHAMBER_RESERVE_PHASE1_FOUNDATION_START.md`
- `docs/CHAMBER_RESERVE_PHASE2_HANDOFF_FROM_PHASE1.md`
- `docs/CHAMBER_RESERVE_PHASE2_SERVER_PERSISTENCE_START.md`

## 実装対象

- Node.js TypeScript API。
- SQLite 永続化。
- 単一温度サイクル型チャンバーの初期データ。
- 予約候補検索 API。
- 予約作成 API。
- 予約ID + PIN による予約取得 API。
- PIN 確認後の予約更新 API。
- PIN 確認後の予約削除 API。
- 予約ボード API。
- 管理者一時利用停止の影響予約 preview API。
- 管理者一時利用停止の確定 API。
- UI から API への接続。
- ページ再読み込み後の予約保持。
- サーバー側の最終競合再確認。

## 対象外

- 複数チャンバー実運用。
- 固定条件型チャンバー。
- 自由温湿度型チャンバー。
- live DB / 本番LAN運用。
- 自動バックアップ、復旧訓練。
- 高度なPINセキュリティ。
- アカウント管理。
- 仮押さえ。
- メール、Teams、Slack通知。
- 奥行き、高さ、重量、通風クリアランス管理。
- 利用率レポートやCSV出力。

## 守るべき仕様

- 最初の画面は条件検索であり、チャンバー選択ではない。
- 候補一覧には予約可能な候補だけを返す。
- 断片化したブロック割り当ては返さない。
- 温度サイクル型の搬入と搬出は 25°C 定常期間だけにする。
- 予約確定直前にサーバー側で競合を再確認する。
- 一時利用停止は通常予約より優先する。
- PIN が一致する場合だけ編集、削除を許可する。
- 利用後予約は削除不可にする。
- 一時利用停止で影響を受ける予約は自動削除しない。
- TeamPlanner の業務概念、認証、ロール、タスク、Gantt、休暇を持ち込まない。

## データ境界

SQLite は Phase 2 のローカル開発用 DB として扱う。

- 既定DB: `data/chamberreserve.sqlite`
- テストDB: 一時ディレクトリまたは `tmp_validation/`
- PID/log/env 名は TeamPlanner と分ける。

## API 候補

- `GET /api/chambers`
- `POST /api/reservation-candidates`
- `POST /api/reservations`
- `POST /api/reservations/lookup`
- `PATCH /api/reservations/:id`
- `DELETE /api/reservations/:id`
- `GET /api/reservation-board?date=YYYY-MM-DD`
- `POST /api/suspensions/preview`
- `POST /api/suspensions`

## 検証コマンド

- `npm run test`
- `npm run test:server`
- `npm run build`
- `python main.py --check`
- `python main.py --no-open`
- ブラウザで予約作成、再読み込み後の保持、PIN編集/削除、利用後削除不可、一時利用停止と影響予約表示を確認する。

## 完了条件

- Phase 1 の主要 UI フローが API 経由で動く。
- 作成した予約がページ再読み込み後も残る。
- 予約確定時にサーバー側で競合再確認される。
- 4桁PIN が保存され、PIN一致時だけ編集、削除できる。
- 利用後予約はサーバー側でも削除不可。
- 管理者一時利用停止が保存され、影響予約を表示できる。
- `npm run test`, `npm run test:server`, `npm run build` が PASS。
- ブラウザ確認結果を `PASS` / `FAIL` / `BLOCKED` / `NOT_RUN` で報告できる。

## 次フェーズへの引き継ぎ

Phase 3 では、単一チャンバー前提を崩さずに複数チャンバー候補検索へ拡張する。Phase 2 完了時には、API と DB スキーマの未決事項、複数チャンバー化で変更すべき箇所、サーバー側判定の追加課題を整理する。
