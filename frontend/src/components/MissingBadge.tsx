import './MissingBadge.css'
import type { MissingKind } from '../types'
import { MISSING_LABEL } from '../types'
import { AlertTriangleIcon } from './icons'

export interface MissingBadgeProps {
  /** 見つからない理由。'' なら何も描画しない（呼び出し側で分岐しなくて済むように） */
  missing: MissingKind
  /** overlay はギャラリーのカバー画像に重ねる版（濃色カバーでも読めるよう不透明度を上げる） */
  variant?: 'inline' | 'overlay'
}

/**
 * 実体（フォルダ・exe）が見つからないゲームに付けるバッジ。
 * ラベルは理由に関わらず「見つかりません」で統一し、フォルダ不在か exe 不在かは
 * title 属性と詳細ドロワーの警告で示す（一覧の情報量を増やさない）。
 */
export function MissingBadge({ missing, variant = 'inline' }: MissingBadgeProps) {
  if (!missing) return null
  return (
    <span className={`missing-badge missing-badge--${variant}`} title={MISSING_LABEL[missing]}>
      <AlertTriangleIcon size={11} />
      <span className="missing-badge__label">見つかりません</span>
    </span>
  )
}
