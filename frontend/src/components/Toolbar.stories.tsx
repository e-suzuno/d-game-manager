import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { Toolbar } from './Toolbar'
import type { GroupKey, SortDir, SortKey, TagAxis } from '../types'
import { UNKNOWN_TOOL } from '../types'

const meta = {
  title: 'Components/Toolbar',
  component: Toolbar,
} satisfies Meta<typeof Toolbar>

export default meta

const TOOLS = ['RPGツクール', 'Unity', 'WOLF RPG', UNKNOWN_TOOL]

const GROUPS = (active: string[]) => [
  {
    axis: 'genre' as TagAxis,
    items: ['ホラー', 'アクション', 'RPG', 'パズル'].map((name, i) => ({
      name,
      count: 5 - (i % 3),
      active: active.includes(name),
    })),
  },
  {
    axis: 'other' as TagAxis,
    items: ['クリア', 'プレイ中', '積みゲー'].map((name, i) => ({
      name,
      count: 6 - i,
      active: active.includes(name),
    })),
  },
]

function InteractiveToolbar() {
  const [tags, setTags] = useState<string[]>([])
  const [tools, setTools] = useState<string[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('added')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [groupBy, setGroupBy] = useState<GroupKey>('none')
  return (
    <div style={{ paddingTop: 14, minHeight: 420 }}>
      <Toolbar
        tools={TOOLS.map((name) => ({ name, active: tools.includes(name) }))}
        activeTools={tools}
        onToggleTool={(name) =>
          setTools((cur) => (cur.includes(name) ? cur.filter((t) => t !== name) : [...cur, name]))
        }
        groups={GROUPS(tags)}
        activeTags={tags}
        onToggleTag={(name) =>
          setTags((cur) => (cur.includes(name) ? cur.filter((t) => t !== name) : [...cur, name]))
        }
        onClearTools={() => setTools([])}
        onClearTags={() => setTags([])}
        onClearFilters={() => {
          setTags([])
          setTools([])
        }}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortKey={setSortKey}
        onToggleSortDir={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
        groupBy={groupBy}
        onGroupBy={setGroupBy}
      />
    </div>
  )
}

export const Interactive: StoryObj = {
  name: '制作ツール / タグの2ボタン・並び替え / グループ（実動作）',
  render: () => <InteractiveToolbar />,
}

/**
 * 調整版ハンドオフ 変更点6: 「制作ツール」「タグ」ボタンが独立したポップオーバーと件数バッジを持ち、
 * 各ポップオーバーの「解除」は自分のフィルタだけを解除することを検証する。
 */
export const IndependentFilterButtons: StoryObj = {
  name: '2ボタンの独立バッジと独立解除（調整版ハンドオフ 変更点6）',
  render: () => <InteractiveToolbar />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // 先頭2つの toolbar__btn = 制作ツール / タグ（並び替え・グループが続く）
    const toolBtn = () => canvasElement.querySelectorAll<HTMLElement>('.toolbar__btn')[0]
    const tagBtn = () => canvasElement.querySelectorAll<HTMLElement>('.toolbar__btn')[1]

    // 制作ツールポップオーバーでピルを選ぶと、ツールボタンだけにバッジが付く
    await userEvent.click(toolBtn())
    await userEvent.click(await canvas.findByText('Unity'))
    await expect(within(toolBtn()).getByText('1')).toBeVisible()
    await expect(within(tagBtn()).queryByText('1')).toBeNull()

    // タグポップオーバーに切り替えて2件チェック → タグボタンに独立した件数バッジ
    await userEvent.click(tagBtn())
    await userEvent.click(await canvas.findByText('ホラー'))
    await userEvent.click(canvas.getByText('クリア'))
    await expect(within(tagBtn()).getByText('2')).toBeVisible()
    await expect(within(toolBtn()).getByText('1')).toBeVisible()

    // タグ側の「解除」はタグのみ解除し、ツールのフィルタは残る
    await userEvent.click(canvas.getByText('解除'))
    await waitFor(() => expect(within(tagBtn()).queryByText('2')).toBeNull())
    await expect(within(toolBtn()).getByText('1')).toBeVisible()

    // ポップオーバーを閉じてから、適用中チップ行の「すべて解除」で両方が消える
    await userEvent.click(canvasElement.querySelector('.toolbar__overlay') as HTMLElement)
    await userEvent.click(canvas.getByText('すべて解除'))
    await waitFor(() => expect(within(toolBtn()).queryByText('1')).toBeNull())
  },
}
