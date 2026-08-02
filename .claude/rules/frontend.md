---
paths:
  - "frontend/**"
---

# フロントエンドの構成

`frontend/src/`、外部の状態管理ライブラリは不使用で `useState`/`useMemo` の2層構造。

- `App.tsx` — データ層 / Wails 連携のルート。`games` と `allTags` を保持し `refresh()` で再取得。全操作を楽観的更新（失敗時 `refresh()` で巻き戻し）として `LibraryPage` に渡す。Go の JSON は `toUIGame`/`toUITag` で UI 型へ正規化
- `LibraryPage.tsx` — UI 状態のルート。ビュー / 検索 / タグフィルタ / ソート / グループ / ドロワー / モーダル / トーストを管理
- `types.ts`（`UIGame`/`UITag`/タグ色パレット）、`lib/format.ts`（サイズ・日付整形、カバーのグラデーション生成）
- `wailsjs/`（`go/main/App`、`go/models.ts`、`runtime/`）は **`wails dev`/`wails build` が自動生成する。手編集しない**
- 各コンポーネントは `.tsx` + `.css` + `.stories.tsx` の3点セット。Storybook がコンポーネント開発・テストの中心（独立した `*.test.tsx` は無い）

# デザイン

- **現行の正典は `docs/specifications/library-screen.md`**（画面・インタラクション・状態）と `docs/reference/design-tokens.md`（色・タイポ・寸法）。この2つを見れば足りる
- デザインハンドオフの原本（基本 / 調整版）とプロトタイプはリポジトリに残していない。**撤回済みの仕様も含めて内容は正典側に統合済み**（撤回分は frontmatter の `not:` に構造化されている）
- Hi-fi デザイン。UIはピクセル単位で再現する。ただしデータはダミー
- ハンドオフの呼び方（世代番号で呼ばない）には規約がある。正典は `.claude/rules/docs-authoring.md` と `docs/docs-policy.md`
