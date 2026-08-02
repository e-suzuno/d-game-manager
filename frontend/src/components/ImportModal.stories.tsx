import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent, fn, userEvent, waitFor, within } from 'storybook/test'
import { ImportModal, type DetectedGame, type ScanProgress } from './ImportModal'
import { UNKNOWN_TOOL } from '../types'

const meta = {
  title: 'Components/ImportModal',
  component: ImportModal,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ImportModal>

export default meta

// 未判別を含める（破線バッジ＋「（取り込み後に設定できます）」の確認用）
const DUMMY: DetectedGame[] = [
  { title: '真紅の魔導書', folderPath: 'D:\\DL\\shinku\\', exePath: 'Game.exe', sizeBytes: 300 * 1024 * 1024, tool: 'RPGツクール' },
  { title: 'スチームパンク・アトリエ', folderPath: 'D:\\DL\\atelier\\', exePath: 'atelier.exe', sizeBytes: 512 * 1024 * 1024, tool: 'Unity' },
  { title: '夜光列車', folderPath: 'D:\\DL\\train\\', exePath: 'yakou.exe', sizeBytes: 128 * 1024 * 1024, tool: UNKNOWN_TOOL },
]

export const Flow: StoryObj = {
  name: 'drop → scanning → review（未判別含む）',
  render: () => (
    <div style={{ position: 'relative', height: '100vh', background: 'var(--bg-app)' }}>
      <ImportModal
        onClose={() => console.log('close')}
        onScan={() => new Promise((resolve) => setTimeout(() => resolve(DUMMY), 1400))}
        onImport={(sel) => alert(`${sel.length}本を取り込む`)}
      />
    </div>
  ),
}

/** スキャン失敗時はドロップ画面に戻り、onError でホスト側にエラーが通知される */
export const ScanError: StoryObj = {
  name: 'スキャン失敗',
  render: () => (
    <div style={{ position: 'relative', height: '100vh', background: 'var(--bg-app)' }}>
      <ImportModal
        onClose={() => console.log('close')}
        onScan={() => new Promise((_, reject) => setTimeout(() => reject(new Error('scan failed')), 1400))}
        onError={(msg) => alert(msg)}
        onImport={(sel) => alert(`${sel.length}本を取り込む`)}
      />
    </div>
  ),
}

/** 実装では Go の scan:progress イベントが届く。ここではタイマーで模擬する */
export const ScanProgressBar: StoryObj = {
  name: 'スキャン進捗（N/M フォルダ）',
  render: () => (
    <div style={{ position: 'relative', height: '100vh', background: 'var(--bg-app)' }}>
      <ImportModal
        onClose={() => console.log('close')}
        onScan={() => new Promise((resolve) => setTimeout(() => resolve(DUMMY), 3000))}
        subscribeScanProgress={(cb: (p: ScanProgress) => void) => {
          const folders = ['shinku', 'atelier', 'train', 'docs', 'redist']
          let i = 0
          const timer = setInterval(() => {
            cb({ current: (i % folders.length) + 1, total: folders.length, folder: folders[i % folders.length] })
            i++
          }, 400)
          return () => clearInterval(timer)
        }}
        onImport={(sel) => alert(`${sel.length}本を取り込む`)}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByText('フォルダを選択'))
    // 最初の進捗イベントが届くとスピナーがプログレスバーに切り替わる
    await waitFor(() => expect(canvas.getByText(/フォルダを確認中…/)).toBeInTheDocument(), {
      timeout: 2000,
    })
  },
}

const closeSpy = fn()

/** scanning / review 中の誤クローズは確認を挟む（drop は即閉じ） */
export const CloseConfirm: StoryObj = {
  name: '誤クローズ確認（scanning / review）',
  render: () => (
    <div style={{ position: 'relative', height: '100vh', background: 'var(--bg-app)' }}>
      <ImportModal
        onClose={closeSpy}
        onScan={() => new Promise((resolve) => setTimeout(() => resolve(DUMMY), 800))}
        onImport={(sel) => alert(`${sel.length}本を取り込む`)}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    closeSpy.mockClear()
    const canvas = within(canvasElement)

    // scanning 中の ✕ は即閉じせず確認を出す
    await userEvent.click(canvas.getByText('フォルダを選択'))
    await userEvent.click(canvas.getByText('✕'))
    await expect(canvas.getByText('スキャンを中断しますか？')).toBeInTheDocument()
    await userEvent.click(canvas.getByText('続ける'))
    await expect(closeSpy).not.toHaveBeenCalled()

    // review へ遷移後、暗幕クリックも確認を出す（モーダル本体が中央を覆うため fireEvent で直接発火）
    await waitFor(
      () => expect(canvas.getByText(/3件のゲームが見つかりました/)).toBeInTheDocument(),
      { timeout: 3000 },
    )
    fireEvent.click(canvasElement.querySelector('.import-scrim')!)
    await expect(canvas.getByText('検出結果を破棄しますか？')).toBeInTheDocument()

    // 「閉じる」で初めて onClose が呼ばれる
    await userEvent.click(canvas.getByText('閉じる'))
    await expect(closeSpy).toHaveBeenCalledTimes(1)
  },
}

/** 実装では Wails の OnFileDrop が OS のドロップで発火する。ここではボタンで模擬する */
export const DragAndDrop: StoryObj = {
  name: 'ドラッグ&ドロップ（模擬）',
  render: () => {
    let fire: ((paths: string[]) => void) | null = null
    return (
      <div style={{ position: 'relative', height: '100vh', background: 'var(--bg-app)' }}>
        <button
          style={{ position: 'absolute', top: 8, left: 8, zIndex: 999 }}
          onClick={() => fire?.(['D:\\DL'])}
        >
          フォルダのドロップを模擬
        </button>
        <ImportModal
          onClose={() => console.log('close')}
          onScan={() => new Promise((resolve) => setTimeout(() => resolve(DUMMY), 1400))}
          onScanPaths={() => new Promise((resolve) => setTimeout(() => resolve(DUMMY), 1400))}
          subscribeFileDrop={(cb) => {
            fire = cb
            return () => {
              fire = null
            }
          }}
          onImport={(sel) => alert(`${sel.length}本を取り込む`)}
        />
      </div>
    )
  },
}
