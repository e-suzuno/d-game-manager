import { useState } from 'react'
import './TagManagerModal.css'
import type { TagAxis, UITag } from '../types'
import { AXIS_LABELS, PALETTE, tagColorOf } from '../types'
import { isEnterConfirm } from '../lib/keyboard'
import { CheckIcon, PencilIcon, SwapIcon, TrashIcon } from './icons'

export interface TagManagerModalProps {
  /** ライブラリ全体のタグ語彙（孤児タグ含む） */
  tags: UITag[]
  /** タグ ID → 使用ゲーム数 */
  counts: Map<number, number>
  onClose: () => void
  onRename: (tag: UITag, name: string) => void
  onSetColor: (tag: UITag, color: string) => void
  /** 性質変換（ジャンル ⇄ その他タグ） */
  onConvertAxis: (tag: UITag) => void
  onDelete: (tag: UITag) => void
  onCreate: (name: string, axis: TagAxis) => void
  /** 新規登録名が既存タグと重複したとき（トースト表示は呼び出し側が行う） */
  onDuplicate: (name: string) => void
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

const NEW_PLACEHOLDER: Record<TagAxis, string> = {
  genre: '新しいジャンル名を入力…',
  other: '新しいタグ名を入力…',
}

const NEW_HINT: Record<TagAxis, string> = {
  genre: '※ 登録したジャンルは、ゲーム詳細のタグ入力で割り当てられます',
  other: '※ 登録したタグは、ゲーム詳細のタグ入力の候補に表示されます',
}

/**
 * タグ管理モーダル（調整版ハンドオフ 変更点4）: ジャンル / その他タグの一覧・リネーム・色変更・
 * 性質変換・削除・新規登録。変更はすべてのゲームに反映される（実処理は呼び出し側）
 */
export function TagManagerModal({
  tags,
  counts,
  onClose,
  onRename,
  onSetColor,
  onConvertAxis,
  onDelete,
  onCreate,
  onDuplicate,
}: TagManagerModalProps) {
  const [tab, setTab] = useState<TagAxis>('genre')
  // 行内の展開 UI（リネーム / パレット / 削除確認）は排他。対象タグの ID を1つだけ持つ
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [colorForId, setColorForId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  // 新規登録の入力はタブごとに保持する（プロトタイプ mgrNewGenre / mgrNewTag 準拠）
  const [newNames, setNewNames] = useState<Record<TagAxis, string>>({ genre: '', other: '' })

  const closeInline = () => {
    setEditingId(null)
    setColorForId(null)
    setDeletingId(null)
  }

  const switchTab = (axis: TagAxis) => {
    setTab(axis)
    closeInline()
  }

  const startRename = (tag: UITag) => {
    closeInline()
    setEditingId(tag.id)
    setDraft(tag.name)
  }

  const commitRename = (tag: UITag) => {
    const name = draft.trim()
    // 空・変更なしは何もせず編集を閉じる（プロトタイプ renameLabel 準拠）
    if (!name || name === tag.name) {
      setEditingId(null)
      setDraft('')
      return
    }
    // 重複チェック（trim 後の完全一致・自分自身は除く）は新規登録と同じくモーダル内で
    // 事前実施。重複時は編集状態を維持して打ち直せるようにする
    if (tags.some((t) => t.id !== tag.id && t.name === name)) {
      onDuplicate(name)
      return
    }
    setEditingId(null)
    setDraft('')
    onRename(tag, name)
  }

  const newName = newNames[tab]
  const canAdd = newName.trim().length > 0

  const submitNew = () => {
    const name = newName.trim()
    if (!name) return
    // 重複チェック（trim 後の完全一致）はモーダル内で即時実施。重複時は入力を残す
    if (tags.some((t) => t.name === name)) {
      onDuplicate(name)
      return
    }
    onCreate(name, tab)
    setNewNames((cur) => ({ ...cur, [tab]: '' }))
  }

  const axisCount = (axis: TagAxis) => tags.filter((t) => t.axis === axis).length
  const rows = tags.filter((t) => t.axis === tab).slice().sort((a, b) => a.name.localeCompare(b.name, 'ja'))

  return (
    <div className="tag-mgr-scrim" onClick={onClose}>
      <div className="tag-mgr" onClick={(e) => e.stopPropagation()}>
        <div className="tag-mgr__head">
          <div>
            <div className="tag-mgr__title">タグを管理</div>
            <div className="tag-mgr__subtitle">名前の変更・色・削除はすべてのゲームに反映されます</div>
          </div>
          <div className="tag-mgr__close" onClick={onClose}>
            ✕
          </div>
        </div>

        <div className="tag-mgr__tabs-wrap">
          <div className="tag-mgr__tabs">
            {(['genre', 'other'] as TagAxis[]).map((axis) => (
              <div
                key={axis}
                className={`tag-mgr__tab ${tab === axis ? 'tag-mgr__tab--active' : ''}`}
                onClick={() => switchTab(axis)}
              >
                <span>{AXIS_LABELS[axis]}</span>
                <span className="tag-mgr__tab-count">{axisCount(axis)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="tag-mgr__list">
          {rows.map((tag) => {
            const color = tagColorOf(tag)
            const count = counts.get(tag.id) ?? 0
            const countLabel = `${count} 本`
            const convertLabel = tag.axis === 'genre' ? 'その他タグにする' : 'ジャンルにする'
            return (
              <div key={tag.id} className="tag-mgr__row">
                <div className="tag-mgr__row-main">
                  <span
                    className="tag-mgr__dot"
                    title="色を変更"
                    style={{ background: color.text, boxShadow: `0 0 0 2px #fff, 0 0 0 3px ${color.bg}` }}
                    onClick={() => {
                      const open = colorForId === tag.id
                      closeInline()
                      setColorForId(open ? null : tag.id)
                    }}
                  />
                  {editingId === tag.id ? (
                    <>
                      <input
                        className="tag-mgr__rename-input"
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (isEnterConfirm(e)) {
                            e.preventDefault()
                            commitRename(tag)
                          } else if (e.key === 'Escape') {
                            setEditingId(null)
                            setDraft('')
                          }
                        }}
                      />
                      <div className="tag-mgr__rename-ok" title="保存" onClick={() => commitRename(tag)}>
                        <CheckIcon size={16} strokeWidth={3} />
                      </div>
                      <div
                        className="tag-mgr__rename-cancel"
                        title="キャンセル"
                        onClick={() => {
                          setEditingId(null)
                          setDraft('')
                        }}
                      >
                        ✕
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="tag-mgr__label" title="名前を変更" onClick={() => startRename(tag)}>
                        {tag.name}
                      </span>
                      <span className="tag-mgr__count">{countLabel}</span>
                      <div
                        className="tag-mgr__icon-btn tag-mgr__icon-btn--convert"
                        title={convertLabel}
                        onClick={() => onConvertAxis(tag)}
                      >
                        <SwapIcon size={15} />
                      </div>
                      <div className="tag-mgr__icon-btn" title="名前を変更" onClick={() => startRename(tag)}>
                        <PencilIcon size={15} />
                      </div>
                      <div
                        className="tag-mgr__icon-btn tag-mgr__icon-btn--delete"
                        title="削除"
                        onClick={() => {
                          closeInline()
                          setDeletingId(tag.id)
                        }}
                      >
                        <TrashIcon size={15} />
                      </div>
                    </>
                  )}
                </div>

                {colorForId === tag.id && (
                  <div className="tag-mgr__swatches">
                    {PALETTE.map((p) => {
                      const current = color.text === p.t
                      return (
                        <div
                          key={p.k}
                          className={`tag-mgr__swatch ${current ? 'tag-mgr__swatch--active' : ''}`}
                          style={{ background: p.t }}
                          onClick={() => {
                            onSetColor(tag, p.k)
                            setColorForId(null)
                          }}
                        />
                      )
                    })}
                  </div>
                )}

                {deletingId === tag.id && (
                  <div className="tag-mgr__delete-confirm">
                    <span className="tag-mgr__delete-note">
                      「{tag.name}」を {countLabel} から削除しますか？
                    </span>
                    <div
                      className="tag-mgr__delete-do"
                      onClick={() => {
                        setDeletingId(null)
                        onDelete(tag)
                      }}
                    >
                      削除する
                    </div>
                    <div className="tag-mgr__delete-cancel" onClick={() => setDeletingId(null)}>
                      やめる
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {rows.length === 0 && <div className="tag-mgr__empty">まだ登録がありません</div>}
        </div>

        <div className="tag-mgr__foot">
          <div className="tag-mgr__new-row">
            <input
              className="tag-mgr__new-input"
              value={newName}
              placeholder={NEW_PLACEHOLDER[tab]}
              onChange={(e) => setNewNames((cur) => ({ ...cur, [tab]: e.target.value }))}
              onKeyDown={(e) => {
                if (isEnterConfirm(e)) {
                  e.preventDefault()
                  submitNew()
                }
              }}
            />
            <button className="tag-mgr__add" disabled={!canAdd} onClick={submitNew}>
              <PlusIcon />
              登録
            </button>
          </div>
          <div className="tag-mgr__new-hint">{NEW_HINT[tab]}</div>
        </div>
      </div>
    </div>
  )
}
