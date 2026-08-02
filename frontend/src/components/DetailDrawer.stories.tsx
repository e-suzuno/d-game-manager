import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent, userEvent, within } from 'storybook/test'
import { DetailDrawer } from './DetailDrawer'
import {
  mockGames,
  mockGameMissingExe,
  mockGameMissingFolder,
  mockGameWithCover,
} from '../data/mockGames'
import type { UIGame, UITag } from '../types'

const meta = {
  title: 'Components/DetailDrawer',
  component: DetailDrawer,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof DetailDrawer>

export default meta

const ALL_TAGS = [...new Map(mockGames.flatMap((g) => g.tags).map((t) => [t.name, t])).values()]
const ALL_TOOLS = [...new Set(mockGames.map((g) => g.tool))]

/** Storybook 用: ブラウザの画像選択 → data URL を返す（実装では Go 側の OS ダイアログ） */
function pickImage(): Promise<string | null> {
  return new Promise((resolve) => {
    const inp = document.createElement('input')
    inp.type = 'file'
    inp.accept = 'image/*'
    inp.onchange = () => {
      const f = inp.files?.[0]
      if (!f) return resolve(null)
      const r = new FileReader()
      r.onload = () => resolve(r.result as string)
      r.readAsDataURL(f)
    }
    inp.click()
  })
}

export const Interactive: StoryObj = {
  name: '制作ツール変更・タグ編集・色ピッカー・タイトル編集・カバー変更',
  render: () => {
    const [game, setGame] = useState(mockGames[0])
    return (
      <div style={{ position: 'relative', height: '100vh', background: 'var(--bg-app)' }}>
        <DetailDrawer
          game={game}
          allTags={ALL_TAGS}
          allTools={ALL_TOOLS}
          onClose={() => console.log('close')}
          onSetTool={(tool) => setGame({ ...game, tool })}
          onLaunch={() => alert('起動')}
          onOpenFolder={() => alert('フォルダを開く')}
          onAddTag={(name) => {
            if (game.tags.some((t) => t.name === name)) return
            const existing = ALL_TAGS.find((t) => t.name === name)
            const tag: UITag = existing ?? { id: Date.now(), name, axis: 'other', color: '' }
            setGame({ ...game, tags: [...game.tags, tag] })
          }}
          onRemoveTag={(tag) => setGame({ ...game, tags: game.tags.filter((t) => t.id !== tag.id) })}
          onSetTagColor={(tag, color) =>
            setGame({
              ...game,
              tags: game.tags.map((t) => (t.name === tag.name ? { ...t, color } : t)),
            })
          }
          onRename={(title) => setGame({ ...game, title })}
          onChangeCover={async () => {
            const url = await pickImage()
            if (url) setGame({ ...game, coverPath: url })
          }}
          onResetCover={() => setGame({ ...game, coverPath: '' })}
          onRelink={() => alert('保存先フォルダを選択（実装では OS ダイアログ）')}
          onDelete={() => alert(`「${game.title}」をライブラリから削除`)}
        />
      </div>
    )
  },
}

export const WithCover: StoryObj = {
  name: 'カバー画像あり（グリフ非表示）',
  render: () => (
    <div style={{ position: 'relative', height: '100vh', background: 'var(--bg-app)' }}>
      <DetailDrawer
        game={mockGameWithCover}
        allTags={ALL_TAGS}
        allTools={ALL_TOOLS}
        onClose={() => {}}
        onSetTool={() => {}}
        onLaunch={() => {}}
        onOpenFolder={() => {}}
        onAddTag={() => {}}
        onRemoveTag={() => {}}
        onSetTagColor={() => {}}
        onRename={() => {}}
        onChangeCover={() => {}}
        onResetCover={() => {}}
        onRelink={() => {}}
        onDelete={() => {}}
      />
    </div>
  ),
}

export const NoTags: StoryObj = {
  name: 'タグなし・制作ツール未判別',
  render: () => (
    <div style={{ position: 'relative', height: '100vh', background: 'var(--bg-app)' }}>
      {/* mockGames[6]（忘却の図書館）はタグなし＋tool 未判別。未判別→確定の主動線を確認する */}
      <DetailDrawer
        game={mockGames[6]}
        allTags={ALL_TAGS}
        allTools={ALL_TOOLS}
        onClose={() => {}}
        onSetTool={(tool) => alert(`制作ツールを変更: ${tool}`)}
        onLaunch={() => {}}
        onOpenFolder={() => {}}
        onAddTag={() => {}}
        onRemoveTag={() => {}}
        onSetTagColor={() => {}}
        onRename={() => {}}
        onChangeCover={() => {}}
        onResetCover={() => {}}
        onRelink={() => {}}
        onDelete={() => {}}
      />
    </div>
  ),
}

export const MissingFolder: StoryObj = {
  name: 'フォルダが見つからない（警告バナー）',
  render: () => (
    <div style={{ position: 'relative', height: '100vh', background: 'var(--bg-app)' }}>
      <DetailDrawer
        game={mockGameMissingFolder}
        allTags={ALL_TAGS}
        allTools={ALL_TOOLS}
        onClose={() => {}}
        onSetTool={() => {}}
        onLaunch={() => alert('起動（見つからない状態でも押せる: 判定は取得時点のもの）')}
        onOpenFolder={() => {}}
        onAddTag={() => {}}
        onRemoveTag={() => {}}
        onSetTagColor={() => {}}
        onRename={() => {}}
        onChangeCover={() => {}}
        onResetCover={() => {}}
        onRelink={() => alert('保存先フォルダを選択（実装では OS ダイアログ）')}
        onDelete={() => {}}
      />
    </div>
  ),
}

export const MissingExe: StoryObj = {
  name: '実行ファイルが見つからない（警告バナー）',
  render: () => (
    <div style={{ position: 'relative', height: '100vh', background: 'var(--bg-app)' }}>
      <DetailDrawer
        game={mockGameMissingExe}
        allTags={ALL_TAGS}
        allTools={ALL_TOOLS}
        onClose={() => {}}
        onSetTool={() => {}}
        onLaunch={() => {}}
        onOpenFolder={() => {}}
        onAddTag={() => {}}
        onRemoveTag={() => {}}
        onSetTagColor={() => {}}
        onRename={() => {}}
        onChangeCover={() => {}}
        onResetCover={() => {}}
        onRelink={() => alert('保存先フォルダを選択（実装では OS ダイアログ）')}
        onDelete={() => {}}
      />
    </div>
  ),
}

/** IME確定Enterのガード検証用: state を持ち onRename / onAddTag を実動作させるラッパー（Issue #29） */
function StatefulDetailDrawerForIme({ initialGame }: { initialGame: UIGame }) {
  const [game, setGame] = useState(initialGame)
  return (
    <div style={{ position: 'relative', height: '100vh', background: 'var(--bg-app)' }}>
      <DetailDrawer
        game={game}
        allTags={ALL_TAGS}
        allTools={ALL_TOOLS}
        onClose={() => {}}
        onSetTool={(tool) => setGame({ ...game, tool })}
        onLaunch={() => {}}
        onOpenFolder={() => {}}
        onAddTag={(name) => {
          if (game.tags.some((t) => t.name === name)) return
          const existing = ALL_TAGS.find((t) => t.name === name)
          const tag: UITag = existing ?? { id: Date.now(), name, axis: 'other', color: '' }
          setGame({ ...game, tags: [...game.tags, tag] })
        }}
        onRemoveTag={(tag) => setGame({ ...game, tags: game.tags.filter((t) => t.id !== tag.id) })}
        onSetTagColor={() => {}}
        onRename={(title) => setGame({ ...game, title })}
        onChangeCover={() => {}}
        onResetCover={() => {}}
        onRelink={() => {}}
        onDelete={() => {}}
      />
    </div>
  )
}

export const TitleEditImeEnterGuard: StoryObj = {
  name: 'タイトル編集: IME変換確定Enterでは保存しない（Issue #29）',
  render: () => <StatefulDetailDrawerForIme initialGame={mockGames[0]} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const originalTitle = mockGames[0].title

    // タイトル行クリックで編集開始 → 新しい文字列を入力
    await userEvent.click(canvas.getByText(originalTitle))
    const input = canvas.getByPlaceholderText('タイトルを入力…')
    await userEvent.clear(input)
    await userEvent.type(input, 'IME変換中のタイトル')

    // IME変換確定の Enter（isComposing: true）では saveTitle が実行されず、編集中のまま
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    await expect(canvas.getByPlaceholderText('タイトルを入力…')).toBeVisible()
    await expect(canvas.queryByText('IME変換中のタイトル')).toBeNull()

    // 続けて通常の Enter（isComposing: false）を押すと、そこで初めて保存される
    await userEvent.type(input, '{Enter}')
    await expect(await canvas.findByText('IME変換中のタイトル')).toBeVisible()
    await expect(canvas.queryByPlaceholderText('タイトルを入力…')).toBeNull()
  },
}

export const TagAddImeEnterGuard: StoryObj = {
  name: 'タグ追加: IME変換確定Enterでは追加しない（Issue #29）',
  render: () => <StatefulDetailDrawerForIme initialGame={mockGames[6]} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // mockGames[6]（忘却の図書館）はタグなしなのでチップとの名前衝突がない
    const input = canvas.getByPlaceholderText('タグを入力して Enter で追加…')
    await userEvent.type(input, 'IME確認用タグ')

    // IME変換確定の Enter（isComposing: true）では submit が実行されず、入力値も残る
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    await expect(canvas.queryByText('IME確認用タグ')).toBeNull()
    await expect(input).toHaveValue('IME確認用タグ')

    // 続けて通常の Enter（isComposing: false）を押すと、そこで初めて追加される
    await userEvent.type(input, '{Enter}')
    await expect(await canvas.findByText('IME確認用タグ')).toBeVisible()
    await expect(input).toHaveValue('')
  },
}
