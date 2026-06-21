# ChamberReserve Candidate Result Optimization Implementation Summary

## Scope

候補一覧を「配置場所の列挙」から「予約判断できる選択肢」へ変更した。

サイズだけ指定では、同じ日付、同じチャンバー、同じ時間窓、同じ条件の配置候補を代表1件へ集約する。複数チャンバーに空きがある場合は、チャンバーごとの候補として残す。

## Implementation

- `src/domain/searchEngine.ts` に `searchReservationCandidateResult` を追加した。
- 既存の `searchReservationCandidates` は互換入口として残し、structured result の `candidates` を返すようにした。
- `Candidate` に `dateKey`、`availablePlacementCount`、`hiddenPlacementCount`、`representativeReason` を追加した。
- サイズ指定の代表配置選定を追加した。
  - 選択位置が空いていれば、その位置を採用する。
  - 空いていなければ、選択形状に最も近い同形状配置を採用する。
  - 同距離の場合は上段、左列、ブロックID順で deterministic に決める。
- 希望日候補と代替日候補を `CandidateSearchResult` で分離した。
- API は既存の `candidates` を残しつつ、`result` を返すようにした。
- UI は structured result を保持し、希望日が埋まっている場合は希望日不可メッセージと近い日付の候補を分けて表示するようにした。
- 候補カードと選択中候補に検索日と代表配置の補足を表示するようにした。

## Validation

- `npm run test`: PASS
- `npm run test:server`: PASS
- `npm run build`: PASS
- `python main.py --check`: PASS
- `python main.py --no-open --db-path tmp_validation\candidate_result_optimization.sqlite`: PASS
- `node tmp_validation\chamber_background_block_map_check.cjs`: PASS

ブラウザ検証では次を確認した。

- サイズ指定で、配置場所の列挙ではなくチャンバー/日付単位の候補に集約される。
- 複数チャンバー候補は残る。
- 希望日が埋まっている場合、希望日不可と近い日付候補が分かれて表示される。
- 代表候補から予約確定し、予約IDとPINが表示される。
- チャンバー背景付きブロック表示とモバイル幅が崩れない。
