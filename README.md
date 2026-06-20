# ChamberReserve

ChamberReserve は、社内LAN上で恒温槽の予約を管理するためのローカルWebサービスとして開発する。

利用者がチャンバーを一台ずつ確認するのではなく、試験条件、必要ブロック、希望日程から予約可能な候補を検索し、最小操作で予約を確定できることを目指す。

## Current Status

このリポジトリは実装準備段階である。現時点では、システム仕様、長期実装計画、Phase 1 実装開始文書、Codex向け作業方針を整備済み。

## Core Documents

- [Agent guide](AGENTS.md)
- [System specification](docs/CHAMBER_RESERVE_SYSTEM_SPEC.md)
- [Long-term implementation plan](docs/CHAMBER_RESERVE_LONG_TERM_IMPLEMENTATION_PLAN.md)
- [Goal implementation policy](docs/GOAL_IMPLEMENTATION_POLICY.md)
- [Phase 1 start document](docs/CHAMBER_RESERVE_PHASE1_FOUNDATION_START.md)
- [Phase 1 goal prompt](docs/CHAMBER_RESERVE_PHASE1_FOUNDATION_GOAL.md)

## Initial Implementation Target

Phase 1 は、単一の温度サイクル型チャンバーを対象にする。

- 条件検索を最初の入口にする。
- 4 x 3 のチャンバー正面ブロックを視覚的に選択する。
- 25°C 定常期間だけ搬入、搬出可能にする。
- 断片化したブロック候補は表示しない。
- 予約確定時に4桁PINを発行する。
- PINで予約変更、削除できるようにする。
- 管理者一時利用停止を通常予約より優先する。

## Development Flow

実装はフェーズ単位で進める。各フェーズは開始Markdownと `/goal` プロンプトを作成してから実装する。

次に進める作業は `docs/CHAMBER_RESERVE_PHASE1_FOUNDATION_GOAL.md` の `/goal` 実行である。
