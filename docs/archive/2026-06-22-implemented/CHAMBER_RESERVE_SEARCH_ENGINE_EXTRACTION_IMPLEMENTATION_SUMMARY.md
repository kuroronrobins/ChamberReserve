# ChamberReserve Search Engine Extraction Implementation Summary

## Scope

候補表示アルゴリズムを今後カスタムしやすくするため、予約候補生成を `reservationRules` から独立した検索エンジンに切り出した。

## Implementation

- `src/domain/searchEngine.ts` を追加した。
- `searchReservationCandidates(request, context)` を候補検索の入口にした。
- 検索日数、対象チャンバー、最大表示件数、候補ランキング関数を `CandidateSearchEngineContext` で指定できるようにした。
- 検索処理を次の名前付きステップに分割した。
  - `buildSearchDateKeys`
  - `buildCandidateSearchWindow`
  - `findCandidatePlacements`
  - `buildReservationCandidate`
  - `buildCandidateId`
- `reservationRules.ts` には、ブロック連続性、配置可能判定、時間窓、予約作成、削除可否などの基礎ルールを残した。
- `src/App.tsx` と `server/service.ts` は新しい検索エンジンを参照するようにした。

## Customization Points

- 探索日数を変える場合は `searchWindowDays` を指定する。
- 表示対象チャンバーを絞る場合は `chambers` を指定する。
- 候補表示件数を制限する場合は `maxResults` を指定する。
- 候補の表示順を変更する場合は `rankCandidates` を指定する。

## Validation

- `src/domain/searchEngine.test.ts` を追加し、探索日数、対象チャンバー、表示順、表示件数上限のカスタムを確認した。
- 既存の候補生成テストは `searchReservationCandidates` を使う形に更新した。
