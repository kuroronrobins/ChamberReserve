# ChamberReserve Overnight Phase 3.6 Expansion Start

作成日: 2026-06-22

## 目的

通常の30分程度の単発実装ではなく、約8倍の実装量を想定した長時間実行用の開始文書。

今回の題材は **Phase 3.6: チャンバー管理設定基盤 + 検索入口整流** とする。

単に1画面を追加するのではなく、次を一連の利用体験として完成させる。

- 利用者の最初の行動は引き続き条件検索にする。
- 検索条件入力の4 x 3ブロック指定を、特定チャンバーの空き状況選択ではなく、希望ブロック条件として整理する。
- 管理者がチャンバーごとの温湿度管理方式と設定版を管理できるようにする。
- 管理者公開済み設定が、候補検索、予約確定、予約ボード、PIN編集/削除、一時利用停止の表示に反映される。
- 温度サイクル型、一定温湿度型、ユーザー温湿度管理型の境界をコードとUIで分ける。
- 既存のPhase 1からPhase 3.5の主要フローを壊さず、テスト、ビルド、ランチャー、ブラウザ確認まで通す。

## なぜこの題材か

`Search Block Intent Input` は重要だが、単体では小さいUX修正で終わる。

`Chamber Admin Configuration` は、型、DB、API、検索エンジン、予約生成、管理UI、利用者UIの表示まで広がるため、睡眠中の長時間実装に向いている。

ただし、管理設定基盤に入る前に検索入口の誤解を取り除く必要がある。したがって今回の長時間実装では、検索入口整流をCheckpoint 2として先に完了させ、その後にPhase 3.6本体へ進む。

## Read First

必ず次の順で読む。

1. `AGENTS.md`
2. `docs/CHAMBER_RESERVE_SYSTEM_SPEC.md`
3. `docs/CHAMBER_RESERVE_LONG_TERM_IMPLEMENTATION_PLAN.md`
4. `docs/GOAL_IMPLEMENTATION_POLICY.md`
5. `docs/CHAMBER_RESERVE_SEARCH_BLOCK_INTENT_INPUT_START.md`
6. `docs/CHAMBER_RESERVE_SEARCH_BLOCK_INTENT_INPUT_GOAL.md`
7. `docs/CHAMBER_RESERVE_CHAMBER_ADMIN_CONFIGURATION_START.md`
8. `docs/CHAMBER_RESERVE_CHAMBER_ADMIN_CONFIGURATION_GOAL.md`
9. `docs/archive/2026-06-22-implemented/CHAMBER_RESERVE_PHASE3_5_IMPLEMENTATION_SUMMARY.md`
10. `package.json`
11. `src/domain/types.ts`
12. `src/domain/chamber.ts`
13. `src/domain/searchEngine.ts`
14. `src/domain/reservationRules.ts`
15. `server/db.ts`
16. `server/service.ts`
17. `server/index.ts`
18. `src/api/client.ts`
19. `src/App.tsx`
20. `src/components/search/SearchFlow.tsx`

`docs/archive/` は上記で指定した文書以外は原則読まない。

## Current State To Verify

実装開始時に、まず現状を監査する。

- `git status --short` で既存差分を確認する。
- 直前のdocsアーカイブ整理差分が残っていても、勝手に戻さない。
- `package.json` の検証コマンドを確認する。
- `server/service.ts`、`server/db.ts`、`src/domain/chamber.ts`、`src/domain/searchEngine.ts` に既に管理設定関連の実装がある場合は、重複実装せず、足りない部分を完成させる。
- 既存のテストが管理設定を一部カバーしている場合は、そのテストを読み、今回の仕様に合わせて拡張する。

## Durable Objective

管理者がチャンバー設定を版管理し、公開済み設定が利用者の候補検索と予約確定に反映される状態にする。

同時に、利用者の検索入口では4 x 3ブロックUIを「現在の特定チャンバーの空き状況」ではなく「希望ブロック条件」として扱い、未選択時のエラー、サイズのみ/位置指定の意味、候補表示後の使用ブロック表示を明確にする。

## Scope

### 1. Workspace Hygiene And Baseline Audit

- `git status --short` を確認し、既存差分を分類する。
- docsアーカイブ整理差分は維持する。
- 実装対象ファイルと既存実装の境界を短くメモする。
- 既に実装済みの機能がある場合は、再実装ではなく検証と補完に切り替える。

完了条件:

- 既存差分を戻していない。
- 既存実装済み/未実装/要修正の分類が進捗報告に残っている。

### 2. Search Block Intent Input

`docs/CHAMBER_RESERVE_SEARCH_BLOCK_INTENT_INPUT_START.md` の内容を先に完了させる。

実装すること:

- 初期表示と新規検索時の `selectedBlocks` を空にする。
- 条件入力画面では予約済み/一時停止由来のdisabled表示を出さない。
- ラベルを「希望ブロック条件」「必要ブロック範囲」など、予約済みブロック選択に見えない表現へ寄せる。
- 未選択で検索した場合は候補生成を呼ばず、明確な入力エラーを出す。
- サイズのみ/位置まで指定の意味を候補比較に自然につなげる。
- 候補カード、予約確認、予約ボード、管理者一時利用停止では既存どおり実際の使用ブロック/影響ブロックを表示する。

完了条件:

- 入力段階のブロックUIが特定チャンバーの空き状況に見えない。
- 未選択時に検索できない。
- 既存の候補表示、予約確定、予約ボード、一時利用停止表示が壊れていない。

### 3. Domain Model Hardening

チャンバー設定を予約ルールから分離し、公開済み設定を候補生成の入力として扱う。

確認/実装する型:

- `Chamber`
- `ChamberConfigRevision`
- `ChamberConditionOwnership`
- `TemperatureCycleConfig`
- `FixedConditionConfig`
- `UserManagedConditionConfig`
- `EnvironmentCondition`

守るルール:

- 温度サイクル型と一定温湿度型は、利用者が温度/湿度を定義しない。
- ユーザー温湿度管理型だけ、利用者が温度/湿度条件を指定できる。
- ユーザー温湿度管理型の同時利用は条件完全一致だけ許可する。
- 温度サイクル型の予約データにはサイクル詳細やサイクル回数を永続化しない。占有開始/終了時刻を中心に持つ。
- 設定変更により既存予約の占有時間を変えない。

完了条件:

- 型と純粋関数が、チャンバー設定と予約占有データの責務を分けている。
- 主要ルールに focused test がある。

### 4. SQLite And Seed Data

DB層で設定版を永続化する。

実装/確認すること:

- チャンバー本体と設定版を分ける。
- 設定版は `draft` / `active` / `archived` を持つ。
- publish時に既存activeをarchiveし、新しいactiveをチャンバーへ紐づける。
- archive対象がactiveの場合は直接archiveできない。先に別版をpublishする。
- 初期seedでは複数の温度サイクル型チャンバーを維持する。
- 固定条件型とユーザー温湿度管理型のテスト用設定を作れる。

完了条件:

- DBを閉じて開き直しても、active設定、draft設定、archived設定が復元できる。
- publish/archiveの整合性がserver testで確認できる。

### 5. Server API

管理設定用APIを完成させる。

期待するAPI境界:

- `GET /api/admin/chambers`
- `POST /api/admin/chambers/:id/config-revisions`
- `PATCH /api/admin/chambers/:id/config-revisions/:revisionId`
- `POST /api/admin/chambers/:id/config-revisions/:revisionId/publish`
- `POST /api/admin/chambers/:id/config-revisions/:revisionId/archive`

APIで守ること:

- 不正な設定は400で返す。
- 存在しないチャンバー/設定版は404で返す。
- active設定の直接archiveなど整合性違反は409で返す。
- 候補検索と予約確定は、公開済みactive設定だけを見る。
- stale candidate は従来どおり最終確定時に再検証する。

完了条件:

- server testで正常系と失敗系が通る。
- 検索/予約APIの既存契約を壊していない。

### 6. Client API And App State

ブラウザ側から管理設定APIを扱えるようにする。

実装/確認すること:

- `src/api/client.ts` に管理設定APIを追加する。
- App stateで `chambers` と設定版一覧を扱える。
- API失敗時はローカル状態に無音フォールバックしない。ユーザーに分かるエラーを出す。
- 予約検索と管理設定画面が同じactive設定を参照する。

完了条件:

- ブラウザ操作で設定一覧、draft作成/編集、publish、archiveが反映される。
- publish後に候補検索へ反映される。

### 7. Admin Configuration UI

管理者が設定を理解して編集できる画面にする。

必要なUI:

- 管理者ビュー内にチャンバー設定セクションを追加する。
- チャンバーごとに active / draft / archived を一覧できる。
- 管理方式を選べる。
  - 管理者管理 / 温度サイクル
  - 管理者管理 / 一定温湿度
  - ユーザー温湿度管理
- 温度サイクル型では、プログラム名、ステップ表、ステップ開始時刻、各ステップの温度/湿度/分数、25°C搬入/搬出窓を編集できる。
- 一定温湿度型では、固定条件と利用可能時間を編集できる。
- ユーザー温湿度管理型では、許容温度/湿度範囲と完全一致利用ルールを表示できる。
- publish前に、現在activeから何が変わるかを確認できる。

UI方針:

- 画面は運用ツールとして密度高く、カードを重ねすぎない。
- 既存UIのトーンに合わせる。
- lucide-reactのアイコンを、操作ボタンやタブに使う。
- 管理設定は利用者の最初の導線ではない。条件検索入口を押し下げすぎない。

完了条件:

- デスクトップで設定編集が一通りできる。
- モバイル幅で主要内容が重ならない。
- ブラウザでpublish後の検索反映を確認できる。

### 8. Search, Reservation, Board, Suspension Integration

公開済み設定が利用者フローに反映されるようにする。

確認/実装すること:

- 温度サイクル型候補は25°C搬入/搬出窓を守る。
- 一定温湿度型候補は条件一致時だけ出る。
- ユーザー温湿度管理型候補は指定条件が許容範囲内で、同時利用条件が完全一致する場合だけ出る。
- 候補カードにチャンバー設定由来の条件サマリーが出る。
- 予約確定では候補が参照した設定版IDを残す。
- 予約ボードと一時利用停止の影響表示が、設定変更後も予約占有時間を基準に安定している。

完了条件:

- 温度サイクル、一定温湿度、ユーザー温湿度管理の候補出し分けがテストされている。
- 予約確定後、設定を変更しても既存予約の占有時間が変わらない。

### 9. Validation And Browser Proof

最低限次を実行する。

```powershell
npm run test
npm run test:server
npm run build
python main.py --check
python main.py --no-open
```

ブラウザ確認では次を確認する。

- 初期検索画面でブロック未選択。
- 未選択検索で入力エラー。
- 希望ブロック選択後に候補が出る。
- 管理者画面で設定版を作成/編集/publishできる。
- publishした固定条件型チャンバーが、条件一致時のみ候補に出る。
- ユーザー温湿度管理型で、許容範囲外または条件不一致の候補が出ない。
- 予約確定、PIN編集、予約ボード、一時利用停止の既存主要フローが壊れていない。
- モバイル幅で検索と管理設定の主要UIが重ならない。

長時間ランタイムは危険なので、起動前に既存PID/状態を確認し、終了時は `python main.py --stop` または既存の停止手順で片付ける。

完了条件:

- 検証結果を `PASS` / `FAIL` / `BLOCKED` / `NOT_RUN` で明記できる。
- ブラウザ確認の対象シナリオが報告に残っている。

### 10. Documentation And Handoff

実装完了時に次を作成する。

- `docs/CHAMBER_RESERVE_OVERNIGHT_PHASE3_6_EXPANSION_IMPLEMENTATION_SUMMARY.md`
- 必要なら次フェーズ用 start/goal。

サマリーに残すこと:

- 実装した範囲。
- 変更ファイル。
- 既存実装を監査して補完した箇所。
- DB/API契約。
- 検索/予約ルールの変更点。
- ブラウザ確認結果。
- 残った課題。

## Out Of Scope

- アカウント管理、権限管理、本番認証。
- メール、Teams、Slackなど通知連携。
- 仮押さえ、承認フロー、待ち行列。
- 実機制御。
- バックアップ/復旧の本格実装。
- 高度な監査ログ。
- TeamPlannerの業務概念、タスク/Gantt/leave/roles/authの持ち込み。
- 新しい外部依存の追加。ただし既存依存で十分でない明確な理由があり、実装量を大きく減らす場合は、理由を報告してから最小限にする。

## Checkpoint Plan

長時間実装では、次の順で進める。

1. Baseline audit and worktree hygiene.
2. Search block intent input completion.
3. Domain model and reservation rule hardening.
4. SQLite config revision persistence.
5. Server API completion.
6. Client API and App state wiring.
7. Admin configuration UI.
8. Search/reservation/board/suspension integration.
9. Validation and browser proof.
10. Implementation summary and handoff.

各checkpointの終わりに、変更ファイル、検証結果、残課題、次checkpointへ進めるかを短く報告する。

## Stop Conditions

次のいずれかで停止する。

- すべてのcheckpointが完了し、検証結果を報告できる。
- 同じ根本原因で3回連続して詰まり、外部入力なしに進めない。
- 仕様と既存実装が矛盾し、ユーザー判断がないと予約データの互換性を壊す。
- 長時間ランタイムが停止できない、またはDBを壊す恐れがある。

停止時は、必ず `PASS` / `FAIL` / `BLOCKED` / `NOT_RUN` を分けて報告する。
