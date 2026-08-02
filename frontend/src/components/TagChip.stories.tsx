import type { Meta, StoryObj } from '@storybook/react-vite'
import { TagChip, MoreChip, AddTagChip, TagRow } from './TagChip'

const meta = {
  title: 'Components/TagChip',
  component: TagChip,
} satisfies Meta<typeof TagChip>

export default meta
type Story = StoryObj<typeof meta>

export const Genre: Story = {
  args: { label: 'RPG', axis: 'genre' },
}

export const Other: Story = {
  args: { label: '積みゲー', axis: 'other' },
}

export const CustomColors: StoryObj = {
  name: 'カスタム色（9色パレット）',
  render: () => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {['blue', 'teal', 'violet', 'rose', 'amber', 'green', 'cyan', 'slate', 'gray'].map((k) => (
        <TagChip key={k} label={k} axis="other" color={k} />
      ))}
    </div>
  ),
}

export const LongLabelEllipsis: Story = {
  name: '長いタグ名は150pxで省略',
  args: { label: 'とても長いタグ名がここに入って省略されるはず', axis: 'genre' },
}

export const DrawerSizeWithRemove: Story = {
  name: 'ドロワー用（×付き）',
  args: { label: 'ホラー', axis: 'genre', size: 'drawer', onRemove: () => alert('remove') },
}

export const More: StoryObj = {
  render: () => <MoreChip count={3} />,
}

export const AddPlaceholder: StoryObj = {
  name: 'タグ0件の「＋ タグ」',
  render: () => <AddTagChip onClick={() => alert('open drawer')} />,
}

export const Row: StoryObj = {
  name: 'TagRow: 2件 + +N',
  render: () => (
    <div style={{ width: 260 }}>
      <TagRow
        tags={[
          { label: 'RPG', axis: 'genre' },
          { label: 'ホラー', axis: 'other' },
          { label: '実況向け', axis: 'other' },
          { label: '積みゲー', axis: 'other' },
        ]}
      />
    </div>
  ),
}

export const RowNarrow: StoryObj = {
  name: 'TagRow: 幅不足でも +N は常に見える',
  render: () => (
    <div style={{ width: 170, border: '1px dashed #ccc' }}>
      <TagRow
        tags={[
          { label: '長いタグ名のホラーアドベンチャー', axis: 'genre' },
          { label: 'マルチエンディング', axis: 'other' },
          { label: '積みゲー', axis: 'other' },
        ]}
      />
    </div>
  ),
}

export const RowEmpty: StoryObj = {
  name: 'TagRow: タグ0件',
  render: () => <TagRow tags={[]} onAddClick={() => alert('open drawer')} />,
}
