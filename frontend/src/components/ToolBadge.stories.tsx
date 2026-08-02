import type { Meta, StoryObj } from '@storybook/react-vite'
import { ToolBadge } from './ToolBadge'
import { UNKNOWN_TOOL } from '../types'

const meta = {
  title: 'Components/ToolBadge',
  component: ToolBadge,
} satisfies Meta<typeof ToolBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Known: Story = {
  name: '確定',
  args: { tool: 'RPGツクール' },
}

export const Unknown: Story = {
  name: '未判別（破線＋?）',
  args: { tool: UNKNOWN_TOOL },
}

export const LongName: StoryObj = {
  name: '長名は幅内で省略',
  render: () => (
    <div style={{ width: 118 }}>
      <ToolBadge tool="RPGツクールMZ スペシャルエディション" />
    </div>
  ),
}

export const ImportUnknown: StoryObj = {
  name: '取り込みレビュー用（小サイズ・ラベル差し替え）',
  render: () => <ToolBadge tool={UNKNOWN_TOOL} label="制作ツール未判別" size="sm" />,
}
