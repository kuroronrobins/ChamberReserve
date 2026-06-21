# ChamberReserve

ChamberReserve は、社内LAN上で恒温槽の予約を管理するためのローカルWebサービスとして開発する。

利用者がチャンバーを一台ずつ確認するのではなく、試験条件、必要ブロック、希望日程から予約可能な候補を検索し、最小操作で予約を確定できることを目指す。

## Current Status

Phase 3.5 時点では、React + Vite + TypeScript のブラウザUI、Node.js API、SQLite 永続化、軽量 `main.py` ランチャーがローカル確認用に動作する。

現在のUIでは、条件検索から複数温度サイクル型チャンバー候補を比較し、4 x 3 ブロック、25°C搬入/搬出窓、サイクル実施量、所属部署、予約確定、4桁PIN編集/削除、管理者一時利用停止まで確認できる。

## Core Documents

- [Agent guide](AGENTS.md)
- [System specification](docs/CHAMBER_RESERVE_SYSTEM_SPEC.md)
- [Long-term implementation plan](docs/CHAMBER_RESERVE_LONG_TERM_IMPLEMENTATION_PLAN.md)
- [Goal implementation policy](docs/GOAL_IMPLEMENTATION_POLICY.md)
- [Phase 1 start document](docs/CHAMBER_RESERVE_PHASE1_FOUNDATION_START.md)
- [Phase 1 UI/UX execution plan](docs/CHAMBER_RESERVE_PHASE1_UI_UX_EXECUTION_PLAN.md)
- [Phase 1 goal prompt](docs/CHAMBER_RESERVE_PHASE1_FOUNDATION_GOAL.md)
- [Phase 2 server persistence summary](docs/CHAMBER_RESERVE_PHASE2_IMPLEMENTATION_SUMMARY.md)
- [Phase 3 multi chamber summary](docs/CHAMBER_RESERVE_PHASE3_IMPLEMENTATION_SUMMARY.md)
- [Phase 3.5 UI/UX refinement summary](docs/CHAMBER_RESERVE_PHASE3_5_IMPLEMENTATION_SUMMARY.md)

## Phase 1 Initial Implementation Target

Phase 1 は、単一の温度サイクル型チャンバーを対象に、サーバー実装前にUI/UXを固める。

- 条件検索を最初の入口にする。
- 4 x 3 のチャンバー正面ブロックを視覚的に選択する。
- 25°C 定常期間だけ搬入、搬出可能にする。
- 断片化したブロック候補は表示しない。
- 予約確定時に4桁PINを発行する。
- PINで予約変更、削除できるようにする。
- 管理者一時利用停止を通常予約より優先する。
- この段階ではサーバーAPIとSQLite永続化は作らず、ブラウザ上のモックデータまたはローカル状態で体験を確認する。

## Development Flow

実装はフェーズ単位で進める。各フェーズは開始Markdownと `/goal` プロンプトを作成してから実装する。

次に進める作業は、Phase 3.5 の到達点を基準に固定条件型チャンバー対応へ進むか、現在の差分をコミット単位に分けて確定することである。

## Local UI Launcher

ローカル確認用UIは、ルートの軽量入口から起動できる。入口はビルド済み `dist` を Python の軽いHTTPサーバーで配信し、Phase 2 以降は Node.js API も同時に管理する。

```powershell
python main.py
```

主な操作:

- `python main.py --check`: Node.js、npm、Vite などの前提確認だけを行う。
- `python main.py --no-open`: UIを起動するがブラウザを開かない。
- `python main.py --status`: 管理対象のUI状態を表示する。
- `python main.py --stop`: `main.py` が起動したUIを停止する。

`dist` がない場合や最新ソースを反映したい場合は、先に `npm run build` を実行する。

既定URLは `http://127.0.0.1:5178/`。TeamPlanner と混同しないように、PID、ログ、環境変数名は ChamberReserve 専用にしている。

## Phase 2 Local Runtime

Phase 2 では `main.py` が静的 UI と Node.js API を一緒に管理する。UI は `5178`、API は `8798` を既定で使い、ブラウザからは同じ UI origin の `/api` として呼び出す。

主な追加コマンド:

- `npm run server`: API だけを起動する。
- `npm run test:server`: SQLite 永続化とサーバー側予約判定を検証する。

実装結果と API / DB / 判定メモは `docs/CHAMBER_RESERVE_PHASE2_IMPLEMENTATION_SUMMARY.md` を参照する。

## Phase 3 Multi Chamber Search

Phase 3 では、条件検索から複数の温度サイクル型チャンバー候補を横断表示できるようにした。対象チャンバーを先に選ぶのではなく、候補カード、予約ボード、編集画面、管理者一時利用停止でチャンバー名を確認する。

実装結果と Phase 4 への引き継ぎは `docs/CHAMBER_RESERVE_PHASE3_IMPLEMENTATION_SUMMARY.md` を参照する。
