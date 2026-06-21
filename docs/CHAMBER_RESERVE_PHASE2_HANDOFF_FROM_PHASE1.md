# ChamberReserve Phase 2 Handoff From Phase 1

作成日: 2026-06-21

## 2026-06-21 Addendum: Phase 3.5 API/data contract changes

- `SearchRequest` now includes `cycleCount`.
- `Candidate` now includes `cycleCount`.
- `Reservation` now includes `cycleCount`.
- `POST /api/reservation-candidates` should accept `cycleCount` and generate only candidates whose cycle-adjusted windows are available.
- `POST /api/reservations` should accept `cycleCount`; the final server-side commit check must recompute candidate availability using the same cycle amount.
- Candidate IDs include the cycle amount segment, for example `tc-02-2026-06-24-c2-exact-1`.
- SQLite/server persistence should store `cycle_count REAL NOT NULL DEFAULT 1`.
- Browser UI no longer asks for contact information. Keep `requester.contact` optional or empty-string-compatible while older data exists.
- Browser UI requires department selection from a fixed option list. Later persistence work should move department options into seed/config data.
- Current supported cycle amounts are `0.5`, `1`, `2`, and `3`; `0.5` means same-day unload access, and integer values mean unload access after that many days.

## 目的

Phase 1 でブラウザ内状態として固めた単一温度サイクル型チャンバーの UI/UX を、Phase 2 の Node.js API と SQLite 永続化へ接続するための引き継ぎメモ。

Phase 1 ではサーバーAPI、SQLite、live DB、本番起動スクリプトは実装していない。

## Phase 1 で使った主なデータ構造

- `Chamber`: `id`, `name`, `type`, `location`, `standardCycle`
- `StandardCycle`: 標準サイクル名、温度条件、湿度条件、搬入開始/終了時刻、運転終了時刻、搬出終了時刻
- `BlockCell`: 4 x 3 の `id`, `row`, `col`, `label`
- `CycleWindow`: `loadStart`, `loadEnd`, `runStart`, `runEnd`, `unloadStart`, `unloadEnd`
- `Reservation`: 予約ID、チャンバーID、試験名、予約者、所属、サイクル実施量、ブロック、サイクル窓、4桁PIN、作成/更新/削除、影響を受けた一時停止ID
- `Suspension`: 一時利用停止ID、チャンバーID、用途、開始/終了、対象ブロックまたは全体、影響予約ID
- `Candidate`: 候補ID、チャンバーID、サイクル窓、使用ブロック、サイズだけ指定/場所まで指定、配置番号

## Phase 2 で必要になるAPI候補

- `GET /api/chambers`: チャンバーと標準条件の取得
- `POST /api/reservation-candidates`: 条件検索と候補生成
- `POST /api/reservations`: 予約確定と4桁PIN発行
- `POST /api/reservations/lookup`: 予約IDとPINによる編集対象取得
- `PATCH /api/reservations/:id`: PIN確認後の予約内容更新
- `DELETE /api/reservations/:id`: PIN確認後の予約削除
- `GET /api/reservation-board?date=YYYY-MM-DD`: 予約ボード表示
- `POST /api/suspensions/preview`: 一時利用停止の影響予約確認
- `POST /api/suspensions`: 一時利用停止確定と影響予約マーキング

## Phase 2 で保存する主なデータ

- チャンバー基本情報
- 標準温度サイクル条件
- 4 x 3 ブロック定義
- 予約本体
- 予約者情報
- 予約ブロック
- PIN
- 予約変更/削除状態
- 一時利用停止本体
- 一時利用停止対象ブロック
- 一時利用停止により影響を受けた予約

## サーバー側で必ず再判定するルール

- 予約確定直前に、予約済みブロックと一時利用停止を再確認する。
- 一時利用停止は通常予約より優先する。
- 必要ブロックは連続していること。
- サイズだけ指定では、選択形状を保った連続配置だけを候補にする。
- 場所まで指定では、選択ブロックそのものが空いている場合だけ候補にする。
- 分割配置が必要になる候補は返さない。
- 温度サイクル型の搬入と搬出は 25°C 定常期間に限る。
- PIN が一致する場合だけ更新、削除を許可する。
- 利用後予約は削除不可にする。
- 同時確定では先にコミットした予約を優先し、後続は候補選び直しを返す。
- 仮押さえは作らない。

## Phase 2 の注意点

- Phase 1 の UI は `src/domain/reservationRules.ts` の純粋関数を中心に組んでいる。サーバー実装では同じ判定を API 側へ移し、クライアント候補は最終確定時に信用しない。
- Phase 1 の `DEMO_NOW_ISO` はブラウザ検証用の固定時刻。Phase 2 ではサーバー時刻を使う。
- Phase 1 のPINは簡易生成。Phase 2 では重複回避だけ行い、高度なセキュリティ機構は入れない。
- Phase 3.5 時点の予約編集は試験名、予約者、所属、備考の変更を確認対象にした。連絡先はUIでは扱わず、既存データ/後方互換用の空文字許容フィールドとして残す。日程/ブロック変更APIを同時に入れる場合も、候補生成と同じ再判定を通す。
