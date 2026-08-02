import type { Meta, StoryObj } from '@storybook/react-vite'
import { MissingBadge } from './MissingBadge'

const meta = {
  title: 'Components/MissingBadge',
  component: MissingBadge,
} satisfies Meta<typeof MissingBadge>

export default meta
type Story = StoryObj<typeof meta>

export const MissingFolder: Story = {
  name: 'フォルダ不在',
  args: { missing: 'folder' },
}

export const MissingExe: Story = {
  name: '実行ファイル不在',
  args: { missing: 'exe' },
}

export const Overlay: StoryObj = {
  name: 'カバー重ね版（ギャラリー）',
  render: () => (
    <div
      style={{
        width: 180,
        height: 90,
        padding: 8,
        background: 'linear-gradient(135deg, #6b7280, #1f2937)',
      }}
    >
      <MissingBadge missing="folder" variant="overlay" />
    </div>
  ),
}

export const Normal: Story = {
  name: '正常時は描画しない',
  args: { missing: '' },
}
