import './TagChip.css'
import type { TagAxis } from '../types'
import { tagColorOf } from '../types'

export type { TagAxis }

export interface TagChipProps {
  label: string
  axis?: TagAxis
  /** パレットキー。未指定/空文字は軸の既定色 */
  color?: string
  /** ドロワー内サイズ（13px / padding大 / × 付き）。省略時はテーブル/ギャラリー用の小サイズ */
  size?: 'table' | 'drawer'
  /** 指定すると × が表示され、クリックで呼ばれる */
  onRemove?: () => void
  /** ラベル部分のクリック（ドロワーの色ピッカー起動用） */
  onLabelClick?: () => void
}

/** タグチップ。色はタグごとのパレットキー（未設定は軸の既定色）。幅不足時は末尾省略（…） */
export function TagChip({ label, axis = 'other', color, size = 'table', onRemove, onLabelClick }: TagChipProps) {
  const c = tagColorOf({ axis, color })
  return (
    <span
      className={`tag-chip tag-chip--${size}`}
      style={{ color: c.text, background: c.bg }}
      title={onLabelClick ? '色を変更' : label}
      onClick={
        onLabelClick
          ? (e) => {
              e.stopPropagation()
              onLabelClick()
            }
          : undefined
      }
    >
      <span className="tag-chip__label">{label}</span>
      {onRemove && (
        <span
          className="tag-chip__remove"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          ×
        </span>
      )}
    </span>
  )
}

/** 「+N」チップ。縮まず常に表示される */
export function MoreChip({ count }: { count: number }) {
  return <span className="tag-chip tag-chip--more">+{count}</span>
}

/** タグ0件時の破線チップ「＋ タグ」。クリックで詳細ドロワーを開く用途 */
export function AddTagChip({ onClick }: { onClick?: () => void }) {
  return (
    <span
      className="tag-chip tag-chip--dashed"
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
    >
      ＋ タグ
    </span>
  )
}

export interface TagRowProps {
  tags: { label: string; axis: TagAxis; color?: string }[]
  /** 表示上限（テーブル/ギャラリーとも 2） */
  max?: number
  /** タグ0件時の「＋ タグ」クリック */
  onAddClick?: () => void
}

/** タグの1行固定表示。上限超過は +N、タグ0件は「＋ タグ」（README「1行固定の実装指針」参照） */
export function TagRow({ tags, max = 2, onAddClick }: TagRowProps) {
  if (tags.length === 0) {
    return (
      <div className="tag-row">
        <AddTagChip onClick={onAddClick} />
      </div>
    )
  }
  const shown = tags.slice(0, max)
  const more = tags.length - shown.length
  return (
    <div className="tag-row">
      {shown.map((t) => (
        <TagChip key={t.label} label={t.label} axis={t.axis} color={t.color} />
      ))}
      {more > 0 && <MoreChip count={more} />}
    </div>
  )
}
