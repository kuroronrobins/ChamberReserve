# ChamberReserve Main Launcher Start

作成日: 2026-06-21

## 目的

Phase 1 の React UI を、ルートの `main.py` から軽く起動できるようにする。

TeamPlanner のローカルWebアプリ方針に合わせ、利用者の入口は `python main.py` とし、長時間の foreground 起動や曖昧なプロセス再利用を避ける。

## 実装対象

- `main.py`
- README の起動手順

## 対象外

- サーバーAPI
- SQLite 永続化
- live DB
- 本番LAN運用
- APIプロキシ
- バックアップ、復旧、集計

## 方針

- ChamberReserve 専用のポート、PID、ログ名を使う。
- Vite dev server を長時間起動せず、ビルド済み `dist` を Python の軽い HTTP サーバーで配信する。
- 既存の正常な ChamberReserve UI が動いていれば再利用する。
- stale PID は検出して片付ける。
- `--check` は依存と設定を短く検査するだけで、サーバーを起動しない。
- `--status` は起動状態を確認する。
- `--stop` は `main.py` が管理する UI プロセスを停止する。
- `--no-open` は自動ブラウザ起動を抑止する。
- `dist` がない場合は起動せず、`npm run build` を明示実行するよう促す。

## 検証

- `python main.py --check`
- `python main.py --status`
- `python main.py --no-open`
- `python main.py --stop`
- `npm run test`
- `npm run build`
