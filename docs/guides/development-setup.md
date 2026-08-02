---
type: Runbook
title: 開発環境セットアップ
description: WSL2 上に Go / Node / Wails を用意して開発・ビルドするための手順と既知の制限。
tags: [build, meta]
stale_after: 2027-01-31
verified: { by: human:e-suzuno, at: 2026-08-02 }
---

# 開発環境セットアップ

WSL2 (Ubuntu 24.04) 上で開発する。2026-08-02 時点のセットアップ記録。

## 必要ツール

| ツール | バージョン | 導入方法 |
|---|---|---|
| Go | 1.25.7 | 公式 tarball を `/usr/local/go` に展開 |
| Node.js | 24 | nvm (`nvm install 24`) |
| Wails CLI | v2.13.0 | `go install github.com/wailsapp/wails/v2/cmd/wails@v2.13.0` |
| Linux 依存 | — | `sudo apt install build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev` |

- Go は上記の実導入バージョン（1.25.7）で開発している。`go.mod` の `go 1.25.0` は**最低要求バージョン**の宣言であり、実際に入れるツールチェーンとは別物（1.25.0 以上なら動く）
- Node.js は CI（`.github/workflows/ci.yml`）が 24 を使うのでバージョンを明示して揃える
- **Ubuntu 24.04 では `libwebkit2gtk-4.0-dev` が存在しない**（webkit2gtk が 4.1 に置き換わったため）。`wails doctor` は `libwebkit: Not Found` と表示したうえで 4.0 のインストールを案内してくるが、**従わず 4.1 を入れる**。4.1 を使うには Linux 向けの `wails` コマンドにビルドタグ `-tags webkit2_41` が要る

- PATH 設定は `~/.bashrc` の**対話ガードより前**に記載（非対話シェルでも Go / nvm の Node が使えるようにするため。interop 経由で Windows 側の node/npm が誤って使われる事故を防ぐ）
- 環境確認: `wails doctor`

## よく使うコマンド

```bash
wails dev -tags webkit2_41      # 開発モード起動（ホットリロード、WSLg で GUI 表示）
wails build -tags webkit2_41    # 本番ビルド → build/bin/d-game-manager
```

フロントエンド単体:

```bash
cd frontend
npm install        # 依存インストール
npx tsc --noEmit   # 型チェック
```

## WSL 開発時の既知の制限

- **日本語入力（IME）が効かない**: WSLg の GUI アプリには Windows の IME が届かないため、タイトル編集などで日本語を直接入力できない。**クリップボード貼り付け（Ctrl+V）は可能**なので開発中はそれで代用する。WSL に fcitx5-mozc を入れれば解消できるが必須ではない。Windows ビルド（WebView2）では問題なし
- **ウィンドウタイトルの日本語が豆腐になる**: WSLg のタイトルバー描画に日本語フォントがないため。タイトルを ASCII のみにして回避済み（Windows では日本語も表示可）

## Windows 向けビルド

- **WSL からのクロスビルド**: `wails build -platform windows/amd64` で `build/bin/d-game-manager.exe` が生成できる（CGO 不要構成のため動作する。2026-08-02 再検証済み）。**Windows 向けは webkit2gtk を使わないので `-tags webkit2_41` は不要**。`/mnt/c` 配下にコピーすれば Windows で実行可能
- **NSIS インストーラー込みのビルド**: GitHub Actions（`.github/workflows/build-windows.yml`）で行う。手動実行（workflow_dispatch）か、`v*` タグの push でリリースが作られる

## プロジェクト構成

レイヤ構成・各パッケージの責務・フロントの構造は [`overview.md`](../architecture/overview.md) にまとめている。ビルド関連のファイルだけ補足すると:

- `wails.json` — Wails プロジェクト設定（`productName` / バージョン等）
- `build/` — ビルド資材と成果物（`build/bin` は git 管理外）
- `frontend/wailsjs/` — Wails が自動生成するバインディング（手編集しない）

## アプリアイコン

`build/appicon.png` / `build/windows/icon.ico` / `frontend/public/favicon.*` は
リポジトリ直下の `app-icon/` のマスター SVG から生成している。差し替えるときは SVG を直してから
`python3 app-icon/generate.py` で再生成する（詳細は [`app-icon.md`](app-icon.md)）。
