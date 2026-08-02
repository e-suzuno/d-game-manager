import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { SettingsModal } from './SettingsModal'
import type { UIGame } from '../types'
import { mockGameMissingExe, mockGameMissingFolder } from '../data/mockGames'

const meta = {
  title: 'Components/SettingsModal',
  component: SettingsModal,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SettingsModal>

export default meta

const wrap = (node: React.ReactNode) => (
  <div style={{ position: 'relative', height: '100vh', background: 'var(--bg-app)' }}>{node}</div>
)

export const Default: StoryObj = {
  name: '通常表示（ライブラリ情報 + タグ管理導線 + 危険な操作）',
  render: () =>
    wrap(
      <SettingsModal
        gameCount={12}
        totalSize="12.4 GB"
        onClose={() => console.log('close')}
        onManageTags={() => alert('タグを管理')}
        onClearAll={() => alert('すべてのデータを消去')}
        onCheckMissing={async () => []}
        onDeleteMissing={async () => {}}
      />,
    ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // 「ライブラリ」節にタグ管理への導線がある（クリック時の遷移は呼び出し側）
    await expect(canvas.getByText('タグ（ジャンル）を管理')).toBeVisible()
  },
}

/** 「すべてのデータを消去…」→ 確認パネル展開 → 「消去」の完全一致入力で実行ボタンが有効化 */
export const ConfirmFlow: StoryObj = {
  name: '確認パネル展開 → 入力一致で有効化',
  render: () =>
    wrap(
      <SettingsModal
        gameCount={12}
        totalSize="12.4 GB"
        onClose={() => console.log('close')}
        onManageTags={() => console.log('manageTags')}
        onClearAll={() => console.log('clearAll')}
        onCheckMissing={async () => []}
        onDeleteMissing={async () => {}}
      />,
    ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'すべてのデータを消去…' }))

    // 展開直後・不一致入力では無効のまま
    const doClear = canvas.getByRole('button', { name: '完全に消去する' })
    await expect(doClear).toBeDisabled()
    const input = canvas.getByPlaceholderText('消去')
    await userEvent.type(input, '削除')
    await expect(doClear).toBeDisabled()

    // 「消去」の完全一致（前後空白は trim）で有効化
    await userEvent.clear(input)
    await userEvent.type(input, ' 消去 ')
    await expect(doClear).toBeEnabled()
  },
}

const MISSING_SAMPLE: UIGame[] = [
  { ...mockGameMissingFolder },
  { ...mockGameMissingExe },
]

/**
 * 整合性チェックの結果表示。**既定では1件も選択されていない**（誤判定で
 * ライブラリ全体を消せてしまわないようにするため。まとめて消すときは「すべて選択」）。
 */
export const MissingCheck: StoryObj = {
  name: '整合性チェック: 既定は未選択（誤削除の防止）',
  render: () =>
    wrap(
      <SettingsModal
        gameCount={12}
        totalSize="12.4 GB"
        onClose={() => {}}
        onManageTags={() => {}}
        onClearAll={() => {}}
        onCheckMissing={async () => MISSING_SAMPLE}
        onDeleteMissing={async (ids) => alert(`${ids.length}本を削除`)}
      />,
    ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '保存先を確認する' }))

    // 見つからないゲームが列挙され、チェックはすべて外れている
    // （findByText は不在なら throw するので存在確認として機能する）
    await canvas.findByText('2 本のゲームが見つかりません')
    const boxes = canvas.getAllByRole('checkbox')
    await expect(boxes).toHaveLength(2)
    for (const box of boxes) await expect(box).not.toBeChecked()

    // 未選択のうちは削除に進めない
    const armed = canvas.getByRole('button', { name: '削除するゲームを選択してください' })
    await expect(armed).toBeDisabled()

    // 「すべて選択」で有効化される
    await userEvent.click(canvas.getByText('すべて選択'))
    await expect(
      await canvas.findByRole('button', { name: '選択した 2 本をライブラリから削除…' }),
    ).toBeEnabled()

    // 「すべて解除」で元に戻る
    await userEvent.click(canvas.getByText('すべて解除'))
    await expect(
      await canvas.findByRole('button', { name: '削除するゲームを選択してください' }),
    ).toBeDisabled()
  },
}

/** 全件が見つからない場合はドライブ未接続の可能性が高いので注意書きを出す */
export const MissingCheckAllGone: StoryObj = {
  name: '整合性チェック: 全件不在はドライブ未接続の注意を出す',
  render: () =>
    wrap(
      <SettingsModal
        gameCount={2}
        totalSize="1.3 GB"
        onClose={() => {}}
        onManageTags={() => {}}
        onClearAll={() => {}}
        onCheckMissing={async () => MISSING_SAMPLE}
        onDeleteMissing={async () => {}}
      />,
    ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '保存先を確認する' }))
    await canvas.findByText(/ドライブが接続されていない可能性があります/)
  },
}

/** 確認そのものが失敗したときは「0本（正常）」と区別できるようエラーを表示する */
export const MissingCheckFailure: StoryObj = {
  name: '整合性チェック: 失敗時はエラーを表示（0本と区別する）',
  render: () =>
    wrap(
      <SettingsModal
        gameCount={12}
        totalSize="12.4 GB"
        onClose={() => {}}
        onManageTags={() => {}}
        onClearAll={() => {}}
        onCheckMissing={async () => {
          throw new Error('ライブラリDBが初期化されていません')
        }}
        onDeleteMissing={async () => {}}
      />,
    ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: '保存先を確認する' }))

    await canvas.findByText(/保存先を確認できませんでした: ライブラリDBが初期化されていません/)
    // 「すべてのゲームの保存先が見つかりました」（0本）とは取り違えない
    await expect(canvas.queryByText('すべてのゲームの保存先が見つかりました。')).toBeNull()
  },
}
