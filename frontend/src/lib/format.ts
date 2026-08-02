/** サイズ表記: 1GB 以上は「x.x GB」、未満は「xxx MB」 */
export function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  // 丸め後の値で判定しないと 1023.5〜1024 MB が「1024 MB」と表示される
  const roundedMB = Math.round(mb)
  return roundedMB >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${roundedMB} MB`
}

/** 追加日表記: YYYY/MM/DD */
export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`
}

// ICON_COVER_SUFFIX: Go/TS 双方（app.go の iconCoverSuffix）で同じサフィックスを使う。値を変える場合は両方揃えること。
const ICON_COVER_SUFFIX = '_icon.png'

/** カバーの CSS background 値。ユーザー指定画像があればそれを、なければ既定グラデーション */
export function coverBackground(id: number, coverPath?: string): string {
  if (coverPath) {
    // data URL / 絶対 URL はそのまま、相対パス（covers/…）はアセットサーバーのルートから解決
    const url = /^(data:|https?:|\/)/.test(coverPath) ? coverPath : `/${coverPath}`
    if (coverPath.endsWith(ICON_COVER_SUFFIX)) {
      // 取り込み時に .exe から抽出したアイコン（Go 側が _icon.png サフィックスを付ける）。
      // 低解像度が多く全面に引き伸ばすと粗くなるため、グラデーションに重ねて中央表示する
      return `center / auto 45% no-repeat url("${url}"), ${coverGradient(id)}`
    }
    return `center/cover no-repeat url("${url}")`
  }
  return coverGradient(id)
}

// 淡色 tint の8色2トーンパレット（デザインハンドオフ v2）。id で循環させる
const PASTEL_PAIRS: [string, string][] = [
  ['#e7ecf4', '#d7deed'],
  ['#e5efe7', '#d3e6d8'],
  ['#f2ece2', '#e7dbca'],
  ['#eae7f3', '#dbd6ec'],
  ['#f3e9ee', '#e9d6e0'],
  ['#e2eff1', '#cfe6e9'],
  ['#eef1f6', '#dfe4ee'],
  ['#f1ede3', '#e5dcc9'],
]

/**
 * カバー画像のプレースホルダ（id ベースの淡色2トーングラデーション）。
 */
export function coverGradient(id: number): string {
  const [a, b] = PASTEL_PAIRS[id % PASTEL_PAIRS.length]
  return `linear-gradient(150deg, ${a}, ${b})`
}
