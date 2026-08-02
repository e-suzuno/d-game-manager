---
type: Architecture
title: アーキテクチャ概要
description: Go バックエンド（Wails v2）と React フロントエンドの2部構成、各パッケージの責務、依存の向き。
tags: [go, frontend, wails]
verified: { by: human:e-suzuno, at: 2026-08-02 }
not:
  - term: "タグは axis（genre / tool / other）の3軸で区別する統一モデル"
    why: "初期の方針。制作ツールは1ゲーム=1ツールでタグの多対多モデルが過剰なため、調整版ハンドオフ 変更点3 で属性化して撤回した。tags.axis の CHECK 制約に 'tool' が残るのは SQLite が CHECK の ALTER をできない歴史的経緯（internal/store/store.go:19）で、アプリからは二度と作られない"
    instead: "タグ軸は genre / other の2軸。制作ツールは games.tool の一級属性（既定「未判別」）"
---

# アーキテクチャ概要

「d-game-manager」の全体構成。Go バックエンド（Wails v2）と React フロントエンドの2部構成で、間を Wails のバインディングがつなぐ。

## レイヤ構成

```
main.go              起動・アセット埋め込み・カバー配信ハンドラ
  └ app.go           Wails バインディング（フロントから呼べる API 群 / ユースケース層）
      └ internal/    ドメイン層
          ├ store/   SQLite リポジトリ層（ドメイン型 Game / Tag と CRUD）
          ├ scan/    フォルダ取り込み時の .exe 検出・制作ツール推定
          ├ health/  登録済みゲームの実体（フォルダ・exe）の存在確認
          ├ icon/    exe の PE リソースからのアイコン抽出（既定カバー生成）
          └ launch/  ゲーム起動・フォルダ表示
```

依存の向きは上から下の一方向。`internal/*` はドメインロジックのみを持ち、Wails や UI に依存しない。フロントに公開する API を足す・変えるのは `app.go` に集約する。

## Go バックエンド

- **`main.go`** — `//go:embed all:frontend/dist` でビルド済みフロントを実行ファイルに埋め込む。カバー画像だけは埋め込みアセットに無いため、`/covers/` パスを独自の AssetServer ハンドラ（ユーザーデータフォルダを配信する `http.FileServer`）で処理する。
- **`app.go`** — `App` 構造体にフロント公開メソッドを集約（ライブラリ取得・タグ編集・お気に入り・取り込み・起動・カバー編集など）。公開 API の一覧は [`app-api.md`](../reference/app-api.md) を参照。起動時に DB を開けなかった場合はエラーダイアログを出して終了し、以降 API が呼ばれても「初期化されていない」エラーを返す。
- **`internal/store/`** — SQLite リポジトリ層。ドメイン型 `Game` / `Tag` と CRUD を持つ。スキーマは `store.go` の `schema` 定数、後方互換の ALTER は `migrate()`。タグは `axis`（**genre / other の2軸**）で区別し、制作ツールは `games.tool` の一級属性として持つ。詳細は [`data-model.md`](../reference/data-model.md)。
- **`internal/scan/`** — 取り込み時の .exe 検出。exe 選択は「ハード除外 → helper-only 除外 → スコアリング（段階式スコアで最上位1つを採用）」の3層。制作ツール推定もここ。スコアリング再設計の設計記録は `scan.go` のパッケージコメントにある。詳細は [`import-flow.md`](../processes/import-flow.md)。
- **`internal/health/`** — 登録済みゲームの実体（フォルダ・exe）が今もあるかの確認。`stat` を並列に走らせ、エラーは種類を問わず「不在」として扱う（未接続ドライブや権限エラーも起動できない状態なので正常と報告しない）。判定結果は DB に永続化しない実行時の値で、**これを根拠に行を自動削除することはしない**。詳細は [`app-api.md`](../reference/app-api.md) の「保存先の存在確認」。
- **`internal/icon/`** — 取り込んだ exe の PE リソースからメインアイコンを取り出し、既定カバー用の PNG を生成する。pure Go 実装（`winres` + `go-ico`）で WSL2/Linux でも動作し、失敗はログのみのベストエフォート。詳細は [`app-api.md`](../reference/app-api.md) の「アイコン抽出による既定カバー」。
- **`internal/launch/`** — ゲーム起動（作業ディレクトリをゲームフォルダに設定して exec、プロセス監視はしない）とフォルダ表示（WSL では `wslpath -w` + `explorer.exe`）。

**データ保存先**: `os.UserConfigDir()/d-game-manager/`（Linux `~/.config/…`、Windows `%AppData%\…`）配下に `library.db` と `covers/`。

## フロントエンド

`frontend/src/` 配下。外部の状態管理ライブラリは使わず、`useState` / `useMemo` の2層構造で状態を管理する。

- **`App.tsx`** — データ層 / Wails 連携のルート。`games` と `allTags` を保持し `refresh()` で再取得する。全操作を**楽観的更新**（UI を即時反映し、失敗時は `refresh()` で巻き戻す）として `LibraryPage` に渡す。Go の JSON は `toUIGame` / `toUITag` で UI 型に正規化する。
- **`LibraryPage.tsx`** — UI 状態のルート。ビュー / 検索 / タグフィルタ / 制作ツールフィルタ（`toolFilters`）/ ソート / グループ / ドロワー / モーダル / トーストを管理する。
- **`types.ts`** — `UIGame` / `UITag` とタグ色パレット。**`lib/format.ts`** — サイズ・日付整形、カバーの手続き的グラデーション生成。
- **`wailsjs/`**（`go/main/App`、`go/models.ts`、`runtime/`）は `wails dev` / `wails build` が自動生成する。**手編集しない**。

各コンポーネントは `.tsx` + `.css` + `.stories.tsx` の3点セットで構成し、Storybook がコンポーネント開発・テストの中心（独立した `*.test.tsx` は持たない）。

## データフロー

起動・取り込み・編集・カバー表示などがレイヤをどう流れるかは [`data-flow.md`](data-flow.md) にまとめている。
