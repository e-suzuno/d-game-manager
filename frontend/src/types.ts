/** UI 層で使う型。Go 側 (store) の JSON 形状と一致させている */

export type TagAxis = 'genre' | 'other'

/** 制作ツールの判別不能値（バックエンドと同じリテラル） */
export const UNKNOWN_TOOL = '未判別'

/** ドロワーの制作ツール選択肢に常に出す既定ツール6種（調整版ハンドオフ 変更点3） */
export const BASE_TOOLS = ['RPGツクール', 'Unity', 'WOLF RPG', 'ティラノ', 'GameMaker', 'Godot']

export interface UITag {
  id: number
  name: string
  axis: TagAxis
  /** パレットキー。空文字は未設定＝軸の既定色（genre→blue / other→gray） */
  color: string
}

/** タグの9色パレット（docs/reference/design-tokens.md「タグの9色パレット」） */
export const PALETTE: { k: string; t: string; b: string }[] = [
  { k: 'blue', t: '#1e40af', b: '#dbeafe' },
  { k: 'teal', t: '#0f766e', b: '#ccfbf1' },
  { k: 'violet', t: '#5b21b6', b: '#ede9fe' },
  { k: 'rose', t: '#9f1239', b: '#ffe4e6' },
  { k: 'amber', t: '#92400e', b: '#fef3c7' },
  { k: 'green', t: '#166534', b: '#dcfce7' },
  { k: 'cyan', t: '#155e75', b: '#cffafe' },
  { k: 'slate', t: '#334155', b: '#e2e8f0' },
  { k: 'gray', t: '#57534e', b: '#eceae4' },
]

const AXIS_DEFAULT_COLOR: Record<TagAxis, string> = {
  genre: 'blue',
  other: 'gray',
}

/** タグの描画色を解決する（color 未設定なら軸の既定色） */
export function tagColorOf(tag: { axis: TagAxis; color?: string }): { text: string; bg: string } {
  const key = tag.color || AXIS_DEFAULT_COLOR[tag.axis]
  const p = PALETTE.find((x) => x.k === key) ?? PALETTE[0]
  return { text: p.t, bg: p.b }
}

/**
 * 実体（フォルダ・exe）が見つからない状態。Go の internal/health と同じ値を使う
 * （'' = 正常 / 'folder' = フォルダ不在 / 'exe' = 実行ファイル不在）。
 * DB には永続化されず、CheckMissingGames の結果で都度上書きされる
 */
export type MissingKind = '' | 'folder' | 'exe'

/** 見つからない理由の説明文（バッジの title 属性・ドロワーの警告見出し） */
export const MISSING_LABEL: Record<Exclude<MissingKind, ''>, string> = {
  folder: 'フォルダが見つかりません',
  exe: '実行ファイルが見つかりません',
}

export type SortKey = 'added' | 'title' | 'size'
export type SortDir = 'asc' | 'desc'
/** 'tool' は属性（UIGame.tool）でのグルーピング。'genre' はタグ軸ベース */
export type GroupKey = 'none' | 'genre' | 'tool'

export interface GameSection {
  label: string
  count: number
  games: UIGame[]
  showHeader: boolean
}

export interface UIGame {
  id: number
  title: string
  /** フォルダからの相対パス（例: Game.exe） */
  exePath: string
  /** 絶対パス */
  folderPath: string
  sizeBytes: number
  favorite: boolean
  /** ISO 8601 */
  addedAt: string
  /** カバー画像。相対パス（covers/…）または data URL。空文字は既定グラデーション */
  coverPath: string
  /** 制作ツール属性。常に値を持つ（判別不能時は UNKNOWN_TOOL） */
  tool: string
  tags: UITag[]
  /** 実体が見つからない状態。一覧取得時は常に '' で、存在確認の結果があとから入る */
  missing: MissingKind
}

/** 'missing' は実体が見つからないゲームのビュー（該当0件のときはサイドナビに出さない） */
export type ViewKey = 'all' | 'fav' | 'untagged' | 'missing'

export const AXIS_LABELS: Record<TagAxis, string> = {
  genre: 'ジャンル',
  other: 'その他タグ',
}
