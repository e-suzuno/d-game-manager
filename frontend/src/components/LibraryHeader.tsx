import './LibraryHeader.css'
import { SearchIcon } from './icons'

export interface LibraryHeaderProps {
  /** ビュー名（すべてのゲーム / お気に入り / 未整理） */
  title: string
  /** 絞り込み後の件数 */
  count: number
  query: string
  onQueryChange: (q: string) => void
  view: 'table' | 'gallery'
  onViewChange: (v: 'table' | 'gallery') => void
}

/** メインヘッダー: ビュー名 + 件数 + 検索ボックス + 表示トグル */
export function LibraryHeader({ title, count, query, onQueryChange, view, onViewChange }: LibraryHeaderProps) {
  return (
    <div className="library-header">
      <div className="library-header__title-block">
        <span className="library-header__title">{title}</span>
        <span className="library-header__count">{count}</span>
      </div>
      <div className="library-header__search">
        <span className="library-header__search-icon">
          <SearchIcon />
        </span>
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="タイトル・タグで検索…"
        />
      </div>
      <div className="view-toggle">
        <span
          className={`view-toggle__btn ${view === 'table' ? 'view-toggle__btn--active' : ''}`}
          onClick={() => onViewChange('table')}
        >
          テーブル
        </span>
        <span
          className={`view-toggle__btn ${view === 'gallery' ? 'view-toggle__btn--active' : ''}`}
          onClick={() => onViewChange('gallery')}
        >
          ギャラリー
        </span>
      </div>
    </div>
  )
}
