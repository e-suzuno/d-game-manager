import { useState } from 'react'
import './Toolbar.css'
import type { GroupKey, SortDir, SortKey } from '../types'
import { AXIS_LABELS } from '../types'
import type { AxisGroup, ToolFilterItem } from './SideNav'
import { TagCheckbox, ToolFilterPill } from './SideNav'
import { TagFilterIcon, WrenchIcon } from './icons'

export interface ToolbarProps {
  /** 制作ツール属性フィルタ（左ナビと同一データ。絞り込み状態も共有） */
  tools: ToolFilterItem[]
  /** 適用中のツールフィルタ（適用順。チップ表示に使う） */
  activeTools: string[]
  onToggleTool: (name: string) => void
  /** タグ軸ごとのタグ一覧（左ナビと同一データ。絞り込み状態も共有） */
  groups: AxisGroup[]
  activeTags: string[]
  onToggleTag: (name: string) => void
  /** 制作ツールフィルタのみ解除する（「制作ツール」ポップオーバーの「解除」） */
  onClearTools: () => void
  /** タグフィルタのみ解除する（「タグ」ポップオーバーの「解除」） */
  onClearTags: () => void
  /** ツール・タグ両方のフィルタを解除する（適用中チップ行の「すべて解除」） */
  onClearFilters: () => void
  sortKey: SortKey
  sortDir: SortDir
  onSortKey: (k: SortKey) => void
  onToggleSortDir: () => void
  groupBy: GroupKey
  onGroupBy: (g: GroupKey) => void
}

type MenuKey = 'toolFilter' | 'tagFilter' | 'sort' | 'group' | null

const SORT_LABELS: Record<SortKey, string> = { added: '追加日', title: 'タイトル', size: 'サイズ' }
const GROUP_LABELS: Record<GroupKey, string> = { none: 'なし', genre: 'ジャンル', tool: '制作ツール' }

function CheckMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
      <path d="M5 12l5 5L20 6" />
    </svg>
  )
}

/** ツールバー: 制作ツール / タグ / 並び替え / グループ（すべて実動作、ポップオーバー付き） */
export function Toolbar({
  tools,
  activeTools,
  onToggleTool,
  groups,
  activeTags,
  onToggleTag,
  onClearTools,
  onClearTags,
  onClearFilters,
  sortKey,
  sortDir,
  onSortKey,
  onToggleSortDir,
  groupBy,
  onGroupBy,
}: ToolbarProps) {
  const [menu, setMenu] = useState<MenuKey>(null)
  const toggleMenu = (m: MenuKey) => setMenu((cur) => (cur === m ? null : m))
  const dirArrow = sortDir === 'desc' ? '↓' : '↑'
  const filterCount = activeTools.length + activeTags.length

  return (
    <div className="toolbar">
      {menu && <div className="toolbar__overlay" onClick={() => setMenu(null)} />}

      <div className="toolbar__group">
        <span
          className={`toolbar__btn ${menu === 'toolFilter' || activeTools.length > 0 ? 'toolbar__btn--active' : ''}`}
          onClick={() => toggleMenu('toolFilter')}
        >
          <WrenchIcon size={13} />
          制作ツール
          {activeTools.length > 0 && <span className="toolbar__badge">{activeTools.length}</span>}
        </span>
        {menu === 'toolFilter' && (
          <div className="toolbar__menu toolbar__menu--tool-filter">
            <div className="toolbar__menu-head">
              <span className="toolbar__menu-title">制作ツールで絞り込み</span>
              {activeTools.length > 0 && (
                <span className="toolbar__menu-clear" onClick={onClearTools}>
                  解除
                </span>
              )}
            </div>
            <div className="toolbar__menu-tools">
              {tools.map((t) => (
                <ToolFilterPill key={t.name} name={t.name} active={t.active} onToggle={() => onToggleTool(t.name)} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="toolbar__group">
        <span
          className={`toolbar__btn ${menu === 'tagFilter' || activeTags.length > 0 ? 'toolbar__btn--active' : ''}`}
          onClick={() => toggleMenu('tagFilter')}
        >
          <TagFilterIcon />
          タグ
          {activeTags.length > 0 && <span className="toolbar__badge">{activeTags.length}</span>}
        </span>
        {menu === 'tagFilter' && (
          <div className="toolbar__menu toolbar__menu--tag-filter">
            <div className="toolbar__menu-head">
              <span className="toolbar__menu-title">タグで絞り込み</span>
              {activeTags.length > 0 && (
                <span className="toolbar__menu-clear" onClick={onClearTags}>
                  解除
                </span>
              )}
            </div>
            {groups.map((grp) => (
              <div key={grp.axis} className="toolbar__menu-axis">
                <div className="toolbar__menu-axis-name">{AXIS_LABELS[grp.axis]}</div>
                <div className="toolbar__menu-items">
                  {grp.items.map((it) => (
                    <div
                      key={it.name}
                      className={`toolbar__tag ${it.active ? 'toolbar__tag--active' : ''}`}
                      onClick={() => onToggleTag(it.name)}
                    >
                      <span className="toolbar__tag-label">
                        <TagCheckbox checked={it.active} />
                        {it.name}
                      </span>
                      <span className="toolbar__tag-count">{it.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="toolbar__group">
        <span
          className={`toolbar__btn ${menu === 'sort' ? 'toolbar__btn--active' : ''}`}
          onClick={() => toggleMenu('sort')}
        >
          並び替え：{SORT_LABELS[sortKey]}
          <span
            className="toolbar__dir"
            onClick={(e) => {
              e.stopPropagation()
              onToggleSortDir()
            }}
          >
            {dirArrow}
          </span>
        </span>
        {menu === 'sort' && (
          <div className="toolbar__menu toolbar__menu--sort">
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <div
                key={k}
                className={`toolbar__opt ${sortKey === k ? 'toolbar__opt--active' : ''}`}
                onClick={() => onSortKey(k)}
              >
                {SORT_LABELS[k]}
                {sortKey === k && <CheckMark />}
              </div>
            ))}
            <div className="toolbar__menu-divider" />
            <div className="toolbar__opt" onClick={onToggleSortDir}>
              並び順を反転<span className="toolbar__dir">{dirArrow}</span>
            </div>
          </div>
        )}
      </div>

      <div className="toolbar__group">
        <span
          className={`toolbar__btn ${menu === 'group' || groupBy !== 'none' ? 'toolbar__btn--active' : ''}`}
          onClick={() => toggleMenu('group')}
        >
          グループ：{GROUP_LABELS[groupBy]}
        </span>
        {menu === 'group' && (
          <div className="toolbar__menu toolbar__menu--group">
            {(Object.keys(GROUP_LABELS) as GroupKey[]).map((k) => (
              <div
                key={k}
                className={`toolbar__opt ${groupBy === k ? 'toolbar__opt--active' : ''}`}
                onClick={() => {
                  onGroupBy(k)
                  setMenu(null)
                }}
              >
                {GROUP_LABELS[k]}
                {groupBy === k && <CheckMark />}
              </div>
            ))}
          </div>
        )}
      </div>

      {filterCount > 0 && (
        <div className="toolbar__chips">
          <span className="toolbar__divider" />
          {/* ツールチップが先・タグチップが後（調整版ハンドオフ 変更点3。未判別も同スタイル＝破線なし） */}
          {activeTools.map((name) => (
            <span key={name} className="toolbar__chip toolbar__chip--tool">
              {name}
              <span className="toolbar__chip-remove" onClick={() => onToggleTool(name)}>
                ×
              </span>
            </span>
          ))}
          {activeTags.map((name) => (
            <span key={name} className="toolbar__chip">
              {name}
              <span className="toolbar__chip-remove" onClick={() => onToggleTag(name)}>
                ×
              </span>
            </span>
          ))}
          <span className="toolbar__clear" onClick={onClearFilters}>
            すべて解除
          </span>
        </div>
      )}
    </div>
  )
}
