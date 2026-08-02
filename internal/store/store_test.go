package store

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestAddAndListGames(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	g, err := s.AddGame(ctx, NewGame{
		Title:      "サンプルRPG",
		ExePath:    "Game.exe",
		FolderPath: "/mnt/d/games/sample-rpg",
		SizeBytes:  512 * 1024 * 1024,
		Tool:       "RPGツクール",
		Tags: []Tag{
			{Name: "RPG", Axis: AxisGenre},
		},
	})
	if err != nil {
		t.Fatalf("AddGame: %v", err)
	}
	if g.ID == 0 || g.Title != "サンプルRPG" || len(g.Tags) != 1 {
		t.Errorf("unexpected game: %+v", g)
	}
	if g.Tool != "RPGツクール" {
		t.Errorf("tool should be saved, got %q", g.Tool)
	}
	if g.AddedAt.IsZero() {
		t.Error("AddedAt should be set")
	}

	games, err := s.ListGames(ctx)
	if err != nil {
		t.Fatalf("ListGames: %v", err)
	}
	if len(games) != 1 {
		t.Fatalf("want 1 game, got %d", len(games))
	}
	if games[0].Tool != "RPGツクール" {
		t.Errorf("ListGames should return tool, got %q", games[0].Tool)
	}
}

func TestToolDefaultsToUnknown(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	// Tool 未指定（空文字）は「未判別」に正規化して保存される
	g, err := s.AddGame(ctx, NewGame{Title: "A", FolderPath: "/games/a"})
	if err != nil {
		t.Fatalf("AddGame: %v", err)
	}
	if g.Tool != "未判別" {
		t.Errorf("empty tool should default to 未判別, got %q", g.Tool)
	}
}

func TestMigrateAddsToolColumnToExistingDB(t *testing.T) {
	// 旧スキーマ（tool 列なし）の既存 DB を Open() すると migrate() が tool 列を
	// ALTER 追加し、既存行は DDL の DEFAULT で埋まることを検証する。
	// DEFAULT 値と ToolUnknown 定数の乖離検出も兼ねる（二重定義のため）
	path := filepath.Join(t.TempDir(), "old.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open raw db: %v", err)
	}
	if _, err := db.Exec(`
		CREATE TABLE games (
			id          INTEGER PRIMARY KEY AUTOINCREMENT,
			title       TEXT NOT NULL,
			exe_path    TEXT NOT NULL DEFAULT '',
			folder_path TEXT NOT NULL UNIQUE,
			size_bytes  INTEGER NOT NULL DEFAULT 0,
			favorite    INTEGER NOT NULL DEFAULT 0,
			added_at    TEXT NOT NULL,
			cover_path  TEXT NOT NULL DEFAULT ''
		)`); err != nil {
		t.Fatalf("create old schema: %v", err)
	}
	if _, err := db.Exec(
		`INSERT INTO games (title, folder_path, added_at) VALUES ('旧ゲーム', '/games/old', '2026-01-01T00:00:00Z')`); err != nil {
		t.Fatalf("insert old row: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close raw db: %v", err)
	}

	ctx := context.Background()
	s, err := Open(path)
	if err != nil {
		t.Fatalf("Open (migrate): %v", err)
	}
	g, err := s.GetGame(ctx, 1)
	if err != nil {
		t.Fatalf("GetGame: %v", err)
	}
	if g.Title != "旧ゲーム" || g.Tool != ToolUnknown {
		t.Errorf("existing row should get DEFAULT tool %q, got %+v", ToolUnknown, g)
	}
	if err := s.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	// 再 Open でも冪等（列追加が二重に走らない）
	s2, err := Open(path)
	if err != nil {
		t.Fatalf("re-Open should be idempotent: %v", err)
	}
	s2.Close()
}

func TestSetTool(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	g, _ := s.AddGame(ctx, NewGame{Title: "A", FolderPath: "/games/a", Tool: "Unity"})
	if err := s.SetTool(ctx, g.ID, "Godot"); err != nil {
		t.Fatalf("SetTool: %v", err)
	}
	got, _ := s.GetGame(ctx, g.ID)
	if got.Tool != "Godot" {
		t.Errorf("want Godot, got %q", got.Tool)
	}

	// 空白のみ・空文字は「未判別」に正規化される
	if err := s.SetTool(ctx, g.ID, "   "); err != nil {
		t.Fatalf("SetTool(blank): %v", err)
	}
	got, _ = s.GetGame(ctx, g.ID)
	if got.Tool != "未判別" {
		t.Errorf("blank tool should normalize to 未判別, got %q", got.Tool)
	}
}

func TestToolAxisTagRoundedToOther(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	// 制作ツールは games.tool 属性になったため、axis='tool' のタグはもう作らない。
	// 旧値 "tool" が渡されても other に丸める
	g, _ := s.AddGame(ctx, NewGame{Title: "A", FolderPath: "/games/a"})
	tag, err := s.AddTagToGame(ctx, g.ID, "RPGツクールMV", "tool")
	if err != nil {
		t.Fatalf("AddTagToGame: %v", err)
	}
	if tag.Axis != AxisOther {
		t.Errorf("tool axis should be rounded to other, got %q", tag.Axis)
	}
}

func TestDuplicateFolderPathRejected(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	ng := NewGame{Title: "A", FolderPath: "/games/a"}
	if _, err := s.AddGame(ctx, ng); err != nil {
		t.Fatalf("first AddGame: %v", err)
	}
	if _, err := s.AddGame(ctx, ng); err == nil {
		t.Error("duplicate folder_path should be rejected")
	}
}

func TestFavorite(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	g, _ := s.AddGame(ctx, NewGame{Title: "A", FolderPath: "/games/a"})
	if err := s.SetFavorite(ctx, g.ID, true); err != nil {
		t.Fatalf("SetFavorite: %v", err)
	}
	got, _ := s.GetGame(ctx, g.ID)
	if !got.Favorite {
		t.Error("favorite should be true")
	}
}

func TestSetTitleAndCoverPath(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	g, _ := s.AddGame(ctx, NewGame{Title: "フォルダ名", FolderPath: "/games/a"})
	if err := s.SetTitle(ctx, g.ID, " 新しいタイトル "); err != nil {
		t.Fatalf("SetTitle: %v", err)
	}
	if err := s.SetTitle(ctx, g.ID, "   "); err == nil {
		t.Error("empty title should be rejected")
	}
	if err := s.SetCoverPath(ctx, g.ID, "covers/1_123.png"); err != nil {
		t.Fatalf("SetCoverPath: %v", err)
	}
	got, _ := s.GetGame(ctx, g.ID)
	if got.Title != "新しいタイトル" || got.CoverPath != "covers/1_123.png" {
		t.Errorf("unexpected game: %+v", got)
	}
}

func TestTagUpsertAndSharedAxis(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	a, _ := s.AddGame(ctx, NewGame{Title: "A", FolderPath: "/games/a"})
	b, _ := s.AddGame(ctx, NewGame{Title: "B", FolderPath: "/games/b"})

	t1, err := s.AddTagToGame(ctx, a.ID, "ホラー", AxisGenre)
	if err != nil {
		t.Fatalf("AddTagToGame: %v", err)
	}
	// 同名タグを別 axis で追加しても、既存タグ（genre）が使われる
	t2, err := s.AddTagToGame(ctx, b.ID, "ホラー", AxisOther)
	if err != nil {
		t.Fatalf("AddTagToGame(2): %v", err)
	}
	if t1.ID != t2.ID || t2.Axis != AxisGenre {
		t.Errorf("tag should be shared with original axis: %+v vs %+v", t1, t2)
	}

	// 同じゲームへの重複付与はエラーにならず冪等
	if _, err := s.AddTagToGame(ctx, a.ID, "ホラー", AxisGenre); err != nil {
		t.Fatalf("idempotent add: %v", err)
	}

	tags, _ := s.ListTags(ctx)
	if len(tags) != 1 || tags[0].Count != 2 {
		t.Errorf("want 1 tag with count 2, got %+v", tags)
	}
}

func TestSetTagColor(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	g, _ := s.AddGame(ctx, NewGame{Title: "A", FolderPath: "/games/a"})
	tag, _ := s.AddTagToGame(ctx, g.ID, "ホラー", AxisGenre)
	if tag.Color != "" {
		t.Errorf("new tag color should default to empty, got %q", tag.Color)
	}
	if err := s.SetTagColor(ctx, tag.ID, "rose"); err != nil {
		t.Fatalf("SetTagColor: %v", err)
	}
	got, _ := s.GetGame(ctx, g.ID)
	if len(got.Tags) != 1 || got.Tags[0].Color != "rose" {
		t.Errorf("want color rose, got %+v", got.Tags)
	}
}

func TestRemoveTagKeepsTagRowAndColor(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	g, _ := s.AddGame(ctx, NewGame{Title: "A", FolderPath: "/games/a"})
	tag, _ := s.AddTagToGame(ctx, g.ID, "積みゲー", AxisOther)
	if err := s.SetTagColor(ctx, tag.ID, "amber"); err != nil {
		t.Fatalf("SetTagColor: %v", err)
	}

	if err := s.RemoveTagFromGame(ctx, g.ID, tag.ID); err != nil {
		t.Fatalf("RemoveTagFromGame: %v", err)
	}
	// タグ行は残る（色・axis を保持）
	tags, _ := s.ListTags(ctx)
	if len(tags) != 1 || tags[0].Count != 0 {
		t.Fatalf("tag row should remain with count 0, got %+v", tags)
	}

	// 付け直すと同じ id・色で復元される
	again, err := s.AddTagToGame(ctx, g.ID, "積みゲー", AxisOther)
	if err != nil {
		t.Fatalf("re-add: %v", err)
	}
	if again.ID != tag.ID || again.Color != "amber" {
		t.Errorf("re-added tag should keep id and color, got %+v", again)
	}
}

func TestListGamesOverBatchSize(t *testing.T) {
	// loadTags のバッチ分割がバインド変数上限を超えるサイズでも動くこと
	s := newTestStore(t)
	ctx := context.Background()

	const n = loadTagsBatchSize + 50
	for i := 0; i < n; i++ {
		g, err := s.AddGame(ctx, NewGame{
			Title:      "G",
			FolderPath: filepath.Join("/games", string(rune('a'+i%26)), fmt.Sprint(i)),
			Tags:       []Tag{{Name: "共通タグ", Axis: AxisOther}},
		})
		if err != nil {
			t.Fatalf("AddGame(%d): %v", i, err)
		}
		_ = g
	}
	games, err := s.ListGames(ctx)
	if err != nil {
		t.Fatalf("ListGames: %v", err)
	}
	if len(games) != n {
		t.Fatalf("want %d games, got %d", n, len(games))
	}
	for _, g := range games {
		if len(g.Tags) != 1 {
			t.Fatalf("game %d should have 1 tag, got %+v", g.ID, g.Tags)
		}
	}
}

func TestResetAllClearsAllTables(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	if _, err := s.AddGame(ctx, NewGame{Title: "A", FolderPath: "/games/a", Tags: []Tag{{Name: "RPG", Axis: AxisGenre}}}); err != nil {
		t.Fatalf("AddGame(A): %v", err)
	}
	if _, err := s.AddGame(ctx, NewGame{Title: "B", FolderPath: "/games/b", Tags: []Tag{{Name: "積みゲー", Axis: AxisOther}}}); err != nil {
		t.Fatalf("AddGame(B): %v", err)
	}

	if err := s.ResetAll(ctx); err != nil {
		t.Fatalf("ResetAll: %v", err)
	}

	games, err := s.ListGames(ctx)
	if err != nil {
		t.Fatalf("ListGames: %v", err)
	}
	if len(games) != 0 {
		t.Errorf("games should be empty, got %+v", games)
	}
	// DeleteGame と違い、タグ行も残さず全消去する（初期状態に戻す）
	tags, err := s.ListTags(ctx)
	if err != nil {
		t.Fatalf("ListTags: %v", err)
	}
	if len(tags) != 0 {
		t.Errorf("tags should be empty, got %+v", tags)
	}
	var n int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM game_tags`).Scan(&n); err != nil {
		t.Fatalf("count game_tags: %v", err)
	}
	if n != 0 {
		t.Errorf("game_tags should be empty, got %d rows", n)
	}
}

func TestResetAllRestartsAutoincrement(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	for i, p := range []string{"/games/a", "/games/b"} {
		if _, err := s.AddGame(ctx, NewGame{Title: "G", FolderPath: p}); err != nil {
			t.Fatalf("AddGame(%d): %v", i, err)
		}
	}
	if err := s.ResetAll(ctx); err != nil {
		t.Fatalf("ResetAll: %v", err)
	}

	// sqlite_sequence もリセットされ、id=1 から再採番される
	g, err := s.AddGame(ctx, NewGame{Title: "再登録", FolderPath: "/games/c"})
	if err != nil {
		t.Fatalf("AddGame after reset: %v", err)
	}
	if g.ID != 1 {
		t.Errorf("id should restart from 1, got %d", g.ID)
	}
}

func TestResetAllOnEmptyDB(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	// 何も登録していない直後の DB でもエラーにならないこと。
	// なお sqlite_sequence は AUTOINCREMENT 列を持つテーブルの CREATE TABLE 時点で
	// 作られるため本アプリのスキーマでは常に存在する。ResetAll の存在確認は
	// 外部ツール製 DB 等、想定外の DB への防御
	if err := s.ResetAll(ctx); err != nil {
		t.Fatalf("ResetAll on empty db: %v", err)
	}
}

func TestAddTagToGameMissingGameReturnsJapaneseError(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	// 存在しない gameID への付与は game_tags の FK 制約違反になる
	if _, err := s.AddTagToGame(ctx, 999, "RPG", AxisGenre); err == nil {
		t.Fatal("存在しない gameID なのにエラーが nil")
	} else if !strings.Contains(err.Error(), "タグの付与に失敗しました") {
		t.Errorf("エラーメッセージが日本語化されていない: %v", err)
	} else if errors.Unwrap(err) == nil {
		// %w でラップされていれば元の FK 制約違反エラーが Unwrap で取り出せるはず。
		// %v やメッセージの握りつぶしに変わった場合は nil になり検知できる
		t.Errorf("元のエラーが %%w でラップされていない（Unwrap が nil）: %v", err)
	}
}

func TestAddTagToGameTrimsName(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	g, _ := s.AddGame(ctx, NewGame{Title: "A", FolderPath: "/games/a"})

	tag, err := s.AddTagToGame(ctx, g.ID, " ホラー ", AxisGenre)
	if err != nil {
		t.Fatalf("AddTagToGame: %v", err)
	}
	if tag.Name != "ホラー" {
		t.Errorf("tag name should be trimmed, got %q", tag.Name)
	}

	tags, err := s.ListTags(ctx)
	if err != nil {
		t.Fatalf("ListTags: %v", err)
	}
	if len(tags) != 1 || tags[0].Name != "ホラー" {
		t.Errorf("ListTags should return trimmed name, got %+v", tags)
	}
}

func TestAddTagToGameTrimmedNameSharesExistingTag(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	a, _ := s.AddGame(ctx, NewGame{Title: "A", FolderPath: "/games/a"})
	b, _ := s.AddGame(ctx, NewGame{Title: "B", FolderPath: "/games/b"})

	t1, err := s.AddTagToGame(ctx, a.ID, "ホラー", AxisGenre)
	if err != nil {
		t.Fatalf("AddTagToGame: %v", err)
	}
	// 前後空白付き・別 axis で呼んでも、trim 後は同名なので既存タグ（genre）が共有される
	t2, err := s.AddTagToGame(ctx, b.ID, "  ホラー  ", AxisOther)
	if err != nil {
		t.Fatalf("AddTagToGame(2): %v", err)
	}
	if t1.ID != t2.ID || t2.Axis != AxisGenre {
		t.Errorf("tag should be shared with original axis: %+v vs %+v", t1, t2)
	}

	tags, _ := s.ListTags(ctx)
	if len(tags) != 1 || tags[0].Count != 2 {
		t.Errorf("want 1 tag with count 2, got %+v", tags)
	}
}

func TestAddTagToGameRejectsBlankName(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	g, _ := s.AddGame(ctx, NewGame{Title: "A", FolderPath: "/games/a"})

	if _, err := s.AddTagToGame(ctx, g.ID, "   ", AxisGenre); err == nil {
		t.Fatal("空白のみのタグ名なのにエラーが nil")
	} else if !strings.Contains(err.Error(), "タグ名が空です") {
		t.Errorf("エラーメッセージが期待と異なる: %v", err)
	}
}

func TestAddGameTrimsTagNames(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	g, err := s.AddGame(ctx, NewGame{
		Title:      "A",
		FolderPath: "/games/a",
		Tags: []Tag{
			{Name: " RPG ", Axis: AxisGenre},
		},
	})
	if err != nil {
		t.Fatalf("AddGame: %v", err)
	}
	if len(g.Tags) != 1 || g.Tags[0].Name != "RPG" {
		t.Errorf("tag name should be trimmed, got %+v", g.Tags)
	}
}

func TestDeleteGameCascades(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	g, _ := s.AddGame(ctx, NewGame{Title: "A", FolderPath: "/games/a", Tags: []Tag{{Name: "RPG", Axis: AxisGenre}}})
	if err := s.DeleteGame(ctx, g.ID); err != nil {
		t.Fatalf("DeleteGame: %v", err)
	}
	games, _ := s.ListGames(ctx)
	if len(games) != 0 {
		t.Errorf("game should be deleted, got %+v", games)
	}
	// game_tags は消えるが、タグ自体は残る（他ゲームで再利用可能な候補として）
	tags, _ := s.ListTags(ctx)
	if len(tags) != 1 || tags[0].Count != 0 {
		t.Errorf("tag should remain with count 0, got %+v", tags)
	}
}

func TestAddGameStoresAddedAtInUTC(t *testing.T) {
	// time.Now() をそのまま RFC3339 保存すると OS のローカルタイムゾーンの
	// オフセットが文字列に混入し、added_at の辞書式ソート（ListGames の
	// ORDER BY / フロントの localeCompare）が実際の追加順と食い違う。
	// 実行環境のシステムタイムゾーンがたまたま UTC だと "Z" 終端になり
	// バグがあっても偶然パスしてしまうため、time.Local を明示的に
	// UTC 以外（JST）へ差し替えて検証する
	orig := time.Local
	time.Local = time.FixedZone("JST", 9*3600)
	defer func() { time.Local = orig }()

	s := newTestStore(t)
	ctx := context.Background()

	g, err := s.AddGame(ctx, NewGame{Title: "A", FolderPath: "/games/a"})
	if err != nil {
		t.Fatalf("AddGame: %v", err)
	}

	var raw string
	if err := s.db.QueryRow(`SELECT added_at FROM games WHERE id = ?`, g.ID).Scan(&raw); err != nil {
		t.Fatalf("query added_at: %v", err)
	}
	if !strings.HasSuffix(raw, "Z") {
		t.Errorf("added_at should be stored in UTC (Z終端), got %q", raw)
	}
}

func TestRenameTag(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	g, _ := s.AddGame(ctx, NewGame{Title: "A", FolderPath: "/games/a"})
	tag, _ := s.AddTagToGame(ctx, g.ID, "ホラー", AxisGenre)
	if err := s.SetTagColor(ctx, tag.ID, "rose"); err != nil {
		t.Fatalf("SetTagColor: %v", err)
	}

	if err := s.RenameTag(ctx, tag.ID, "サスペンス"); err != nil {
		t.Fatalf("RenameTag: %v", err)
	}
	// game_tags は tag_id 参照なので、付与済みゲームにも新名が波及する（色・axis は維持）
	got, _ := s.GetGame(ctx, g.ID)
	if len(got.Tags) != 1 || got.Tags[0].Name != "サスペンス" {
		t.Fatalf("game tags should reflect new name, got %+v", got.Tags)
	}
	if got.Tags[0].Color != "rose" || got.Tags[0].Axis != AxisGenre {
		t.Errorf("color and axis should be kept, got %+v", got.Tags[0])
	}
	tags, _ := s.ListTags(ctx)
	if len(tags) != 1 || tags[0].Name != "サスペンス" {
		t.Errorf("ListTags should return new name, got %+v", tags)
	}
}

func TestRenameTagTrimsSpaceAndRejectsEmpty(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	g, _ := s.AddGame(ctx, NewGame{Title: "A", FolderPath: "/games/a"})
	tag, _ := s.AddTagToGame(ctx, g.ID, "ホラー", AxisGenre)

	// 前後の空白は TrimSpace して保存される
	if err := s.RenameTag(ctx, tag.ID, " サスペンス "); err != nil {
		t.Fatalf("RenameTag: %v", err)
	}
	tags, _ := s.ListTags(ctx)
	if len(tags) != 1 || tags[0].Name != "サスペンス" {
		t.Errorf("name should be trimmed, got %+v", tags)
	}

	// 空・空白のみは拒否
	if err := s.RenameTag(ctx, tag.ID, "   "); err == nil {
		t.Error("blank name should be rejected")
	} else if !strings.Contains(err.Error(), "タグ名が空です") {
		t.Errorf("エラーメッセージが日本語化されていない: %v", err)
	}
}

func TestRenameTagDuplicateNameRejected(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	g, _ := s.AddGame(ctx, NewGame{Title: "A", FolderPath: "/games/a"})
	t1, _ := s.AddTagToGame(ctx, g.ID, "ホラー", AxisGenre)
	if _, err := s.AddTagToGame(ctx, g.ID, "RPG", AxisGenre); err != nil {
		t.Fatalf("AddTagToGame(2): %v", err)
	}

	// 別の既存タグと同名になるリネームはマージせずエラー
	if err := s.RenameTag(ctx, t1.ID, "RPG"); err == nil {
		t.Error("rename to existing tag name should be rejected")
	} else if !strings.Contains(err.Error(), "同じ名前のタグが既にあります") {
		t.Errorf("エラーメッセージが日本語化されていない: %v", err)
	}
}

func TestRenameTagSameNameIsNoop(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	g, _ := s.AddGame(ctx, NewGame{Title: "A", FolderPath: "/games/a"})
	tag, _ := s.AddTagToGame(ctx, g.ID, "ホラー", AxisGenre)

	// 同じ名前へのリネームは変更なしで成功する
	if err := s.RenameTag(ctx, tag.ID, "ホラー"); err != nil {
		t.Fatalf("rename to same name should be no-op: %v", err)
	}
	tags, _ := s.ListTags(ctx)
	if len(tags) != 1 || tags[0].Name != "ホラー" {
		t.Errorf("tag should be unchanged, got %+v", tags)
	}
}

func TestRenameTagMissingTagReturnsJapaneseError(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	if err := s.RenameTag(ctx, 999, "新名"); err == nil {
		t.Fatal("存在しない tagID なのにエラーが nil")
	} else if !strings.Contains(err.Error(), "タグが見つかりません") {
		t.Errorf("エラーメッセージが日本語化されていない: %v", err)
	}
}

func TestDeleteTag(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	a, _ := s.AddGame(ctx, NewGame{Title: "A", FolderPath: "/games/a"})
	b, _ := s.AddGame(ctx, NewGame{Title: "B", FolderPath: "/games/b"})
	target, _ := s.AddTagToGame(ctx, a.ID, "ホラー", AxisGenre)
	if _, err := s.AddTagToGame(ctx, b.ID, "ホラー", AxisGenre); err != nil {
		t.Fatalf("AddTagToGame(b): %v", err)
	}
	other, _ := s.AddTagToGame(ctx, a.ID, "積みゲー", AxisOther)

	if err := s.DeleteTag(ctx, target.ID); err != nil {
		t.Fatalf("DeleteTag: %v", err)
	}
	// タグ行が消え、付与されていた全ゲームからも消える（game_tags は ON DELETE CASCADE）
	tags, _ := s.ListTags(ctx)
	if len(tags) != 1 || tags[0].ID != other.ID {
		t.Fatalf("only the other tag should remain, got %+v", tags)
	}
	gotA, _ := s.GetGame(ctx, a.ID)
	if len(gotA.Tags) != 1 || gotA.Tags[0].ID != other.ID {
		t.Errorf("game A should keep only the other tag, got %+v", gotA.Tags)
	}
	gotB, _ := s.GetGame(ctx, b.ID)
	if len(gotB.Tags) != 0 {
		t.Errorf("game B tags should be empty, got %+v", gotB.Tags)
	}
	// ゲーム自体は無影響
	games, _ := s.ListGames(ctx)
	if len(games) != 2 {
		t.Errorf("games should be unaffected, got %d games", len(games))
	}
}

func TestDeleteTagMissingIsIdempotent(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	// 存在しない tagID の削除はエラーにならない（RemoveTagFromGame と同じ方針）
	if err := s.DeleteTag(ctx, 999); err != nil {
		t.Fatalf("delete missing tag should be idempotent: %v", err)
	}
}

func TestSetTagAxis(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	g, _ := s.AddGame(ctx, NewGame{Title: "A", FolderPath: "/games/a"})
	tag, _ := s.AddTagToGame(ctx, g.ID, "ホラー", AxisGenre)
	if err := s.SetTagColor(ctx, tag.ID, "rose"); err != nil {
		t.Fatalf("SetTagColor: %v", err)
	}

	// genre → other
	if err := s.SetTagAxis(ctx, tag.ID, AxisOther); err != nil {
		t.Fatalf("SetTagAxis(other): %v", err)
	}
	got, _ := s.GetGame(ctx, g.ID)
	if len(got.Tags) != 1 || got.Tags[0].Axis != AxisOther {
		t.Fatalf("axis should be other, got %+v", got.Tags)
	}
	if got.Tags[0].Color != "rose" {
		t.Errorf("color should be kept, got %q", got.Tags[0].Color)
	}

	// other → genre
	if err := s.SetTagAxis(ctx, tag.ID, AxisGenre); err != nil {
		t.Fatalf("SetTagAxis(genre): %v", err)
	}
	got, _ = s.GetGame(ctx, g.ID)
	if len(got.Tags) != 1 || got.Tags[0].Axis != AxisGenre {
		t.Errorf("axis should be back to genre, got %+v", got.Tags)
	}

	// 同じ軸への再設定もエラーにならない（存在判定は RowsAffected==0 に依存しており、
	// SQLite ドライバが同値 UPDATE でもマッチ行を数える前提の明文化）
	if err := s.SetTagAxis(ctx, tag.ID, AxisGenre); err != nil {
		t.Errorf("re-setting same axis should be no-op: %v", err)
	}
}

func TestSetTagAxisRejectsInvalidAxis(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	g, _ := s.AddGame(ctx, NewGame{Title: "A", FolderPath: "/games/a"})
	tag, _ := s.AddTagToGame(ctx, g.ID, "ホラー", AxisGenre)

	// 有効軸は genre / other のみ。旧 'tool' や空文字は拒否する
	for _, axis := range []string{"tool", "", "unknown"} {
		if err := s.SetTagAxis(ctx, tag.ID, axis); err == nil {
			t.Errorf("axis %q should be rejected", axis)
		} else if !strings.Contains(err.Error(), "不正なタグ軸です") {
			t.Errorf("axis %q: エラーメッセージが日本語化されていない: %v", axis, err)
		}
	}
}

func TestSetTagAxisMissingTagReturnsJapaneseError(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	if err := s.SetTagAxis(ctx, 999, AxisGenre); err == nil {
		t.Fatal("存在しない tagID なのにエラーが nil")
	} else if !strings.Contains(err.Error(), "タグが見つかりません") {
		t.Errorf("エラーメッセージが日本語化されていない: %v", err)
	}
}

func TestCreateTag(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	// ゲームに紐付けない新規タグ登録
	tag, err := s.CreateTag(ctx, "ホラー", AxisGenre)
	if err != nil {
		t.Fatalf("CreateTag: %v", err)
	}
	if tag.ID == 0 || tag.Name != "ホラー" || tag.Axis != AxisGenre || tag.Color != "" {
		t.Errorf("unexpected tag: %+v", tag)
	}
	tags, _ := s.ListTags(ctx)
	if len(tags) != 1 || tags[0].ID != tag.ID || tags[0].Count != 0 {
		t.Errorf("want 1 tag with count 0, got %+v", tags)
	}
}

func TestCreateTagTrimsSpaceAndRejectsEmpty(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	// 前後の空白は TrimSpace して保存される
	tag, err := s.CreateTag(ctx, " ホラー ", AxisGenre)
	if err != nil {
		t.Fatalf("CreateTag: %v", err)
	}
	if tag.Name != "ホラー" {
		t.Errorf("name should be trimmed, got %q", tag.Name)
	}

	// 空・空白のみは拒否
	if _, err := s.CreateTag(ctx, "   ", AxisGenre); err == nil {
		t.Error("blank name should be rejected")
	} else if !strings.Contains(err.Error(), "タグ名が空です") {
		t.Errorf("エラーメッセージが日本語化されていない: %v", err)
	}
}

func TestCreateTagDuplicateNameRejected(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	if _, err := s.CreateTag(ctx, "ホラー", AxisGenre); err != nil {
		t.Fatalf("CreateTag: %v", err)
	}
	if _, err := s.CreateTag(ctx, "ホラー", AxisOther); err == nil {
		t.Error("duplicate tag name should be rejected")
	} else if !strings.Contains(err.Error(), "同じ名前のタグが既にあります") {
		t.Errorf("エラーメッセージが日本語化されていない: %v", err)
	}
}

func TestCreateTagRejectsInvalidAxis(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	// AddTagToGame と違い other への丸めはせず、不正な軸はエラーにする
	for _, axis := range []string{"tool", "", "unknown"} {
		if _, err := s.CreateTag(ctx, "ホラー", axis); err == nil {
			t.Errorf("axis %q should be rejected", axis)
		} else if !strings.Contains(err.Error(), "不正なタグ軸です") {
			t.Errorf("axis %q: エラーメッセージが日本語化されていない: %v", axis, err)
		}
	}
}

func TestCreateTagReusedByAddTagToGame(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	tag, err := s.CreateTag(ctx, "ホラー", AxisGenre)
	if err != nil {
		t.Fatalf("CreateTag: %v", err)
	}
	g, _ := s.AddGame(ctx, NewGame{Title: "A", FolderPath: "/games/a"})

	// 作成済みタグ名での AddTagToGame は新規作成せず既存タグ（同 ID）を使う
	attached, err := s.AddTagToGame(ctx, g.ID, "ホラー", AxisOther)
	if err != nil {
		t.Fatalf("AddTagToGame: %v", err)
	}
	if attached.ID != tag.ID || attached.Axis != AxisGenre {
		t.Errorf("existing tag should be reused with original axis: %+v vs %+v", tag, attached)
	}
	tags, _ := s.ListTags(ctx)
	if len(tags) != 1 || tags[0].Count != 1 {
		t.Errorf("want 1 tag with count 1, got %+v", tags)
	}
}

func TestQueryGamesLogsMalformedAddedAt(t *testing.T) {
	// added_at のパース失敗を握りつぶさず log.Printf で警告すること
	// （フォールバック先がゼロ値になる既存動作自体は維持される）
	s := newTestStore(t)
	ctx := context.Background()

	if _, err := s.db.Exec(
		`INSERT INTO games (title, folder_path, added_at) VALUES (?, ?, ?)`,
		"壊れたデータ", "/games/broken", "not-a-valid-timestamp",
	); err != nil {
		t.Fatalf("insert malformed row: %v", err)
	}

	origOut := log.Writer()
	var buf bytes.Buffer
	log.SetOutput(&buf)
	defer log.SetOutput(origOut)

	g, err := s.GetGame(ctx, 1)
	if err != nil {
		t.Fatalf("GetGame: %v", err)
	}
	if !g.AddedAt.IsZero() {
		t.Errorf("malformed added_at should fall back to zero value, got %v", g.AddedAt)
	}
	if !strings.Contains(buf.String(), "added_at") {
		t.Errorf("parse error should be logged with added_at context, log output: %q", buf.String())
	}
}

func TestSetLocationUpdatesPathsAndSize(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	g, err := s.AddGame(ctx, NewGame{
		Title:      "引っ越すゲーム",
		ExePath:    "Game.exe",
		FolderPath: "/mnt/d/games/old",
		SizeBytes:  100,
		Tool:       "Unity",
		Tags:       []Tag{{Name: "RPG", Axis: AxisGenre}},
	})
	if err != nil {
		t.Fatalf("AddGame: %v", err)
	}

	if err := s.SetLocation(ctx, g.ID, "/mnt/e/games/new", "bin/Game2.exe", 200); err != nil {
		t.Fatalf("SetLocation: %v", err)
	}

	got, err := s.GetGame(ctx, g.ID)
	if err != nil {
		t.Fatalf("GetGame: %v", err)
	}
	if got.FolderPath != "/mnt/e/games/new" || got.ExePath != "bin/Game2.exe" || got.SizeBytes != 200 {
		t.Errorf("保存先が更新されていない: %+v", got)
	}
	// 再紐付けはタイトル・タグ・お気に入り等のユーザー編集を保持する（これが自動削除しない理由でもある）
	if got.Title != "引っ越すゲーム" || got.Tool != "Unity" || len(got.Tags) != 1 {
		t.Errorf("ユーザー編集が失われている: %+v", got)
	}
}

func TestSetLocationRejectsDuplicateFolder(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	a, err := s.AddGame(ctx, NewGame{Title: "A", ExePath: "A.exe", FolderPath: "/games/a"})
	if err != nil {
		t.Fatalf("AddGame(A): %v", err)
	}
	if _, err := s.AddGame(ctx, NewGame{Title: "B", ExePath: "B.exe", FolderPath: "/games/b"}); err != nil {
		t.Fatalf("AddGame(B): %v", err)
	}

	err = s.SetLocation(ctx, a.ID, "/games/b", "B.exe", 10)
	if err == nil {
		t.Fatal("別ゲームが使っているフォルダへの変更なのにエラーが nil")
	}
	if !strings.Contains(err.Error(), "別のゲーム") {
		t.Errorf("日本語の重複エラーになっていない: %v", err)
	}
	// 失敗時は元の保存先が保たれる
	got, err := s.GetGame(ctx, a.ID)
	if err != nil {
		t.Fatalf("GetGame: %v", err)
	}
	if got.FolderPath != "/games/a" {
		t.Errorf("失敗したのに保存先が変わっている: %q", got.FolderPath)
	}
}

func TestSetLocationRejectsEmptyFolder(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	g, err := s.AddGame(ctx, NewGame{Title: "A", ExePath: "A.exe", FolderPath: "/games/a"})
	if err != nil {
		t.Fatalf("AddGame: %v", err)
	}
	if err := s.SetLocation(ctx, g.ID, "  ", "A.exe", 10); err == nil {
		t.Error("空のフォルダパスが受け入れられた")
	}
}

func TestSetLocationMissingIDIsError(t *testing.T) {
	s := newTestStore(t)
	err := s.SetLocation(context.Background(), 999, "/games/x", "X.exe", 10)
	if err == nil {
		t.Fatal("存在しない ID なのにエラーが nil")
	}
	if !strings.Contains(err.Error(), "見つかりません") {
		t.Errorf("日本語エラーになっていない: %v", err)
	}
}

// HasFolders は候補ごとの HasFolder をまとめた1クエリ版。
// 登録済みのパスだけをキーに持ち、未登録はキー無し（ゼロ値 false）で表す。
func TestHasFolders(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	for _, folder := range []string{`D:\Games\Alpha`, `D:\Games\Beta`} {
		if _, err := s.AddGame(ctx, NewGame{Title: folder, ExePath: "Game.exe", FolderPath: folder}); err != nil {
			t.Fatalf("AddGame(%q): %v", folder, err)
		}
	}

	got, err := s.HasFolders(ctx, []string{`D:\Games\Alpha`, `D:\Games\Gamma`})
	if err != nil {
		t.Fatalf("HasFolders: %v", err)
	}
	if !got[`D:\Games\Alpha`] {
		t.Error("登録済みフォルダが true になっていない")
	}
	if got[`D:\Games\Gamma`] {
		t.Error("未登録フォルダが true になっている")
	}
	if len(got) != 1 {
		t.Errorf("登録済みの1件だけをキーに持つべき: %+v", got)
	}
}

// Windows の NTFS は大文字小文字を区別しないため、綴り違いのパスでも
// 登録済みと判定できなければ二重登録を招く（HasFolder と同じ不変条件）。
func TestHasFoldersIsCaseInsensitive(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	if _, err := s.AddGame(ctx, NewGame{Title: "A", ExePath: "Game.exe", FolderPath: `D:\Games\Alpha`}); err != nil {
		t.Fatalf("AddGame: %v", err)
	}

	// 渡した文字列そのものがキーになる（呼び出し元が正規化せずに引ける）
	got, err := s.HasFolders(ctx, []string{`d:\games\ALPHA`})
	if err != nil {
		t.Fatalf("HasFolders: %v", err)
	}
	if !got[`d:\games\ALPHA`] {
		t.Errorf("大文字小文字違いで登録済みと判定されていない: %+v", got)
	}
}

func TestHasFoldersEmptyInput(t *testing.T) {
	s := newTestStore(t)
	got, err := s.HasFolders(context.Background(), nil)
	if err != nil {
		t.Fatalf("HasFolders: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("空入力では空マップを返すべき: %+v", got)
	}
}

// バインド変数数の上限（SQLITE_MAX_VARIABLE_NUMBER）を超える件数でも
// バッチ分割で正しく引けること。境界をまたぐよう batch サイズ + 1 件を登録する。
func TestHasFoldersSplitsIntoBatches(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()
	n := hasFoldersBatchSize + 1
	paths := make([]string, 0, n+1)
	for i := 0; i < n; i++ {
		folder := fmt.Sprintf(`D:\Games\G%04d`, i)
		if _, err := s.AddGame(ctx, NewGame{Title: folder, ExePath: "Game.exe", FolderPath: folder}); err != nil {
			t.Fatalf("AddGame(%q): %v", folder, err)
		}
		paths = append(paths, folder)
	}
	paths = append(paths, `D:\Games\NotRegistered`)

	got, err := s.HasFolders(ctx, paths)
	if err != nil {
		t.Fatalf("HasFolders: %v", err)
	}
	if len(got) != n {
		t.Fatalf("登録済み %d 件を返すべき: got %d 件", n, len(got))
	}
	if got[`D:\Games\NotRegistered`] {
		t.Error("未登録フォルダが true になっている")
	}
}
