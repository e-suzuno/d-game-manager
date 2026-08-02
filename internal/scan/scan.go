// Package scan はフォルダを走査して個人開発ゲーム（.exe）を検出する。
// 制作ツールの推定結果はタグではなく Detected.Tool 属性として返す
// （調整版ハンドオフ 変更点3。判別できない場合は「未判別」）。
package scan

import (
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"
)

// Detected はスキャンで見つかったゲーム候補。
type Detected struct {
	Title      string `json:"title"`      // フォルダ名から推定
	FolderPath string `json:"folderPath"` // ゲームフォルダの絶対パス
	ExePath    string `json:"exePath"`    // フォルダからの相対パス
	SizeBytes  int64  `json:"sizeBytes"`  // フォルダ合計サイズ
	Tool       string `json:"tool"`       // 制作ツール（判別できなければ「未判別」）
}

// exe の扱いは3層に分離する（第4回レビューで確定、第6回でスコアリング方式に再設計）:
//  1. ハード除外（候補にしない）: その名前なら確実に補助ツールと言えるもの
//  2. helper-only 除外と非ゲーム判定: 「setup/config/install 語＋(空|数字|補助接尾辞)」
//     だけの名前（install.exe / config2.exe / installer.exe / SetupTool.exe）は
//     補助ツールそのものとみなし候補から外す。実質候補が無いフォルダは非ゲーム
//     （再頒布フォルダ等を偽ゲームとして登録しないため）
//  3. スコアリング: 残った候補を「本命らしさスコア」降順で1つ選ぶ。
//     フォルダ名と完全一致 > Game.exe > フォルダ名との双方向包含 > 一般名。
//     setup 等を含む正規タイトル（SetupYourEscape.exe）は軽い減点のみで、
//     フォルダ名一致のシグナルがあれば上位に救済される。
//     名前の比較は記号・空白・括弧を除いた正規化名で行うため、
//     「_v1.0」「(Steam)」「[DL版]」「v2_」等の接頭・接尾辞は無視される。
//     同点は決定的タイブレーク（共通接頭辞長 → 名前の短さ → 辞書順）で割り、
//     意味のない辞書順で本命が負けないようにする

// ハード除外する exe 名（小文字前方一致）
var excludedExePrefixes = []string{
	"unins", "uninstall", "vcredist", "dxwebsetup",
	"unitycrashhandler", "notification_helper", "crashpad", "createdump",
}

// ハード除外する exe 名（小文字完全一致）。crashreport は前方一致だと
// CrashReportChronicle.exe のような正規タイトルを誤除外するため、具体名に限定する
var excludedExeNames = map[string]bool{
	"crashreport.exe":   true,
	"crashreporter.exe": true,
}

// 補助ツールを示す語（含む名前はスコア減点。補助ツールそのものの判定は isHelperOnlyName）
var deprioritizedExeWords = []string{"setup", "config", "install"}

// helper 語の後ろに付いて「補助ツールそのもの」を示す接尾辞
// （installer / setuptool / configutil 等。線引きは実データで調整していく）
var helperNameSuffixes = []string{"er", "ers", "tool", "tools", "util", "utils", "utility", "helper", "wizard"}

// 本命らしさスコア。段階式（排他）で、該当する最上位の1つだけを採用する。
// 加算式だと Game.exe が game.exe ボーナス+包含ボーナスの合算で
// 完全一致を逆転してしまうため（第7回 #1）
const (
	scoreFolderExact   = 100 // 正規化フォルダ名と完全一致
	scoreGameExe       = 80  // 既知ランチャー名 Game.exe
	scoreFolderContain = 50  // フォルダ名と exe 名のどちらかが他方を包含
	scoreHelperPenalty = -10 // setup/config/install を含む名前の減点（フォルダ一致で打ち消せる軽さ）
)

// 包含ボーナスを与える正規化名の最小文字数（rune 数。バイト長ではない）。
// 短すぎる名前（フォルダ "a" / 漢字1〜2文字タイトル等）の偶然の包含で誤発火しないようにする
const minContainRunes = 3

// Progress はスキャン進捗の通知。フォルダを1つ調べるたびに
// current（1始まりの通し番号）/ total（調べるフォルダ総数）/ name（フォルダ名）で呼ばれる。
// 呼び出し回数は必ず CountScanTargets(root) と一致する（複数ルートの取り込みで
// 呼び出し元が通し番号に合算できるように）。
type Progress func(current, total int, name string)

// ScanFolder は root を走査してゲーム候補を返す。
// root 自体がゲームフォルダならそれを 1 件、そうでなければ直下のサブフォルダを走査する。
func ScanFolder(root string) ([]Detected, error) {
	return ScanFolderProgress(root, nil)
}

// ScanFolderProgress は ScanFolder と同じ走査を行い、進捗を progress（nil 可）へ通知する。
// 時間の大半は各フォルダの folderSize（配下の全ファイル走査）なので、フォルダ単位の
// 通知で進捗表示には十分な粒度になる。
func ScanFolderProgress(root string, progress Progress) ([]Detected, error) {
	root = filepath.Clean(root)
	if progress == nil {
		progress = func(int, int, string) {}
	}
	if d, ok := detectGame(root); ok {
		// root 自体がゲーム（総数1）。通知は detectGame の後になるが、
		// 呼び出し側は総数1のとき進捗を出さないので実害はない
		progress(1, 1, filepath.Base(root))
		return []Detected{d}, nil
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil, err
	}
	var dirs []os.DirEntry
	for _, e := range entries {
		if e.IsDir() {
			dirs = append(dirs, e)
		}
	}
	var out []Detected
	for i, e := range dirs {
		progress(i+1, len(dirs), e.Name())
		if d, ok := detectGame(filepath.Join(root, e.Name())); ok {
			out = append(out, d)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Title < out[j].Title })
	return out, nil
}

// CountScanTargets は ScanFolderProgress が調べるフォルダ数（進捗の分母）を返す。
// root 自体がゲームフォルダ（直下に本命 exe 候補がある）なら 1、そうでなければ
// 直下のサブフォルダ数。読めない root は 0（ScanFolder がエラーを返すケース）。
// folderSize を伴わないので走査そのものより桁違いに軽く、複数ルートの取り込みで
// 走査前に全体の分母を合算するために使う。
func CountScanTargets(root string) int {
	root = filepath.Clean(root)
	entries, err := os.ReadDir(root)
	if err != nil {
		return 0
	}
	if pickExe(root, entries) != "" {
		return 1
	}
	n := 0
	for _, e := range entries {
		if e.IsDir() {
			n++
		}
	}
	return n
}

// detectGame は dir がゲームフォルダかを判定し、候補情報を返す。
func detectGame(dir string) (Detected, bool) {
	// ディレクトリの読み取りは1回だけ行い、exe 選択とツール判別で共有する
	entries, err := os.ReadDir(dir)
	if err != nil {
		return Detected{}, false
	}
	exe := pickExe(dir, entries)
	if exe == "" {
		return Detected{}, false
	}
	return Detected{
		Title:      filepath.Base(dir),
		FolderPath: dir,
		ExePath:    exe,
		SizeBytes:  folderSize(dir),
		Tool:       detectTool(entries, exe),
	}, true
}

// pickExe はフォルダ直下（1階層のみ）から起動 exe を選ぶ。
// ハード除外・補助ツールそのもの（helper-only）を除いた候補を
// スコア降順 → 決定的タイブレークで並べて先頭を返す。
// 実質候補が無い場合は空文字（=非ゲーム）。
func pickExe(dir string, entries []os.DirEntry) string {
	normFolder := normalizeName(filepath.Base(dir))
	type candidate struct {
		name      string
		score     int
		prefixLen int // normFolder との共通接頭辞長（タイブレーク①）
	}
	var candidates []candidate
	for _, e := range entries {
		if e.IsDir() || !strings.EqualFold(filepath.Ext(e.Name()), ".exe") {
			continue
		}
		lower := strings.ToLower(e.Name())
		if isExcludedExe(lower) {
			continue
		}
		exeNorm := normalizeName(strings.TrimSuffix(lower, ".exe"))
		if isHelperOnlyName(exeNorm) {
			continue // 補助ツールそのものは候補にしない
		}
		// スコア・タイブレークキーは候補ごとに1回だけ計算する（ソート比較内で再計算しない）
		candidates = append(candidates, candidate{
			name:      e.Name(),
			score:     scoreExe(lower, exeNorm, normFolder),
			prefixLen: commonPrefixLen(exeNorm, normFolder),
		})
	}
	if len(candidates) == 0 {
		return "" // 本命候補が無い → 非ゲーム
	}
	sort.Slice(candidates, func(i, j int) bool {
		a, b := candidates[i], candidates[j]
		if a.score != b.score {
			return a.score > b.score
		}
		// 同点は意味のある決定的キーで割る（辞書順で本命が負けないように）
		if a.prefixLen != b.prefixLen {
			return a.prefixLen > b.prefixLen // フォルダ名との共通接頭辞が長い方
		}
		if len(a.name) != len(b.name) {
			return len(a.name) < len(b.name) // 汎用の長い名前より短い具体名
		}
		return a.name < b.name // 実質到達しない保険
	})
	return candidates[0].name
}

// scoreExe は候補 exe の本命らしさスコアを返す（大きいほど本命）。
// lowerName は小文字の exe 名、exeNorm / normFolder は normalizeName 済み。
// ボーナスは段階式で最上位の1つだけ採用し、減点のみ独立に加える。
func scoreExe(lowerName, exeNorm, normFolder string) int {
	score := 0
	switch {
	case exeNorm != "" && exeNorm == normFolder:
		score = scoreFolderExact
	case lowerName == "game.exe":
		score = scoreGameExe
	case runeLen(exeNorm) >= minContainRunes && strings.Contains(normFolder, exeNorm),
		runeLen(normFolder) >= minContainRunes && strings.Contains(exeNorm, normFolder):
		// 双方向包含: フォルダ名にサフィックス（_v1.0 等）が付いても
		// 接頭辞（v2_ 等）が付いても救済される。被包含側が短すぎる偶然一致は除く
		score = scoreFolderContain
	}
	if containsDeprioritizedWord(lowerName) {
		score += scoreHelperPenalty
	}
	return score
}

// runeLen は文字数（rune 数）を返す。バイト長だと日本語1〜2文字の名前が
// 最小長ガードをすり抜けるため、必ずこちらで判定する（第7回 #2）。
func runeLen(s string) int {
	return utf8.RuneCountInString(s)
}

// isHelperOnlyName は正規化済み exe 名が「補助ツールそのもの」かを返す。
// helper 語で始まり、残りが空・数字のみ・補助接尾辞なら補助ツールとみなす
// （install / config2 / installer / setuptool → true、setupyourescape → false）。
func isHelperOnlyName(exeNorm string) bool {
	for _, w := range deprioritizedExeWords {
		if !strings.HasPrefix(exeNorm, w) {
			continue
		}
		rest := exeNorm[len(w):]
		if rest == "" || allDigits(rest) {
			return true
		}
		for _, s := range helperNameSuffixes {
			if rest == s {
				return true
			}
		}
	}
	return false
}

func allDigits(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// commonPrefixLen は a と b の共通接頭辞のバイト長を返す。
func commonPrefixLen(a, b string) int {
	n := 0
	for n < len(a) && n < len(b) && a[n] == b[n] {
		n++
	}
	return n
}

// normalizeName は名前比較用に、文字・数字だけを残して小文字に畳む
// （空白・記号・括弧・バージョン区切りの違いを無視して比較するため）。
func normalizeName(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func containsDeprioritizedWord(lowerName string) bool {
	for _, w := range deprioritizedExeWords {
		if strings.Contains(lowerName, w) {
			return true
		}
	}
	return false
}

func isExcludedExe(lowerName string) bool {
	if excludedExeNames[lowerName] {
		return true
	}
	for _, p := range excludedExePrefixes {
		if strings.HasPrefix(lowerName, p) {
			return true
		}
	}
	return false
}

// detectTool は制作ツールを推定する。判別できない場合は「未判別」。
func detectTool(entries []os.DirEntry, exe string) string {
	exeBase := strings.TrimSuffix(strings.ToLower(exe), ".exe")
	var hasWWW, hasNW, hasTyrano bool
	for _, e := range entries {
		name := strings.ToLower(e.Name())
		switch {
		case e.IsDir() && name == "www":
			hasWWW = true
		case e.IsDir() && name == exeBase+"_data":
			return "Unity"
		case e.IsDir() && (name == "tyrano" || name == "tyrano_data"):
			hasTyrano = true
		case !e.IsDir():
			switch {
			case strings.HasSuffix(name, ".wolf"):
				return "WOLF RPG"
			case strings.HasSuffix(name, ".pck") && strings.TrimSuffix(name, ".pck") == exeBase:
				return "Godot"
			case strings.HasSuffix(name, ".rgss3a") || strings.HasSuffix(name, ".rgss2a") || strings.HasSuffix(name, ".rgssad"):
				return "RPGツクール"
			case name == "nw.dll" || name == "nw_elf.dll":
				hasNW = true
			}
		}
	}
	if hasTyrano {
		return "ティラノ"
	}
	// www/ + nw.dll（または Game.exe）は RPGツクール MV/MZ 構成
	if hasWWW && (hasNW || strings.EqualFold(exe, "Game.exe")) {
		return "RPGツクール"
	}
	if hasNW && strings.EqualFold(exe, "Game.exe") {
		return "RPGツクール"
	}
	// store.ToolUnknown と一致させること（import 循環を避けるため定数参照はしない）
	return "未判別"
}

// folderSize はフォルダ配下の合計サイズを返す（エラーのファイルはスキップ）。
func folderSize(dir string) int64 {
	var total int64
	filepath.WalkDir(dir, func(_ string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if info, err := d.Info(); err == nil {
			total += info.Size()
		}
		return nil
	})
	return total
}
