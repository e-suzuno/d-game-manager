---
type: Decision
title: 0001 デスクトップフレームワークに Wails v2 を採用する
description: Go バックエンド + Web フロントエンドの Wails v2 と React 19 + TypeScript の組み合わせを選んだ。
tags: [decision, wails, go, frontend]
decided_at: 2026-07-21
verified: { by: human:e-suzuno, at: 2026-07-26 }
---

# 0001 デスクトップフレームワークに Wails v2 を採用する

**決定日**: 2026-07-21

## 決定

デスクトップフレームワークに **Wails v2**（Go バックエンド + Web フロントエンド）を、フロントエンドに **React 19 + TypeScript** を採用する。

## 背景

ローカルのフォルダを走査し、`.exe` を起動し、エクスプローラーと連携する必要がある。つまり **OS のファイルシステムとプロセスに素直に触れられること**が要件の中心にある。一方で画面はコレクション型のデータベース UI で、Web の技術で作るのが最も速い。

## 帰結

- Go 側で `os` / `os/exec` を直接使えるため、フォルダ走査・exe 起動・エクスプローラー連携が素直に書ける
- UI は Web 技術で作れるので、デザインハンドオフ（HTML プロトタイプ）からの移植コストが低い
- Electron と比べて配布サイズが小さい（ランタイムを同梱せず OS の WebView を使う）
- 一方で **OS ごとの WebView の差異**を受ける。Windows は WebView2、Linux は webkit2gtk なので、開発環境と配布先で描画エンジンが違う
- フロントは `//go:embed` で実行ファイルに埋め込むため、ビルド時にフロントのビルドが先行する必要がある

## 関連

- レイヤ構成は [`overview.md`](../architecture/overview.md)
- 開発環境の選択は [`0002-develop-on-wsl2.md`](0002-develop-on-wsl2.md)
