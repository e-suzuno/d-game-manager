package icon

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"testing"

	"github.com/tc-hib/winres"
)

// テスト用 exe のクロスコンパイルは重いため、パッケージ内の全テストで1回だけビルドして
// 共有する。t.TempDir() はテスト単位で削除されるので、ここでは os.MkdirTemp を使い
// プロセス終了までキャッシュを保持し、TestMain で全テスト終了後にまとめて削除する。
var (
	testEXEOnce     sync.Once
	testEXEPlain    string
	testEXEPlainErr error
	testEXEIcon     string
	testEXEIconErr  error
)

// TestMain はパッケージ内の全テスト終了後、testEXEPaths が作成した一時ディレクトリ
// （testEXEPlain と、その配下に作られる testEXEIcon）をまとめて削除する。
func TestMain(m *testing.M) {
	code := m.Run()
	if testEXEPlain != "" {
		os.RemoveAll(filepath.Dir(testEXEPlain))
	}
	os.Exit(code)
}

// testPlainEXE はプレーン（アイコン無し）exe のパスを返す（初回のみビルド）。
func testPlainEXE(t *testing.T) string {
	t.Helper()
	testEXEOnce.Do(func() {
		testEXEPlain, testEXEPlainErr = buildPlainEXE()
		if testEXEPlainErr != nil {
			return
		}
		testEXEIcon, testEXEIconErr = addIconToEXE(testEXEPlain)
	})
	if testEXEPlainErr != nil {
		t.Fatalf("プレーン exe のビルドに失敗: %v", testEXEPlainErr)
	}
	return testEXEPlain
}

// testIconEXE はアイコン付き exe のパスを返す（初回のみビルド）。
func testIconEXE(t *testing.T) string {
	t.Helper()
	testPlainEXE(t) // sync.Once を発火させ、プレーンビルドの成功を確認する
	if testEXEIconErr != nil {
		t.Fatalf("アイコン付き exe のビルドに失敗: %v", testEXEIconErr)
	}
	return testEXEIcon
}

// buildPlainEXE は Go ツールチェーンで最小の Windows exe をビルドしたパスを返す。
// 途中で失敗した場合は作成済みの一時ディレクトリを片付けてから返す（リーク防止）。
// 注意: 戻り値の path は失敗時に "" を返すため、cleanup 対象の dir とは別の変数に
// 保持する（named return の path を "" で return すると defer 実行前に上書きされてしまい、
// os.RemoveAll(dir) の対象が空文字になってクリーンアップが効かなくなるため）。
func buildPlainEXE() (path string, err error) {
	dir, err := os.MkdirTemp("", "icon-test-exe")
	if err != nil {
		return "", err
	}
	defer func() {
		if err != nil {
			os.RemoveAll(dir)
		}
	}()
	src := filepath.Join(dir, "main.go")
	if err = os.WriteFile(src, []byte("package main\n\nfunc main() {}\n"), 0o644); err != nil {
		return "", err
	}
	if err = os.WriteFile(filepath.Join(dir, "go.mod"), []byte("module testexe\n\ngo 1.25\n"), 0o644); err != nil {
		return "", err
	}
	plain := filepath.Join(dir, "plain.exe")
	cmd := exec.Command("go", "build", "-o", plain, ".")
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "GOOS=windows", "GOARCH=amd64", "CGO_ENABLED=0", "GOFLAGS=", "GOTOOLCHAIN=local")
	if out, buildErr := cmd.CombinedOutput(); buildErr != nil {
		err = fmt.Errorf("%w\n%s", buildErr, out)
		return "", err
	}
	return plain, nil
}

// addIconToEXE は plain の exe に winres で 16x16 / 48x48 のアイコンリソースを
// 埋め込んだコピーを作り、そのパスを返す。
func addIconToEXE(plain string) (string, error) {
	ic, err := winres.NewIconFromImages([]image.Image{fill(16, color.NRGBA{R: 255, A: 255}), fill(48, color.NRGBA{G: 255, A: 255})})
	if err != nil {
		return "", err
	}
	rs := &winres.ResourceSet{}
	if err := rs.SetIcon(winres.ID(1), ic); err != nil {
		return "", err
	}
	in, err := os.Open(plain)
	if err != nil {
		return "", err
	}
	defer in.Close()
	withRes := filepath.Join(filepath.Dir(plain), "icon.exe")
	out, err := os.Create(withRes)
	if err != nil {
		return "", err
	}
	defer out.Close()
	if err := rs.WriteToEXE(out, in); err != nil {
		return "", fmt.Errorf("アイコンの埋め込みに失敗: %w", err)
	}
	return withRes, nil
}

func fill(size int, c color.NRGBA) image.Image {
	img := image.NewNRGBA(image.Rect(0, 0, size, size))
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			img.SetNRGBA(x, y, c)
		}
	}
	return img
}

func TestExtractPNG(t *testing.T) {
	exe := testIconEXE(t)
	data, err := ExtractPNG(exe)
	if err != nil {
		t.Fatalf("ExtractPNG: %v", err)
	}
	img, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("PNG として読めない: %v", err)
	}
	// グループ内の最大サイズ（48x48）が選ばれること
	if b := img.Bounds(); b.Dx() != 48 || b.Dy() != 48 {
		t.Errorf("サイズが %dx%d（期待 48x48）", b.Dx(), b.Dy())
	}
}

func TestExtractPNG_NoIcon(t *testing.T) {
	exe := testPlainEXE(t)
	if _, err := ExtractPNG(exe); err == nil {
		t.Error("アイコン無し exe でエラーにならなかった")
	}
}

func TestExtractPNG_NotPE(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "not-pe.exe")
	if err := os.WriteFile(p, []byte("これは PE ではない"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := ExtractPNG(p); err == nil {
		t.Error("PE でないファイルでエラーにならなかった")
	}
}

func TestLargest(t *testing.T) {
	small := image.NewRGBA(image.Rect(0, 0, 16, 16))
	pal48 := image.NewPaletted(image.Rect(0, 0, 48, 48), color.Palette{color.Black, color.White})
	full48 := image.NewRGBA(image.Rect(0, 0, 48, 48))

	// 同面積では、低色の Paletted が先に並んでいても truecolor を選ぶ
	if got := largest([]image.Image{pal48, full48}); got != image.Image(full48) {
		t.Errorf("同面積で truecolor が選ばれていない: %T", got)
	}
	// truecolor が先でも Paletted に負けない
	if got := largest([]image.Image{full48, pal48}); got != image.Image(full48) {
		t.Errorf("truecolor が先勝ちで上書きされた: %T", got)
	}
	// 面積が大きい方を優先（並び順に依存しない）
	if got := largest([]image.Image{full48, small}); got != image.Image(full48) {
		t.Errorf("最大面積が選ばれていない: %T", got)
	}
	// 空スライスは nil
	if got := largest(nil); got != nil {
		t.Errorf("空スライスで nil を返していない: %v", got)
	}
}
