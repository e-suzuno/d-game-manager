/** プロトタイプのインライン SVG アイコン集 */

export function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  )
}

export function FolderIcon({ size = 13, strokeWidth = 1.8 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} style={{ flexShrink: 0 }}>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17z" />
    </svg>
  )
}

export function StarIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3l2.6 6.3 6.8.5-5.2 4.4 1.7 6.6L12 17.7 6.3 21.3l1.7-6.6L2.8 10.3l6.8-.5z" />
    </svg>
  )
}

export function PlayIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4l14 8-14 8z" />
    </svg>
  )
}

export function PencilIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 20h4L18.5 9.5a2 2 0 0 0-2.8-2.8L5 17z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  )
}

export function CameraIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2l1.1-1.7A1 1 0 0 1 8.4 4.8h7.2a1 1 0 0 1 .8.5L17.5 7h2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
      <circle cx="12" cy="12.4" r="3.1" />
    </svg>
  )
}

export function CheckIcon({ size = 17, strokeWidth = 3 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}>
      <path d="M5 12l5 5L20 6" />
    </svg>
  )
}

export function TrashIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2M6.5 7l1 12.1a1 1 0 0 0 1 .9h7a1 1 0 0 0 1-.9l1-12.1" />
      <path d="M10 11v5.5M14 11v5.5" />
    </svg>
  )
}

/** 既定カバー（グラデーション）上に重ねるゲームパッドのグリフ。色は親の currentColor */
export function GamepadGlyph({ size, strokeWidth }: { size: number; strokeWidth: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}>
      <rect x="2" y="7" width="20" height="10" rx="5" />
      <path d="M7 12h-2M6 11v2M15 11.5h.01M18 13.5h.01" />
    </svg>
  )
}

/** 制作ツール属性のレンチアイコン（確定バッジ / 見出し / ドロワー現在値で共用） */
export function WrenchIcon({ size = 11, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} style={{ flexShrink: 0 }}>
      <path d="M14.5 5.5a3.4 3.4 0 0 1-4.6 4.6L4 16l4 4 5.9-5.9a3.4 3.4 0 0 0 4.6-4.6l-2.3 2.3-2-2z" />
    </svg>
  )
}

/** 制作ツール未判別バッジの「?」アイコン */
export function QuestionCircleIcon({ size = 11, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.3 9.3a2.7 2.7 0 0 1 5.3 1c0 1.8-2.6 2.1-2.6 3.9M12 17.4h.01" />
    </svg>
  )
}

/** 警告（三角＋！）アイコン。実体が見つからないゲームのバッジ・ドロワー警告で使用 */
export function AlertTriangleIcon({ size = 11, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 4.2 2.6 19.4h18.8z" />
      <path d="M12 9.6v4.2M12 16.8h.01" />
    </svg>
  )
}

/** 設定（歯車）アイコン。サイドナビの設定ボタンで使用 */
export function GearIcon({ size = 15, strokeWidth = 1.9 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 0 1-4 0v-.2A1.6 1.6 0 0 0 6.6 19a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 2.9 14H2.7a2 2 0 0 1 0-4h.2A1.6 1.6 0 0 0 5 8.6a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 11 3.9V3.7a2 2 0 0 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 0 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1z" />
    </svg>
  )
}

/** タグフィルタ（3本線）アイコン。ツールバーの「タグ」ボタンで使用 */
export function TagFilterIcon({ size = 13, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} style={{ flexShrink: 0 }}>
      <path d="M3 6h18M7 12h10M11 18h2" />
    </svg>
  )
}

/** 編集（線ペン）アイコン。サイドナビの「管理」リンク / 設定モーダルのタグ管理行で使用 */
export function EditLineIcon({ size = 12, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} style={{ flexShrink: 0 }}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2 2 0 0 1 2.8 2.8L7 18.6 3 20l1.4-4z" />
    </svg>
  )
}

/** 性質変換（⇄）アイコン。タグ管理モーダルの「ジャンル⇄その他タグ」変換で使用 */
export function SwapIcon({ size = 13, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} style={{ flexShrink: 0 }}>
      <path d="M17 4l4 4-4 4M21 8H8M7 20l-4-4 4-4M3 16h13" />
    </svg>
  )
}
