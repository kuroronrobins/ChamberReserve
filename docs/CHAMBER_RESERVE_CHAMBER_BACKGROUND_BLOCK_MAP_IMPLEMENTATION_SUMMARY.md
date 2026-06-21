# ChamberReserve Chamber Background Block Map Implementation Summary

作成日: 2026-06-22

## 結果

採用済みの開口状態チャンバー正面模式図を、large 表示の 4 x 3 ブロック操作面へ組み込んだ。

背景画像には選択枠を焼き込まず、React 側の button grid を絶対配置で重ねて、選択、候補、予約済み、一時停止、影響予約を表現する構成にした。

## 実装内容

- `src/assets/espec-ar-front-background.svg` を `BlockGrid` の chamber surface 背景として import した。
- `src/components/BlockGrid.tsx` に `surface?: 'plain' | 'chamber'` を追加し、`size="large"` は既定で背景付き表示にした。
- オーバーレイ基準を `left: 29.1667%`, `top: 17.5%`, `width: 56.25%`, `height: 56.25%` に固定した。
- オーバーレイの 12 セルは従来と同じ button のまま、`aria-label`、`aria-pressed`、ドラッグ選択、readonly、状態判定を維持した。
- 検索の利用ブロック、選択中候補、予約ボード、管理者一時利用停止で背景付き表示を使うようにした。
- 候補カードと予約行の小さいミニマップは、視認性優先で plain 表示を維持した。
- モバイル幅では背景付きマップの最小高さを下げ、左の行ラベル込みでも横スクロールが出ないようにした。

## 視覚確認

ブラウザで次を確認した。

- 背景SVGが読み込まれる。
- 4 x 3 の操作枠が庫内領域内に収まる。
- 棚と上段/中段/下段の対応が大きくずれない。
- 右端と下端にはみ出しがない。
- 選択、候補、予約済み、一時停止、影響予約が背景上で判別できる。
- 予約確定後に予約IDと4桁PINが表示される。
- 予約ボード、管理者一時利用停止、モバイル幅で破綻しない。

## 検証証跡

- `npm run test`: PASS
- `npm run test:server`: PASS
- `npm run build`: PASS
- `python main.py --check`: PASS
- `python main.py --no-open`: PASS
- `node tmp_validation/chamber_background_block_map_check.cjs`: PASS

ブラウザ検証結果:

- `tmp_validation/chamber_background_block_map_check.json`
- `tmp_validation/chamber_background_block_map_search.png`
- `tmp_validation/chamber_background_block_map_board.png`
- `tmp_validation/chamber_background_block_map_admin.png`
- `tmp_validation/chamber_background_block_map_mobile.png`

## 補足

検証スクリプトは、検証専用の一時SQLiteを使うランタイムに対して実行した。通常DBへ検証予約を残さないためであり、通常起動自体は別途 `python main.py --no-open` で確認済み。

この変更では、予約ロジック、API、SQLiteスキーマ、PIN仕様、管理者一時停止ロジックは変更していない。

## 2026-06-22 追調整

実機画像確認で、棚板の線と4 x 3セル枠が重なって見えづらいこと、クリック後の選択状態が弱いことが分かったため、次を調整した。

- 背景付きオーバーレイのセル間に均等な余白を入れ、棚板線とセル枠が直接重ならないようにした。
- 選択セルを濃いteal塗り、太枠、白い外縁、チェック表示に変更した。
- ブラウザ検証に、実際にセルをクリックして `aria-pressed` と選択スタイルが反映される確認を追加した。

追検証:

- `npm run test`: PASS
- `npm run test:server`: PASS
- `npm run build`: PASS
- `python main.py --check`: PASS
- `node tmp_validation/chamber_background_block_map_check.cjs`: PASS

## 2026-06-22 表示エンジン再利用

候補カードにも採用済みチャンバー正面表示を適用するため、4 x 3 ブロック状態判定と表示を分離した。

- `src/domain/blockMapEngine.ts` を追加し、`suspended > impact > reserved > selected > candidate > disabled > empty` の表示優先順位、操作可否、toggle/drag 選択更新を pure helper として切り出した。
- `src/domain/blockMapEngine.test.ts` を追加し、状態優先順位、readonly/予約済み/一時停止/影響予約/disabled の操作不可、immutable な選択更新を固定した。
- `src/components/ChamberBlockMap.tsx` を追加し、採用済みチャンバー背景、plain 表示、`large` / `inline` / `compact` の表示密度を共通コンポーネントへ集約した。
- `src/components/BlockGrid.tsx` は互換 wrapper に縮小し、状態判定や背景付き JSX を持たない構成にした。
- 候補カードは `ChamberBlockMap density="inline"`、予約行は `ChamberBlockMap density="compact"` を直接参照するようにした。
- 検索入力、選択中候補、予約ボード、管理者一時利用停止は `BlockGrid` wrapper 経由で同じ表示エンジンを参照する。
- ブラウザ検証に、候補カード内の背景付きマップ、選択中候補とのブロック一致、候補カード側が readonly であること、モバイル幅での候補カードマップ表示を追加した。

追検証:

- `npm run test`: PASS
- `npm run test:server`: PASS
- `npm run build`: PASS
- `python main.py --check`: PASS
- `node tmp_validation/chamber_background_block_map_check.cjs`: PASS

この変更でも、予約候補生成ロジック、API、SQLiteスキーマ、PIN仕様、管理者一時停止ロジックは変更していない。
