import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { GalleryGrid } from './GalleryGrid'
import { singleSection } from './GameTable'
import {
  mockGames,
  mockGameManyTags,
  mockGameMissingExe,
  mockGameMissingFolder,
  mockGameWithCover,
} from '../data/mockGames'

const meta = {
  title: 'Components/GalleryGrid',
  component: GalleryGrid,
} satisfies Meta<typeof GalleryGrid>

export default meta

export const Default: StoryObj = {
  render: () => {
    const [games, setGames] = useState(mockGames.slice(0, 10))
    return (
      <GalleryGrid
        sections={singleSection(games)}
        onOpen={(id) => console.log('open', id)}
        onToggleFavorite={(id) =>
          setGames(games.map((g) => (g.id === id ? { ...g, favorite: !g.favorite } : g)))
        }
      />
    )
  },
}

export const Grouped: StoryObj = {
  name: 'グループ表示',
  render: () => {
    const byGenre = new Map<string, typeof mockGames>()
    for (const g of mockGames.slice(0, 14)) {
      const key = g.tags.find((t) => t.axis === 'genre')?.name ?? '未分類'
      byGenre.set(key, [...(byGenre.get(key) ?? []), g])
    }
    const sections = [...byGenre.entries()].map(([label, games]) => ({
      label,
      count: games.length,
      games,
      showHeader: true,
    }))
    return <GalleryGrid sections={sections} onOpen={() => {}} onToggleFavorite={() => {}} />
  },
}

export const EdgeCases: StoryObj = {
  name: 'エッジケース（タグ多数・タグなし・未判別・カバー画像あり）',
  render: () => (
    // mockGames[6]（index 5〜8 に含まれる）はタグなし＋制作ツール未判別（オーバーレイも未判別表示）
    <GalleryGrid
      sections={singleSection([mockGameManyTags, mockGameWithCover, ...mockGames.slice(5, 9)])}
      onOpen={() => {}}
      onToggleFavorite={() => {}}
    />
  ),
}

export const Missing: StoryObj = {
  name: '実体が見つからない（カバー上のバッジ）',
  render: () => (
    <GalleryGrid
      sections={singleSection([
        mockGameMissingFolder,
        mockGameMissingExe,
        { ...mockGameWithCover, missing: 'folder' as const },
        mockGames[0],
      ])}
      onOpen={() => {}}
      onToggleFavorite={() => {}}
    />
  ),
}
