---
paths:
  - "docs/**/*.md"
---

# ドキュメントの管理

- ドキュメントは `docs/` 配下に Markdown で管理する
- `docs/` は **Open Knowledge Format (OKF) v0.2 バンドル**。新規文書には frontmatter（`type` / `title` / `description` / `tags` / `verified`）が必須で、`type` と `tags` は閉じた語彙から選ぶ。規約の正典は `docs/docs-policy.md`
- 文書を追加したら、そのディレクトリの `index.md` と `docs/log.md` にも1行追記する
- デザインハンドオフを**世代番号（v1 / v2 / v3）で引用してはいけない**。「基本ハンドオフ」「調整版ハンドオフ」の固有名＋節名で指す（理由は `docs/docs-policy.md`）
- 撤回された仕様は現行文書の frontmatter の `not:`（term / why / instead）で無効化する。撤回された決定は `docs/decisions/` に `status: deprecated` ＋ `superseded_by` で残す

**この規約の適用範囲は `docs/` バンドルのみ。** `.claude/rules/` 配下は OKF バンドルの外側なので、OKF frontmatter は付けず（`paths` のみ）、`docs/index.md` や `docs/log.md` への追記も不要。
