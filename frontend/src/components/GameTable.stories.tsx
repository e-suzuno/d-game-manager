import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { GameTable, singleSection } from './GameTable'
import {
  mockGames,
  mockGameManyTags,
  mockGameMissingExe,
  mockGameMissingFolder,
  mockGameWithCover,
} from '../data/mockGames'

const meta = {
  title: 'Components/GameTable',
  component: GameTable,
} satisfies Meta<typeof GameTable>

export default meta

export const Default: StoryObj = {
  render: () => {
    const [games, setGames] = useState(mockGames)
    return (
      <GameTable
        sections={singleSection(games)}
        onOpen={(id) => console.log('open', id)}
        onToggleFavorite={(id) =>
          setGames(games.map((g) => (g.id === id ? { ...g, favorite: !g.favorite } : g)))
        }
        onLaunch={(id) => alert(`起動: ${id}`)}
      />
    )
  },
}

export const Grouped: StoryObj = {
  name: 'グループ表示（sticky 見出し）',
  render: () => {
    // 制作ツール属性でグループ化（未判別も独立グループ）
    const byTool = new Map<string, typeof mockGames>()
    for (const g of mockGames) {
      byTool.set(g.tool, [...(byTool.get(g.tool) ?? []), g])
    }
    const sections = [...byTool.entries()].map(([label, games]) => ({
      label,
      count: games.length,
      games,
      showHeader: true,
    }))
    return (
      <GameTable sections={sections} onOpen={() => {}} onToggleFavorite={() => {}} onLaunch={() => {}} />
    )
  },
}

export const EdgeCases: StoryObj = {
  name: 'エッジケース（タグ多数・タグなし・未判別・カバー画像あり）',
  render: () => (
    // mockGames[6]（index 5〜7 に含まれる）はタグなし＋制作ツール未判別
    <GameTable
      sections={singleSection([mockGameManyTags, mockGameWithCover, ...mockGames.slice(5, 8)])}
      onOpen={() => {}}
      onToggleFavorite={() => {}}
      onLaunch={() => {}}
    />
  ),
}

export const Missing: StoryObj = {
  name: '実体が見つからない（フォルダ不在・exe 不在）',
  render: () => (
    <GameTable
      sections={singleSection([mockGameMissingFolder, mockGameMissingExe, mockGames[0]])}
      onOpen={() => {}}
      onToggleFavorite={() => {}}
      onLaunch={() => {}}
    />
  ),
}

export const Empty: StoryObj = {
  name: '0件',
  render: () => (
    <GameTable sections={singleSection([])} onOpen={() => {}} onToggleFavorite={() => {}} onLaunch={() => {}} />
  ),
}
