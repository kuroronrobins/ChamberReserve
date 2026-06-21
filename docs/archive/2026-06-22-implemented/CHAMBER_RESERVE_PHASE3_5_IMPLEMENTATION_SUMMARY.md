# ChamberReserve Phase 3.5 Implementation Summary

作成日: 2026-06-21

## 実装結果

Phase 3 の複数チャンバー候補検索UIを、第2案「候補比較 + 4 x 3 ブロック選択」を基準に再構成した。

検索画面は、左に検索条件と指定ブロック、中央に予約可能候補の比較行、右に選択中候補の詳細と大きな 4 x 3 ブロック表示を置く構成になった。候補を選ぶと右側のチャンバー名、25°C 搬入、運転期間、25°C 搬出、使用ブロック、予約確定ボタンが連動する。

## 変更した主な内容

- 検索画面を候補比較中心の3領域レイアウトに変更。
- 候補一覧を比較行として再設計し、チャンバー名、場所、25°C 搬入、運転期間、25°C 搬出、使用ブロック、配置意図、予約可能状態を表示。
- 選択中候補に連動する `4 x 3 ブロック選択` 詳細パネルを追加。
- 予約確定後の予約IDと4桁PINを、選択候補詳細の文脈に表示。
- `BlockGrid` をチャンバー正面投影として見えるように調整し、大きな詳細表示と小さな候補ミニマップの両方に対応。
- `CycleTimeline` を候補比較向けに調整し、25°C 搬入、運転期間、25°C 搬出の区分を強めた。
- 色トークンを、teal = 選択/予約可能、amber = 注意/影響、red = 停止/不可、gray = 予約済み/補助として整理。
- Phase 3.5 用ブラウザ検証スクリプトを追加。

## 変更ファイル

- `src/App.tsx`
- `src/components/BlockGrid.tsx`
- `src/components/CycleTimeline.tsx`
- `src/styles.css`
- `tailwind.config.cjs`
- `tmp_validation/phase3_5_browser_check.cjs`
- `docs/CHAMBER_RESERVE_PHASE3_5_IMPLEMENTATION_SUMMARY.md`

## 維持した仕様

- 最初の画面は空き検索。
- 候補一覧は予約可能候補のみ。
- 断片化候補は表示しない。
- 温度サイクル型の 25°C 搬入、運転期間、25°C 搬出を候補ごとに表示。
- 4桁PINによる編集/削除。
- 利用後予約の削除不可。
- 管理者一時利用停止と影響予約表示。
- 複数温度サイクル型チャンバーの横断候補検索。
- サーバーAPIとSQLiteスキーマは変更なし。

## ブラウザ確認

検証スクリプト:

- `tmp_validation/phase3_5_browser_check.cjs`

出力:

- `tmp_validation/phase3_5_browser_check.json`
- `tmp_validation/phase3_5_candidate_comparison.png`
- `tmp_validation/phase3_5_browser_check.png`
- `tmp_validation/phase3_5_browser_check_mobile.png`

確認したシナリオ:

- 初期表示が空き検索である。
- 条件入力から候補検索できる。
- TC-01 / TC-02 / TC-03 の候補を比較できる。
- 候補一覧には予約可能候補だけが出る。
- 候補を選ぶと詳細パネルと 4 x 3 ブロックが連動する。
- 選択中候補の詳細パネルから予約確定できる。
- 予約確定後に予約IDと4桁PINが表示される。
- PINで予約を開き、編集できる。
- PINで予約を削除できる。
- 利用後の予約は削除できない。
- 管理者一時利用停止で対象チャンバーを選び、影響予約を確認して登録できる。
- モバイル幅で横スクロールが出ない。

## 検証結果

- `npm run test`: PASS
- `npm run test:server`: PASS
- `npm run build`: PASS
- `python main.py --check`: PASS
- `python main.py --no-open`: PASS
- `tmp_validation/phase3_5_browser_check.cjs`: PASS

## Phase 4 Handoff

Phase 4 では固定条件型チャンバーを候補に追加する。

追加時に使うUI拡張ポイント:

- 候補比較行のチャンバー名/場所の下に、チャンバー種別や固定条件ラベルを追加できる。
- 選択中候補詳細パネルの予約範囲サマリーに、固定温度/固定湿度の条件表示を追加できる。
- `CycleTimeline` は温度サイクル型用なので、固定条件型では候補詳細パネル内で別の利用可能期間表示に差し替える余地を残す。
- 候補の予約可能状態表示は、種別ごとの判定理由を短く表示する場所として使える。
- `BlockGrid` はチャンバー種別に依存しないため、固定条件型でも同じ 4 x 3 表示を再利用できる。

## 残件

- 固定条件型チャンバーの候補判定と表示は Phase 4 で扱う。
- 自由温湿度型チャンバーは Phase 5 で扱う。
## 2026-06-21 Addendum: cycle amount and requester input refinement

### Implemented behavior

- Search conditions now include `cycleCount` as a selectable cycle amount.
- Supported cycle amounts are `0.5`, `1`, `2`, and `3` cycles.
- `0.5` cycle keeps unload access on the same desired date at the 25°C steady unload window.
- `1`, `2`, and `3` cycles place unload access on the corresponding day offset, while keeping unload at the 25°C steady unload window.
- Reservation candidates carry `cycleCount`, and candidate IDs include the selected cycle amount to avoid stale candidate ambiguity.
- Confirmed reservations persist `cycleCount` through the browser state, server API, and SQLite schema.
- Department is selected from a fixed dropdown in both new reservation and PIN edit flows.
- Contact input is no longer shown in the UI. The server/data model still accepts `requester.contact` for backward compatibility, but the browser sends an empty string.

### Validation update

- `npm run test`: PASS, 16 tests.
- `npm run test:server`: PASS, 8 tests.
- `npm run build`: PASS.
- Browser validation script: PASS.
- User manual confirmation after runtime recovery: PASS.

### Handoff notes

- Phase 2+ API contracts should keep `cycleCount` on search and reservation creation payloads.
- Server-side final conflict checks must use the cycle-adjusted `window` generated from `cycleCount`.
- If a future UI allows cycle amounts beyond `0.5`, `1`, `2`, and `3`, add them to the domain option list first and keep candidate generation deterministic.
- Department dropdown options should become seed/config data when the server persistence layer is expanded.
