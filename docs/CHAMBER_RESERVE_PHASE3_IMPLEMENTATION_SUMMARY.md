# ChamberReserve Phase 3 Implementation Summary

作成日: 2026-06-21

## 実装結果

Phase 2 の単一チャンバー API / SQLite / UI を、複数の温度サイクル型チャンバー横断候補検索へ拡張した。
最初の画面は引き続き条件検索であり、利用者にチャンバーを先に選ばせない。

## 追加した挙動

- `TC-01`, `TC-02`, `TC-03` の温度サイクル型チャンバーを seed する。
- `GET /api/state` と `GET /api/chambers` が複数チャンバーを返す。
- `POST /api/reservation-candidates` が複数チャンバーを横断して候補を返す。
- 候補 ID と予約に `chamberId` を保持する。
- 予約競合、一時利用停止競合、ブロック占有判定を `chamberId` 単位に分離する。
- 候補カード、予約ボード、編集画面、影響予約にチャンバー名と場所を表示する。
- 予約ボードで表示対象チャンバーを選択できる。
- 管理者一時利用停止で対象チャンバーを選択できる。

## サーバー側判定

- 候補生成は、日付、チャンバー、配置の順に探索する。
- 同じ日付、同じブロックでも、別チャンバーなら競合しない。
- 同じチャンバー内では、既存予約と一時利用停止を照合して候補から除外する。
- 予約確定時は候補を再生成し、同じ候補 ID がまだ存在する場合だけ保存する。
- 一時利用停止 preview / 登録は、対象 `chamberId` の予約だけを影響予約にする。

## 保存データ

既定 DB は引き続き `data/chamberreserve.sqlite`。

- `chambers`: 3 台の温度サイクル型チャンバー。
- `reservations`: `chamberId` を保持した予約。
- `suspensions`: `chamberId` を保持した一時利用停止。
- `reservation_suspension_impacts`: チャンバー別判定後の影響予約。

## 検証

- `npm run test`
- `npm run test:server`
- `npm run build`
- `python main.py --check`
- `python main.py --no-open`
- `tmp_validation/phase3_browser_check.cjs`

ブラウザ検証では、場所指定検索で `TC-01`, `TC-02`, `TC-03` の候補を表示し、`TC-02` 候補を予約確定、PIN 編集、予約ボード表示、PIN 削除、利用後削除不可、管理者一時利用停止の対象チャンバー選択まで確認した。

## Phase 4 Handoff

Phase 4 は固定条件型チャンバー対応に進む。

追加検討が必要な箇所:

- `Chamber.type` を `temperature_cycle` 以外へ拡張する。
- 固定条件型の温度、湿度、運転可能期間を DB に保存する。
- `generateReservationCandidates` にチャンバー種別ごとの条件適合判定を追加する。
- 検索フォームに、固定条件型の条件一致を自然に扱う表示を追加する。
- 候補カードに、標準サイクル型と固定条件型の違いが比較できる表示を追加する。
