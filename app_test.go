package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"d-game-manager/internal/health"
	"d-game-manager/internal/scan"
	"d-game-manager/internal/store"
)

// newTestApp は wails ランタイム無しで ImportGames 等を試すための App を作る。
func newTestApp(t *testing.T) *App {
	t.Helper()
	s, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return &App{ctx: context.Background(), store: s}
}

func detected(title, folder, tool string) scan.Detected {
	return scan.Detected{Title: title, FolderPath: folder, ExePath: "Game.exe", SizeBytes: 100, Tool: tool}
}

// writeExe は scan.ScanFolder が検出できるように、dir 直下に空の exe ファイルを置く
// （pickExe はファイル名しか見ないため内容は不要）。
func writeExe(t *testing.T, dir, name string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte{}, 0o644); err != nil {
		t.Fatalf("writeExe: %v", err)
	}
}

func TestImportGamesAllSuccess(t *testing.T) {
	a := newTestApp(t)

	result, err := a.ImportGames([]scan.Detected{
		detected("A", "/games/a", "Unity"),
		detected("B", "/games/b", "未判別"),
	})
	if err != nil {
		t.Fatalf("ImportGames: %v", err)
	}
	if len(result.Games) != 2 || len(result.Failed) != 0 || result.RefreshFailed {
		t.Fatalf("want 2 games / no failures, got %+v", result)
	}
}

func TestImportGamesSavesToolAsAttribute(t *testing.T) {
	a := newTestApp(t)

	// scan の tool は games.tool 属性として保存され、タグは1件も作られない
	result, err := a.ImportGames([]scan.Detected{
		detected("A", "/games/a", "Unity"),
		detected("B", "/games/b", "未判別"),
	})
	if err != nil {
		t.Fatalf("ImportGames: %v", err)
	}
	tools := map[string]string{}
	for _, g := range result.Games {
		tools[g.Title] = g.Tool
		if len(g.Tags) != 0 {
			t.Errorf("%s: import should not create tags, got %+v", g.Title, g.Tags)
		}
	}
	if tools["A"] != "Unity" || tools["B"] != "未判別" {
		t.Errorf("tool should be saved as attribute, got %+v", tools)
	}
	tags, err := a.ListTags()
	if err != nil {
		t.Fatalf("ListTags: %v", err)
	}
	if len(tags) != 0 {
		t.Errorf("no tag rows should be created on import, got %+v", tags)
	}
}

func TestSetToolBinding(t *testing.T) {
	a := newTestApp(t)

	result, err := a.ImportGames([]scan.Detected{detected("A", "/games/a", "未判別")})
	if err != nil || len(result.Games) != 1 {
		t.Fatalf("ImportGames: %v / %+v", err, result)
	}
	id := result.Games[0].ID
	if err := a.SetTool(id, "WOLF RPG"); err != nil {
		t.Fatalf("SetTool: %v", err)
	}
	games, err := a.ListGames()
	if err != nil {
		t.Fatalf("ListGames: %v", err)
	}
	if len(games) != 1 || games[0].Tool != "WOLF RPG" {
		t.Errorf("want WOLF RPG, got %+v", games)
	}
}

func TestTagManagementBindings(t *testing.T) {
	a := newTestApp(t)

	// 作成 → リネーム → 軸変更 → 削除の一連の流れが store 層に委譲されること
	tag, err := a.CreateTag("ホラー", store.AxisGenre)
	if err != nil {
		t.Fatalf("CreateTag: %v", err)
	}
	if tag.ID == 0 || tag.Name != "ホラー" || tag.Axis != store.AxisGenre {
		t.Fatalf("unexpected tag: %+v", tag)
	}

	if err := a.RenameTag(tag.ID, "サスペンス"); err != nil {
		t.Fatalf("RenameTag: %v", err)
	}
	if err := a.SetTagAxis(tag.ID, store.AxisOther); err != nil {
		t.Fatalf("SetTagAxis: %v", err)
	}
	tags, err := a.ListTags()
	if err != nil {
		t.Fatalf("ListTags: %v", err)
	}
	if len(tags) != 1 || tags[0].Name != "サスペンス" || tags[0].Axis != store.AxisOther {
		t.Fatalf("rename/axis change should be reflected, got %+v", tags)
	}

	if err := a.DeleteTag(tag.ID); err != nil {
		t.Fatalf("DeleteTag: %v", err)
	}
	tags, err = a.ListTags()
	if err != nil {
		t.Fatalf("ListTags after delete: %v", err)
	}
	if len(tags) != 0 {
		t.Errorf("tag should be deleted, got %+v", tags)
	}
}

func TestCreateTagBindingRejectsEmptyName(t *testing.T) {
	a := newTestApp(t)

	// store 層のバリデーションエラーがそのまま返ること（代表1件）
	if _, err := a.CreateTag("   ", store.AxisGenre); err == nil {
		t.Fatal("blank name should be rejected")
	} else if !strings.Contains(err.Error(), "タグ名が空です") {
		t.Errorf("エラーメッセージが日本語化されていない: %v", err)
	}
}

func TestImportGamesPartialFailure(t *testing.T) {
	a := newTestApp(t)

	// 同一 folder_path を2回登録 → 2件目は UNIQUE 制約で失敗するが処理は続行される
	result, err := a.ImportGames([]scan.Detected{
		detected("A", "/games/a", "未判別"),
		detected("A重複", "/games/a", "未判別"),
		detected("B", "/games/b", "未判別"),
	})
	if err != nil {
		t.Fatalf("ImportGames: %v", err)
	}
	if len(result.Games) != 2 {
		t.Errorf("want 2 committed games, got %d", len(result.Games))
	}
	if len(result.Failed) != 1 || result.Failed[0].Title != "A重複" || result.Failed[0].Reason == "" {
		t.Errorf("want 1 failure with reason, got %+v", result.Failed)
	}
	if result.RefreshFailed {
		t.Error("refresh should have succeeded")
	}
}

func TestImportGamesEmptyLibraryIsNotRefreshFailure(t *testing.T) {
	a := newTestApp(t)

	// 何も取り込まない空ライブラリ: Games は空スライス（null ではない）で RefreshFailed=false
	result, err := a.ImportGames(nil)
	if err != nil {
		t.Fatalf("ImportGames: %v", err)
	}
	if result.Games == nil || len(result.Games) != 0 || result.RefreshFailed {
		t.Fatalf("empty library should be Games=[] / RefreshFailed=false, got %+v", result)
	}
}

func TestImportGamesRefreshFailureDistinguished(t *testing.T) {
	a := newTestApp(t)

	// DB を閉じて一覧再取得を失敗させる（登録0件なので AddGame は走らない）
	a.store.Close()
	result, err := a.ImportGames(nil)
	if err != nil {
		t.Fatalf("ImportGames should not error on refresh failure: %v", err)
	}
	if !result.RefreshFailed {
		t.Fatalf("want RefreshFailed=true, got %+v", result)
	}
}

func TestScanFoldersExcludesRegistered(t *testing.T) {
	a := newTestApp(t)
	dir := t.TempDir()
	writeExe(t, dir, "Game.exe")
	folder := filepath.Clean(dir) // scan.ScanFolder が返す FolderPath と揃える

	if _, err := a.store.AddGame(a.ctx, store.NewGame{Title: "既存", ExePath: "Game.exe", FolderPath: folder}); err != nil {
		t.Fatalf("AddGame: %v", err)
	}

	got, err := a.ScanFolders([]string{dir})
	if err != nil {
		t.Fatalf("ScanFolders: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("登録済みフォルダが除外されていない: %+v", got)
	}
}

func TestScanFoldersDedupesAcrossPaths(t *testing.T) {
	a := newTestApp(t)
	dir := t.TempDir()
	writeExe(t, dir, "Game.exe")

	// 同じフォルダを複数パスから渡しても1件にまとめる
	got, err := a.ScanFolders([]string{dir, dir})
	if err != nil {
		t.Fatalf("ScanFolders: %v", err)
	}
	if len(got) != 1 {
		t.Errorf("重複が排除されていない: %+v", got)
	}
}

// 同じフォルダを2回ドロップしたときは走査自体を1回に畳む。結果の重複排除
// （seen）だけでは走査が二重に走り、進捗の分母も二重に計上されてしまう。
// 分母が水増しされないことを進捗イベントで観測する。
func TestScanFoldersDedupesDuplicateInputPaths(t *testing.T) {
	a := newTestApp(t)
	dir := t.TempDir()
	writeExe(t, dir, "Game.exe")

	var events [][2]int
	a.emitEvent = func(name string, data any) {
		if name != "scan:progress" {
			t.Errorf("unexpected event %q", name)
			return
		}
		p := data.(map[string]any)
		events = append(events, [2]int{p["current"].(int), p["total"].(int)})
	}

	got, err := a.ScanFolders([]string{dir, dir})
	if err != nil {
		t.Fatalf("ScanFolders: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("1件のはず: %+v", got)
	}
	// 畳まないと {1,2},{2,2} の2イベントになる
	if len(events) != 1 || events[0] != [2]int{1, 1} {
		t.Errorf("走査が重複している（分母が水増しされている）: %+v", events)
	}
}

// 末尾セパレータ違いも完全重複として畳む（normFolderKey の filepath.Clean）。
func TestScanFoldersDedupesTrailingSeparator(t *testing.T) {
	a := newTestApp(t)
	dir := t.TempDir()
	writeExe(t, dir, "Game.exe")

	count := 0
	a.emitEvent = func(string, any) { count++ }

	got, err := a.ScanFolders([]string{dir, dir + string(os.PathSeparator)})
	if err != nil {
		t.Fatalf("ScanFolders: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("1件のはず: %+v", got)
	}
	if count != 1 {
		t.Errorf("末尾セパレータ違いが畳まれていない（進捗 %d 回）", count)
	}
}

// **入力のネストは畳んではいけない**。ScanFolderProgress は1階層しか見ないため、
// 親をスキャンしても孫にあたるゲームは検出されない。「親が入力にあるから子は不要」
// と判断して子を捨てると、子の配下のゲームを丸ごと取りこぼす（Issue #50）。
func TestScanFoldersKeepsNestedInputPaths(t *testing.T) {
	a := newTestApp(t)
	parent := t.TempDir()
	// parent/mid 自体はゲームではない（exe を置かない）。その直下にゲームを作る
	mid := filepath.Join(parent, "mid")
	game := filepath.Join(mid, "GameA")
	if err := os.MkdirAll(game, 0o755); err != nil {
		t.Fatal(err)
	}
	writeExe(t, game, "GameA.exe")

	// parent だけを渡しても検出できないことを先に確かめる（前提の固定）
	onlyParent, err := a.ScanFolders([]string{parent})
	if err != nil {
		t.Fatalf("ScanFolders(parent): %v", err)
	}
	if len(onlyParent) != 0 {
		t.Fatalf("親のスキャンは1階層しか見ないので検出0件のはず: %+v", onlyParent)
	}

	// 親と子を同時に渡したら、子のスキャンによって GameA が検出されること
	got, err := a.ScanFolders([]string{parent, mid})
	if err != nil {
		t.Fatalf("ScanFolders(parent, mid): %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("ネストを畳むと取りこぼす: got %+v", got)
	}
	if filepath.Clean(got[0].FolderPath) != filepath.Clean(game) {
		t.Errorf("検出されたフォルダが違う: %q", got[0].FolderPath)
	}
}

// 登録済み判定が DB エラーで失敗しても ScanFolders はエラーを返さず、
// 判定できなかった候補を黙って落として続行する（onErr を渡す呼び出し元の方針）。
// バッチクエリ失敗時のフォールバック経路もここを通る。
func TestScanFoldersContinuesOnRegisteredCheckFailure(t *testing.T) {
	a := newTestApp(t)
	dir := t.TempDir()
	writeExe(t, dir, "Game.exe")

	a.store.Close() // 以降の登録済み判定は全て失敗する

	got, err := a.ScanFolders([]string{dir})
	if err != nil {
		t.Fatalf("判定失敗はエラーにせず続行すべき: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("判定できなかった候補は落とすべき: %+v", got)
	}
}

func TestScanFoldersSkipsStatFailure(t *testing.T) {
	a := newTestApp(t)
	dir := t.TempDir()
	writeExe(t, dir, "Game.exe")

	// 存在しないパスは stat 失敗として読み飛ばし、他のパスの処理は続行する
	got, err := a.ScanFolders([]string{filepath.Join(dir, "does-not-exist"), dir})
	if err != nil {
		t.Fatalf("ScanFolders: %v", err)
	}
	if len(got) != 1 {
		t.Errorf("stat 失敗が他のパスの処理をブロックした: %+v", got)
	}
}

func TestScanFoldersEmitsSequentialProgress(t *testing.T) {
	a := newTestApp(t)
	// ルート2つ（単体ゲーム + サブフォルダ2つの親フォルダ）= 分母3の通し番号になる
	single := t.TempDir()
	writeExe(t, single, "Game.exe")
	parent := t.TempDir()
	for _, name := range []string{"a", "b"} {
		sub := filepath.Join(parent, name)
		if err := os.Mkdir(sub, 0o755); err != nil {
			t.Fatal(err)
		}
		writeExe(t, sub, name+".exe")
	}

	type event struct {
		current, total int
	}
	var events []event
	a.emitEvent = func(name string, data any) {
		if name != "scan:progress" {
			t.Errorf("unexpected event %q", name)
			return
		}
		p := data.(map[string]any)
		events = append(events, event{p["current"].(int), p["total"].(int)})
	}

	if _, err := a.ScanFolders([]string{single, parent}); err != nil {
		t.Fatalf("ScanFolders: %v", err)
	}
	want := []event{{1, 3}, {2, 3}, {3, 3}}
	if len(events) != len(want) {
		t.Fatalf("want %d events, got %+v", len(want), events)
	}
	for i, w := range want {
		if events[i] != w {
			t.Errorf("event %d: want %+v, got %+v", i, w, events[i])
		}
	}
}

func TestResetLibraryClearsDBAndCovers(t *testing.T) {
	coversDirOverride = t.TempDir()
	t.Cleanup(func() { coversDirOverride = "" })

	a := newTestApp(t)
	if _, err := a.ImportGames([]scan.Detected{detected("A", "/games/a", "Unity")}); err != nil {
		t.Fatalf("ImportGames: %v", err)
	}
	if err := os.WriteFile(filepath.Join(coversDir(), "1_123.png"), []byte("dummy"), 0o644); err != nil {
		t.Fatalf("write dummy cover: %v", err)
	}

	if err := a.ResetLibrary(); err != nil {
		t.Fatalf("ResetLibrary: %v", err)
	}

	games, err := a.ListGames()
	if err != nil {
		t.Fatalf("ListGames: %v", err)
	}
	if len(games) != 0 {
		t.Errorf("games should be empty, got %+v", games)
	}
	// covers ディレクトリ配下（ディレクトリごと）が消えている
	if _, statErr := os.Stat(coversDir()); !os.IsNotExist(statErr) {
		t.Errorf("covers dir should be removed, stat: %v", statErr)
	}
}

func TestResetLibraryKeepsCoversOnDBFailure(t *testing.T) {
	coversDirOverride = t.TempDir()
	t.Cleanup(func() { coversDirOverride = "" })

	a := newTestApp(t)
	cover := filepath.Join(coversDir(), "1_123.png")
	if err := os.WriteFile(cover, []byte("dummy"), 0o644); err != nil {
		t.Fatalf("write dummy cover: %v", err)
	}

	// DB を閉じて ResetAll を失敗させる → covers には未着手であること（DB → covers の順序保証）
	a.store.Close()
	if err := a.ResetLibrary(); err == nil {
		t.Fatal("ResetLibrary should fail after db close")
	}
	if _, statErr := os.Stat(cover); statErr != nil {
		t.Errorf("cover file should survive db failure, stat: %v", statErr)
	}
}

func TestResetLibraryNeverTouchesGameFolders(t *testing.T) {
	// 不変条件: ResetLibrary はアプリの管理データ（DB 行・covers）だけを消し、
	// ゲーム本体のフォルダ（folderPath 配下）には一切触れない
	coversDirOverride = t.TempDir()
	t.Cleanup(func() { coversDirOverride = "" })

	a := newTestApp(t)
	gameDir := t.TempDir() // ゲーム本体フォルダのダミー
	writeExe(t, gameDir, "Game.exe")
	if _, err := a.ImportGames([]scan.Detected{{
		Title: "本体あり", FolderPath: gameDir, ExePath: "Game.exe", SizeBytes: 100, Tool: "未判別",
	}}); err != nil {
		t.Fatalf("ImportGames: %v", err)
	}

	if err := a.ResetLibrary(); err != nil {
		t.Fatalf("ResetLibrary: %v", err)
	}

	if _, err := os.Stat(filepath.Join(gameDir, "Game.exe")); err != nil {
		t.Errorf("game folder contents must be untouched: %v", err)
	}
}

func TestSaveCoverRollsBackFileOnDBFailure(t *testing.T) {
	coversDirOverride = t.TempDir()
	t.Cleanup(func() { coversDirOverride = "" })

	a := newTestApp(t)
	a.store.Close() // SetCoverPath を確実に失敗させる

	name := fmt.Sprintf("rollback_%d.png", time.Now().UnixNano())
	wrote := false
	_, err := a.saveCover(1, name, func(dst string) error {
		wrote = true
		return os.WriteFile(dst, []byte("dummy"), 0o644)
	})
	if err == nil {
		t.Fatal("DB クローズ後は SetCoverPath が失敗するはず")
	}
	if !wrote {
		t.Fatal("write が呼ばれていない")
	}
	if _, statErr := os.Stat(filepath.Join(coversDir(), name)); !os.IsNotExist(statErr) {
		t.Errorf("書き込み済みファイルがロールバックされていない: %v", statErr)
	}
}

// assertJapaneseNotFoundError は「存在しない ID を GetGame に渡した」ことによるエラーが
// sql.ErrNoRows を %w でラップした日本語メッセージになっていることを検証する。
func assertJapaneseNotFoundError(t *testing.T, err error) {
	t.Helper()
	if err == nil {
		t.Fatal("存在しない ID なのにエラーが nil")
	}
	if !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("sql.ErrNoRows がラップされていない: %v", err)
	}
	if !strings.Contains(err.Error(), "ゲーム情報の取得に失敗しました") {
		t.Errorf("エラーメッセージが日本語化されていない: %v", err)
	}
}

func TestLaunchGameNotFoundReturnsJapaneseError(t *testing.T) {
	a := newTestApp(t)
	assertJapaneseNotFoundError(t, a.LaunchGame(999))
}

func TestOpenGameFolderNotFoundReturnsJapaneseError(t *testing.T) {
	a := newTestApp(t)
	assertJapaneseNotFoundError(t, a.OpenGameFolder(999))
}

func TestDeleteGameNotFoundReturnsJapaneseError(t *testing.T) {
	a := newTestApp(t)
	assertJapaneseNotFoundError(t, a.DeleteGame(999))
}

func TestSelectCoverImageNotFoundReturnsJapaneseError(t *testing.T) {
	a := newTestApp(t)
	// GetGame の時点で早期リターンするため runtime.OpenFileDialog（wails ランタイム未初期化）には到達しない
	_, err := a.SelectCoverImage(999)
	assertJapaneseNotFoundError(t, err)
}

func TestResetCoverNotFoundReturnsJapaneseError(t *testing.T) {
	a := newTestApp(t)
	assertJapaneseNotFoundError(t, a.ResetCover(999))
}

// importOne は1件だけ取り込んで登録後のゲームを返す（存在確認系テストのセットアップ用）。
func importOne(t *testing.T, a *App, title, folder, exe string) store.Game {
	t.Helper()
	result, err := a.ImportGames([]scan.Detected{
		{Title: title, FolderPath: folder, ExePath: exe, SizeBytes: 100, Tool: store.ToolUnknown},
	})
	if err != nil {
		t.Fatalf("ImportGames(%q): %v", title, err)
	}
	for _, g := range result.Games {
		if g.Title == title {
			return g
		}
	}
	t.Fatalf("取り込んだ %q が一覧に無い", title)
	return store.Game{}
}

func TestCheckMissingGamesReportsOnlyMissing(t *testing.T) {
	a := newTestApp(t)

	okDir := t.TempDir()
	writeExe(t, okDir, "Game.exe")
	noExeDir := t.TempDir() // フォルダはあるが exe を置かない
	goneDir := filepath.Join(t.TempDir(), "removed")

	okGame := importOne(t, a, "正常", okDir, "Game.exe")
	noExeGame := importOne(t, a, "exe不在", noExeDir, "Game.exe")
	goneGame := importOne(t, a, "フォルダ不在", goneDir, "Game.exe")

	results, err := a.CheckMissingGames()
	if err != nil {
		t.Fatalf("CheckMissingGames: %v", err)
	}

	got := map[int64]string{}
	for _, r := range results {
		got[r.ID] = r.Missing
	}
	if len(got) != 2 {
		t.Fatalf("見つからないゲームは2件のはず: %+v", results)
	}
	if _, ok := got[okGame.ID]; ok {
		t.Errorf("実体のあるゲームが報告されている: %+v", results)
	}
	if got[noExeGame.ID] != health.MissingExe {
		t.Errorf("exe不在 = %q, want %q", got[noExeGame.ID], health.MissingExe)
	}
	if got[goneGame.ID] != health.MissingFolder {
		t.Errorf("フォルダ不在 = %q, want %q", got[goneGame.ID], health.MissingFolder)
	}
}

// 0件でも null ではなく空配列を返す（フロントの非 nullable 型と合わせる）。
func TestCheckMissingGamesReturnsEmptySliceWhenAllPresent(t *testing.T) {
	a := newTestApp(t)
	dir := t.TempDir()
	writeExe(t, dir, "Game.exe")
	importOne(t, a, "正常", dir, "Game.exe")

	results, err := a.CheckMissingGames()
	if err != nil {
		t.Fatalf("CheckMissingGames: %v", err)
	}
	if results == nil {
		t.Fatal("nil ではなく空スライスを返すべき")
	}
	if len(results) != 0 {
		t.Errorf("見つからないゲームは0件のはず: %+v", results)
	}
}

func TestCheckMissingGamesEmptyLibrary(t *testing.T) {
	a := newTestApp(t)
	results, err := a.CheckMissingGames()
	if err != nil {
		t.Fatalf("CheckMissingGames: %v", err)
	}
	if results == nil || len(results) != 0 {
		t.Errorf("空ライブラリでは空スライスを返すべき: %+v", results)
	}
}

// ListGames / ListTags は 0 件でも空スライスを返す。store 側は 0 件で nil スライスを
// 返すため、そのまま渡すと JSON が null になり、フロントの非 nullable な型定義
// （App.d.ts の Promise<Array<...>>）と矛盾する。新規インストール直後の状態を再現する。
func TestListGamesEmptyLibraryReturnsEmptySlice(t *testing.T) {
	a := newTestApp(t)
	games, err := a.ListGames()
	if err != nil {
		t.Fatalf("ListGames: %v", err)
	}
	if games == nil {
		t.Fatal("nil ではなく空スライスを返すべき（JSON が null になる）")
	}
	if len(games) != 0 {
		t.Errorf("空ライブラリでは0件のはず: %+v", games)
	}
}

func TestListTagsEmptyLibraryReturnsEmptySlice(t *testing.T) {
	a := newTestApp(t)
	tags, err := a.ListTags()
	if err != nil {
		t.Fatalf("ListTags: %v", err)
	}
	if tags == nil {
		t.Fatal("nil ではなく空スライスを返すべき（JSON が null になる）")
	}
	if len(tags) != 0 {
		t.Errorf("タグ未作成では0件のはず: %+v", tags)
	}
}

// ResetLibrary 直後も同じ不変条件を満たす（全削除で 0 件に戻る経路の回帰確認）。
func TestListGamesAndListTagsAfterResetReturnEmptySlices(t *testing.T) {
	a := newTestApp(t)
	coversDirOverride = filepath.Join(t.TempDir(), "covers")
	t.Cleanup(func() { coversDirOverride = "" })

	dir := t.TempDir()
	writeExe(t, dir, "Game.exe")
	g := importOne(t, a, "消える", dir, "Game.exe")
	if _, err := a.AddTag(g.ID, "ホラー", store.AxisGenre); err != nil {
		t.Fatalf("AddTag: %v", err)
	}

	if err := a.ResetLibrary(); err != nil {
		t.Fatalf("ResetLibrary: %v", err)
	}

	games, err := a.ListGames()
	if err != nil {
		t.Fatalf("ListGames: %v", err)
	}
	if games == nil || len(games) != 0 {
		t.Errorf("リセット後は空スライスのはず: %+v", games)
	}
	tags, err := a.ListTags()
	if err != nil {
		t.Fatalf("ListTags: %v", err)
	}
	if tags == nil || len(tags) != 0 {
		t.Errorf("リセット後は空スライスのはず: %+v", tags)
	}
}

// ListGames は DB を読むだけで stat しない（missing は常に空。存在確認は
// CheckMissingGames の責務。未接続ドライブで初回描画がブロックされないための不変条件）。
func TestListGamesDoesNotResolveMissing(t *testing.T) {
	a := newTestApp(t)
	importOne(t, a, "フォルダ不在", filepath.Join(t.TempDir(), "removed"), "Game.exe")

	games, err := a.ListGames()
	if err != nil {
		t.Fatalf("ListGames: %v", err)
	}
	if len(games) != 1 {
		t.Fatalf("1件のはず: %+v", games)
	}
	if games[0].Missing != "" {
		t.Errorf("ListGames が missing を埋めている: %q", games[0].Missing)
	}
}

func TestRelinkToUpdatesLocationAndKeepsEdits(t *testing.T) {
	a := newTestApp(t)

	oldDir := t.TempDir()
	writeExe(t, oldDir, "Game.exe")
	g := importOne(t, a, "引っ越したゲーム", oldDir, "Game.exe")
	if _, err := a.AddTag(g.ID, "RPG", "genre"); err != nil {
		t.Fatalf("AddTag: %v", err)
	}
	if err := a.SetFavorite(g.ID, true); err != nil {
		t.Fatalf("SetFavorite: %v", err)
	}

	// 引っ越し先（フォルダ名が変わり exe 名も変わったケース）
	newDir := filepath.Join(t.TempDir(), "引っ越したゲーム_v2")
	if err := os.MkdirAll(newDir, 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	writeExe(t, newDir, "Game.exe")

	got, err := a.relinkTo(g, newDir)
	if err != nil {
		t.Fatalf("relinkTo: %v", err)
	}
	if got.FolderPath != newDir {
		t.Errorf("folderPath = %q, want %q", got.FolderPath, newDir)
	}
	if got.ExePath != "Game.exe" {
		t.Errorf("exePath = %q, want Game.exe", got.ExePath)
	}
	// タイトル・タグ・お気に入りは保持される（再紐付けの目的そのもの）
	if got.Title != "引っ越したゲーム" || !got.Favorite || len(got.Tags) != 1 {
		t.Errorf("ユーザー編集が失われている: %+v", got)
	}
	// 貼り替え後は実体が見つかる状態になる
	if missing, err := a.CheckMissingGames(); err != nil || len(missing) != 0 {
		t.Errorf("再紐付け後も見つからない扱い: %+v (err=%v)", missing, err)
	}
}

// 同じフォルダを選び直すと exe を再検出する（exe だけリネームされたケースの復帰手段）。
func TestRelinkToSameFolderRedetectsExe(t *testing.T) {
	a := newTestApp(t)

	dir := t.TempDir()
	writeExe(t, dir, "Game.exe")
	g := importOne(t, a, "exe が変わったゲーム", dir, "Game.exe")

	// exe をリネーム（ユーザーが手で変えた想定）
	if err := os.Rename(filepath.Join(dir, "Game.exe"), filepath.Join(dir, "Start.exe")); err != nil {
		t.Fatalf("Rename: %v", err)
	}

	got, err := a.relinkTo(g, dir)
	if err != nil {
		t.Fatalf("relinkTo: %v", err)
	}
	if got.ExePath != "Start.exe" {
		t.Errorf("exePath = %q, want Start.exe", got.ExePath)
	}
}

func TestRelinkToRejectsFolderWithoutExe(t *testing.T) {
	a := newTestApp(t)

	dir := t.TempDir()
	writeExe(t, dir, "Game.exe")
	g := importOne(t, a, "ゲーム", dir, "Game.exe")

	_, err := a.relinkTo(g, t.TempDir()) // exe が1つも無いフォルダ
	if err == nil {
		t.Fatal("exe が無いフォルダなのにエラーが nil")
	}
	if !strings.Contains(err.Error(), "実行ファイル") {
		t.Errorf("日本語エラーになっていない: %v", err)
	}
}

func TestRelinkToRejectsFolderOfAnotherGame(t *testing.T) {
	a := newTestApp(t)

	dirA := t.TempDir()
	writeExe(t, dirA, "A.exe")
	dirB := t.TempDir()
	writeExe(t, dirB, "B.exe")
	gA := importOne(t, a, "A", dirA, "A.exe")
	importOne(t, a, "B", dirB, "B.exe")

	_, err := a.relinkTo(gA, dirB)
	if err == nil {
		t.Fatal("別ゲームのフォルダなのにエラーが nil")
	}
	if !strings.Contains(err.Error(), "別のゲーム") {
		t.Errorf("日本語エラーになっていない: %v", err)
	}
	// 元の保存先は保たれる
	got, err := a.store.GetGame(a.ctx, gA.ID)
	if err != nil {
		t.Fatalf("GetGame: %v", err)
	}
	if got.FolderPath != dirA {
		t.Errorf("失敗したのに保存先が変わっている: %q", got.FolderPath)
	}
}

func TestRelinkGameNotFoundReturnsJapaneseError(t *testing.T) {
	a := newTestApp(t)
	// GetGame の時点で早期リターンするため wails ランタイム（ダイアログ）には到達しない
	_, err := a.RelinkGame(999)
	assertJapaneseNotFoundError(t, err)
}

func TestDeleteGamesRemovesAllAndReportsCount(t *testing.T) {
	a := newTestApp(t)

	dirA := t.TempDir()
	writeExe(t, dirA, "A.exe")
	gA := importOne(t, a, "A", dirA, "A.exe")
	gB := importOne(t, a, "B", filepath.Join(t.TempDir(), "gone"), "B.exe")

	result, err := a.DeleteGames([]int64{gA.ID, gB.ID})
	if err != nil {
		t.Fatalf("DeleteGames: %v", err)
	}
	if result.Deleted != 2 || len(result.Failed) != 0 {
		t.Fatalf("want 2 deleted / no failures, got %+v", result)
	}
	games, err := a.ListGames()
	if err != nil {
		t.Fatalf("ListGames: %v", err)
	}
	if len(games) != 0 {
		t.Errorf("削除後もゲームが残っている: %+v", games)
	}
}

// 1件の失敗で中断せず、成功分は削除して失敗分だけ理由付きで返す（ImportGames と同じ方針）。
func TestDeleteGamesContinuesOnFailure(t *testing.T) {
	a := newTestApp(t)

	dir := t.TempDir()
	writeExe(t, dir, "Game.exe")
	g := importOne(t, a, "残す予定はない", dir, "Game.exe")

	result, err := a.DeleteGames([]int64{999, g.ID})
	if err != nil {
		t.Fatalf("DeleteGames: %v", err)
	}
	if result.Deleted != 1 {
		t.Errorf("deleted = %d, want 1", result.Deleted)
	}
	if len(result.Failed) != 1 || result.Failed[0].ID != 999 {
		t.Fatalf("失敗が記録されていない: %+v", result.Failed)
	}
	games, err := a.ListGames()
	if err != nil {
		t.Fatalf("ListGames: %v", err)
	}
	if len(games) != 0 {
		t.Errorf("存在する側の削除が中断された: %+v", games)
	}
}

func TestDeleteGamesEmptyInput(t *testing.T) {
	a := newTestApp(t)
	result, err := a.DeleteGames(nil)
	if err != nil {
		t.Fatalf("DeleteGames: %v", err)
	}
	if result.Deleted != 0 || result.Failed == nil || len(result.Failed) != 0 {
		t.Errorf("空入力では 0件成功・空スライスを返すべき: %+v", result)
	}
}
