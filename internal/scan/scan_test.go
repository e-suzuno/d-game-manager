package scan

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// makeGame は dir にダミーのゲームフォルダ構造を作る。
func makeGame(t *testing.T, dir string, files []string, dirs []string) {
	t.Helper()
	for _, d := range dirs {
		if err := os.MkdirAll(filepath.Join(dir, d), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	for _, f := range files {
		path := filepath.Join(dir, f)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte("dummy"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

// scanOne は folderName のゲームフォルダを1つ作ってスキャンする。
func scanOne(t *testing.T, folderName string, files []string, dirs []string) []Detected {
	t.Helper()
	root := t.TempDir()
	makeGame(t, filepath.Join(root, folderName), files, dirs)
	got, err := ScanFolder(root)
	if err != nil {
		t.Fatalf("ScanFolder: %v", err)
	}
	return got
}

// --- 正規ゲーム検出 ---

func TestGameExeWinsOverHelpers(t *testing.T) {
	got := scanOne(t, "g", []string{"Game.exe", "config2.exe", "start.exe"}, nil)
	if len(got) != 1 || got[0].ExePath != "Game.exe" {
		t.Fatalf("Game.exe should win, got %+v", got)
	}
}

func TestFolderNameMatchBeatsGenericName(t *testing.T) {
	got := scanOne(t, "MyGame", []string{"MyGame.exe", "another.exe"}, nil)
	if len(got) != 1 || got[0].ExePath != "MyGame.exe" {
		t.Fatalf("folder-name match should win, got %+v", got)
	}
}

func TestSetupTitleRescuedByFolderName(t *testing.T) {
	// 本命が setup 語を含んでいても、フォルダ名一致で救済されて選ばれる（第4回 #1 回帰）
	got := scanOne(t, "SetupYourEscape", []string{"SetupYourEscape.exe", "crashreporter.exe"}, nil)
	if len(got) != 1 || got[0].ExePath != "SetupYourEscape.exe" {
		t.Fatalf("setup-titled main exe should be rescued, got %+v", got)
	}
}

func TestSetupTitleRescuedOverConfigHelper(t *testing.T) {
	// 本命が setup 語 + 補助が config 語でも、フォルダ名一致で本命が選ばれる
	got := scanOne(t, "SetupYourEscape", []string{"SetupYourEscape.exe", "configtool.exe"}, nil)
	if len(got) != 1 || got[0].ExePath != "SetupYourEscape.exe" {
		t.Fatalf("rescued main should beat config helper, got %+v", got)
	}
}

// --- 本命救済: フォルダ名サフィックス（第5回 #1） ---

func TestVersionSuffixedFolderRescue(t *testing.T) {
	// フォルダ名にバージョンサフィックスが付いても本命が救済される（第5回 #1 回帰）
	got := scanOne(t, "SetupYourEscape_v1.0", []string{"SetupYourEscape.exe"}, nil)
	if len(got) != 1 || got[0].ExePath != "SetupYourEscape.exe" {
		t.Fatalf("versioned folder should rescue main exe, got %+v", got)
	}
}

func TestVendorSuffixedFolderRescue(t *testing.T) {
	got := scanOne(t, "SetupYourEscape (Steam)", []string{"SetupYourEscape.exe"}, nil)
	if len(got) != 1 || got[0].ExePath != "SetupYourEscape.exe" {
		t.Fatalf("vendor-suffixed folder should rescue main exe, got %+v", got)
	}
}

func TestJapaneseBracketSuffixedFolderRescue(t *testing.T) {
	got := scanOne(t, "SetupYourEscape [DL版]", []string{"SetupYourEscape.exe"}, nil)
	if len(got) != 1 || got[0].ExePath != "SetupYourEscape.exe" {
		t.Fatalf("bracket-suffixed folder should rescue main exe, got %+v", got)
	}
}

func TestSuffixedFolderMatchBeatsGenericName(t *testing.T) {
	// サフィックス付きでもフォルダ名一致が一般名より優先される
	// （救済が効かないと辞書順で Launcher.exe が選ばれてしまう）
	got := scanOne(t, "MyGame_v2.3.1", []string{"MyGame.exe", "Launcher.exe"}, nil)
	if len(got) != 1 || got[0].ExePath != "MyGame.exe" {
		t.Fatalf("suffixed folder-name match should beat generic name, got %+v", got)
	}
}

func TestSuffixedFolderRescueWithHelper(t *testing.T) {
	// サフィックス付き + 補助 exe 同居でも本命が勝つ
	got := scanOne(t, "SetupYourEscape_v1.0", []string{"SetupYourEscape.exe", "crashreporter.exe"}, nil)
	if len(got) != 1 || got[0].ExePath != "SetupYourEscape.exe" {
		t.Fatalf("rescued main should beat helper, got %+v", got)
	}
}

func TestSuffixedConfigFolderStillNotDetected(t *testing.T) {
	// 救済を緩めても「補助語そのもの」の exe は救済しない（第4回 #2 を壊さない）
	got := scanOne(t, "Config_v2", []string{"config.exe"}, nil)
	if len(got) != 0 {
		t.Fatalf("helper-named exe should not be rescued by suffixed folder, got %+v", got)
	}
}

// --- スコアリング方式（第6回: 同点競合・双方向一致・helper-only 判定） ---

func TestExactMatchBeatsContainedName(t *testing.T) {
	// 第6回 #2: フォルダ名と完全一致する exe が、より短い包含名に勝つ
	// （旧方式では両方 prioFolderMatch 同点 → 辞書順で MyGame.exe が誤選択されていた）
	got := scanOne(t, "MyGameEditor", []string{"MyGame.exe", "MyGameEditor.exe"}, nil)
	if len(got) != 1 || got[0].ExePath != "MyGameEditor.exe" {
		t.Fatalf("exact folder match should beat contained name, got %+v", got)
	}
}

func TestPrefixedFolderRescuesContainedExe(t *testing.T) {
	// 第6回 #3: フォルダ名に接頭辞が付いても、exe 名の包含（双方向一致）で救済される
	got := scanOne(t, "v2_MyGame", []string{"MyGame.exe", "Launcher.exe"}, nil)
	if len(got) != 1 || got[0].ExePath != "MyGame.exe" {
		t.Fatalf("contained exe name should be rescued over generic name, got %+v", got)
	}
}

func TestHelperWordTitleDetectedWithoutFolderMatch(t *testing.T) {
	// 第6回 #1: helper 語を含む正規タイトルは、フォルダ名と一致しなくても取りこぼさない
	// （helper-only でなければ候補に残る。非ゲーム判定はスコアに依存しない）
	got := scanOne(t, "MyEscape", []string{"SetupYourEscape.exe"}, nil)
	if len(got) != 1 || got[0].ExePath != "SetupYourEscape.exe" {
		t.Fatalf("helper-word title should still be detected, got %+v", got)
	}
}

func TestSetupToolNotDetectedDespiteFolderMatch(t *testing.T) {
	// 第6回 #5: exe 名=フォルダ名でも「helper 語＋補助接尾辞」は補助ツールそのもの
	got := scanOne(t, "SetupTool", []string{"SetupTool.exe"}, nil)
	if len(got) != 0 {
		t.Fatalf("helper-only name should not be rescued by folder match, got %+v", got)
	}
}

func TestInstallerOnlyFolderNotDetected(t *testing.T) {
	// installer (= install + er) も helper-only（部分一致廃止に伴う回帰ガード）
	got := scanOne(t, "redist", []string{"installer.exe"}, nil)
	if len(got) != 0 {
		t.Fatalf("installer-only folder should not be detected, got %+v", got)
	}
}

func TestCrashReportTitleNotExcluded(t *testing.T) {
	// 第6回 #6: crashreport で始まる正規タイトルはハード除外しない（完全一致除外に変更）
	got := scanOne(t, "CrashReportChronicle", []string{"CrashReportChronicle.exe"}, nil)
	if len(got) != 1 || got[0].ExePath != "CrashReportChronicle.exe" {
		t.Fatalf("regular title starting with crashreport should be detected, got %+v", got)
	}
}

func TestShortFolderNameNoSpuriousContainment(t *testing.T) {
	// 1文字フォルダ名の偶然の包含（'start' ⊇ 'a'）ではボーナスを与えず、
	// タイブレーク（名前の短い方）で決定的に選ぶ
	got := scanOne(t, "a", []string{"launcher.exe", "start.exe"}, nil)
	if len(got) != 1 || got[0].ExePath != "start.exe" {
		t.Fatalf("short folder name should not grant containment bonus, got %+v", got)
	}
}

func TestExactMatchBeatsGameExe(t *testing.T) {
	// 第7回 #1: 完全一致(100)が Game.exe に勝つ。加算式だと Game.exe が
	// game.exe ボーナス+包含ボーナス（"gameoflife" ⊇ "game"）で 130 になり逆転していた
	got := scanOne(t, "GameOfLife", []string{"GameOfLife.exe", "Game.exe"}, nil)
	if len(got) != 1 || got[0].ExePath != "GameOfLife.exe" {
		t.Fatalf("exact folder match should beat Game.exe bonus stacking, got %+v", got)
	}
}

func TestSingleKanjiFolderExactMatch(t *testing.T) {
	// 日本語1文字フォルダ名でも完全一致の本体が選ばれる（第7回 #2 の周辺回帰）
	got := scanOne(t, "月", []string{"月.exe", "月helper.exe"}, nil)
	if len(got) != 1 || got[0].ExePath != "月.exe" {
		t.Fatalf("exact match should win in single-kanji folder, got %+v", got)
	}
}

func TestSingleKanjiFolderNoSpuriousContainment(t *testing.T) {
	// 第7回 #2: 最小長ガードがバイト長判定だと、漢字1文字（=3バイト）のフォルダ名が
	// ガードを通過し、その文字を含むだけの補助 exe に +50 が付いて誤選択される
	got := scanOne(t, "月", []string{"月config.exe", "launcher.exe"}, nil)
	if len(got) != 1 || got[0].ExePath != "launcher.exe" {
		t.Fatalf("single-kanji containment should not grant bonus, got %+v", got)
	}
}

func TestTwoKanjiFolderNoSpuriousContainment(t *testing.T) {
	// 日本語2文字（=6バイト、2 rune）でも同様にボーナスを与えない
	got := scanOne(t, "物語", []string{"物語config.exe", "launcher.exe"}, nil)
	if len(got) != 1 || got[0].ExePath != "launcher.exe" {
		t.Fatalf("two-kanji containment should not grant bonus, got %+v", got)
	}
}

func TestIsHelperOnlyName(t *testing.T) {
	cases := map[string]bool{
		"setup":           true, // helper 語そのもの
		"config2":         true, // helper 語 + 数字
		"install":         true,
		"installer":       true, // helper 語 + 補助接尾辞
		"setuptool":       true,
		"configutil":      true,
		"setupwizard":     true,
		"setupyourescape": false, // helper 語で始まる正規タイトル
		"mygame":          false,
		"launcher":        false,
	}
	for name, want := range cases {
		if got := isHelperOnlyName(name); got != want {
			t.Errorf("isHelperOnlyName(%q) = %v, want %v", name, got, want)
		}
	}
}

func TestScoreExeOrdering(t *testing.T) {
	// スコアの大小関係が設計どおりであること（同一入力＝同一出力の純関数）
	score := func(name, folder string) int {
		lower := strings.ToLower(name)
		return scoreExe(lower, normalizeName(strings.TrimSuffix(lower, ".exe")), normalizeName(folder))
	}
	// 完全一致 > 包含
	if score("MyGameEditor.exe", "MyGameEditor") <= score("MyGame.exe", "MyGameEditor") {
		t.Error("exact match should score higher than containment")
	}
	// Game.exe > 一般名
	if score("Game.exe", "MyGame") <= score("Launcher.exe", "MyGame") {
		t.Error("Game.exe should score higher than generic name")
	}
	// 包含 + helper 減点でも一般名より上（救済が減点を打ち消す）
	if score("SetupYourEscape.exe", "SetupYourEscape_v1.0") <= score("launcher.exe", "SetupYourEscape_v1.0") {
		t.Error("contained helper-word title should beat generic name")
	}
}

// --- 非ゲーム判定 ---

func TestInstallOnlyFolderNotDetected(t *testing.T) {
	// install.exe だけの再頒布フォルダは偽検出しない（第4回 #2 回帰）
	got := scanOne(t, "redist", []string{"install.exe"}, nil)
	if len(got) != 0 {
		t.Fatalf("install-only folder should not be detected, got %+v", got)
	}
}

func TestConfigOnlyFolderNotDetected(t *testing.T) {
	got := scanOne(t, "Config", []string{"config.exe"}, nil)
	if len(got) != 0 {
		t.Fatalf("config-only folder should not be detected, got %+v", got)
	}
}

func TestConfig2OnlyFolderNotDetected(t *testing.T) {
	// 旧 TestHelperOnlyFolderStillDetected の反転（仕様変更: 本命候補が無ければ非ゲーム）
	got := scanOne(t, "g", []string{"config2.exe"}, nil)
	if len(got) != 0 {
		t.Fatalf("deprioritized-only folder should not be detected, got %+v", got)
	}
}

func TestHardExcludedOnlyFolderNotDetected(t *testing.T) {
	got := scanOne(t, "g", []string{"unins000.exe", "vcredist_x64.exe"}, nil)
	if len(got) != 0 {
		t.Fatalf("hard-excluded-only folder should not be detected, got %+v", got)
	}
}

// --- 境界 ---

func TestGameExeWithUninstaller(t *testing.T) {
	got := scanOne(t, "g", []string{"Game.exe", "unins000.exe"}, nil)
	if len(got) != 1 || got[0].ExePath != "Game.exe" {
		t.Fatalf("hard-excluded should not interfere, got %+v", got)
	}
}

func TestHelperPairNotDetected(t *testing.T) {
	// 補助ツール風のみ複数 → 本命が無いので非検出
	got := scanOne(t, "tools", []string{"setup.exe", "config.exe"}, nil)
	if len(got) != 0 {
		t.Fatalf("helper-pair folder should not be detected, got %+v", got)
	}
}

func TestGenericNamesDeterministicPick(t *testing.T) {
	// 一般名が複数 → 決定的に1つ。同点のタイブレークは
	// 共通接頭辞長 → 名前の短い方（辞書順ではない）なので start.exe が選ばれる
	got := scanOne(t, "g", []string{"start.exe", "launcher.exe"}, nil)
	if len(got) != 1 || got[0].ExePath != "start.exe" {
		t.Fatalf("pick should be deterministic (shorter name wins tie), got %+v", got)
	}
}

// --- 走査・ツール判別（既存仕様の回帰） ---

func TestScanSubfolders(t *testing.T) {
	root := t.TempDir()

	makeGame(t, filepath.Join(root, "wolf-game"), []string{"Game.exe", "Data.wolf"}, nil)
	makeGame(t, filepath.Join(root, "unity-game"), []string{"unity-game.exe"}, []string{"unity-game_Data"})
	makeGame(t, filepath.Join(root, "not-a-game"), []string{"readme.txt"}, nil)

	got, err := ScanFolder(root)
	if err != nil {
		t.Fatalf("ScanFolder: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("want 2 games, got %d: %+v", len(got), got)
	}
	if got[0].Title != "unity-game" || got[0].Tool != "Unity" {
		t.Errorf("unity-game: %+v", got[0])
	}
	if got[1].Title != "wolf-game" || got[1].Tool != "WOLF RPG" || got[1].ExePath != "Game.exe" {
		t.Errorf("wolf-game: %+v", got[1])
	}
}

func TestScanRootIsGame(t *testing.T) {
	root := t.TempDir()
	makeGame(t, root, []string{"Game.exe", "Game.rgss3a"}, nil)

	got, err := ScanFolder(root)
	if err != nil {
		t.Fatalf("ScanFolder: %v", err)
	}
	if len(got) != 1 || got[0].Tool != "RPGツクール" {
		t.Fatalf("want RPGツクール game, got %+v", got)
	}
	if got[0].FolderPath != root {
		t.Errorf("folder should be root itself: %+v", got[0])
	}
}

func TestRpgMakerMV(t *testing.T) {
	got := scanOne(t, "mv-game", []string{"Game.exe", "nw.dll"}, []string{"www"})
	if len(got) != 1 || got[0].Tool != "RPGツクール" {
		t.Fatalf("want RPGツクール(MV), got %+v", got)
	}
}

func TestTyranoDetected(t *testing.T) {
	// ティラノ製は「ティラノ」（旧表記「ティラノスクリプト」から変更、調整版ハンドオフ 変更点3）
	got := scanOne(t, "tyrano-game", []string{"tyrano-game.exe"}, []string{"tyrano"})
	if len(got) != 1 || got[0].Tool != "ティラノ" {
		t.Fatalf("want ティラノ, got %+v", got)
	}
}

func TestUnknownToolDefaultsToUnknown(t *testing.T) {
	// ツール構成の手がかりが無いフォルダは Tool="未判別"（空文字やタグ無しにしない）
	got := scanOne(t, "plain-game", []string{"plain-game.exe"}, nil)
	if len(got) != 1 || got[0].Tool != "未判別" {
		t.Fatalf("want 未判別, got %+v", got)
	}
}

func TestRealWorldRpgMakerVXLayout(t *testing.T) {
	// 実データ回帰: 手元の実ゲーム（RPGツクールVX）のフォルダ構成を再現
	// Newlittleworld/Newlittleworld/{Game.exe, Game.ini, Game.rgss2a, RGSS202J.dll, read me.txt}
	// 外側フォルダには exe が無く、内側の1階層下がゲーム本体（入れ子パターン）
	root := t.TempDir()
	makeGame(t, filepath.Join(root, "Newlittleworld"),
		[]string{"Game.exe", "Game.ini", "Game.rgss2a", "RGSS202J.dll", "read me.txt"},
		[]string{"Audio", "Fonts", "SaveFile"})

	got, err := ScanFolder(root)
	if err != nil {
		t.Fatalf("ScanFolder: %v", err)
	}
	if len(got) != 1 || got[0].ExePath != "Game.exe" || got[0].Title != "Newlittleworld" {
		t.Fatalf("want Newlittleworld with Game.exe, got %+v", got)
	}
	if got[0].Tool != "RPGツクール" {
		t.Errorf("rgss2a should be detected as RPGツクール: %+v", got[0])
	}
}

func TestNoExeNoDetection(t *testing.T) {
	got := scanOne(t, "docs", []string{"note.txt"}, nil)
	if len(got) != 0 {
		t.Fatalf("want 0, got %+v", got)
	}
}

func TestFolderSizeAggregates(t *testing.T) {
	got := scanOne(t, "g", []string{"Game.exe", "data/big.bin"}, nil)
	if len(got) != 1 || got[0].SizeBytes != int64(len("dummy")*2) {
		t.Fatalf("size should sum nested files, got %+v", got)
	}
}

// --- 進捗通知（ScanFolderProgress / CountScanTargets） ---

// progressCall は Progress コールバック1回分の記録。
type progressCall struct {
	current, total int
	name           string
}

func collectProgress(calls *[]progressCall) Progress {
	return func(current, total int, name string) {
		*calls = append(*calls, progressCall{current, total, name})
	}
}

func TestScanFolderProgressReportsEachSubfolder(t *testing.T) {
	// サブフォルダ3つ（ゲーム2＋非ゲーム1）: 非ゲームも「調べる対象」として数える
	root := t.TempDir()
	makeGame(t, filepath.Join(root, "alpha"), []string{"alpha.exe"}, nil)
	makeGame(t, filepath.Join(root, "beta"), []string{"beta.exe"}, nil)
	makeGame(t, filepath.Join(root, "notes"), []string{"readme.txt"}, nil)

	var calls []progressCall
	got, err := ScanFolderProgress(root, collectProgress(&calls))
	if err != nil {
		t.Fatalf("ScanFolderProgress: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("want 2 games, got %+v", got)
	}
	want := []progressCall{{1, 3, "alpha"}, {2, 3, "beta"}, {3, 3, "notes"}}
	if len(calls) != len(want) {
		t.Fatalf("want %d calls, got %+v", len(want), calls)
	}
	for i, w := range want {
		if calls[i] != w {
			t.Errorf("call %d: want %+v, got %+v", i, w, calls[i])
		}
	}
}

func TestScanFolderProgressRootIsGame(t *testing.T) {
	// root 自体がゲームフォルダなら総数1で1回だけ通知する
	root := t.TempDir()
	dir := filepath.Join(root, "solo")
	makeGame(t, dir, []string{"solo.exe"}, []string{"data"})

	var calls []progressCall
	got, err := ScanFolderProgress(dir, collectProgress(&calls))
	if err != nil {
		t.Fatalf("ScanFolderProgress: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("want 1 game, got %+v", got)
	}
	if len(calls) != 1 || calls[0] != (progressCall{1, 1, "solo"}) {
		t.Fatalf("want single (1,1,solo) call, got %+v", calls)
	}
}

func TestCountScanTargetsMatchesProgressCalls(t *testing.T) {
	// CountScanTargets（走査前の分母）と Progress の呼び出し回数は一致する
	// （複数ルートの取り込みが通し番号に合算するための前提）
	parent := t.TempDir()
	makeGame(t, filepath.Join(parent, "a"), []string{"a.exe"}, nil)
	makeGame(t, filepath.Join(parent, "b"), []string{"note.txt"}, nil)
	single := filepath.Join(parent, "a")

	for _, root := range []string{parent, single} {
		var calls []progressCall
		if _, err := ScanFolderProgress(root, collectProgress(&calls)); err != nil {
			t.Fatalf("ScanFolderProgress(%q): %v", root, err)
		}
		if n := CountScanTargets(root); n != len(calls) {
			t.Errorf("%q: CountScanTargets=%d but %d progress calls", root, n, len(calls))
		}
	}
}
