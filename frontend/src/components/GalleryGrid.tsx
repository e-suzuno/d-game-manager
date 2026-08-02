import './GalleryGrid.css'
import type { GameSection } from '../types'
import { formatSize, coverBackground } from '../lib/format'
import { MissingBadge } from './MissingBadge'
import { TagRow } from './TagChip'
import { GamepadGlyph, StarIcon, WrenchIcon } from './icons'

export interface GalleryGridProps {
  /** グループなしの場合は showHeader:false の 1 セクションを渡す */
  sections: GameSection[]
  onOpen: (id: number) => void
  onToggleFavorite: (id: number) => void
}

/** ギャラリー表示（グループごとに5列グリッド）。カード全体クリックで詳細ドロワー */
export function GalleryGrid({ sections, onOpen, onToggleFavorite }: GalleryGridProps) {
  return (
    <div className="gallery">
      {sections.map((sec, i) => (
        <div key={sec.label || i} className="gallery__section">
          {sec.showHeader && (
            <div className="gallery__group-header">
              <span className="gallery__group-label">{sec.label}</span>
              <span className="gallery__group-count">{sec.count}</span>
              <span className="gallery__group-line" />
            </div>
          )}
          <div className="gallery-grid">
            {sec.games.map((g) => (
              <div key={g.id} className="gallery-card" onClick={() => onOpen(g.id)}>
                <div className="gallery-card__cover" style={{ background: coverBackground(g.id, g.coverPath) }}>
                  {!g.coverPath && (
                    <span className="gallery-card__glyph">
                      <GamepadGlyph size={46} strokeWidth={1.5} />
                    </span>
                  )}
                  <div className="gallery-card__shade" />
                  {/* 制作ツール属性オーバーレイ。プロトタイプ同様、未判別でも常に表示（アイコンはレンチ固定） */}
                  <div className="gallery-card__tool">
                    <WrenchIcon size={10} />
                    <span className="gallery-card__tool-label">{g.tool}</span>
                  </div>
                  {/* 実体が見つからないバッジは制作ツールの真下（タイトル・☆と重ならない位置） */}
                  {g.missing && (
                    <div className="gallery-card__missing">
                      <MissingBadge missing={g.missing} variant="overlay" />
                    </div>
                  )}
                  <div
                    className={`gallery-card__fav ${g.favorite ? 'gallery-card__fav--on' : ''}`}
                    title="お気に入り"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleFavorite(g.id)
                    }}
                  >
                    <StarIcon />
                  </div>
                  <div className="gallery-card__title">{g.title}</div>
                </div>
                <div className="gallery-card__meta">
                  <TagRow
                    tags={g.tags.map((t) => ({ label: t.name, axis: t.axis, color: t.color }))}
                    onAddClick={() => onOpen(g.id)}
                  />
                  <span className="gallery-card__size">{formatSize(g.sizeBytes)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
