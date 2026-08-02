---
type: Decision
title: 0002 開発は WSL2 上で行い、Windows 向けビルドだけを Windows / CI に任せる
description: 当初は Windows 側で開発する決定だったが、Claude Code との相性を理由に同日 WSL2 へ方向転換した。
tags: [decision, build, meta]
decided_at: 2026-07-21
verified: { by: human:e-suzuno, at: 2026-08-02 }
supersedes: 開発は Windows 側で行う（リポジトリも Windows 側へ移動、Claude Code も Windows で起動）
---

# 0002 開発は WSL2 上で行い、Windows 向けビルドだけを Windows / CI に任せる

**決定日**: 2026-07-21（同日中の方向転換）

## 決定

開発は **WSL2 (Ubuntu) 上**で行う。`wails dev` は WSLg で GUI 表示する。**Windows 向けの最終ビルドのみ** Windows 側または GitHub Actions で行う。

## 背景

配布先が Windows なので、当初は「開発も Windows 側で行う（リポジトリも Windows 側へ移動し、Claude Code も Windows で起動する）」と決めた。しかし **Windows 側での Claude Code の動作が相性が悪く**、同日中に方向転換した。

## 帰結

- WSL2 に Go / Node / Wails の Linux 依存（`libgtk-3-dev` / `libwebkit2gtk`）を入れる（webkit2gtk の版とビルドタグは [`development-setup.md`](../guides/development-setup.md) が正典）
- `.exe` の起動とエクスプローラー連携は **WSL interop**（`/mnt/c` ＋ `wslpath -w` ＋ `explorer.exe`）で検証できる
- Windows 向けビルドは `wails build -platform windows/amd64` のクロスビルドで通る（CGO 不要構成のおかげ → [`0003-sqlite-pure-go.md`](0003-sqlite-pure-go.md)）
- NSIS インストーラ込みのリリースは GitHub Actions（`.github/workflows/build-windows.yml`）に任せる
- **WSLg 固有の制限を受け入れる** — 日本語入力（IME）が効かない（クリップボード貼り付けで代用）、ウィンドウタイトルの日本語が豆腐になる（タイトルを ASCII にして回避）。どちらも Windows ビルドでは問題にならない
- 実機での最終動作確認は WSL2 では代替できず、別途必要になる

## 関連

- 環境構築手順と既知の制限は [`development-setup.md`](../guides/development-setup.md)
