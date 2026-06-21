# ChamberReserve Phase 2 Implementation Summary

作成日: 2026-06-21

## 実装結果

Phase 1 の単一温度サイクル型チャンバー UI/UX を、Node.js TypeScript API と SQLite 永続化へ接続した。
ブラウザは `python main.py` の単一入口から起動し、静的 UI は `http://127.0.0.1:5178/`、API は内部で `http://127.0.0.1:8798/api/` を使う。
UI からは相対 `/api` で呼び出し、`main.py` が API へプロキシする。

## API

- `GET /api/health`
- `GET /api/chambers`
- `GET /api/state`
- `POST /api/reservation-candidates`
- `POST /api/reservations`
- `POST /api/reservations/lookup`
- `PATCH /api/reservations/:id`
- `DELETE /api/reservations/:id`
- `GET /api/reservation-board?date=YYYY-MM-DD`
- `POST /api/suspensions/preview`
- `POST /api/suspensions`

## 保存データ

既定 DB は `data/chamberreserve.sqlite`。

- `chambers`: 単一温度サイクル型チャンバーと標準サイクル条件。
- `reservations`: 予約本体、試験名、申請者、25°C 搬入/搬出を含むサイクル期間、PIN、作成/更新/削除時刻。
- `reservation_blocks`: 予約ブロック。
- `suspensions`: 管理者一時利用停止。
- `suspension_blocks`: 一時利用停止対象ブロック。
- `reservation_suspension_impacts`: 一時利用停止により影響を受ける予約。

## サーバー側判定

- 候補生成時に、25°C 搬入/搬出の標準サイクル期間、既存予約、一時利用停止を照合する。
- 予約確定時に候補を再生成し、同じ候補 ID がまだ予約可能な場合だけ保存する。
- 必要ブロックが非連続の場合、候補を返さない。
- サイズ指定は同じ形状の連続ブロックだけを候補にする。
- 場所指定は選択ブロックそのものが空いている場合だけ候補にする。
- PIN が一致する場合だけ編集/削除を許可する。
- 利用後の予約は削除不可。
- 管理者一時利用停止は通常予約より優先し、影響予約を保存して予約ボードに表示する。

## 起動と検証

- `npm run test`
- `npm run test:server`
- `npm run build`
- `python main.py --check`
- `python main.py --no-open`
- `python main.py --status`
- `python main.py --stop`

ブラウザ検証は `tmp_validation/phase2_browser_check.cjs` で実施し、結果は `tmp_validation/phase2_browser_check.json` に保存した。

## 次フェーズ候補

Phase 3 では、単一チャンバーの UX を崩さずに複数チャンバー候補検索へ拡張する。
DB スキーマ、API ルート、UI の検索入口は複数チャンバー対応を妨げない形にしているが、固定条件型、自由温湿度型、複数チャンバー実運用はまだ未実装。
