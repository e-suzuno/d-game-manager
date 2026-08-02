import { useState } from 'react'
import './DetailDrawer.css'
import type { UIGame, UITag } from '../types'
import { BASE_TOOLS, MISSING_LABEL, PALETTE, UNKNOWN_TOOL, tagColorOf } from '../types'
import { formatSize, formatDate, coverBackground } from '../lib/format'
import { isEnterConfirm } from '../lib/keyboard'
import { TagChip } from './TagChip'
import { AlertTriangleIcon, CameraIcon, CheckIcon, FolderIcon, GamepadGlyph, PencilIcon, PlayIcon, TrashIcon, WrenchIcon } from './icons'

export interface DetailDrawerProps {
  game: UIGame
  /** ライブラリ全体のタグ（「既存タグから追加」の候補） */
  allTags: UITag[]
  /** ライブラリ内の全制作ツール（出現順 distinct。ドロップダウンの選択肢に合成する） */
  allTools: string[]
  onClose: () => void
  /** 制作ツール属性の変更（ドロップダウンの選択で呼ばれる） */
  onSetTool: (tool: string) => void
  onLaunch: () => void
  onOpenFolder: () => void
  onAddTag: (name: string) => void
  onRemoveTag: (tag: UITag) => void
  onSetTagColor: (tag: UITag, color: string) => void
  /** タイトル保存（空文字は呼ばれない） */
  onRename: (title: string) => void
  /** カバー画像の変更（画像選択は呼び出し側 = OS ダイアログ） */
  onChangeCover: () => void
  /** カバー画像を既定グラデーションに戻す */
  onResetCover: () => void
  /** ライブラリから削除（登録解除）。確認 UI を通過した後にだけ呼ばれる */
  onDelete: () => void
  /**
   * 保存先フォルダの再指定（移動・リネームしたゲームの復帰）。
   * フォルダ選択は呼び出し側 = OS ダイアログ。実体が見つからないときだけ導線を出す
   */
  onRelink: () => void
}

/** 詳細ドロワー: カバー / 起動・フォルダ / 制作ツール編集 / タグ編集（色ピッカー付き）/ 情報リスト */
export function DetailDrawer({
  game,
  allTags,
  allTools,
  onClose,
  onSetTool,
  onLaunch,
  onOpenFolder,
  onAddTag,
  onRemoveTag,
  onSetTagColor,
  onRename,
  onChangeCover,
  onResetCover,
  onDelete,
  onRelink,
}: DetailDrawerProps) {
  const [draft, setDraft] = useState('')
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [toolPickOpen, setToolPickOpen] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const saveTitle = () => {
    const t = titleDraft.trim()
    setEditingTitle(false)
    // 空文字は保存せず取消扱い（基本ハンドオフ「1-a. タイトルの編集」）
    if (t && t !== game.title) onRename(t)
  }

  const trimmed = draft.trim()
  const lower = trimmed.toLowerCase()
  const ownNames = new Set(game.tags.map((t) => t.name))
  // 重複判定・候補フィルタは大文字小文字を区別しない（Unity と unity を別タグにしない）
  const allByLower = new Map(allTags.map((t) => [t.name.toLowerCase(), t]))
  const suggestions = allTags
    .filter((t) => !ownNames.has(t.name) && (!lower || t.name.toLowerCase().includes(lower)))
    .slice(0, 10)
  const canCreate = !!trimmed && !allByLower.has(lower)

  const submit = () => {
    if (!trimmed) return
    // 大文字小文字違いの既存タグがあればそちらの正式名で追加する（新規作成しない）
    const existing = allByLower.get(lower)
    onAddTag(existing?.name ?? trimmed)
    setDraft('')
  }

  // 選択肢 = [未判別, 既定6種, ライブラリ内の全ツール] を挿入順維持で重複排除
  const toolOptions = [...new Set([UNKNOWN_TOOL, ...BASE_TOOLS, ...allTools])]

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer" onClick={() => setPickerFor(null)}>
        <div className="drawer__banner" style={{ background: coverBackground(game.id, game.coverPath) }}>
          {!game.coverPath && (
            <span className="drawer__banner-glyph">
              <GamepadGlyph size={60} strokeWidth={1.4} />
            </span>
          )}
          <div className="drawer__banner-shade" />
          <div className="drawer__cover-actions">
            <div className="drawer__cover-btn" title="カバー画像を変更" onClick={onChangeCover}>
              <CameraIcon />
              画像を変更
            </div>
            {game.coverPath && (
              <div
                className="drawer__cover-btn drawer__cover-btn--reset"
                title="初期のグラデーションに戻す"
                onClick={onResetCover}
              >
                ↺
              </div>
            )}
          </div>
          <div className="drawer__close" onClick={onClose}>
            ✕
          </div>
          {!editingTitle ? (
            <div
              className="drawer__title-row"
              title="タイトルを編集"
              onClick={() => {
                setTitleDraft(game.title)
                setEditingTitle(true)
              }}
            >
              <span className="drawer__title">{game.title}</span>
              <span className="drawer__title-pencil">
                <PencilIcon />
              </span>
            </div>
          ) : (
            <div className="drawer__title-edit">
              <input
                autoFocus
                value={titleDraft}
                placeholder="タイトルを入力…"
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (isEnterConfirm(e)) {
                    e.preventDefault()
                    saveTitle()
                  } else if (e.key === 'Escape') {
                    setEditingTitle(false)
                  }
                }}
              />
              <div className="drawer__title-save" title="保存" onClick={saveTitle}>
                <CheckIcon />
              </div>
            </div>
          )}
        </div>
        <div className="drawer__body">
          {/*
            実体が見つからないゲームの警告。起動・フォルダのボタンは意図的に無効化しない。
            この判定は一覧を開いた時点のスナップショットで、外部ドライブを繋ぎ直した等で
            すでに復帰している可能性がある。押せば最新の結果がトーストで返る
          */}
          {game.missing && (
            <div className="drawer__missing">
              <span className="drawer__missing-icon">
                <AlertTriangleIcon size={15} />
              </span>
              <div>
                <div className="drawer__missing-title">{MISSING_LABEL[game.missing]}</div>
                <div className="drawer__missing-note">
                  {game.missing === 'folder'
                    ? 'フォルダが削除・移動されたか、保存先のドライブが接続されていません。'
                    : '実行ファイルが削除されたか、名前が変わっています。'}
                  <br />
                  移動しただけなら保存先を指定し直せば、タグやお気に入りはそのまま復帰します。
                  <br />
                  ゲーム本体を削除した場合は、下の「ライブラリから削除」で一覧から外せます。
                </div>
                <button className="drawer__relink" onClick={onRelink}>
                  <FolderIcon size={13} strokeWidth={2} />
                  フォルダを指定し直す
                </button>
              </div>
            </div>
          )}
          <div className="drawer__actions">
            <button className="drawer__launch" onClick={onLaunch}>
              <PlayIcon size={16} />
              起動
            </button>
            <button className="drawer__folder" onClick={onOpenFolder}>
              <FolderIcon size={15} strokeWidth={2} />
              フォルダ
            </button>
          </div>

          {/*
            制作ツールのドロップダウンはプロトタイプ仕様で「外側クリックでは閉じない」
            （選択時とドロワーの開閉時にだけ閉じる）。タグ色ピッカーは drawer ルートの
            onClick={() => setPickerFor(null)} で外側クリック時に閉じるのと挙動が異なるため、
            ブロック全体で stopPropagation して巻き込まれないようにしている。
            ただし色ピッカーは明示的に閉じ、両メニューが同時に開いたままにならないようにする
          */}
          <div
            onClick={(e) => {
              e.stopPropagation()
              setPickerFor(null)
            }}
          >
            <div className="drawer__section-title">制作ツール</div>
            <div className="drawer__tool">
              <div className="drawer__tool-current" onClick={() => setToolPickOpen((o) => !o)}>
                <span className="drawer__tool-value">
                  <WrenchIcon size={14} />
                  {game.tool}
                </span>
                <span className="drawer__tool-change">▾ 変更</span>
              </div>
              {toolPickOpen && (
                <div className="drawer__tool-menu">
                  {toolOptions.map((t) => (
                    <div
                      key={t}
                      className={`drawer__tool-opt ${t === game.tool ? 'drawer__tool-opt--active' : ''}`}
                      onClick={() => {
                        setToolPickOpen(false)
                        // 現在値の再選択は変更なしなので呼ばない（onRename と同じ方針）
                        if (t !== game.tool) onSetTool(t)
                      }}
                    >
                      {t}
                      {t === game.tool && <CheckIcon size={15} strokeWidth={2.6} />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="drawer__section-title">タグ</div>
            <div className="drawer__tags">
              {game.tags.map((t) => (
                <div key={t.id} className="drawer__tag-wrap" onClick={(e) => e.stopPropagation()}>
                  <TagChip
                    label={t.name}
                    axis={t.axis}
                    color={t.color}
                    size="drawer"
                    onLabelClick={() => setPickerFor(pickerFor === t.name ? null : t.name)}
                    onRemove={() => onRemoveTag(t)}
                  />
                  {pickerFor === t.name && (
                    <div className="color-picker">
                      <div className="color-picker__title">「{t.name}」の色</div>
                      <div className="color-picker__swatches">
                        {PALETTE.map((p) => {
                          const current = tagColorOf(t).text === p.t
                          return (
                            <div
                              key={p.k}
                              className={`color-picker__swatch ${current ? 'color-picker__swatch--active' : ''}`}
                              style={{ background: p.t }}
                              onClick={() => onSetTagColor(t, p.k)}
                            />
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {game.tags.length === 0 && <span className="drawer__no-tags">まだタグがありません</span>}
            </div>
            <input
              className="drawer__tag-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (isEnterConfirm(e)) {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder="タグを入力して Enter で追加…"
            />
            {canCreate && (
              <div className="drawer__create" onClick={submit}>
                ＋「{trimmed}」を新しいタグとして追加
              </div>
            )}
            {suggestions.length > 0 && (
              <div className="drawer__suggest">
                <div className="drawer__suggest-title">既存タグから追加</div>
                <div className="drawer__suggest-chips">
                  {suggestions.map((t) => (
                    <span key={t.id} className="drawer__suggest-chip" onClick={() => onAddTag(t.name)}>
                      ＋ {t.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="drawer__section-title drawer__section-title--info">情報</div>
            <div className="drawer__info-row">
              <span className="drawer__info-label">実行ファイル</span>
              <span className="drawer__info-value">{game.exePath}</span>
            </div>
            <div className="drawer__info-row drawer__info-row--block">
              <div className="drawer__info-label">保存先</div>
              <div className="drawer__info-path">{game.folderPath}</div>
            </div>
            <div className="drawer__info-row">
              <span className="drawer__info-label">サイズ</span>
              <span className="drawer__info-value">{formatSize(game.sizeBytes)}</span>
            </div>
            <div className="drawer__info-row drawer__info-row--last">
              <span className="drawer__info-label">追加日</span>
              <span className="drawer__info-value">{formatDate(game.addedAt)}</span>
            </div>
          </div>

          <div className="drawer__danger">
            {!confirmingDelete ? (
              <button className="drawer__delete" onClick={() => setConfirmingDelete(true)}>
                <TrashIcon />
                ライブラリから削除
              </button>
            ) : (
              <div className="drawer__delete-confirm">
                <div className="drawer__delete-note">
                  「{game.title}」をライブラリから削除しますか？
                  <br />
                  ゲーム本体のファイルは削除されません。
                </div>
                <div className="drawer__delete-actions">
                  <button
                    className="drawer__delete-cancel"
                    disabled={deleting}
                    onClick={() => setConfirmingDelete(false)}
                  >
                    キャンセル
                  </button>
                  <button
                    className="drawer__delete-do"
                    disabled={deleting}
                    onClick={() => {
                      // 連打で onDelete が二重発火し、2回目のエラーが成功トーストを
                      // 上書きするのを防ぐ（呼び出し元がドロワーを閉じるまでのガード）
                      if (deleting) return
                      setDeleting(true)
                      onDelete()
                    }}
                  >
                    削除する
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
