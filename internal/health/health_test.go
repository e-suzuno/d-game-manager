package health

import (
	"os"
	"path/filepath"
	"testing"
)

// newGameDir は folder/exe が揃った正常なゲームフォルダを作って絶対パスを返す。
func newGameDir(t *testing.T, exeName string) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, exeName), []byte("dummy"), 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	return dir
}

func TestCheckOK(t *testing.T) {
	dir := newGameDir(t, "Game.exe")
	if got := Check(dir, "Game.exe"); got != OK {
		t.Errorf("Check = %q, want OK", got)
	}
}

func TestCheckMissingFolder(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "not-exist")
	if got := Check(dir, "Game.exe"); got != MissingFolder {
		t.Errorf("Check = %q, want %q", got, MissingFolder)
	}
}

func TestCheckMissingExe(t *testing.T) {
	dir := newGameDir(t, "Game.exe")
	if got := Check(dir, "Renamed.exe"); got != MissingExe {
		t.Errorf("Check = %q, want %q", got, MissingExe)
	}
}

// exe_path は旧 DB では空文字がありうる。その場合はフォルダの有無だけで判定する。
func TestCheckEmptyExePathChecksFolderOnly(t *testing.T) {
	dir := t.TempDir()
	if got := Check(dir, ""); got != OK {
		t.Errorf("Check(存在するフォルダ, 空 exe) = %q, want OK", got)
	}
	if got := Check(filepath.Join(dir, "not-exist"), ""); got != MissingFolder {
		t.Errorf("Check(不在フォルダ, 空 exe) = %q, want %q", got, MissingFolder)
	}
}

// フォルダのパスが同名ファイルに置き換わっていたらフォルダ不在として扱う。
func TestCheckFolderReplacedByFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "game")
	if err := os.WriteFile(path, []byte("not a dir"), 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	if got := Check(path, "Game.exe"); got != MissingFolder {
		t.Errorf("Check = %q, want %q", got, MissingFolder)
	}
}

// exe のパスがディレクトリなら起動できないので exe 不在として扱う。
func TestCheckExeIsDirectory(t *testing.T) {
	dir := t.TempDir()
	if err := os.Mkdir(filepath.Join(dir, "Game.exe"), 0o755); err != nil {
		t.Fatalf("Mkdir: %v", err)
	}
	if got := Check(dir, "Game.exe"); got != MissingExe {
		t.Errorf("Check = %q, want %q", got, MissingExe)
	}
}

// exe_path はフォルダからの相対パス。サブフォルダ入りでも解決できること。
func TestCheckExeInSubfolder(t *testing.T) {
	dir := t.TempDir()
	if err := os.Mkdir(filepath.Join(dir, "bin"), 0o755); err != nil {
		t.Fatalf("Mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "bin", "Game.exe"), []byte("dummy"), 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	if got := Check(dir, filepath.Join("bin", "Game.exe")); got != OK {
		t.Errorf("Check = %q, want OK", got)
	}
}

func TestCheckAllKeepsOrderAndResults(t *testing.T) {
	ok := newGameDir(t, "Game.exe")
	noExe := newGameDir(t, "Other.exe")
	gone := filepath.Join(t.TempDir(), "not-exist")

	targets := []Target{
		{ID: 1, FolderPath: ok, ExePath: "Game.exe"},
		{ID: 2, FolderPath: gone, ExePath: "Game.exe"},
		{ID: 3, FolderPath: noExe, ExePath: "Game.exe"},
	}
	got := CheckAll(targets)
	want := []Result{
		{ID: 1, Missing: OK},
		{ID: 2, Missing: MissingFolder},
		{ID: 3, Missing: MissingExe},
	}
	if len(got) != len(want) {
		t.Fatalf("CheckAll: %d件, want %d件", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("CheckAll[%d] = %+v, want %+v", i, got[i], want[i])
		}
	}
}

// 並列度（8）を超える件数でも取り違えなく全件返すこと。
func TestCheckAllManyTargets(t *testing.T) {
	var targets []Target
	for i := 0; i < 30; i++ {
		dir := newGameDir(t, "Game.exe")
		exe := "Game.exe"
		if i%3 == 0 { // 1/3 は exe 不在にする
			exe = "Missing.exe"
		}
		targets = append(targets, Target{ID: int64(i), FolderPath: dir, ExePath: exe})
	}
	got := CheckAll(targets)
	if len(got) != len(targets) {
		t.Fatalf("CheckAll: %d件, want %d件", len(got), len(targets))
	}
	for i, r := range got {
		if r.ID != int64(i) {
			t.Fatalf("CheckAll[%d].ID = %d, want %d（順序が崩れている）", i, r.ID, i)
		}
		want := OK
		if i%3 == 0 {
			want = MissingExe
		}
		if r.Missing != want {
			t.Errorf("CheckAll[%d].Missing = %q, want %q", i, r.Missing, want)
		}
	}
}

func TestCheckAllEmpty(t *testing.T) {
	if got := CheckAll(nil); len(got) != 0 {
		t.Errorf("CheckAll(nil) = %+v, want 空", got)
	}
}
