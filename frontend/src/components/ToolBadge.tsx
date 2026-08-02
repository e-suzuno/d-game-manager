import './ToolBadge.css'
import { UNKNOWN_TOOL } from '../types'
import { QuestionCircleIcon, WrenchIcon } from './icons'

export interface ToolBadgeProps {
  /** 制作ツール属性の値。UNKNOWN_TOOL のとき未判別スタイル（破線＋「?」）になる */
  tool: string
  /** 表示ラベルの差し替え（ImportModal の「制作ツール未判別」用）。省略時は tool をそのまま表示 */
  label?: string
  /** 取り込みレビューカード用の小サイズ */
  size?: 'md' | 'sm'
}

/** 制作ツール属性バッジ。確定＝レンチ / 未判別＝「?」＋破線（調整版ハンドオフ 変更点3） */
export function ToolBadge({ tool, label, size = 'md' }: ToolBadgeProps) {
  const unknown = tool === UNKNOWN_TOOL
  const text = label ?? tool
  const iconSize = size === 'sm' ? 10 : 11
  const cls = [
    'tool-badge',
    unknown ? 'tool-badge--unknown' : '',
    size === 'sm' ? 'tool-badge--sm' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <span className={cls} title={text}>
      {unknown ? <QuestionCircleIcon size={iconSize} /> : <WrenchIcon size={iconSize} />}
      <span className="tool-badge__label">{text}</span>
    </span>
  )
}
