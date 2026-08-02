import { useState } from 'react'
import './SettingsModal.css'
import type { UIGame } from '../types'
import { MISSING_LABEL } from '../types'
import { EditLineIcon, TrashIcon } from './icons'

/** 全消去の確認語。この文字列の完全一致入力で実行ボタンが有効になる */
const CLEAR_CONFIRM_WORD = '消去'

export interface SettingsModalProps {
  /** 登録ゲーム数（LibraryPage が全ゲーム基準で算出） */
  gameCount: number
  /** 総容量の表示文字列（例: "12.4 GB"。StatsBar と同じロジックで算出した値を受ける） */
  totalSize: string
  onClose: () => void
  /** タグ管理モーダルへの導線（呼び出し側で設定を閉じてからタグ管理を開く） */
  onManageTags: () => void
  /** 全データ消去の実行。二段階確認（ボタン → 確認語入力）を通過した後にだけ呼ばれる */
  onClearAll: () => void
  /** 整合性チェック: 実体の存在確認を実行し、見つからないゲームを返す */
  onCheckMissing: () => Promise<UIGame[]>
  /**
   * 整合性チェック: 選択されたゲームの一括削除（インライン確認を通過した後に呼ばれる）。
   * 結果のトースト表示は呼び出し側が行い、こちらは完了後に再チェックして表示を更新する
   */
  onDeleteMissing: (ids: number[]) => Promise<void>
}

/**
 * 設定モーダル: ライブラリ情報 + タグ管理への導線 + 保存先の整合性チェック
 * + 危険な操作（全データ消去、二段階確認付き）
 */
export function SettingsModal({
  gameCount,
  totalSize,
  onClose,
  onManageTags,
  onClearAll,
  onCheckMissing,
  onDeleteMissing,
}: SettingsModalProps) {
  const [armed, setArmed] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [clearing, setClearing] = useState(false)
  const match = confirm.trim() === CLEAR_CONFIRM_WORD

  // 整合性チェック。missingGames が null なら未実行（結果カードを出さない）
  const [checking, setChecking] = useState(false)
  const [missingGames, setMissingGames] = useState<UIGame[] | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [armedDelete, setArmedDelete] = useState(false)
  const [deletingMissing, setDeletingMissing] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)

  const runCheck = async () => {
    if (checking) return
    setChecking(true)
    setArmedDelete(false)
    setCheckError(null)
    try {
      const found = await onCheckMissing()
      setMissingGames(found)
      // 既定は「何も選択しない」。全選択で始めると、外付けドライブ未接続という誤判定の
      // ケースでも2クリックでライブラリ全体の登録解除が走ってしまう（タグ・お気に入り・
      // カバー・編集済みタイトルは復元できない）。まとめて消すときは「すべて選択」を使う
      setSelected(new Set())
    } catch (e) {
      // 失敗を黙って飲むと「0本＝正常」と区別できないため、必ず理由を出す
      setCheckError(e instanceof Error ? e.message : String(e))
    } finally {
      setChecking(false)
    }
  }

  const deleteSelected = async () => {
    if (deletingMissing || selected.size === 0) return
    setDeletingMissing(true)
    try {
      await onDeleteMissing([...selected])
      // 削除できなかったものは再チェックで再び現れる（失敗 ID を受け渡すより実態に忠実）
      await runCheck()
    } finally {
      setDeletingMissing(false)
      setArmedDelete(false)
    }
  }

  const toggleSelected = (id: number) =>
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const selectAll = () => setSelected(new Set((missingGames ?? []).map((g) => g.id)))
  const clearSelection = () => setSelected(new Set())

  const execute = () => {
    // ボタンの disabled に加えてハンドラ内でも再ガードする（プロトタイプ clearAll と
    // 同じ二重ガード）。clearing は連打による二重発火防止（DetailDrawer の deleting と同パターン）
    if (!match || clearing) return
    setClearing(true)
    onClearAll()
  }

  // 実行中はモーダルを閉じさせない（閉じて開き直すと clearing ガードが消え、
  // 再実行できてしまう経路を塞ぐ）
  const close = clearing ? undefined : onClose

  return (
    <div className="settings-scrim" onClick={close}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal__head">
          <span className="settings-modal__title">設定</span>
          <div className="settings-modal__close" onClick={close}>
            ✕
          </div>
        </div>

        <div className="settings-modal__body">
          <div>
            <div className="settings-modal__section-title">ライブラリ</div>
            <div className="settings-modal__info-row">
              <span className="settings-modal__info-label">登録ゲーム数</span>
              <span className="settings-modal__info-value">{gameCount} 本</span>
            </div>
            <div className="settings-modal__info-row settings-modal__info-row--last">
              <span className="settings-modal__info-label">総容量</span>
              <span className="settings-modal__info-value">{totalSize}</span>
            </div>
            {/* 消去実行中は画面遷移させない（close と同じガード） */}
            <div
              className="settings-modal__manage-row"
              onClick={clearing ? undefined : onManageTags}
            >
              <span className="settings-modal__manage-label">
                <EditLineIcon size={15} />
                タグ（ジャンル）を管理
              </span>
              <span className="settings-modal__manage-arrow">›</span>
            </div>
          </div>

          <div>
            <div className="settings-modal__section-title">保存先の整合性</div>
            <div className="settings-modal__check-card">
              <div className="settings-modal__check-desc">
                登録済みゲームのフォルダと実行ファイルが実際にあるかを確認します。見つからないものはライブラリから外せます（
                <b>ゲーム本体のファイルは削除されません</b>
                ）。外付けドライブやクラウド同期のフォルダは、接続した状態で確認してください。
              </div>

              {checkError && (
                <div className="settings-modal__check-error">
                  保存先を確認できませんでした: {checkError}
                </div>
              )}

              {missingGames === null ? (
                <button
                  className="settings-modal__check-run"
                  disabled={checking || clearing}
                  onClick={runCheck}
                >
                  {checking ? '確認中…' : '保存先を確認する'}
                </button>
              ) : missingGames.length === 0 ? (
                <div className="settings-modal__check-result">
                  <div className="settings-modal__check-ok">
                    すべてのゲームの保存先が見つかりました。
                  </div>
                  <button
                    className="settings-modal__check-run"
                    disabled={checking || clearing}
                    onClick={runCheck}
                  >
                    {checking ? '確認中…' : 'もう一度確認する'}
                  </button>
                </div>
              ) : (
                <div className="settings-modal__check-result">
                  <div className="settings-modal__check-found">
                    {missingGames.length} 本のゲームが見つかりません
                  </div>
                  {/* 全件が見つからない場合はドライブ未接続の可能性が高い（誤判定で
                      ライブラリを空にしてしまわないよう、削除前に注意を促す） */}
                  {gameCount > 1 && missingGames.length === gameCount && (
                    <div className="settings-modal__check-warn">
                      登録されている {gameCount} 本すべてが見つかりません。保存先のドライブが接続されていない可能性があります。削除する前に接続を確認してください。
                    </div>
                  )}
                  <div className="settings-modal__check-select-actions">
                    <span className="settings-modal__check-select-link" onClick={selectAll}>
                      すべて選択
                    </span>
                    <span className="settings-modal__check-select-link" onClick={clearSelection}>
                      すべて解除
                    </span>
                  </div>
                  <div className="settings-modal__check-list">
                    {missingGames.map((g) => (
                      <label key={g.id} className="settings-modal__check-item">
                        <input
                          type="checkbox"
                          checked={selected.has(g.id)}
                          disabled={deletingMissing}
                          onChange={() => toggleSelected(g.id)}
                        />
                        <span className="settings-modal__check-item-body">
                          <span className="settings-modal__check-item-title">{g.title}</span>
                          <span className="settings-modal__check-item-path">{g.folderPath}</span>
                        </span>
                        <span className="settings-modal__check-item-reason">
                          {g.missing ? MISSING_LABEL[g.missing] : ''}
                        </span>
                      </label>
                    ))}
                  </div>
                  {!armedDelete ? (
                    <button
                      className="settings-modal__check-delete"
                      disabled={selected.size === 0 || checking || clearing}
                      onClick={() => setArmedDelete(true)}
                    >
                      <TrashIcon size={14} />
                      {selected.size === 0
                        ? '削除するゲームを選択してください'
                        : `選択した ${selected.size} 本をライブラリから削除…`}
                    </button>
                  ) : (
                    <div className="settings-modal__check-confirm">
                      <div className="settings-modal__check-confirm-note">
                        選択した {selected.size} 本をライブラリから削除しますか？
                        タグやお気に入りの設定も一緒に失われます（ゲーム本体のファイルは残ります）。
                      </div>
                      <div className="settings-modal__confirm-actions">
                        <button
                          className="settings-modal__cancel"
                          disabled={deletingMissing}
                          onClick={() => setArmedDelete(false)}
                        >
                          キャンセル
                        </button>
                        <button
                          className="settings-modal__clear-do"
                          disabled={deletingMissing}
                          onClick={deleteSelected}
                        >
                          <TrashIcon size={15} />
                          削除する
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="settings-modal__section-title settings-modal__section-title--danger">
              危険な操作
            </div>
            <div className="settings-modal__danger-card">
              <div className="settings-modal__danger-head">
                <div className="settings-modal__danger-icon">
                  <TrashIcon size={20} />
                </div>
                <div className="settings-modal__danger-body">
                  <div className="settings-modal__danger-title">すべてのデータを消去</div>
                  <div className="settings-modal__danger-desc">
                    登録ゲーム・タグ・お気に入り・カバー画像・制作ツールの変更など、このアプリに保存したすべての情報を削除して初期状態に戻します。
                    <b>ゲーム本体のフォルダやファイルには一切影響しません。</b>
                    この操作は取り消せません。
                  </div>
                </div>
              </div>

              {!armed ? (
                <div className="settings-modal__arm-row">
                  <button
                    className="settings-modal__arm"
                    onClick={() => {
                      setConfirm('')
                      setArmed(true)
                    }}
                  >
                    すべてのデータを消去…
                  </button>
                </div>
              ) : (
                <div className="settings-modal__confirm">
                  <div className="settings-modal__confirm-note">
                    確認のため <b className="settings-modal__confirm-word">{CLEAR_CONFIRM_WORD}</b>{' '}
                    と入力してください。
                  </div>
                  <input
                    className="settings-modal__confirm-input"
                    autoFocus
                    value={confirm}
                    placeholder={CLEAR_CONFIRM_WORD}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                  <div className="settings-modal__confirm-actions">
                    <button
                      className="settings-modal__cancel"
                      disabled={clearing}
                      onClick={() => {
                        setArmed(false)
                        setConfirm('')
                      }}
                    >
                      キャンセル
                    </button>
                    <button
                      className="settings-modal__clear-do"
                      disabled={!match || clearing}
                      onClick={execute}
                    >
                      <TrashIcon size={15} />
                      完全に消去する
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
