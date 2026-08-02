---
type: Data Model
title: データモデル
description: SQLite のスキーマとライフサイクル規則、永続化にまつわる設計判断。
resource: internal/store/store.go
tags: [go, sqlite]
verified: { by: human:e-suzuno, at: 2026-07-25 }
---

# データモデル

SQLite による永続化。実装は `internal/store/`。

## 設計判断

- **ドライバ: `modernc.org/sqlite`（pure Go）** — CGO 不要のため、WSL2 での開発と将来の Windows 向けクロスビルドの両方でツールチェーンが単純になる（`mattn/go-sqlite3` は CGO + MinGW が必要）
- **DB の場所**: `os.UserConfigDir()/d-game-manager/library.db`（Linux: `~/.config/...`、Windows: `%AppData%\...`）
- **制作ツールは一級属性**（調整版ハンドオフ 変更点3）: `games.tool` カラムに保持する。既定値は「未判別」（空文字は保存時に「未判別」へ正規化）。旧仕様では tool 軸タグで表現していたが、1ゲーム=1ツールでありタグの多対多モデルが過剰なため属性化した
  - 旧 tool 軸タグからの backfill 移行は**実装しない**（正式リリース前で移行対象データが無いため）
- **タグモデル**: ジャンル・進行状況などユーザーが手動で付ける分類は `tags` テーブルで扱う。軸は **genre / other の2軸**。`axis` の CHECK 制約に `'tool'` が残るのは歴史的経緯（SQLite は CHECK の ALTER ができず、制約変更にはテーブル再作成が必要なためコストを回避）。アプリからは tool 軸タグを二度と作らない（`AddTag` 経路では未知の axis を other に丸め、`CreateTag` / `SetTagAxis` では拒否する）ことで実質無効化している
- **タグの axis は作成時に決まり、タグ管理から変更（性質変換）できる**（調整版ハンドオフ 変更点4）。同名タグを別 axis で追加しようとした場合は既存タグ（元の axis）が使われる。明示的な変換は `SetTagAxis`（genre ↔ other、color は維持）で行う
- **タグ名は登録経路によらず TrimSpace してから保存する**（`AddTag` / `CreateTag` / `RenameTag` すべて共通）。前後空白の違いだけで別タグが併存するのを防ぐため。既存データに残る非 trim 名の backfill は行わない（正式リリース前で移行対象データが無いため）
- **実体の有無（`Game.Missing`）は永続化しない**: フォルダ・exe が今あるかどうかは実行時に `os.Stat` で確認する値で、`games` に列を持たない（`store` から返る時点では常に空文字）。OS 側の削除・移動・ドライブ着脱でいつでも変わるため、列に持つと同期対象が二重になるだけで正確さは増さない。判定は `internal/health`、値の埋め込みは app 層（`CheckMissingGames`）が担う。**この判定で行を自動削除することはしない**（詳細は [`app-api.md`](app-api.md) の「保存先の存在確認」）
- 単一接続（`SetMaxOpenConns(1)`）で運用。デスクトップアプリなので並行接続は不要で、PRAGMA の適用も確実になる
- **`added_at` は UTC 固定で保存する**: `ORDER BY added_at DESC`（SQL）とフロントの `localeCompare` はいずれも文字列（辞書式）比較でソートしており、ローカルタイムゾーンのオフセット付きだと DST・手動 TZ 変更をまたいだ際に順序が崩れる。UTC 固定（オフセット常に0）にすることで辞書式比較でも時系列順と一致する。過去に異なるオフセットで保存済みの既存データの再フォーマットは行わない（正式リリース前で移行対象データが無いため）

## スキーマ

```sql
CREATE TABLE games (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    exe_path    TEXT NOT NULL DEFAULT '',   -- フォルダからの相対パス
    folder_path TEXT NOT NULL UNIQUE,       -- 絶対パス。同一フォルダの二重登録を防ぐ
    size_bytes  INTEGER NOT NULL DEFAULT 0,
    favorite    INTEGER NOT NULL DEFAULT 0,
    added_at    TEXT NOT NULL,              -- RFC3339（UTC固定。ローカルTZだとDST/TZ変更をまたぐ文字列比較ソートが崩れるため）
    cover_path  TEXT NOT NULL DEFAULT '',   -- ユーザー指定カバー（covers/… 相対パス。空=既定グラデ）
    tool        TEXT NOT NULL DEFAULT '未判別'  -- 制作ツール（一級属性。調整版ハンドオフ 変更点3）
);

CREATE TABLE tags (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL UNIQUE,
    axis  TEXT NOT NULL DEFAULT 'other'
          CHECK (axis IN ('genre','tool','other')),  -- 'tool' は歴史的経緯（アプリは genre/other のみ使用）
    color TEXT NOT NULL DEFAULT ''          -- パレットキー。空文字=軸の既定色（調整版ハンドオフ）
);

CREATE TABLE game_tags (
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (game_id, tag_id)
);
```

## ライフサイクルの規則

- ゲーム削除 → `game_tags` はカスケード削除。タグ自体は残る（count 0 の候補として）
- ゲームからタグを外しても（`RemoveTag`）、タグ行は**温存**する（ユーザーが設定した色・axis を保持し、付け直しで復元できるようにするため。2026-07-21 のコードレビューで孤児削除方式から変更）
- タグ行そのものを消すのは**タグ管理の明示的な削除（`DeleteTag`）のみ**。`game_tags` はカスケードで全ゲームから外れる（調整版ハンドオフ 変更点4）
- タグはゲームに紐付けず語彙として先行登録できる（`CreateTag`。count 0 で `ListTags` に現れる）
- `foreign_keys` は DSN（`?_pragma=foreign_keys(1)`）で全接続に強制
- ユーザー指定カバー画像は `games.cover_path` に相対パスで保持（空=既定グラデーション）。後方互換のため `migrate()` で ALTER 追加している
- `games.tool` も同様に `migrate()` で ALTER 追加（既定「未判別」。旧 tool 軸タグからの backfill はしない）
- 保存先の貼り替え（`SetLocation` / `RelinkGame`）は `folder_path` / `exe_path` / `size_bytes` だけを更新し、タイトル・タグ・お気に入り・カバーは保持する。`folder_path` は UNIQUE なので、別ゲームが使っているフォルダを指定した場合は更新せずエラーになる

## Go API（フロントエンドへのバインディング）

`app.go` でフロントに公開するメソッド一覧は [`app-api.md`](app-api.md) を参照（型は `frontend/wailsjs/go/main/App.d.ts` に自動生成される）。
