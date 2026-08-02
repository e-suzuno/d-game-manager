import './GameTable.css'
import type { GameSection, UIGame } from '../types'
import { formatSize, formatDate, coverBackground } from '../lib/format'
import { MissingBadge } from './MissingBadge'
import { TagRow } from './TagChip'
import { ToolBadge } from './ToolBadge'
import { FolderIcon, GamepadGlyph, StarIcon, PlayIcon } from './icons'

export interface GameTableProps {
  /** グループなしの場合は showHeader:false の 1 セクションを渡す */
  sections: GameSection[]
  onOpen: (id: number) => void
  onToggleFavorite: (id: number) => void
  onLaunch: (id: number) => void
}

/** ゲーム1件をグループなしの単一セクションに包むヘルパー */
export function singleSection(games: UIGame[]): GameSection[] {
  return [{ label: '', count: games.length, games, showHeader: false }]
}

/** テーブル表示。行クリックで詳細ドロワー（☆・▷は stopPropagation）。グループ見出しは sticky */
export function GameTable({ sections, onOpen, onToggleFavorite, onLaunch }: GameTableProps) {
  return (
    <div>
      <div className="game-table__row game-table__header">
        <span></span>
        <span>タイトル</span>
        <span>制作ツール</span>
        <span>タグ</span>
        <span>保存先フォルダ</span>
        <span className="game-table__right">サイズ</span>
        <span className="game-table__right">追加日</span>
        <span></span>
      </div>
      {sections.map((sec, i) => (
        <div key={sec.label || i}>
          {sec.showHeader && (
            <div className="game-table__group-header">
              <span className="game-table__group-label">{sec.label}</span>
              <span className="game-table__group-count">{sec.count}</span>
              <span className="game-table__group-line" />
            </div>
          )}
          {sec.games.map((g) => (
            <div key={g.id} className="game-table__row game-table__data" onClick={() => onOpen(g.id)}>
              <div className="game-table__cover" style={{ background: coverBackground(g.id, g.coverPath) }}>
                {!g.coverPath && <GamepadGlyph size={16} strokeWidth={1.7} />}
              </div>
              <div className="game-table__title-cell">
                <div className="game-table__title">{g.title}</div>
                <div className="game-table__sub">
                  <span className="game-table__exe">{g.exePath}</span>
                  <MissingBadge missing={g.missing} />
                </div>
              </div>
              <div className="game-table__tool">
                <ToolBadge tool={g.tool} />
              </div>
              <div className="game-table__tags">
                <TagRow
                  tags={g.tags.map((t) => ({ label: t.name, axis: t.axis, color: t.color }))}
                  onAddClick={() => onOpen(g.id)}
                />
              </div>
              <div className="game-table__folder">
                <FolderIcon />
                <span className="game-table__folder-path">{g.folderPath}</span>
              </div>
              <div className="game-table__size">{formatSize(g.sizeBytes)}</div>
              <div className="game-table__date">{formatDate(g.addedAt)}</div>
              <div className="game-table__actions">
                <div
                  className={`game-table__fav ${g.favorite ? 'game-table__fav--on' : ''}`}
                  title="お気に入り"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleFavorite(g.id)
                  }}
                >
                  <StarIcon />
                </div>
                <div
                  className="game-table__launch"
                  title="起動"
                  onClick={(e) => {
                    e.stopPropagation()
                    onLaunch(g.id)
                  }}
                >
                  <PlayIcon />
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
