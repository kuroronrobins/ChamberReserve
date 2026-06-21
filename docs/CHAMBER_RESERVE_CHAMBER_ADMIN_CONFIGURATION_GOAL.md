# ChamberReserve Chamber Admin Configuration Goal

```text
/goal ChamberReserve「チャンバー管理設定基盤」を、管理者がチャンバーごとに管理方式と温湿度設定を編集し、その公開中設定を予約候補生成へ反映できる状態まで実装してください。

# Objective
チャンバーごとに「管理者管理」「ユーザー温湿度管理」を切り替えられる管理者画面を作る。管理者管理では「温湿度サイクル」「一定温湿度」を設定できるようにし、温湿度サイクルはステップ表と時間グラフで編集し、ステップ1開始時刻から全ステップ時刻を自動計算する。予約はサイクル数やサイクル詳細を持たず、占有開始/終了を中心に保存、競合判定する。

# Read First
- AGENTS.md
- docs/CHAMBER_RESERVE_SYSTEM_SPEC.md
- docs/CHAMBER_RESERVE_LONG_TERM_IMPLEMENTATION_PLAN.md
- docs/GOAL_IMPLEMENTATION_POLICY.md
- docs/CHAMBER_RESERVE_PHASE3_5_IMPLEMENTATION_SUMMARY.md
- docs/CHAMBER_RESERVE_CHAMBER_ADMIN_CONFIGURATION_START.md
- package.json
- src/domain/types.ts
- src/domain/chamber.ts
- src/domain/reservationRules.ts
- server/db.ts
- server/service.ts
- src/App.tsx

# Scope
- チャンバー設定版モデル draft/active/archive。
- 管理方式: 管理者管理 / ユーザー温湿度管理。
- 管理者管理の種別: 温湿度サイクル / 一定温湿度。
- 温湿度サイクルのステップ表、周期計算、ステップ1開始時刻からの時刻計算。
- 温度/湿度の時間推移グラフ編集UI。
- ユーザー温湿度管理の許容範囲と完全一致同時利用ルール。
- 予約永続データを、サイクル/固定条件型では占有開始/終了中心へ寄せる。
- 公開中チャンバー設定を使った候補生成、予約確定、ボード、PIN編集/削除、一時利用停止影響表示。

# Out of Scope
- アカウント管理、権限管理、本番認証。
- 通知連携。
- 高度な監査ログ。
- 実機制御。
- バックアップ/利用率レポート。
- 複雑な温湿度許容幅による同時利用判定。ユーザー温湿度管理は完全一致のみ。

# Constraints
- 最初の利用者画面は引き続き空き検索にする。
- チャンバー選択起点に戻さない。
- TeamPlannerの業務概念を持ち込まない。
- 既存の未コミット変更を戻さない。
- 設定変更で既存予約の占有時間を変えない。
- 候補一覧には予約可能な候補だけを出す。
- ブラウザで見えるUIはチャンバー管理専用として洗練させる。

# Validation
- npm run test
- npm run test:server
- npm run build
- ブラウザで管理者画面を開き、チャンバー管理、管理方式切替、温湿度サイクル表編集、グラフ連動、ステップ1開始時刻変更、一定温湿度設定、ユーザー温湿度管理設定、設定公開、検索候補反映、予約確定、PIN編集/削除、一時利用停止影響表示を確認する。

# Progress
チェックポイントごとに、変更ファイル、検証結果、残件、ブロック有無を短く報告する。

# Stop When
docs/CHAMBER_RESERVE_CHAMBER_ADMIN_CONFIGURATION_START.md の完了条件を満たし、テスト、ビルド、ブラウザ確認の結果を PASS / FAIL / BLOCKED / NOT_RUN で報告できたら完了。
```
