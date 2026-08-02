# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.


## 前提条件

- 回答は必ず日本語でしてください
- 変更量が200行を超える可能性がある場合は、事前に確認をとってください
- 大きな変更を加える場合、まず計画を立てて提案してください
- 驚き最小の原則: 既存の命名規則・ディレクトリ構成・実装パターンに従う。新しいパターンを導入する場合は理由を説明し、承認を得てから行う。

## プロジェクト概要

購入した個人開発ゲーム（RPGツクール / Unity / Godot / WOLF RPG などの .exe を含むフォルダ）をローカルで管理するデスクトップアプリ（製品名「d-game-manager」）。
**Wails v2 (Go バックエンド) + React 19 + TypeScript + Vite** で実装。データは SQLite（`modernc.org/sqlite`、pure Go / CGO 不要）に永続化する。開発は WSL2 上で行い（`wails dev` は WSLg で GUI 表示）、
Windows 向け配布は GitHub Actions でビルドする。

## アーキテクチャ

レイヤ構成: `main.go`（起動・アセット埋め込み）→ `app.go`（Wails バインディング＝フロントから呼べる API 群 / ユースケース層）→ `internal/*`（ドメイン層）。

レイヤ別の詳細は `.claude/rules/` にあり、**該当するファイルを読むと自動でロードされる**。先に構成を知りたいときは直接読むこと。

- `.claude/rules/go-backend.md` — Go 各パッケージの責務・データ保存先
- `.claude/rules/frontend.md` — フロント構成とデザインの正典
- `.claude/rules/specifications.md` — 確定済み仕様の正典テーブル
- `.claude/rules/docs-authoring.md` — `docs/` 執筆規約（OKF）

詳細ドキュメントは OKF v0.2 バンドル `docs/` にある。**目録は `docs/index.md`**（ここにファイル名を列挙すると二重管理でずれるため入口だけを示す）。実装前に該当 concept を確認すること。

## 確定済みの仕様

**正典は `docs/specifications/`。** 仕様の一覧表は `.claude/rules/specifications.md` にある。

特に外しやすい前提:

- **プレイ時間・進行状況の自動取得はしない**（プロセス監視をしないため）。UI にも列・バッジ・統計・ソートキーとして持たない
- **統計（総数/総容量/お気に入り/未整理）は全ゲーム基準**で算出する（絞り込みに連動しない）
- **ゲーム本体のフォルダをアプリが変更・削除することはない**（アプリの不変条件）

## 主要機能

1. ライブラリ表示（テーブル / ギャラリー切替）
2. 検索・ビュー切替（すべて / お気に入り / 未整理）・タグ絞り込み
3. 詳細ドロワー（タグ編集、ゲーム起動、フォルダを開く）
4. フォルダ取り込み（ドロップ → スキャン → レビュー → 登録）
5. ゲームの起動（.exe 実行）
6. 保存先の整合性（実体が消えたゲームの検出・保存先の再指定・見つからないゲームの一括削除）

## よく使うコマンド

前提: Wails CLI は `go install github.com/wailsapp/wails/v2/cmd/wails@v2.13.0`。フロントのパッケージマネージャは **npm**（`frontend/` 配下）。

- 開発サーバ（ホットリロード、WSLg で GUI 表示）: `wails dev -tags webkit2_41`
- 本番ビルド（Linux）: `wails build -tags webkit2_41` → `build/bin/d-game-manager`（Ubuntu 24.04 は webkit2gtk 4.1 のためタグが要る。Windows クロスビルドには不要）
- Windows クロスビルド: `wails build -platform windows/amd64` → `.exe`（配布は `.github/workflows/build-windows.yml` が `v*` タグ push で NSIS インストーラごと生成）
- 環境確認: `wails doctor`
- Go テスト全実行: `go test ./...`（単一: `go test ./internal/scan/ -run TestName`）
- フロント型チェック: `frontend/` で `npx tsc --noEmit`（`npm run build` = `tsc && vite build` にも含む）
- フロントのテスト: `frontend/` で `npm test`（= `vitest run`。Storybook stories を Vitest + Playwright/chromium で実行）
- Storybook: `frontend/` で `npm run storybook`（ポート 6006）


## 開発フロー

**正典は `docs/guides/development-flow.md`**（ブランチ・コミット・PR・CI が検証する範囲・テスト戦略・ブランチ保護の推奨設定）。以下はエージェント向けの要約。リリース手順は `docs/guides/release.md`。

### git 運用
- **`main` に直接コミット・push しない**。必ず feature ブランチを切り、PR 経由で `main` に取り込む
- コミットは Conventional Commits（`feat:` / `fix:` / `docs:` など、要約は日本語可）

### 計画モード
- 3ステップ以上のタスク、またはアーキテクチャ上の決定が必要な場合は必ず計画モードに入る
- 問題が起きたら即座に停止して再計画。無理に進めない

### タスク管理
- GitHub Issue にタスクが定義されている場合はそれを参照する（未着手・対応中の課題は Issue が正）
- セッション内の進捗追跡は `tasks/` 配下に作業トピックごとのファイルを作る。運用ルールは `tasks/README.md`
- 計画を書き、確認を得てから実装開始
- 修正を受けた後は `tasks/lessons.md` を更新

### サブエージェント戦略
- メインのコンテキストウィンドウをきれいに保つため、サブエージェントを活用
- 調査、探索、並行分析をサブエージェントにオフロード
- 1つのサブエージェントにつき1つのタスクを割り当てる
- サブエージェントはタスクの精度でモデルを切り分ける

## 核となる原則
- **シンプルさ第一**: 変更を最小限にし、コードへの影響を抑える
- **手抜きなし**: 根本原因を見つける。一時しのぎの修正はしない
- **影響の最小化**: 必要な部分のみに触れ、バグの混入を避ける
