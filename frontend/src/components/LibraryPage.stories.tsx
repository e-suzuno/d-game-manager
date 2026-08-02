import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { LibraryPage } from './LibraryPage'
import type { DetectedGame } from './ImportModal'
import type { UIGame, UITag } from '../types'
import { mockGames, mockGameMissingExe, mockGameMissingFolder } from '../data/mockGames'
import { UNKNOWN_TOOL } from '../types'

const meta = {
  title: 'Pages/LibraryPage',
  component: LibraryPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof LibraryPage>

export default meta

// 未判別を含める（取り込みレビューの破線バッジ確認用）
const DUMMY_DETECTED: DetectedGame[] = [
  { title: '真紅の魔導書', folderPath: 'D:\\DL\\shinku\\', exePath: 'Game.exe', sizeBytes: 300 * 1024 * 1024, tool: 'RPGツクール' },
  { title: 'スチームパンク・アトリエ', folderPath: 'D:\\DL\\atelier\\', exePath: 'atelier.exe', sizeBytes: 512 * 1024 * 1024, tool: 'Unity' },
  { title: '夜光列車', folderPath: 'D:\\DL\\train\\', exePath: 'yakou.exe', sizeBytes: 128 * 1024 * 1024, tool: UNKNOWN_TOOL },
]

export const Interactive: StoryObj = {
  name: 'ライブラリ画面（全機能・未判別ゲーム含む）',
  render: () => {
    const [games, setGames] = useState(mockGames)
    // タグ管理の「新規登録」で増えた未割当タグ（games からは導出できないため別に持つ）
    const [extraTags, setExtraTags] = useState<UITag[]>([])
    const update = (id: number, fn: (g: UIGame) => UIGame) =>
      setGames((cur) => cur.map((g) => (g.id === id ? fn(g) : g)))
    // 全ゲームのタグ ID ごとに一括更新する（リネーム・性質変換で使う）
    const updateTagEverywhere = (tagID: number, fn: (t: UITag) => UITag) => {
      setGames((cur) =>
        cur.map((g) => ({ ...g, tags: g.tags.map((t) => (t.id === tagID ? fn(t) : t)) })),
      )
      setExtraTags((cur) => cur.map((t) => (t.id === tagID ? fn(t) : t)))
    }
    const allTags = [
      ...new Map([...games.flatMap((g) => g.tags), ...extraTags].map((t) => [t.name, t])).values(),
    ]

    return (
      <div style={{ height: '100vh' }}>
        <LibraryPage
          games={games}
          allTags={allTags}
          onToggleFavorite={(id) => update(id, (g) => ({ ...g, favorite: !g.favorite }))}
          onSetTool={(id, tool) => {
            update(id, (g) => ({ ...g, tool }))
            return '制作ツールを変更しました'
          }}
          onLaunch={(id) => `「${games.find((g) => g.id === id)?.title}」を起動します…`}
          onOpenFolder={(id) => `フォルダを開きます： ${games.find((g) => g.id === id)?.folderPath}`}
          onAddTag={(id, name) =>
            update(id, (g) => {
              if (g.tags.some((t) => t.name === name)) return g
              const existing = games.flatMap((x) => x.tags).find((t) => t.name === name)
              const tag: UITag = existing ?? { id: Date.now(), name, axis: 'other', color: '' }
              return { ...g, tags: [...g.tags, tag] }
            })
          }
          onRemoveTag={(id, tag) =>
            update(id, (g) => ({ ...g, tags: g.tags.filter((t) => t.id !== tag.id) }))
          }
          onSetTagColor={(tag, color) =>
            setGames((cur) =>
              cur.map((g) => ({
                ...g,
                tags: g.tags.map((t) => (t.name === tag.name ? { ...t, color } : t)),
              })),
            )
          }
          onRenameTag={(tag, name) => updateTagEverywhere(tag.id, (t) => ({ ...t, name }))}
          onDeleteTag={(tag) => {
            setGames((cur) =>
              cur.map((g) => ({ ...g, tags: g.tags.filter((t) => t.id !== tag.id) })),
            )
            setExtraTags((cur) => cur.filter((t) => t.id !== tag.id))
          }}
          onSetTagAxis={(tag, axis) => updateTagEverywhere(tag.id, (t) => ({ ...t, axis }))}
          onCreateTag={(name, axis) =>
            setExtraTags((cur) => [...cur, { id: Date.now(), name, axis, color: '' }])
          }
          onRename={(id, title) => {
            update(id, (g) => ({ ...g, title }))
            return 'タイトルを変更しました'
          }}
          onChangeCover={(id) =>
            new Promise((resolve) => {
              const inp = document.createElement('input')
              inp.type = 'file'
              inp.accept = 'image/*'
              inp.onchange = () => {
                const f = inp.files?.[0]
                if (!f) return resolve(null)
                const r = new FileReader()
                r.onload = () => {
                  update(id, (g) => ({ ...g, coverPath: r.result as string }))
                  resolve('カバー画像を変更しました')
                }
                r.readAsDataURL(f)
              }
              inp.click()
            })
          }
          onResetCover={(id) => {
            update(id, (g) => ({ ...g, coverPath: '' }))
            return 'カバー画像を初期に戻しました'
          }}
          onRelink={() => alert('保存先フォルダを選択（実装では OS ダイアログ）')}
          onCheckMissing={async () => games.filter((g) => g.missing)}
          onDeleteMissing={(ids) => {
            setGames((cur) => cur.filter((g) => !ids.includes(g.id)))
            return `${ids.length}本をライブラリから削除しました`
          }}
          onDelete={(id) => {
            const title = games.find((g) => g.id === id)?.title
            setGames((cur) => cur.filter((g) => g.id !== id))
            return `「${title}」をライブラリから削除しました`
          }}
          onScanFolder={() =>
            new Promise((resolve) => setTimeout(() => resolve(DUMMY_DETECTED), 1400))
          }
          onImport={(selected) =>
            setGames((cur) => {
              let nextGameId = Math.max(0, ...cur.map((g) => g.id)) + 1
              const added = selected.map((d) => ({
                id: nextGameId++,
                title: d.title,
                exePath: d.exePath,
                folderPath: d.folderPath,
                sizeBytes: d.sizeBytes,
                favorite: false,
                addedAt: '2026-07-21T12:00:00+09:00',
                coverPath: '',
                tool: d.tool,
                tags: [],
                missing: '' as const,
              }))
              return [...cur, ...added]
            })
          }
          onResetLibrary={() => {
            // 成功は null（既定トースト「すべてのデータを消去しました」は LibraryPage 側）
            setGames([])
            return null
          }}
        />
      </div>
    )
  },
}

// Issue #16: 同一秒バッチのタイブレーク検証用データ。
// バックエンドの返却順（added_at DESC, id DESC = 新しい順）を模して「新しい順」で並べる。
// バッチ3件（2026-07-15T09:00:00）を id 降順で挟み、前後に異なる addedAt のゲームを置く。
const g = (id: number, title: string, addedAt: string): UIGame => ({
  id,
  title,
  exePath: 'Game.exe',
  folderPath: `D:\\Games\\${title}\\`,
  sizeBytes: 200 * 1024 * 1024,
  favorite: false,
  addedAt,
  coverPath: '',
  tool: 'Unity',
  tags: [],
  missing: '',
})

const SORT_GAMES: UIGame[] = [
  g(100, 'ソート検証・最新', '2026-07-20T10:00:00+09:00'),
  g(30, 'バッチ先頭', '2026-07-15T09:00:00+09:00'),
  g(20, 'バッチ中央', '2026-07-15T09:00:00+09:00'),
  g(10, 'バッチ末尾', '2026-07-15T09:00:00+09:00'),
  g(5, 'ソート検証・最古', '2026-07-10T08:00:00+09:00'),
]

const noop = () => {}

/**
 * Issue #16: 追加日 降順（既定ソート）で、同一秒バッチ内のタイブレーク順が
 * 入力配列順（バックエンドの added_at DESC, id DESC）のまま保たれることを検証する。
 * 昇順ソート後に配列全体を reverse する実装だと同値区間の相対順序まで反転する回帰を防ぐ。
 */
export const SortStableDescendingTie: StoryObj = {
  name: '追加日降順で同一秒バッチの順序が保たれる（Issue #16）',
  render: () => (
    <div style={{ height: '100vh' }}>
      <LibraryPage
        games={SORT_GAMES}
        allTags={[]}
        onToggleFavorite={noop}
        onSetTool={noop}
        onLaunch={noop}
        onOpenFolder={noop}
        onAddTag={noop}
        onRemoveTag={noop}
        onSetTagColor={noop}
        onRenameTag={noop}
        onDeleteTag={noop}
        onSetTagAxis={noop}
        onCreateTag={noop}
        onRename={noop}
        onChangeCover={noop}
        onResetCover={noop}
        onRelink={noop}
        onCheckMissing={async () => []}
        onDeleteMissing={noop}
        onDelete={noop}
        onScanFolder={async () => null}
        onImport={noop}
        onResetLibrary={noop}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const titles = Array.from(canvasElement.querySelectorAll('.game-table__title')).map(
      (el) => el.textContent,
    )

    // 既定は sortKey='added' / sortDir='desc'。desc 表示では、渡された配列の順序
    // （新しい順）がそのまま保たれるべき ＝ 入力配列のタイトル順と一致する。
    await expect(titles).toEqual(SORT_GAMES.map((game) => game.title))

    // 異なる addedAt 同士の反転は成立していること（最新が先頭・最古が末尾）
    await expect(titles[0]).toBe('ソート検証・最新')
    await expect(titles[titles.length - 1]).toBe('ソート検証・最古')

    // 核心: 同一秒バッチ（2026-07-15T09:00:00）内の相対順序が入力順のまま
    const batch = titles.filter((t) => t?.startsWith('バッチ'))
    await expect(batch).toEqual(['バッチ先頭', 'バッチ中央', 'バッチ末尾'])
  },
}

// タグフィルタ検証用: mockGames のタグから name 一意の語彙を作る（axis 解決に使う）
const MOCK_ALL_TAGS: UITag[] = [
  ...new Map(mockGames.flatMap((game) => game.tags).map((t) => [t.name, t])).values(),
]

/**
 * 調整版ハンドオフ 変更点5: タグフィルタは「ジャンル同士 OR / その他タグ同士 OR / 両群の間 AND」。
 * ツールバーの「タグ」ポップオーバーから選択して行数の変化を検証する。
 */
export const TagFilterAndOr: StoryObj = {
  name: 'タグフィルタ: ジャンルOR・その他OR・両群間AND（調整版ハンドオフ 変更点5）',
  render: () => (
    <div style={{ height: '100vh' }}>
      <LibraryPage
        games={mockGames}
        allTags={MOCK_ALL_TAGS}
        onToggleFavorite={noop}
        onSetTool={noop}
        onLaunch={noop}
        onOpenFolder={noop}
        onAddTag={noop}
        onRemoveTag={noop}
        onSetTagColor={noop}
        onRenameTag={noop}
        onDeleteTag={noop}
        onSetTagAxis={noop}
        onCreateTag={noop}
        onRename={noop}
        onChangeCover={noop}
        onResetCover={noop}
        onRelink={noop}
        onCheckMissing={async () => []}
        onDeleteMissing={noop}
        onDelete={noop}
        onScanFolder={async () => null}
        onImport={noop}
        onResetLibrary={noop}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const toolbar = within(canvasElement.querySelector('.toolbar') as HTMLElement)
    const readTitles = () =>
      Array.from(canvasElement.querySelectorAll('.game-table__title')).map((el) => el.textContent)

    // ツールバーの「タグ」ポップオーバーを開き、ジャンルを2つ選ぶ
    await userEvent.click(toolbar.getByText('タグ'))
    await userEvent.click(await toolbar.findByText('ホラー'))
    await userEvent.click(toolbar.getByText('アクション'))
    // ジャンル同士は OR: ホラー2件 + アクション4件 = 6件
    await waitFor(() => expect(readTitles()).toHaveLength(6))

    // その他タグを追加すると両群の間は AND: (ホラー∨アクション) ∧ クリア = 1件
    await userEvent.click(toolbar.getByText('クリア'))
    await waitFor(() => expect(readTitles()).toEqual(['霧の街のアリア']))

    // その他タグ同士は OR: (ホラー∨アクション) ∧ (クリア∨プレイ中) = 3件
    await userEvent.click(toolbar.getByText('プレイ中'))
    await waitFor(() => expect(readTitles()).toHaveLength(3))
  },
}

/**
 * Issue #16: 昇順（dir=1）経路の検証。並び替えメニューで desc → asc に切り替えても、
 * 異なる addedAt 同士は反転する一方で、同一秒バッチのタイブレーク順は入力配列順のまま
 * 保たれる（比較関数へ方向符号を掛ける実装は同値 0 を反転しないため）。
 */
export const SortStableAscendingTie: StoryObj = {
  name: '追加日昇順でも同一秒バッチの順序が保たれる（Issue #16）',
  render: () => (
    <div style={{ height: '100vh' }}>
      <LibraryPage
        games={SORT_GAMES}
        allTags={[]}
        onToggleFavorite={noop}
        onSetTool={noop}
        onLaunch={noop}
        onOpenFolder={noop}
        onAddTag={noop}
        onRemoveTag={noop}
        onSetTagColor={noop}
        onRenameTag={noop}
        onDeleteTag={noop}
        onSetTagAxis={noop}
        onCreateTag={noop}
        onRename={noop}
        onChangeCover={noop}
        onResetCover={noop}
        onRelink={noop}
        onCheckMissing={async () => []}
        onDeleteMissing={noop}
        onDelete={noop}
        onScanFolder={async () => null}
        onImport={noop}
        onResetLibrary={noop}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // 並び替えメニューを開き「並び順を反転」で desc → asc に切り替える
    await userEvent.click(canvas.getByText('並び替え：追加日'))
    await userEvent.click(await canvas.findByText('並び順を反転'))

    const readTitles = () =>
      Array.from(canvasElement.querySelectorAll('.game-table__title')).map((el) => el.textContent)

    // asc 反映を待つ（先頭が最古に入れ替わる）
    await waitFor(() => expect(readTitles()[0]).toBe('ソート検証・最古'))

    const titles = readTitles()
    // 異なる addedAt 同士は昇順で反転している（最古が先頭・最新が末尾）
    await expect(titles[0]).toBe('ソート検証・最古')
    await expect(titles[titles.length - 1]).toBe('ソート検証・最新')

    // 核心: 昇順でもタイは反転せず、同一秒バッチの相対順序は入力配列順のまま
    const batch = titles.filter((t) => t?.startsWith('バッチ'))
    await expect(batch).toEqual(['バッチ先頭', 'バッチ中央', 'バッチ末尾'])
  },
}

/**
 * 実体が見つからないゲームがある状態。サイドナビに「見つからない」ビューが現れ
 * （該当0件のときは行そのものが出ない）、設定モーダルの整合性チェックから一括削除できる。
 */
export const WithMissingGames: StoryObj = {
  name: '見つからないゲームがある（ビュー + 整合性チェック）',
  render: () => {
    const [games, setGames] = useState<UIGame[]>([
      mockGameMissingFolder,
      mockGameMissingExe,
      ...mockGames.slice(0, 6),
    ])
    return (
      <div style={{ height: '100vh' }}>
        <LibraryPage
          games={games}
          allTags={[...new Map(mockGames.flatMap((g) => g.tags).map((t) => [t.name, t])).values()]}
          onToggleFavorite={noop}
          onSetTool={noop}
          onLaunch={noop}
          onOpenFolder={noop}
          onAddTag={noop}
          onRemoveTag={noop}
          onSetTagColor={noop}
          onRenameTag={noop}
          onDeleteTag={noop}
          onSetTagAxis={noop}
          onCreateTag={noop}
          onRename={noop}
          onChangeCover={noop}
          onResetCover={noop}
          onRelink={() => alert('保存先フォルダを選択（実装では OS ダイアログ）')}
          onCheckMissing={async () => games.filter((g) => g.missing)}
          onDeleteMissing={(ids) => {
            setGames((cur) => cur.filter((g) => !ids.includes(g.id)))
            return `${ids.length}本をライブラリから削除しました`
          }}
          onDelete={(id) => {
            setGames((cur) => cur.filter((g) => g.id !== id))
            return 'ライブラリから削除しました'
          }}
          onScanFolder={async () => null}
          onImport={noop}
          onResetLibrary={noop}
        />
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // 「見つからない」ビューは該当があるときだけ現れ、件数を警告色で示す
    await expect(canvas.getByText('見つからない')).toBeVisible()
    await userEvent.click(canvas.getByText('見つからない'))
    await expect(await canvas.findByText('見つからないゲーム')).toBeVisible()
    // 絞り込み後は missing のゲームだけが並ぶ
    const titles = Array.from(canvasElement.querySelectorAll('.game-table__title')).map(
      (el) => el.textContent,
    )
    await expect(titles).toEqual([mockGameMissingFolder.title, mockGameMissingExe.title])
  },
}
