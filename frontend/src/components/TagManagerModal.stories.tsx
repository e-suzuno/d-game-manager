import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent, fn, userEvent, waitFor, within } from 'storybook/test'
import { TagManagerModal } from './TagManagerModal'
import type { TagAxis, UITag } from '../types'

const meta = {
  title: 'Components/TagManagerModal',
  component: TagManagerModal,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof TagManagerModal>

export default meta

const wrap = (node: React.ReactNode) => (
  <div style={{ position: 'relative', height: '100vh', background: 'var(--bg-app)' }}>{node}</div>
)

const TAGS: UITag[] = [
  { id: 1, name: 'ホラー', axis: 'genre', color: '' },
  { id: 2, name: 'RPG', axis: 'genre', color: 'violet' },
  { id: 3, name: 'アクション', axis: 'genre', color: '' },
  { id: 4, name: 'クリア', axis: 'other', color: '' },
  { id: 5, name: 'プレイ中', axis: 'other', color: 'green' },
  { id: 6, name: '積みゲー', axis: 'other', color: '' },
]

const COUNTS = new Map<number, number>([
  [1, 2],
  [2, 4],
  [3, 4],
  [4, 7],
  [5, 6],
  [6, 3],
])

const duplicateSpy = fn()

/** タグ配列をローカル state で管理し、全ハンドラを実動作させるラッパー */
function StatefulTagManager({ initialTags = TAGS }: { initialTags?: UITag[] }) {
  const [tags, setTags] = useState<UITag[]>(initialTags)
  return (
    <TagManagerModal
      tags={tags}
      counts={COUNTS}
      onClose={() => console.log('close')}
      onRename={(tag, name) =>
        setTags((cur) => cur.map((t) => (t.id === tag.id ? { ...t, name } : t)))
      }
      onSetColor={(tag, color) =>
        setTags((cur) => cur.map((t) => (t.id === tag.id ? { ...t, color } : t)))
      }
      onConvertAxis={(tag) =>
        setTags((cur) =>
          cur.map((t) =>
            t.id === tag.id ? { ...t, axis: (t.axis === 'genre' ? 'other' : 'genre') as TagAxis } : t,
          ),
        )
      }
      onDelete={(tag) => setTags((cur) => cur.filter((t) => t.id !== tag.id))}
      onCreate={(name, axis) =>
        setTags((cur) => [...cur, { id: Date.now(), name, axis, color: '' }])
      }
      onDuplicate={duplicateSpy}
    />
  )
}

export const Default: StoryObj = {
  name: '通常表示（ジャンルタブ）',
  render: () => wrap(<StatefulTagManager />),
}

export const TabSwitch: StoryObj = {
  name: 'タブ切替（ジャンル ⇄ その他タグ）',
  render: () => wrap(<StatefulTagManager />),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // 既定はジャンルタブ: ジャンルのタグだけが並ぶ
    await expect(canvas.getByText('ホラー')).toBeVisible()
    await expect(canvas.queryByText('クリア')).toBeNull()

    // その他タグへ切替
    await userEvent.click(canvas.getByText('その他タグ'))
    await expect(await canvas.findByText('クリア')).toBeVisible()
    await expect(canvas.queryByText('ホラー')).toBeNull()
    // 新規登録欄のプレースホルダもタブに追従する
    await expect(canvas.getByPlaceholderText('新しいタグ名を入力…')).toBeVisible()
  },
}

export const RenameFlow: StoryObj = {
  name: 'リネーム: Enter 確定 / Esc 取消',
  render: () => wrap(<StatefulTagManager />),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // ラベルクリックでインライン編集開始 → Enter で確定（全ゲームへの反映は呼び出し側）
    await userEvent.click(canvas.getByText('ホラー'))
    const input = canvas.getByDisplayValue('ホラー')
    await userEvent.clear(input)
    await userEvent.type(input, 'サスペンス{Enter}')
    await expect(await canvas.findByText('サスペンス')).toBeVisible()
    await expect(canvas.queryByText('ホラー')).toBeNull()

    // Esc は取消（元の名前のまま）
    await userEvent.click(canvas.getByText('サスペンス'))
    const input2 = canvas.getByDisplayValue('サスペンス')
    await userEvent.clear(input2)
    await userEvent.type(input2, '破棄される名前{Escape}')
    await expect(await canvas.findByText('サスペンス')).toBeVisible()
    await expect(canvas.queryByText('破棄される名前')).toBeNull()

    // IME変換確定の Enter（isComposing: true）は確定操作として扱わない（Issue #29）。
    // 編集中のまま残り、リネームは実行されない
    await userEvent.click(canvas.getByText('サスペンス'))
    const input3 = canvas.getByDisplayValue('サスペンス')
    await userEvent.clear(input3)
    await userEvent.type(input3, 'IME変換中の名前')
    fireEvent.keyDown(input3, { key: 'Enter', isComposing: true })
    // まだ編集中（input が残っている）= commitRename は実行されていない
    await expect(canvas.getByDisplayValue('IME変換中の名前')).toBeVisible()

    // 続けて通常の Enter（isComposing: false）を押すと、そこで初めて確定される
    await userEvent.type(input3, '{Enter}')
    await expect(await canvas.findByText('IME変換中の名前')).toBeVisible()
    await expect(canvas.queryByText('サスペンス')).toBeNull()
  },
}

export const DeleteConfirm: StoryObj = {
  name: '削除はインライン確認を通過してから実行',
  render: () => wrap(<StatefulTagManager />),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // RPG 行のゴミ箱 → インライン確認が展開
    const row = canvas.getByText('RPG').closest('.tag-mgr__row') as HTMLElement
    await userEvent.click(within(row).getByTitle('削除'))
    await expect(canvas.getByText('「RPG」を 4 本 から削除しますか？')).toBeVisible()

    // 「やめる」で確認が閉じ、行は残る
    await userEvent.click(canvas.getByText('やめる'))
    await expect(canvas.queryByText('「RPG」を 4 本 から削除しますか？')).toBeNull()
    await expect(canvas.getByText('RPG')).toBeVisible()

    // 再度開いて「削除する」で行が消える
    await userEvent.click(within(row).getByTitle('削除'))
    await userEvent.click(canvas.getByText('削除する'))
    await waitFor(() => expect(canvas.queryByText('RPG')).toBeNull())
  },
}

export const DuplicateRejected: StoryObj = {
  name: '重複名の新規登録・リネームは拒否（onDuplicate 通知）',
  render: () => wrap(<StatefulTagManager />),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    duplicateSpy.mockClear()

    // 別軸（その他タグ）にある既存名でも重複扱い（語彙全体で name 一意）
    const input = canvas.getByPlaceholderText('新しいジャンル名を入力…')
    await userEvent.type(input, 'クリア')
    await userEvent.click(canvas.getByRole('button', { name: '登録' }))
    await expect(duplicateSpy).toHaveBeenCalledWith('クリア')
    // 登録はされず、入力値は残る（打ち直しできるように）
    await expect(canvas.queryByText('クリア')).toBeNull()
    await expect(input).toHaveValue('クリア')

    // 未重複の名前は登録され、入力がクリアされる
    await userEvent.clear(input)
    await userEvent.type(input, 'ノベル{Enter}')
    await expect(await canvas.findByText('ノベル')).toBeVisible()
    await expect(input).toHaveValue('')

    // リネームでも既存名（自分以外）への変更は拒否され、編集状態が維持される
    duplicateSpy.mockClear()
    await userEvent.click(canvas.getByText('ホラー'))
    const renameInput = canvas.getByDisplayValue('ホラー')
    await userEvent.clear(renameInput)
    await userEvent.type(renameInput, 'RPG{Enter}')
    await expect(duplicateSpy).toHaveBeenCalledWith('RPG')
    await expect(canvas.getByDisplayValue('RPG')).toBeVisible()
    // Esc で取消すると元の名前のまま
    await userEvent.keyboard('{Escape}')
    await expect(await canvas.findByText('ホラー')).toBeVisible()
  },
}

export const CreateImeEnterGuard: StoryObj = {
  name: '新規登録: IME変換確定Enterでは登録しない（Issue #29）',
  render: () => wrap(<StatefulTagManager />),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    const input = canvas.getByPlaceholderText('新しいジャンル名を入力…')
    await userEvent.type(input, 'IME確認用ジャンル')

    // IME変換確定の Enter（isComposing: true）では submitNew が実行されず、入力値も残る
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    await expect(canvas.queryByText('IME確認用ジャンル')).toBeNull()
    await expect(input).toHaveValue('IME確認用ジャンル')

    // 続けて通常の Enter（isComposing: false）を押すと、そこで初めて登録される
    await userEvent.type(input, '{Enter}')
    await expect(await canvas.findByText('IME確認用ジャンル')).toBeVisible()
    await expect(input).toHaveValue('')
  },
}

export const Empty: StoryObj = {
  name: '空状態（該当タブにタグ0件）',
  render: () => wrap(<StatefulTagManager initialTags={[]} />),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('まだ登録がありません')).toBeVisible()
  },
}
