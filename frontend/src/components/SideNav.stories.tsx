import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { SideNav } from './SideNav'
import type { TagAxis, ViewKey } from '../types'
import { UNKNOWN_TOOL } from '../types'

const meta = {
  title: 'Components/SideNav',
  component: SideNav,
} satisfies Meta<typeof SideNav>

export default meta

const TOOLS = ['RPGツクール', 'Unity', 'WOLF RPG', 'ティラノ', 'Godot', UNKNOWN_TOOL]

const GROUPS = (active: string[]) => [
  {
    axis: 'genre' as TagAxis,
    items: ['ホラー', 'アクション', 'RPG', 'シミュレーション', 'ノベル', 'パズル'].map((name, i) => ({
      name,
      count: 5 - (i % 3),
      active: active.includes(name),
    })),
  },
  {
    axis: 'other' as TagAxis,
    items: ['クリア', 'プレイ中', '積みゲー', '未プレイ'].map((name, i) => ({
      name,
      count: 6 - i,
      active: active.includes(name),
    })),
  },
]

function InteractiveSideNav() {
  const [view, setView] = useState<ViewKey>('all')
  const [activeTags, setActiveTags] = useState<string[]>(['RPG'])
  const [activeTools, setActiveTools] = useState<string[]>(['Unity'])
  const [expanded, setExpanded] = useState<Record<TagAxis, boolean>>({
    genre: true,
    other: false,
  })
  return (
    <div style={{ height: 640, display: 'flex' }}>
      <SideNav
        view={view}
        counts={{ all: 24, fav: 5, untagged: 2, missing: 0 }}
        onViewChange={setView}
        tools={TOOLS.map((name) => ({ name, active: activeTools.includes(name) }))}
        onToggleTool={(name) =>
          setActiveTools(
            activeTools.includes(name)
              ? activeTools.filter((t) => t !== name)
              : [...activeTools, name],
          )
        }
        groups={GROUPS(activeTags)}
        expanded={expanded}
        onToggleExpand={(a) => setExpanded({ ...expanded, [a]: !expanded[a] })}
        onToggleTag={(name) =>
          setActiveTags(
            activeTags.includes(name)
              ? activeTags.filter((t) => t !== name)
              : [...activeTags, name],
          )
        }
        onManageTags={() => alert('タグを管理')}
        onSettings={() => alert('設定')}
        onImport={() => alert('フォルダを取り込む')}
      />
    </div>
  )
}

export const Interactive: StoryObj = {
  name: '制作ツールアコーディオン + タグ軸 + 管理リンク',
  render: () => <InteractiveSideNav />,
}

/**
 * 調整版ハンドオフ 変更点6: 制作ツールセクションは既定で折りたたみ。見出しクリックで開閉し、
 * 折りたたみ中も選択中の件数バッジが見出しに表示されることを検証する。
 */
export const ToolsAccordion: StoryObj = {
  name: '制作ツールは既定折りたたみ・開閉と件数バッジ（調整版ハンドオフ 変更点6）',
  render: () => <InteractiveSideNav />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // 既定は折りたたみ: ピルは出ず、選択中（Unity）の件数バッジだけ見出しに表示される
    await expect(canvas.queryByText('Unity')).toBeNull()
    await expect(canvasElement.querySelector('.side-nav__tools-badge')?.textContent).toBe('1')

    // 見出しクリックで展開 → ピルが現れる（「属性」注記は見出し内の要素）
    await userEvent.click(canvas.getByText('属性'))
    await expect(await canvas.findByText('Unity')).toBeVisible()

    // ピルの解除でバッジが消える
    await userEvent.click(canvas.getByText('Unity'))
    await waitFor(() =>
      expect(canvasElement.querySelector('.side-nav__tools-badge')).toBeNull(),
    )

    // もう一度見出しをクリックで折りたたみ
    await userEvent.click(canvas.getByText('属性'))
    await waitFor(() => expect(canvas.queryByText('Unity')).toBeNull())

    // 「タグで絞り込み」見出し右に「管理」リンクがある
    await expect(canvas.getByText('管理')).toBeVisible()
  },
}
