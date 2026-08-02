---
type: Decision
title: 0003 SQLite ドライバに modernc.org/sqlite（pure Go）を使う
description: CGO 不要でクロスビルドが単純になるため、mattn/go-sqlite3 ではなく pure Go 実装を選んだ。
resource: internal/store/store.go
tags: [decision, sqlite, go, build]
decided_at: 2026-07-21
verified: { by: human:e-suzuno, at: 2026-07-26 }
---

# 0003 SQLite ドライバに modernc.org/sqlite（pure Go）を使う

**決定日**: 2026-07-21

## 決定

SQLite ドライバに **`modernc.org/sqlite`（pure Go 実装）** を使う。`mattn/go-sqlite3` は採用しない。

## 背景

WSL2 で開発し Windows へクロスビルドする構成（[`0002-develop-on-wsl2.md`](0002-develop-on-wsl2.md)）では、**CGO を要求するドライバがツールチェーンの複雑さを一気に増やす**。`mattn/go-sqlite3` は CGO ＋ MinGW のクロスコンパイル環境が必要になる。

## 帰結

- `CGO_ENABLED=0` のまま `wails build -platform windows/amd64` が通る。GitHub Actions のワークフローもクロスコンパイラのセットアップが不要になった
- 同じ理由で、後から入れたアイコン抽出も pure Go のライブラリ（`tc-hib/winres` ＋ `sergeymakinen/go-ico`）を選んでいる。**WSL2/Linux 上で Windows PE リソースを読める**のはこの方針の恩恵
- 一方 C 実装より実行性能は劣る。ただし本アプリの規模（ローカルのゲーム数百件、単一接続）では問題にならない
- 単一接続（`SetMaxOpenConns(1)`）で運用する。デスクトップアプリなので並行接続は不要で、PRAGMA の適用も確実になる

## 関連

- スキーマと永続化の設計判断は [`data-model.md`](../reference/data-model.md)
