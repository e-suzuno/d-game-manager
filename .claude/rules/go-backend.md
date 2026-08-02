---
paths:
  - "**/*.go"
---

# Go バックエンドの構成

レイヤ構成: `main.go`（起動・アセット埋め込み）→ `app.go`（Wails バインディング＝フロントから呼べる API 群 / ユースケース層）→ `internal/*`（ドメイン層）。

- `main.go` — `//go:embed all:frontend/dist` でフロントを埋め込み。カバー画像は `/covers/` パスだけ独自 AssetServer ハンドラでファイル配信する
- `app.go` — `App` 構造体に、フロントへバインドする全メソッドを集約（`ListGames` / `SelectAndScanFolder` / `ImportGames` / `LaunchGame` / `OpenGameFolder` / タグ・お気に入り・カバー編集など）。フロントに公開する API を追加・変更するのはここ
- `internal/store/` — SQLite リポジトリ層。ドメイン型 `Game` / `Tag` と CRUD。スキーマは `store.go` の `schema` 定数、後方互換 ALTER は `migrate()`。制作ツールは `games.tool` の一級属性（既定「未判別」）、タグは `axis`（genre / other）で区別する
- `internal/scan/` — フォルダ取り込み時の .exe 検出。exe 選択は「ハード除外 → helper-only 除外 → スコアリング（段階式スコアで最上位1つを採用）」の3層。制作ツール推定もここ（設計記録は `scan.go` のパッケージコメント）
- `internal/health/` — 登録済みゲームの実体（フォルダ・exe）の存在確認。`stat` を並列実行し、エラーは種類を問わず不在扱い。結果は DB に永続化しない実行時の値（`Game.Missing`）で、これを根拠に行を自動削除はしない
- `internal/icon/` — 取り込んだ exe の PE リソースからメインアイコンを取り出し既定カバー用の PNG を生成（pure Go。失敗はログのみのベストエフォート）
- `internal/launch/` — ゲーム起動（作業ディレクトリをゲームフォルダに設定して exec、プロセス監視はしない）とフォルダ表示（WSL では `wslpath -w` + `explorer.exe`）

**データ保存先**: `os.UserConfigDir()/d-game-manager/`（Linux `~/.config/...`、Windows `%AppData%\...`）配下に `library.db` と `covers/`。
