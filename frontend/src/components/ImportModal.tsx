import { useEffect, useRef, useState } from 'react'
import './ImportModal.css'
import { UNKNOWN_TOOL } from '../types'
import { ToolBadge } from './ToolBadge'
import { FolderIcon } from './icons'

/** スキャンで検出されたゲーム候補（Go 側 scan.Detected と同形） */
export interface DetectedGame {
  title: string
  folderPath: string
  exePath: string
  sizeBytes: number
  /** 制作ツールの推定結果（判別不能時は UNKNOWN_TOOL） */
  tool: string
}

/** スキャン進捗（Go 側 app.go の scan:progress イベントのペイロードと同形） */
export interface ScanProgress {
  /** 1始まりの通し番号 */
  current: number
  /** 調べるフォルダ総数 */
  total: number
  /** いま調べているフォルダ名 */
  folder: string
}

export interface ImportModalProps {
  onClose: () => void
  /** フォルダ選択/ドロップ時に呼ばれる。null はダイアログのキャンセル（drop に戻る） */
  onScan: () => Promise<DetectedGame[] | null>
  /** 「N本を取り込む」で選択された候補を渡す */
  onImport: (selected: DetectedGame[]) => void
  /** ドロップされたパス群のスキャン（Wails 連携。Storybook では省略可） */
  onScanPaths?: (paths: string[]) => Promise<DetectedGame[] | null>
  /**
   * OS のファイルドロップ購読（Wails の OnFileDrop をトップレベルから注入する）。
   * 戻り値は購読解除関数。購読自体はモーダル生存中ずっと張られるが、
   * ドロップの処理（スキャン開始）は drop ステップのときだけ行われる
   */
  subscribeFileDrop?: (cb: (paths: string[]) => void) => () => void
  /** スキャン進捗の購読（Wails の EventsOn をトップレベルから注入する。Storybook では省略可） */
  subscribeScanProgress?: (cb: (p: ScanProgress) => void) => () => void
  /** スキャン失敗時に呼ばれる（トースト表示等はホスト側の責務） */
  onError?: (message: string) => void
}

type Step = 'drop' | 'scanning' | 'review'

/** フォルダ絶対パスと相対 exe 名を OS の区切り文字で結合して表示する */
function joinPath(folder: string, exe: string): string {
  const sep = folder.includes('\\') ? '\\' : '/'
  return folder.endsWith(sep) ? folder + exe : folder + sep + exe
}

/** フォルダ取り込みモーダル（drop → scanning → review の3ステップ。D&D とフォルダ選択の両対応） */
export function ImportModal({
  onClose,
  onScan,
  onImport,
  onScanPaths,
  subscribeFileDrop,
  subscribeScanProgress,
  onError,
}: ImportModalProps) {
  const [step, setStep] = useState<Step>('drop')
  const [detected, setDetected] = useState<DetectedGame[]>([])
  const [sel, setSel] = useState<boolean[]>([])
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  // scanning / review 中の誤クローズ確認（library-screen.md「閉じる操作」）
  const [confirmingClose, setConfirmingClose] = useState(false)

  const runScan = async (scan: () => Promise<DetectedGame[] | null>) => {
    setStep('scanning')
    setProgress(null)
    setConfirmingClose(false)
    try {
      const found = await scan()
      if (found == null) {
        // ダイアログのキャンセル
        setStep('drop')
        return
      }
      setDetected(found)
      setSel(found.map(() => true))
      setStep('review')
    } catch {
      // スキャン失敗をドロップ画面への無言の後退にせず、ホスト側に通知する
      // （D&D 経路が失敗と「0件」を区別できないと、ユーザーには機能自体が
      // 壊れているように見える）
      setStep('drop')
      onError?.('スキャンに失敗しました。もう一度お試しください。')
    }
  }

  const startScan = () => runScan(onScan)

  // OS のファイルドロップは drop ステップの間だけ受け付ける。
  // runScan/onScanPaths を effect の依存にしないよう ref 経由で参照する
  const dropHandler = useRef<(paths: string[]) => void>(() => {})
  dropHandler.current = (paths) => {
    if (step === 'drop' && onScanPaths) runScan(() => onScanPaths(paths))
  }
  useEffect(() => {
    if (!subscribeFileDrop) return
    return subscribeFileDrop((paths) => dropHandler.current(paths))
  }, [subscribeFileDrop])

  // スキャン進捗の購読（file drop と同じく ref 経由で effect の依存を切る）
  const progressHandler = useRef<(p: ScanProgress) => void>(() => {})
  progressHandler.current = (p) => {
    if (step === 'scanning') setProgress(p)
  }
  useEffect(() => {
    if (!subscribeScanProgress) return
    return subscribeScanProgress((p) => progressHandler.current(p))
  }, [subscribeScanProgress])

  // drop ステップは失うものが無いので即閉じる。scanning / review は
  // 待った末の検出結果を誤クリック1つで破棄しないよう確認を挟む
  const requestClose = () => {
    if (step === 'drop') onClose()
    else setConfirmingClose(true)
  }

  const selCount = sel.filter(Boolean).length

  return (
    <div className="import-scrim" onClick={requestClose}>
      <div className="import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="import-modal__head">
          <span className="import-modal__title">フォルダを取り込む</span>
          <div className="import-modal__close" onClick={requestClose}>
            ✕
          </div>
        </div>

        {step === 'drop' && (
          <div className="import-modal__drop-wrap">
            <div className="import-modal__dropzone" onClick={startScan}>
              <div className="import-modal__drop-icon">
                <FolderIcon size={28} strokeWidth={2} />
              </div>
              <div className="import-modal__drop-title">ゲームフォルダをドラッグ&ドロップ</div>
              <div className="import-modal__drop-or">または</div>
              <button className="import-modal__choose">フォルダを選択</button>
              <div className="import-modal__drop-note">
                配下の <span className="import-modal__mono">.exe</span> を自動検出します
                <br />
                （RPGツクール / Unity / Godot / WOLF RPG など）
              </div>
            </div>
          </div>
        )}

        {step === 'scanning' &&
          // 調べるフォルダが2つ以上のときだけプログレスバー（総数1は進みが表現できないのでスピナーのまま）
          (progress && progress.total > 1 ? (
            <div className="import-modal__scanning">
              <div className="import-modal__progress">
                <div
                  className="import-modal__progress-fill"
                  style={{ width: `${Math.min(100, (progress.current / progress.total) * 100)}%` }}
                />
              </div>
              <div className="import-modal__scanning-title">
                {progress.current}/{progress.total} フォルダを確認中…
              </div>
              <div className="import-modal__scanning-note">{progress.folder}</div>
            </div>
          ) : (
            <div className="import-modal__scanning">
              <div className="import-modal__spinner" />
              <div className="import-modal__scanning-title">スキャン中…</div>
              <div className="import-modal__scanning-note">実行ファイルを検出しています</div>
            </div>
          ))}

        {step === 'review' && (
          <>
            <div className="import-modal__review">
              <div className="import-modal__review-note">
                {detected.length === 0
                  ? '対象のフォルダが見つからないか、ゲームを検出できませんでした。別のフォルダを試してください。'
                  : `${detected.length}件のゲームが見つかりました。取り込む項目を選択してください。`}
              </div>
              <div className="import-modal__cards">
                {detected.map((d, i) => (
                  <div
                    key={d.folderPath + d.exePath}
                    className={`import-card ${sel[i] ? 'import-card--checked' : ''}`}
                    onClick={() => setSel(sel.map((s, k) => (k === i ? !s : s)))}
                  >
                    <div className={`import-card__box ${sel[i] ? 'import-card__box--checked' : ''}`}>
                      {sel[i] && (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M5 12l5 5L20 6" />
                        </svg>
                      )}
                    </div>
                    <div className="import-card__body">
                      <div className="import-card__title">{d.title}</div>
                      <div className="import-card__path">{joinPath(d.folderPath, d.exePath)}</div>
                      <div className="import-card__tool">
                        <ToolBadge
                          tool={d.tool}
                          size="sm"
                          label={d.tool === UNKNOWN_TOOL ? '制作ツール未判別' : undefined}
                        />
                        {d.tool === UNKNOWN_TOOL && (
                          <span className="import-card__tool-note">（取り込み後に設定できます）</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="import-modal__footer">
              <button className="import-modal__cancel" onClick={onClose}>
                キャンセル
              </button>
              <button
                className="import-modal__confirm"
                disabled={selCount === 0}
                onClick={() => onImport(detected.filter((_, i) => sel[i]))}
              >
                {selCount}本を取り込む
              </button>
            </div>
          </>
        )}

        {confirmingClose && step !== 'drop' && (
          <div className="import-close-confirm">
            <div className="import-close-confirm__box">
              <div className="import-close-confirm__title">
                {step === 'scanning' ? 'スキャンを中断しますか？' : '検出結果を破棄しますか？'}
              </div>
              <div className="import-close-confirm__note">
                {step === 'scanning'
                  ? '閉じると検出結果は破棄されます。'
                  : '閉じると検出された内容と選択は失われます。'}
              </div>
              <div className="import-close-confirm__actions">
                <button className="import-modal__cancel" onClick={() => setConfirmingClose(false)}>
                  続ける
                </button>
                <button className="import-close-confirm__close" onClick={onClose}>
                  閉じる
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
