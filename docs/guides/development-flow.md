---
type: Runbook
title: 開発フロー
description: ブランチ運用・コミット規約・PR・CI で検証される範囲・テスト戦略を、着手から取り込みまでの順に並べた手順。
tags: [meta]
status: draft
generated: { by: claude-code/opus-5, at: 2026-07-26 }
resource: .github/workflows/ci.yml
---

# 開発フロー

1タスクを着手から `main` への取り込みまで進める手順。**この文書が開発フローの正典**で、[`CLAUDE.md`](../../CLAUDE.md) の「開発フロー」節はエージェント向けの要約として同じ内容を短く持つ。

## 1. 着手

- GitHub Issue にタスクが定義されていればそれを参照する。無ければ先に Issue を起こす
- **3ステップ以上の作業、またはアーキテクチャ上の決定を含む作業は、計画を出して承認を得てから実装に入る**。変更量が 200 行を超えそうな場合も事前に確認する
- セッション内の進捗は `tasks/` 配下のファイルで追う（運用は [`tasks/README.md`](../../tasks/README.md)）

## 2. ブランチ

**`main` に直接コミット・push しない。** feature ブランチを切り、PR 経由で取り込む。

| 状況 | 命名 |
|---|---|
| Issue に紐づく作業 | `feature/#<issue番号>-<slug>` / `docs/#<issue番号>-<slug>` |
| リモートセッション（Claude Code on the web）で環境からブランチ名が指定される場合 | 指定されたブランチ名をそのまま使う（例 `claude/<topic>-<id>`） |

## 3. コミット

[Conventional Commits](https://www.conventionalcommits.org/) に従う。**要約は日本語で書いてよい。**

| type | 使いどころ |
|---|---|
| `feat` | 機能の追加 |
| `fix` | 不具合の修正 |
| `docs` | ドキュメントのみの変更 |
| `refactor` | 振る舞いを変えない内部改善 |
| `test` | テストの追加・修正 |
| `chore` | 雑務（依存更新・作業メモの整理など） |
| `ci` | CI 設定の変更 |

関連 Issue があるときは要約の前に番号を置く慣習になっている（例: `#45 fix: shallow clone で verified.at 検査が偽陽性を出す問題を修正`）。

レビュー済みドキュメントを変更した PR では、その文書の `verified.at` を1行更新する（[`docs-policy.md`](../docs-policy.md) の唯一の運用ルール）。

## 4. PR

- `.github/pull_request_template.md` の節（概要 / 変更内容 / テスト計画 / 確認事項 / 関連Issue）を埋める
- Issue を閉じる PR は本文に `Closes #<番号>` を書く
- Issue を新しく起こすときは `.github/ISSUE_TEMPLATE/` の「不具合の報告」/「機能追加・改善」を使う
- 領域をまたぐ大きな変更は、レビューできる単位に PR を分ける

## 5. CI

PR を出すと [`ci.yml`](../../.github/workflows/ci.yml) の3ジョブが走る。

| ジョブ | 内容 |
|---|---|
| Frontend build & typecheck | `npm ci` → `npm run build`（= `tsc && vite build`） |
| Frontend component tests | `npm ci` → `npx playwright install --with-deps chromium` → `npm test`（= `vitest run`） |
| Go build & tests | `gofmt` 検査 → `go vet ./...` → `go test ./...`（ルートパッケージ込み） |

`go test ./...` は `//go:embed all:frontend/dist` を満たすため空の `frontend/dist/index.html` をスタブとして作ってから実行する。フロントの実ビルドは Frontend ジョブが担保しているので、Go 側で npm を二重に走らせない。

コンポーネントテストをビルドと別ジョブにしているのは、Playwright の chromium 取得が要ることと、型・ビルドの失敗と振る舞いの失敗を切り分けて読みたいため。

**CI で検証されないもの**（＝人が確認する範囲）:

- Storybook UI での見た目とアニメーション — `vitest` が見るのは `play` 関数の振る舞いだけで、しかもアニメーションは無効化して走らせる（後述）。ピクセル単位の再現とモーダル・ドロワーの登場の動きは `npm run storybook` で人が見る
- `docs/` の OKF 適合性と運用規約 — lint はこのリポジトリに含めておらず、開発環境に用意した共通ツールで**ローカルから任意に**実行する（[`docs-policy.md`](../docs-policy.md) の「検証」）
- Windows でのビルドと NSIS インストーラー — `v*` タグ push 時の [`build-windows.yml`](../../.github/workflows/build-windows.yml) が担当（[`release.md`](release.md)）

## テスト戦略

| 対象 | 手段 | 実行場所 |
|---|---|---|
| Go のドメイン層・ユースケース層 | `go test ./...`（`internal/*` と `app_test.go`） | ローカル / CI |
| Go の書式・静的検査 | `gofmt -l .` / `go vet ./...` | ローカル / CI |
| フロントの型 | `npx tsc --noEmit`（`npm run build` に含む） | ローカル / CI |
| フロントのコンポーネントの振る舞い | Storybook stories を Vitest + Playwright/chromium で実行（`npm test` = `vitest run`）。独立した `*.test.tsx` は持たない | ローカル / CI |
| フロントの見た目とアニメーション | `npm run storybook` で目視（Hi-fi デザインの再現を含む） | 人 |
| ドキュメント | OKF バンドルの lint（[`docs-policy.md`](../docs-policy.md) の「検証」） | ローカル（任意） |
| 実際の .exe 起動・エクスプローラー連携・IME | 手動（WSLg / Windows 実機） | 人 |

振る舞いと見た目を分けているのは、**テストとして走らせるときだけアニメーションを無効化している**ため。`.storybook/preview.tsx` が Vitest のブラウザモード（`globalThis.__vitest_browser__`）を検出して、CSS アニメーションと transition の再生時間を 0 にする。モーダルやドロワーの登場アニメーションは `opacity: 0` から始まるため、`play` 関数が先頭フレームに当たると `toBeVisible()` が「要素はあるが not visible」で落ちるからで、これを放置すると flaky になる（[Issue #52](https://github.com/e-suzuno/d-game-manager/issues/52)）。裏を返すと**アニメーションそのものは CI では一度も再生されない**ので、動きを変えたときは Storybook の UI で人が見ること。

ESLint / Prettier は導入していない。

## 6. マージ

- CI が緑になってからマージする
- マージ後、`tasks/` の該当ファイルが完了したら削除する。未完項目は Issue へ移す
- 修正・指摘を受けた場合は [`tasks/lessons.md`](../../tasks/lessons.md) に教訓を追記する

## `main` のブランチ保護（推奨設定）

「`main` に直接 push しない」は現在は運用の約束にすぎず、GitHub 側で強制していない。リポジトリ設定（Settings → Branches → Add branch ruleset）で次を有効にすると機械的に守られる。

- **Require a pull request before merging**（直 push を禁止）
- **Require status checks to pass** — `Frontend build & typecheck` / `Go build & tests`
- **Require branches to be up to date before merging**

1人開発なので Require approvals（レビュー承認の必須化）は付けない。付けると自分の PR をマージできなくなる。
