import type { UIGame, UITag } from '../types'
import { UNKNOWN_TOOL } from '../types'

/**
 * デザインプロトタイプ相当のダミーデータ 24 件。
 * Storybook と、フェーズ5で実データに繋ぐまでのアプリ表示に使う。
 */

interface RawGame {
  t: string // タイトル
  g: string // ジャンル
  tool: string // 制作ツール（属性。空文字は未判別扱い）
  p: string // 進行状況（その他タグとして扱う）
  fav?: boolean
  untagged?: boolean // 未整理（タグなし）にするか
}

const RAW: RawGame[] = [
  { t: '霧の街のアリア', g: 'ホラー', tool: 'RPGツクール', p: 'クリア', fav: true },
  { t: 'ネオ・ドリフト2099', g: 'アクション', tool: 'Unity', p: 'プレイ中' },
  { t: 'ちいさな魔女の薬草店', g: 'シミュレーション', tool: 'Unity', p: 'プレイ中', fav: true },
  { t: '深淵のダンジョンロード', g: 'RPG', tool: 'WOLF RPG', p: '積みゲー' },
  { t: '星屑カフェテリア', g: 'ノベル', tool: 'ティラノ', p: 'クリア' },
  { t: 'ピクセル・ガンナーX', g: 'シューティング', tool: 'GameMaker', p: 'プレイ中' },
  { t: '忘却の図書館', g: '', tool: '', p: '', untagged: true },
  { t: 'ブロックロジック', g: 'パズル', tool: 'Unity', p: 'クリア' },
  { t: '銀嶺のサムライ', g: 'アクション', tool: 'Unity', p: '積みゲー', fav: true },
  { t: 'ふしぎ商店街ものがたり', g: 'シミュレーション', tool: 'RPGツクール', p: 'プレイ中' },
  { t: '虚空のヴァルキリー', g: 'RPG', tool: 'Unity', p: 'クリア', fav: true },
  { t: '真夜中の探偵ノート', g: 'アドベンチャー', tool: 'ティラノ', p: 'クリア' },
  { t: 'キューブ・エスケープ', g: '', tool: '', p: '', untagged: true },
  { t: '廃線トンネルの怪', g: 'ホラー', tool: 'WOLF RPG', p: 'プレイ中' },
  { t: 'クリスタル・タクティクス', g: 'RPG', tool: 'RPGツクール', p: '積みゲー' },
  { t: 'ハイパー・スカイジャンプ', g: 'アクション', tool: 'GameMaker', p: '未プレイ' },
  { t: '花咲く丘の約束', g: 'ノベル', tool: 'ティラノ', p: 'プレイ中', fav: true },
  { t: 'メカニカ：鋼の遺産', g: 'シューティング', tool: 'Unity', p: 'クリア' },
  { t: '迷宮のパティシエ', g: 'シミュレーション', tool: '', p: '未プレイ' },
  { t: '漆黒のレクイエム', g: 'RPG', tool: 'WOLF RPG', p: 'プレイ中' },
  { t: 'ドット絵農園日記', g: 'シミュレーション', tool: 'Unity', p: 'クリア' },
  { t: '反響する洞窟', g: 'アドベンチャー', tool: 'Godot', p: '積みゲー' },
  { t: 'ゼロ・グラビティ・レース', g: 'アクション', tool: 'Unity', p: '未プレイ' },
  { t: '言ノ葉パズラー', g: 'パズル', tool: 'RPGツクール', p: 'プレイ中' },
]

// タグは name 一意（store と同じ規則）。名前 → id を採番する
const tagIds = new Map<string, number>()
function tag(name: string, axis: UITag['axis'], color = ''): UITag {
  if (!tagIds.has(name)) tagIds.set(name, tagIds.size + 1)
  return { id: tagIds.get(name)!, name, axis, color }
}

export const mockGames: UIGame[] = RAW.map((r, i) => {
  const id = i + 1
  // 制作ツールはタグではなく属性（調整版ハンドオフ 変更点3）。タグは genre + other の2点
  const tags: UITag[] = r.untagged ? [] : [tag(r.g, 'genre'), tag(r.p, 'other')]
  const sizeMB = 140 + (i * 151) % 1700
  const y = 2024 + (i % 2)
  const mo = 1 + (i * 7) % 12
  const d = 1 + (i * 13) % 27
  return {
    id,
    title: r.t,
    exePath: 'Game.exe',
    folderPath: `D:\\Games\\${r.t}\\`,
    sizeBytes: sizeMB * 1024 * 1024,
    favorite: !!r.fav,
    addedAt: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00:00+09:00`,
    coverPath: '',
    tool: r.tool || UNKNOWN_TOOL,
    tags,
    missing: '',
  }
})

/** 実体が見つからないゲーム（フォルダ不在 / exe 不在）の検証用 */
export const mockGameMissingFolder: UIGame = {
  ...mockGames[3],
  id: 996,
  title: 'フォルダを削除したゲーム',
  missing: 'folder',
}

export const mockGameMissingExe: UIGame = {
  ...mockGames[4],
  id: 997,
  title: '実行ファイルが消えたゲーム',
  missing: 'exe',
}

/** カバー画像あり（グリフ非表示）検証用: data URL のダミーカバーを持つゲーム */
export const mockGameWithCover: UIGame = {
  ...mockGames[1],
  id: 998,
  title: 'カバー画像ありのゲーム',
  coverPath:
    "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><rect width='96' height='96' fill='%23415a77'/><circle cx='48' cy='38' r='20' fill='%23ffd166'/></svg>",
}

/** タグ折り返し検証用: タグが多く名前も長いゲーム（BASE_TOOLS 外のライブラリ内ツールの例を兼ねる） */
export const mockGameManyTags: UIGame = {
  ...mockGames[0],
  id: 999,
  title: 'エッジケース・オブ・ザ・イヤー ディレクターズカット完全版',
  tool: 'RPGツクールMZ',
  tags: [
    tag('サイコロジカルホラーアドベンチャー', 'genre'),
    tag('実績コンプ済み', 'other'),
    tag('サントラ付き限定版', 'other'),
    tag('積みゲー', 'other'),
  ],
}
