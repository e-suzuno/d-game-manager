# d-game-manager

購入した個人開発ゲーム（RPGツクール / Unity / Godot / WOLF RPG などの `.exe` を含むフォルダ）を、ローカルで管理するデスクトップアプリです。フォルダを取り込むと `.exe` を自動検出し、制作ツールを判別して属性として記録します。ジャンルや進行状況はタグとして手動で整理でき、アプリからそのままゲームを起動できます。

## 主な機能

- **ライブラリ表示** — テーブル / ギャラリーの切り替え
- **検索・絞り込み** — タイトル・タグ検索、ビュー切替（すべて / お気に入り / 未整理）、タグ絞り込み（ジャンル同士 OR・その他タグ同士 OR・両群の間 AND）、制作ツール絞り込み（複数選択 OR）、並び替え・グループ化
- **フォルダ取り込み** — フォルダ選択 → `.exe` 自動検出 → 制作ツール判別 → レビュー → 登録。複数ゲームが入った親フォルダもまとめて取り込み可能
- **詳細ドロワー** — タグ編集（9色から色選択）、タイトル変更、カバー画像の設定、ゲーム起動、フォルダを開く
- **ゲーム起動** — `.exe` を実行（作業ディレクトリはゲームフォルダ。プロセス監視はしない）

### 設計方針

- 制作ツールは **`Game.tool` の一級属性**（判別できないものは「未判別」として保存）。ジャンル・進行状況は **ユーザーが手で付けるタグ**（genre / other の2軸）
- プレイ時間・進行状況の **自動記録はしない**（プロセス監視をしない方針）
- 統計（総数 / 総容量 / お気に入り / 未整理）は全ゲーム基準で算出
- ゲーム本体のフォルダをアプリが変更・削除することはない

## 技術スタック

- **バックエンド**: Go + [Wails v2](https://wails.io/)（v2.13.0）
- **フロントエンド**: React 19 + TypeScript + Vite
- **データ永続化**: SQLite（`modernc.org/sqlite`、pure Go / CGO 不要）
- **UI 開発**: Storybook（各コンポーネントは `.tsx` + `.css` + `.stories.tsx` の3点セット）

### アーキテクチャ

```
main.go        起動・アセット埋め込み
  └ app.go     Wails バインディング（フロントから呼べる API 群 / ユースケース層）
      └ internal/
          ├ store/   SQLite リポジトリ層（ドメイン型 Game / Tag と CRUD）
          ├ scan/    フォルダ取り込み時の .exe 検出・制作ツール推定
          ├ health/  登録済みゲームの実体（フォルダ・exe）の存在確認
          ├ icon/    exe からのアイコン抽出（既定カバーの生成）
          └ launch/  ゲーム起動・フォルダ表示
```

フロントエンド（`frontend/src/`）は外部状態管理ライブラリを使わず `useState` / `useMemo` の2層構造。`App.tsx` がデータ層 / Wails 連携、`LibraryPage.tsx` が UI 状態のルート。

## データの保存場所

| OS | 場所 |
|---|---|
| Windows | `%AppData%\d-game-manager\`（`library.db` + `covers\`） |
| Linux / WSL | `~/.config/d-game-manager/` |

## ライセンス

著作権者が個人の学習を目的として開発している、権利を留保した非オープンソースの成果物です（All rights reserved）。オープンソースライセンスの下では提供していません。

- **使うこと**は歓迎します。Releases のビルド済みバイナリを個人的な利用のためにダウンロード・実行すること、および本リポジトリを閲覧し学習目的で clone してローカルで改変することを許諾しています
- **再配布・販売**は許諾していません
- **無保証・免責**です。本アプリは利用者が指定したフォルダを走査し、利用者が指定した実行ファイルを起動します。自己責任でご利用ください

正確な条件は [`LICENSE`](LICENSE) を参照してください。

同梱している第三者ソフトウェアとフォントのライセンス表示は [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) にあります。

## 開発

WSL2 (Ubuntu) 上で開発し、`wails dev` は WSLg で GUI 表示されます。

### 必要ツール

| ツール | バージョン | 導入方法 |
|---|---|---|
| Go | 1.25.7 | 公式 tarball を `/usr/local/go` に展開 |
| Node.js | 24 | nvm (`nvm install 24`)。パッケージマネージャは **npm** |
| Wails CLI | v2.13.0 | `go install github.com/wailsapp/wails/v2/cmd/wails@v2.13.0` |
| Linux 依存 | — | `sudo apt install build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev` |

Go は上記の実導入バージョンで開発しています。`go.mod` の `go 1.25.0` は**最低要求バージョンの宣言**で、入れるツールチェーンとは別物です（1.25.0 以上なら動きます）。

Ubuntu 24.04 では webkit2gtk が **4.1** に置き換わっており、`libwebkit2gtk-4.0-dev` は提供されていません（`wails doctor` は 4.0 を案内してきますが従わないでください）。4.1 を使うため、**Linux 向けの `wails` コマンドにはビルドタグ `-tags webkit2_41` が必要**です。

環境確認は `wails doctor`。詳細は [`docs/guides/development-setup.md`](docs/guides/development-setup.md) を参照。

### よく使うコマンド

```bash
# 開発サーバ（ホットリロード、WSLg で GUI 表示）
wails dev -tags webkit2_41

# 本番ビルド（Linux）→ build/bin/d-game-manager
wails build -tags webkit2_41

# Windows クロスビルド → build/bin/d-game-manager.exe（webkit を使わないのでタグ不要）
wails build -platform windows/amd64

# Go テスト
go test ./...

# フロント型チェック（frontend/ 配下）
npx tsc --noEmit

# フロントのテスト（Storybook stories を Vitest + Playwright/chromium で実行）
npx vitest

# Storybook（ポート 6006）
npm run storybook
```

> **注意**
> - `frontend/wailsjs/` は Wails が自動生成するため手編集しない
> - ESLint / Prettier は導入されていない

## 配布ビルド

Windows 向けの配布は GitHub Actions（[`.github/workflows/build-windows.yml`](.github/workflows/build-windows.yml)）で行います。手動実行（`workflow_dispatch`）か、`v*` タグの push で NSIS インストーラー込みのリリースが生成されます。バージョン更新からタグ push・Release 公開までの手順は [`docs/guides/release.md`](docs/guides/release.md) にあります。

## 不具合の報告について

個人の学習用プロジェクトのため、**プルリクエストは受け付けていません**。ライセンス上も再配布・改変物の公開は許諾していません。

不具合や気づいた点は [Issue](https://github.com/e-suzuno/d-game-manager/issues) で報告してください。ただし個人開発のため、対応やサポートをお約束するものではありません。

開発者向けのブランチ運用・コミット規約・PR・CI が検証する範囲・テスト戦略は [`docs/guides/development-flow.md`](docs/guides/development-flow.md) にまとめています。

## ドキュメント

`docs/` は　Open Knowledge Format (OKF) のルールを採用しています。
全文書の目録は [`docs/index.md`](docs/index.md) にあります（ここに一覧を複製すると二重管理でずれるため、入口だけを示します）。

よく参照するもの:

| ドキュメント | 内容 |
|---|---|
| [`architecture/overview.md`](docs/architecture/overview.md) | レイヤ構成・各パッケージの責務・依存の向き |
| [`reference/app-api.md`](docs/reference/app-api.md) | フロントに公開する API の契約 |
| [`guides/development-setup.md`](docs/guides/development-setup.md) | 開発環境セットアップ・WSL の既知の制限 |
| [`guides/development-flow.md`](docs/guides/development-flow.md) | ブランチ・コミット・PR・CI・テスト戦略 |
| [`guides/release.md`](docs/guides/release.md) | リリース手順（バージョン更新・タグ push・配布物） |
| [`guides/user-guide.md`](docs/guides/user-guide.md) | 使い方 |
