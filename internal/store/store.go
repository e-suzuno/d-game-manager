// Package store はゲームライブラリの SQLite 永続化を担う。
package store

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// タグ軸。サイドナビのグルーピングに使う。
// 制作ツールはタグではなく games.tool 属性（調整版ハンドオフ 変更点3）。
// tags.axis の CHECK 制約に 'tool' が残るのは歴史的経緯（SQLite は CHECK の
// ALTER 不可）で、アプリからは tool 軸タグを二度と作らない。
const (
	AxisGenre = "genre" // ジャンル
	AxisOther = "other" // その他タグ
)

// ToolUnknown は制作ツールが判別できていないことを表す games.tool の既定値。
const ToolUnknown = "未判別"

type Tag struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	Axis string `json:"axis"`
	// Color はパレットキー（blue/teal/violet/rose/amber/green/cyan/slate/gray）。
	// 空文字は未設定＝フロントエンドが軸の既定色で描画する。
	Color string `json:"color"`
}

type TagWithCount struct {
	Tag
	Count int `json:"count"` // 付与されているゲーム数
}

type Game struct {
	ID         int64     `json:"id"`
	Title      string    `json:"title"`
	ExePath    string    `json:"exePath"`    // フォルダからの相対パス
	FolderPath string    `json:"folderPath"` // 絶対パス（一意）
	SizeBytes  int64     `json:"sizeBytes"`
	Favorite   bool      `json:"favorite"`
	AddedAt    time.Time `json:"addedAt"`
	// CoverPath はユーザー指定カバー画像の相対パス（例: covers/3_1690000000.png）。
	// 空文字は未設定＝フロントエンドが手続き的グラデーションで描画する。
	CoverPath string `json:"coverPath"`
	// Tool は制作ツール（RPGツクール / Unity など）。判別できていなければ ToolUnknown。
	Tool string `json:"tool"`
	Tags []Tag  `json:"tags"`
	// Missing は実体（フォルダ・exe）が見つからないことを表す実行時の値で、
	// **DB には永続化しない**（列を持たない）。store から返る時点では常に空文字で、
	// 値を埋めるのは app 層の存在確認（internal/health）だけ。
	// 値の意味は health.OK / MissingFolder / MissingExe に対応する
	Missing string `json:"missing"`
}

// NewGame は取り込み時の登録パラメータ。
type NewGame struct {
	Title      string
	ExePath    string
	FolderPath string
	SizeBytes  int64
	Tool       string // 空文字は ToolUnknown に正規化される
	Tags       []Tag  // ID は無視され、Name+Axis で upsert される
}

type Store struct {
	db *sql.DB
}

const schema = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS games (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	title       TEXT NOT NULL,
	exe_path    TEXT NOT NULL DEFAULT '',
	folder_path TEXT NOT NULL UNIQUE,
	size_bytes  INTEGER NOT NULL DEFAULT 0,
	favorite    INTEGER NOT NULL DEFAULT 0,
	added_at    TEXT NOT NULL,
	cover_path  TEXT NOT NULL DEFAULT '',
	tool        TEXT NOT NULL DEFAULT '未判別'
);

CREATE TABLE IF NOT EXISTS tags (
	id    INTEGER PRIMARY KEY AUTOINCREMENT,
	name  TEXT NOT NULL UNIQUE,
	axis  TEXT NOT NULL DEFAULT 'other' CHECK (axis IN ('genre','tool','other')),
	color TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS game_tags (
	game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
	tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
	PRIMARY KEY (game_id, tag_id)
);
`

// Open は path の SQLite DB を開き、スキーマを適用する。親ディレクトリは自動作成する。
func Open(path string) (*Store, error) {
	if dir := filepath.Dir(path); dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("create db dir: %w", err)
		}
	}
	// PRAGMA は接続単位のため、DSN で全接続に foreign_keys を強制する
	db, err := sql.Open("sqlite", path+"?_pragma=foreign_keys(1)")
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	// デスクトップアプリなので並行接続は不要。単一接続でロック競合も避ける
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("apply schema: %w", err)
	}
	if err := migrate(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return &Store{db: db}, nil
}

// migrate は既存 DB への後方互換の変更を適用する。
func migrate(db *sql.DB) error {
	// カラム追加系のマイグレーション（存在しなければ ALTER）
	addColumns := []struct{ table, column, ddl string }{
		// v2: 基本ハンドオフのタグ色システム
		{"tags", "color", `ALTER TABLE tags ADD COLUMN color TEXT NOT NULL DEFAULT ''`},
		// v3: 基本ハンドオフのカバー画像変更
		{"games", "cover_path", `ALTER TABLE games ADD COLUMN cover_path TEXT NOT NULL DEFAULT ''`},
		// v4: 調整版ハンドオフ 変更点3 の制作ツール属性化。既存の tool 軸タグからの
		// backfill はしない（正式リリース前の判断）
		{"games", "tool", `ALTER TABLE games ADD COLUMN tool TEXT NOT NULL DEFAULT '未判別'`},
	}
	for _, m := range addColumns {
		var n int
		if err := db.QueryRow(
			`SELECT COUNT(*) FROM pragma_table_info(?) WHERE name = ?`, m.table, m.column).Scan(&n); err != nil {
			return err
		}
		if n == 0 {
			if _, err := db.Exec(m.ddl); err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

// AddGame はゲームを登録する。folder_path が重複する場合はエラー。
func (s *Store) AddGame(ctx context.Context, g NewGame) (Game, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Game{}, err
	}
	defer tx.Rollback()

	addedAt := time.Now().UTC()
	res, err := tx.ExecContext(ctx,
		`INSERT INTO games (title, exe_path, folder_path, size_bytes, added_at, tool) VALUES (?, ?, ?, ?, ?, ?)`,
		g.Title, g.ExePath, g.FolderPath, g.SizeBytes, addedAt.Format(time.RFC3339), normalizeTool(g.Tool),
	)
	if err != nil {
		return Game{}, fmt.Errorf("insert game: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Game{}, err
	}
	for _, t := range g.Tags {
		if err := attachTag(ctx, tx, id, t.Name, t.Axis); err != nil {
			return Game{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return Game{}, err
	}
	return s.GetGame(ctx, id)
}

// GetGame は ID 指定で 1 件取得する。
func (s *Store) GetGame(ctx context.Context, id int64) (Game, error) {
	games, err := s.queryGames(ctx, `WHERE id = ?`, id)
	if err != nil {
		return Game{}, err
	}
	if len(games) == 0 {
		return Game{}, sql.ErrNoRows
	}
	return games[0], nil
}

// ListGames は全ゲームを追加日の新しい順で返す。
func (s *Store) ListGames(ctx context.Context) ([]Game, error) {
	return s.queryGames(ctx, `ORDER BY added_at DESC, id DESC`)
}

func (s *Store) queryGames(ctx context.Context, clause string, args ...any) ([]Game, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, title, exe_path, folder_path, size_bytes, favorite, added_at, cover_path, tool FROM games `+clause, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var games []Game
	for rows.Next() {
		var g Game
		var fav int
		var addedAt string
		if err := rows.Scan(&g.ID, &g.Title, &g.ExePath, &g.FolderPath, &g.SizeBytes, &fav, &addedAt, &g.CoverPath, &g.Tool); err != nil {
			return nil, err
		}
		g.Favorite = fav != 0
		if t, err := time.Parse(time.RFC3339, addedAt); err != nil {
			log.Printf("store: game id=%d の added_at %q のパースに失敗（ゼロ値で継続）: %v", g.ID, addedAt, err)
		} else {
			g.AddedAt = t
		}
		g.Tags = []Tag{}
		games = append(games, g)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if err := s.loadTags(ctx, games); err != nil {
		return nil, err
	}
	return games, nil
}

// loadTagsBatchSize は IN 句のバインド変数数。SQLITE_MAX_VARIABLE_NUMBER
// （古い既定で 999）を超えないようバッチ分割する。
const loadTagsBatchSize = 500

func (s *Store) loadTags(ctx context.Context, games []Game) error {
	if len(games) == 0 {
		return nil
	}
	idx := make(map[int64]*Game, len(games))
	ids := make([]int64, 0, len(games))
	for i := range games {
		idx[games[i].ID] = &games[i]
		ids = append(ids, games[i].ID)
	}
	for start := 0; start < len(ids); start += loadTagsBatchSize {
		end := min(start+loadTagsBatchSize, len(ids))
		if err := s.loadTagsBatch(ctx, idx, ids[start:end]); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) loadTagsBatch(ctx context.Context, idx map[int64]*Game, ids []int64) error {
	placeholders := make([]string, len(ids))
	args := make([]any, len(ids))
	for i, id := range ids {
		placeholders[i] = "?"
		args[i] = id
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT gt.game_id, t.id, t.name, t.axis, t.color
		FROM game_tags gt JOIN tags t ON t.id = gt.tag_id
		WHERE gt.game_id IN (`+strings.Join(placeholders, ",")+`)
		ORDER BY t.name`, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var gameID int64
		var t Tag
		if err := rows.Scan(&gameID, &t.ID, &t.Name, &t.Axis, &t.Color); err != nil {
			return err
		}
		if g, ok := idx[gameID]; ok {
			g.Tags = append(g.Tags, t)
		}
	}
	return rows.Err()
}

// HasFolder は folder_path が登録済みかを返す（取り込み時の重複チェック用）。
// 大文字小文字を区別しない比較（COLLATE NOCASE）にすることで、Windows の
// NTFS が大文字小文字を区別しないために起きる綴り違いパスでの二重登録を防ぐ。
func (s *Store) HasFolder(ctx context.Context, folderPath string) (bool, error) {
	var n int
	if err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM games WHERE folder_path = ? COLLATE NOCASE`, folderPath).Scan(&n); err != nil {
		return false, err
	}
	return n > 0, nil
}

// hasFoldersBatchSize は IN 句のバインド変数数。loadTagsBatchSize と同じ理由で
// SQLITE_MAX_VARIABLE_NUMBER（古い既定で 999）を超えないよう分割する。
const hasFoldersBatchSize = 500

// HasFolders は paths のうち登録済みのものを「渡した文字列そのもの」をキーとする
// マップで返す（未登録のパスはキーを持たないので、ゼロ値の false で判定できる）。
// HasFolder を候補ごとに呼ぶ代わりに1クエリでまとめるためのもの。
//
// COLLATE NOCASE の位置は `folder_path COLLATE NOCASE IN (...)` でなければならない。
// `folder_path IN (...) COLLATE NOCASE` と書くと**エラーも出さずに常に0件**を返し、
// 登録済みフォルダを未登録と誤判定して二重登録を招く。
func (s *Store) HasFolders(ctx context.Context, paths []string) (map[string]bool, error) {
	out := make(map[string]bool, len(paths))
	for start := 0; start < len(paths); start += hasFoldersBatchSize {
		batch := paths[start:min(start+hasFoldersBatchSize, len(paths))]
		args := make([]any, len(batch))
		for i, p := range batch {
			args[i] = p
		}
		placeholders := strings.TrimPrefix(strings.Repeat(",?", len(batch)), ",")
		rows, err := s.db.QueryContext(ctx,
			`SELECT folder_path FROM games WHERE folder_path COLLATE NOCASE IN (`+placeholders+`)`, args...)
		if err != nil {
			return nil, err
		}
		// DB 側は COLLATE NOCASE で引いているので、Go 側の突き合わせも
		// 大文字小文字を無視する（登録時と綴りが違うパスを渡されても一致させる）
		registered := make(map[string]bool)
		for rows.Next() {
			var folderPath string
			if err := rows.Scan(&folderPath); err != nil {
				rows.Close()
				return nil, err
			}
			registered[strings.ToLower(folderPath)] = true
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
		for _, p := range batch {
			if registered[strings.ToLower(p)] {
				out[p] = true
			}
		}
	}
	return out, nil
}

// DeleteGame はゲームを削除する（game_tags はカスケード削除）。
func (s *Store) DeleteGame(ctx context.Context, id int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM games WHERE id = ?`, id)
	return err
}

// SetFavorite はお気に入りフラグを設定する。
func (s *Store) SetFavorite(ctx context.Context, id int64, fav bool) error {
	_, err := s.db.ExecContext(ctx, `UPDATE games SET favorite = ? WHERE id = ?`, boolToInt(fav), id)
	return err
}

// SetTitle は表示タイトルを変更する（フォルダパスは不変）。空文字は拒否する。
func (s *Store) SetTitle(ctx context.Context, id int64, title string) error {
	title = strings.TrimSpace(title)
	if title == "" {
		return fmt.Errorf("タイトルが空です")
	}
	_, err := s.db.ExecContext(ctx, `UPDATE games SET title = ? WHERE id = ?`, title, id)
	return err
}

// SetLocation はゲームの保存先（フォルダ・実行ファイル・サイズ）を差し替える（再紐付け）。
// フォルダを移動・リネームしたゲームを、タイトル・タグ・お気に入り・カバーを保ったまま
// 復帰させるための操作。folder_path は UNIQUE なので、別のゲームが使っているフォルダを
// 指定した場合は変更せずエラーを返す。
func (s *Store) SetLocation(ctx context.Context, id int64, folderPath, exePath string, sizeBytes int64) error {
	folderPath = strings.TrimSpace(folderPath)
	if folderPath == "" {
		return fmt.Errorf("保存先フォルダが空です")
	}
	res, err := s.db.ExecContext(ctx,
		`UPDATE games SET folder_path = ?, exe_path = ?, size_bytes = ? WHERE id = ?`,
		folderPath, exePath, sizeBytes, id)
	if err != nil {
		// UNIQUE 制約違反（別ゲームが同じフォルダを登録済み）が主なケース
		return fmt.Errorf("保存先を更新できませんでした。そのフォルダは別のゲームで登録済みの可能性があります: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return fmt.Errorf("ゲームが見つかりません")
	}
	return nil
}

// SetCoverPath はカバー画像の相対パスを設定する。空文字で未設定（既定グラデーション）に戻す。
func (s *Store) SetCoverPath(ctx context.Context, id int64, coverPath string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE games SET cover_path = ? WHERE id = ?`, coverPath, id)
	return err
}

// SetTool は制作ツールを設定する。空白のみ・空文字は ToolUnknown に正規化される。
func (s *Store) SetTool(ctx context.Context, id int64, tool string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE games SET tool = ? WHERE id = ?`, normalizeTool(tool), id)
	return err
}

// normalizeTool は制作ツール名を保存用に正規化する（空は ToolUnknown）。
func normalizeTool(tool string) string {
	tool = strings.TrimSpace(tool)
	if tool == "" {
		return ToolUnknown
	}
	return tool
}

// AddTagToGame はタグをゲームに付与する。タグが未登録なら name+axis で作成する。
// 登録済みの場合、axis 引数は**無視**され既存タグ（元の axis・color）が使われる。
// これは意図的な仕様: タグの axis は作成時に一度だけ決まる（docs/reference/data-model.md 参照）。
// 呼び出し側は戻り値の Tag.Axis で実際の軸を確認できる。
func (s *Store) AddTagToGame(ctx context.Context, gameID int64, name, axis string) (Tag, error) {
	// attachTag 内でも trim するが、直後の SELECT に生の name を使うと
	// trim 後の保存名と食い違うため、呼び出し側でも trim 済みの値を揃えて使う
	name = strings.TrimSpace(name)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Tag{}, err
	}
	defer tx.Rollback()
	if err := attachTag(ctx, tx, gameID, name, axis); err != nil {
		return Tag{}, err
	}
	var t Tag
	if err := tx.QueryRowContext(ctx, `SELECT id, name, axis, color FROM tags WHERE name = ?`, name).
		Scan(&t.ID, &t.Name, &t.Axis, &t.Color); err != nil {
		return Tag{}, err
	}
	if err := tx.Commit(); err != nil {
		return Tag{}, err
	}
	return t, nil
}

// attachTag はタグ名の前後空白を除去してから登録・付与する（AddGame のタグ一括登録時も
// 同じ入口を通るため、ここで trim すれば一括対応できる。既存データの backfill はしない）。
func attachTag(ctx context.Context, tx *sql.Tx, gameID int64, name, axis string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("タグ名が空です")
	}
	// 有効軸は genre / other のみ。旧 'tool' を含む未知の値は other に丸める
	// （制作ツールは games.tool 属性であり、tool 軸タグはもう作らない）
	if axis != AxisGenre && axis != AxisOther {
		axis = AxisOther
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO tags (name, axis) VALUES (?, ?) ON CONFLICT(name) DO NOTHING`, name, axis); err != nil {
		return fmt.Errorf("タグの登録に失敗しました: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO game_tags (game_id, tag_id)
		SELECT ?, id FROM tags WHERE name = ?
		ON CONFLICT DO NOTHING`, gameID, name); err != nil {
		return fmt.Errorf("タグの付与に失敗しました: %w", err)
	}
	return nil
}

// RemoveTagFromGame はゲームからタグを外す。
// タグ行自体は残す（ユーザーが設定した色・axis を保持し、付け直しで復元できるようにするため）。
func (s *Store) RemoveTagFromGame(ctx context.Context, gameID, tagID int64) error {
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM game_tags WHERE game_id = ? AND tag_id = ?`, gameID, tagID)
	return err
}

// SetTagColor はタグの色（パレットキー）を設定する。色はタグ名ごとにグローバル。
func (s *Store) SetTagColor(ctx context.Context, tagID int64, color string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE tags SET color = ? WHERE id = ?`, color, tagID)
	return err
}

// RenameTag はタグ名を変更する。空文字は拒否し、別の既存タグと同名になる場合は
// マージせずエラーにする。game_tags は tag_id 参照のため付与済みゲームにも新名が波及する。
func (s *Store) RenameTag(ctx context.Context, tagID int64, newName string) error {
	newName = strings.TrimSpace(newName)
	if newName == "" {
		return fmt.Errorf("タグ名が空です")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var current string
	if err := tx.QueryRowContext(ctx, `SELECT name FROM tags WHERE id = ?`, tagID).Scan(&current); err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("タグが見つかりません")
		}
		return fmt.Errorf("タグの取得に失敗しました: %w", err)
	}
	// 同じ名前へのリネームは変更なしで成功
	if current == newName {
		return nil
	}
	var dupID int64
	switch err := tx.QueryRowContext(ctx,
		`SELECT id FROM tags WHERE name = ? AND id <> ?`, newName, tagID).Scan(&dupID); err {
	case nil:
		return fmt.Errorf("同じ名前のタグが既にあります")
	case sql.ErrNoRows:
		// 衝突なし
	default:
		return fmt.Errorf("タグの重複確認に失敗しました: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `UPDATE tags SET name = ? WHERE id = ?`, newName, tagID); err != nil {
		return fmt.Errorf("タグ名の変更に失敗しました: %w", err)
	}
	return tx.Commit()
}

// DeleteTag はタグをライブラリから完全に削除する。RemoveTagFromGame と違いタグ行自体を
// 消すため、付与されていた全ゲームからも外れる（game_tags は ON DELETE CASCADE）。
// 存在しない tagID の削除はエラーにならない（冪等）。
func (s *Store) DeleteTag(ctx context.Context, tagID int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM tags WHERE id = ?`, tagID)
	return err
}

// SetTagAxis はタグの軸（genre / other）を変更する。それ以外の軸は拒否する。
func (s *Store) SetTagAxis(ctx context.Context, tagID int64, axis string) error {
	if axis != AxisGenre && axis != AxisOther {
		return fmt.Errorf("不正なタグ軸です")
	}
	res, err := s.db.ExecContext(ctx, `UPDATE tags SET axis = ? WHERE id = ?`, axis, tagID)
	if err != nil {
		return fmt.Errorf("タグ軸の変更に失敗しました: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return fmt.Errorf("タグが見つかりません")
	}
	return nil
}

// CreateTag はゲームに紐付けない新規タグを登録する。AddTagToGame と違い、
// 不正な軸は other に丸めず拒否し、同名タグが既にある場合もエラーにする。
func (s *Store) CreateTag(ctx context.Context, name, axis string) (Tag, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return Tag{}, fmt.Errorf("タグ名が空です")
	}
	if axis != AxisGenre && axis != AxisOther {
		return Tag{}, fmt.Errorf("不正なタグ軸です")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Tag{}, err
	}
	defer tx.Rollback()

	var dupID int64
	switch err := tx.QueryRowContext(ctx, `SELECT id FROM tags WHERE name = ?`, name).Scan(&dupID); err {
	case nil:
		return Tag{}, fmt.Errorf("同じ名前のタグが既にあります")
	case sql.ErrNoRows:
		// 衝突なし
	default:
		return Tag{}, fmt.Errorf("タグの重複確認に失敗しました: %w", err)
	}
	res, err := tx.ExecContext(ctx, `INSERT INTO tags (name, axis) VALUES (?, ?)`, name, axis)
	if err != nil {
		return Tag{}, fmt.Errorf("タグの登録に失敗しました: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Tag{}, err
	}
	if err := tx.Commit(); err != nil {
		return Tag{}, err
	}
	return Tag{ID: id, Name: name, Axis: axis, Color: ""}, nil
}

// ListTags は全タグを付与ゲーム数付きで返す。
func (s *Store) ListTags(ctx context.Context) ([]TagWithCount, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT t.id, t.name, t.axis, t.color, COUNT(gt.game_id)
		FROM tags t LEFT JOIN game_tags gt ON gt.tag_id = t.id
		GROUP BY t.id ORDER BY t.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var tags []TagWithCount
	for rows.Next() {
		var t TagWithCount
		if err := rows.Scan(&t.ID, &t.Name, &t.Axis, &t.Color, &t.Count); err != nil {
			return nil, err
		}
		tags = append(tags, t)
	}
	return tags, rows.Err()
}

// ResetAll はライブラリの全データ（games / tags / game_tags）を単一トランザクションで
// 削除し、AUTOINCREMENT の採番もリセットして DB を初期状態に戻す。
// DB の行だけを消す操作であり、ゲーム本体のフォルダ・ファイルには一切触れない。
func (s *Store) ResetAll(ctx context.Context) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// games の削除で game_tags はカスケードされるが、意図（全テーブルを空にする）を
	// 明示するため子テーブルから順に DELETE する
	for _, table := range []string{"game_tags", "games", "tags"} {
		if _, err := tx.ExecContext(ctx, `DELETE FROM `+table); err != nil {
			return fmt.Errorf("reset %s: %w", table, err)
		}
	}
	// AUTOINCREMENT の採番カウンタをリセットする。sqlite_sequence は
	// AUTOINCREMENT 列を持つテーブルの CREATE TABLE 時点で作られる内部テーブルのため、
	// 本アプリのスキーマでは Open 直後から必ず存在する。存在確認は外部ツール製 DB 等、
	// 想定外の DB を開いた場合への防御
	var n int
	if err := tx.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'`).Scan(&n); err != nil {
		return fmt.Errorf("check sqlite_sequence: %w", err)
	}
	if n > 0 {
		if _, err := tx.ExecContext(ctx, `DELETE FROM sqlite_sequence WHERE name IN ('games','tags')`); err != nil {
			return fmt.Errorf("reset sqlite_sequence: %w", err)
		}
	}
	return tx.Commit()
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
