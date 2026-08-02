import type { Meta, StoryObj } from '@storybook/react-vite'
import { StatsBar } from './StatsBar'

const meta = {
  title: 'Components/StatsBar',
  component: StatsBar,
} satisfies Meta<typeof StatsBar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    stats: [
      { label: '総ゲーム数', value: 24, unit: '本' },
      { label: '総容量', value: '18.4', unit: 'GB' },
      { label: 'お気に入り', value: 5, unit: '本' },
      { label: '未整理', value: 2, unit: '本' },
    ],
  },
}
