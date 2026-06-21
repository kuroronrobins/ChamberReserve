# ChamberReserve Overnight Phase 3.6 Expansion Implementation Summary

作成日: 2026-06-22

## 結果

Phase 3.6「チャンバー管理設定基盤 + 検索入口整流」は完了。

検索入口の 4 x 3 ブロック指定は、特定チャンバーの空き状況ではなく「希望ブロック条件」として扱う形に整流した。未選択時は候補生成へ進まず、専用の入力エラーを表示する。条件入力画面では予約済み/一時停止の表示を出さず、候補表示、予約ボード、管理画面の一時停止では実際の予約/停止/影響ブロック表示を維持した。

管理者向けには、チャンバー設定版を `draft` / `active` / `archived` で扱う基盤を完成させた。UI から draft 保存、draft 編集、draft 公開、draft archive ができる。公開時は既存 active を archived にし、active の直接 archive は拒否する。

## 主な実装

- `src/domain/searchEngine.ts`
  - 空ブロックと非連続ブロックの unavailable reason を分離。
  - 固定条件チャンバーは、要求温湿度が明示され一致する場合だけ候補化。
- `src/domain/reservationRules.ts`
  - `validateChamberConditionConfig` を追加し、温度サイクル、一定温湿度、ユーザー温湿度管理の検証を共通化。
- `server/service.ts`
  - 設定版一覧取得を追加。
  - draft 以外の patch/publish を 409 にした。
  - active 設定版の直接 archive を 409 にした。
  - API path の chamberId と revision の chamberId 不一致を 404 にした。
- `server/index.ts`
  - `GET /api/admin/chambers/:id/config-revisions` を追加。
  - publish/archive 失敗時の 404/409 を HTTP 応答へ反映。
- `src/api/client.ts`
  - チャンバー別 config revision 取得 API を追加。
- `src/App.tsx`
  - 管理画面を draft lifecycle 対応へ拡張。
  - publish 後に古い検索候補を破棄し、設定変更後の stale candidate 確定を避ける。
  - 検索入口の空ブロック文言を「希望ブロック条件」に統一。
- `src/components/ChamberBlockMap.tsx`
  - compact 表示のチャンバー面ではセルラベルを視覚的に隠し、小型ブロックセルの text clipping を解消。
- Tests
  - 空ブロック/非連続ブロック理由の分離。
  - 固定条件の明示一致要求。
  - 設定版 draft/active/archived 遷移。
  - active archive 拒否、missing revision 404。
  - 設定 config validation。

## 検証結果

- PASS: `npm run test`
  - 6 files, 46 tests passed.
- PASS: `npm run test:server`
  - 1 file, 12 tests passed.
  - sandbox では Vite config 読み込み時に `spawn EPERM` が出たため、権限付きで再実行して PASS。
- PASS: `npm run build`
  - `tsc -b && vite build` 成功。
- PASS: `python main.py --check`
  - `CHECK PASS ChamberReserve`
  - `DIST ready`
- PASS: `python main.py --no-open`
  - UI: `http://127.0.0.1:5178/`
  - API: `http://127.0.0.1:8798/api/`
- PASS: runtime API spot checks
  - `GET /api/admin/chambers/tc-01/config-revisions` returns `ok: true`.
  - `POST /api/admin/chambers/tc-01/config-revisions/tc-01-config-r12/archive` returns HTTP 409 for active direct archive.

## ブラウザ確認

in-app browser で `http://127.0.0.1:5178/` を確認。

- PASS: 初期検索画面で選択済みブロック 0。
- PASS: 条件入力ブロック UI に予約済み/一時停止の凡例や disabled 表示が出ない。
- PASS: 未選択検索で `希望ブロック条件を1つ以上選択してください。` を表示し、候補生成に進まない。
- PASS: 1ブロック + 1サイクルで TC-01/TC-02/TC-03 の候補が表示される。
- PASS: 候補詳細から予約確定し、予約ID/PIN が生成される。
- PASS: 生成された PIN で PIN編集を照合し、保存できる。
- PASS: 予約ボードに確定予約とブロック表示が出る。
- PASS: 管理画面で draft 保存、draft archive、一定温湿度 publish、ユーザー温湿度管理 publish ができる。
- PASS: 一定温湿度 active では 25C/93%RH が候補化され、30C/93%RH は候補化されない。
- PASS: ユーザー温湿度管理 active では 30C/60%RH が候補化され、100C/60%RH は候補化されない。
- PASS: 一時利用停止で影響予約 1件を preview し、確定後に影響付与メッセージと対象予約が表示される。
- PASS: desktop 1280px / mobile 390px の管理画面と検索画面で横スクロール、主要要素のはみ出し、button text clipping なし。

## 残課題

- 実 DB はブラウザ検証で設定版と予約/停止データが増えている。検証データを初期化したい場合は、別途 DB reset 手順を実行する。
- 管理画面の draft 操作は基盤として完成したが、公開前 diff 表示や監査ログは今回の out of scope。
- active 設定の公開履歴は JSON revision として保存している。将来、大規模運用に進むなら cycle step 正規化テーブルや migration 管理を検討する。

## 次候補

次に進めるなら Phase 3.7 として、管理設定変更の実運用 hardening が適切。

- DB reset/seed 操作の管理画面または安全な CLI。
- 設定版 publish 前の差分 preview。
- admin suspension の取消/編集。
- 予約作成後の設定変更に対する履歴表示。
- API smoke/e2e のブラウザ自動検証スクリプト化。
