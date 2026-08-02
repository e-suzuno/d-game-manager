// Package icon は Windows 実行ファイル（PE）のリソースからアプリアイコンを取り出し、
// カバー画像用の PNG に変換する。
//
// 設計メモ:
//   - 取り込み時のベストエフォート用途。抽出に失敗してもゲーム登録は続行される前提の
//     ため、エラーは呼び出し側でログに落とすだけでよい
//   - pure Go（winres + go-ico）で読むので、WSL2/Linux 開発環境でも .exe を解析できる
//   - Windows のエクスプローラーが表示する「アプリのアイコン」は最初のアイコングループ
//     なので、RT_GROUP_ICON の列挙順の先頭を採用する
//   - グループ内には複数サイズが入っているため、最も大きい画像（同点なら先勝ち）を選ぶ
package icon

import (
	"bytes"
	"fmt"
	"image"
	"image/png"
	"os"

	ico "github.com/sergeymakinen/go-ico"
	"github.com/tc-hib/winres"
)

// ExtractPNG は exe のメインアイコンの最大サイズ画像を PNG バイト列で返す。
// アイコンリソースが無い・PE として読めない場合はエラーを返す。
func ExtractPNG(exePath string) ([]byte, error) {
	f, err := os.Open(exePath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	rs, err := winres.LoadFromEXESingleType(f, winres.RT_GROUP_ICON)
	if err != nil {
		return nil, fmt.Errorf("リソースを読めませんでした: %w", err)
	}

	// 最初のアイコングループを ICO に組み立てる（winres が RT_ICON の解決まで行う）
	var icon *winres.Icon
	rs.WalkType(winres.RT_GROUP_ICON, func(resID winres.Identifier, langID uint16, _ []byte) bool {
		if ic, err := rs.GetIconTranslation(resID, langID); err == nil {
			icon = ic
			return false // 先頭のグループだけ使う
		}
		return true
	})
	if icon == nil {
		return nil, fmt.Errorf("アイコンリソースがありません")
	}

	var buf bytes.Buffer
	if err := icon.SaveICO(&buf); err != nil {
		return nil, fmt.Errorf("ICO の組み立てに失敗しました: %w", err)
	}
	images, err := ico.DecodeAll(&buf)
	if err != nil {
		return nil, fmt.Errorf("ICO のデコードに失敗しました: %w", err)
	}
	best := largest(images)
	if best == nil {
		return nil, fmt.Errorf("アイコン画像がありません")
	}

	var out bytes.Buffer
	if err := png.Encode(&out, best); err != nil {
		return nil, fmt.Errorf("PNG エンコードに失敗しました: %w", err)
	}
	return out.Bytes(), nil
}

// largest は面積が最大の画像を返す。同面積では truecolor（*image.Paletted 以外）を
// 優先する（同じサイズで複数ビット深度が併存する古い ICO で、低色版が先に格納されて
// いても採用されないようにするため）。それ以外の同点は先勝ち。空スライスなら nil。
func largest(images []image.Image) image.Image {
	var best image.Image
	bestArea := 0
	for _, img := range images {
		b := img.Bounds()
		area := b.Dx() * b.Dy()
		switch {
		case area > bestArea:
			best, bestArea = img, area
		case area == bestArea && isPaletted(best) && !isPaletted(img):
			best = img
		}
	}
	return best
}

// isPaletted はインデックスカラー（低ビット深度）画像かどうかを返す。
func isPaletted(img image.Image) bool {
	_, ok := img.(*image.Paletted)
	return ok
}
