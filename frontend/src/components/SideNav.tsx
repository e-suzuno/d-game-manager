import { useState } from 'react'
import './SideNav.css'
import type { TagAxis, ViewKey } from '../types'
import { AXIS_LABELS, UNKNOWN_TOOL } from '../types'
import { EditLineIcon, FolderIcon, GearIcon, WrenchIcon } from './icons'

export interface AxisGroupItem {
  name: string
  count: number
  active: boolean
}

export interface AxisGroup {
  axis: TagAxis
  items: AxisGroupItem[]
}

export interface ToolFilterItem {
  name: string
  active: boolean
}

export interface SideNavProps {
  view: ViewKey
  counts: Record<ViewKey, number>
  onViewChange: (v: ViewKey) => void
  /** 制作ツール属性フィルタ（複数選択 = OR。ツールバーのポップオーバーと状態共有） */
  tools: ToolFilterItem[]
  onToggleTool: (name: string) => void
  groups: AxisGroup[]
  expanded: Record<TagAxis, boolean>
  onToggleExpand: (axis: TagAxis) => void
  onToggleTag: (name: string) => void
  /** タグ管理モーダルを開く（「タグで絞り込み」見出し右の「管理」リンク） */
  onManageTags: () => void
  /** 設定モーダルを開く */
  onSettings: () => void
  onImport: () => void
}

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'all', label: 'すべてのゲーム' },
  { key: 'fav', label: 'お気に入り' },
  { key: 'untagged', label: '未整理（タグなし）' },
  // 通常は存在しない状態なので、該当0件のときは行そのものを出さない
  { key: 'missing', label: '見つからない' },
]

/** 制作ツール属性フィルタのピル（SideNav とツールバーのフィルタで共用。未判別は琥珀系の破線） */
export function ToolFilterPill({ name, active, onToggle }: ToolFilterItem & { onToggle: () => void }) {
  const unknown = name === UNKNOWN_TOOL
  const cls = [
    'tool-pill',
    unknown ? 'tool-pill--unknown' : '',
    active ? (unknown ? 'tool-pill--unknown-on' : 'tool-pill--on') : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <span className={cls} onClick={onToggle}>
      {name}
    </span>
  )
}

/** タグフィルタ用の標準チェックボックス（ON は一律アクセント紫。タグ色とは無関係） */
export function TagCheckbox({ checked }: { checked: boolean }) {
  return (
    <span className={`tag-checkbox ${checked ? 'tag-checkbox--on' : ''}`}>
      {checked && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
          <path d="M5 12l5 5L20 6" />
        </svg>
      )}
    </span>
  )
}

/** サイドナビ: ロゴ + ビュー切替 + 制作ツール属性アコーディオン + タグ軸アコーディオン + 取り込みボタン */
export function SideNav({
  view,
  counts,
  onViewChange,
  tools,
  onToggleTool,
  groups,
  expanded,
  onToggleExpand,
  onToggleTag,
  onManageTags,
  onSettings,
  onImport,
}: SideNavProps) {
  // 制作ツールセクションは既定で折りたたみ（調整版ハンドオフ 変更点6）。開閉は SideNav ローカルの状態
  const [toolsOpen, setToolsOpen] = useState(false)
  const activeToolCount = tools.filter((t) => t.active).length
  return (
    <div className="side-nav">
      <div className="side-nav__logo">
        <div className="side-nav__logo-mark">◈</div>
        <div>
          <div className="side-nav__logo-title">d-game-manager</div>
          <div className="side-nav__logo-sub">ローカルコレクション</div>
        </div>
      </div>

      <div className="side-nav__section-title">ビュー</div>
      <div className="side-nav__views">
        {VIEWS.filter((v) => v.key !== 'missing' || counts.missing > 0).map((v) => (
          <div
            key={v.key}
            className={[
              'side-nav__view',
              view === v.key ? 'side-nav__view--active' : '',
              v.key === 'missing' ? 'side-nav__view--missing' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onViewChange(v.key)}
          >
            <span>{v.label}</span>
            <span className="side-nav__view-count">{counts[v.key]}</span>
          </div>
        ))}
      </div>

      <div
        className="side-nav__section-title side-nav__section-title--tools"
        onClick={() => setToolsOpen((o) => !o)}
      >
        <span className="side-nav__caret side-nav__caret--tools">{toolsOpen ? '▾' : '▸'}</span>
        <WrenchIcon size={12} />
        <span className="side-nav__tools-label">
          制作ツール<span className="side-nav__section-note">属性</span>
        </span>
        {activeToolCount > 0 && <span className="side-nav__tools-badge">{activeToolCount}</span>}
      </div>
      {toolsOpen && (
        <div className="side-nav__tools">
          {tools.map((t) => (
            <ToolFilterPill key={t.name} name={t.name} active={t.active} onToggle={() => onToggleTool(t.name)} />
          ))}
        </div>
      )}

      <div className="side-nav__tags-header">
        <span className="side-nav__section-title side-nav__section-title--tags">タグで絞り込み</span>
        <span className="side-nav__manage" title="タグを管理" onClick={onManageTags}>
          <EditLineIcon size={12} />
          管理
        </span>
      </div>
      <div className="side-nav__groups">
        {groups.map((grp) => (
          <div key={grp.axis}>
            <div className="side-nav__group-header" onClick={() => onToggleExpand(grp.axis)}>
              <span className="side-nav__caret">{expanded[grp.axis] ? '▾' : '▸'}</span>
              {AXIS_LABELS[grp.axis]}
            </div>
            {expanded[grp.axis] && (
              <div className="side-nav__group-items">
                {grp.items.map((it) => (
                  <div
                    key={it.name}
                    className={`side-nav__tag ${it.active ? 'side-nav__tag--active' : ''}`}
                    onClick={() => onToggleTag(it.name)}
                  >
                    <span className="side-nav__tag-label">
                      <TagCheckbox checked={it.active} />
                      {it.name}
                    </span>
                    <span className="side-nav__tag-count">{it.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="side-nav__footer">
        <button className="side-nav__settings" onClick={onSettings}>
          <GearIcon size={15} />
          設定
        </button>
        <button className="side-nav__import" onClick={onImport}>
          <FolderIcon size={15} strokeWidth={2} />
          フォルダを取り込む
        </button>
      </div>
    </div>
  )
}
