import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { LibraryHeader } from './LibraryHeader'

const meta = {
  title: 'Components/LibraryHeader',
  component: LibraryHeader,
} satisfies Meta<typeof LibraryHeader>

export default meta

export const Interactive: StoryObj = {
  render: () => {
    const [query, setQuery] = useState('')
    const [view, setView] = useState<'table' | 'gallery'>('table')
    return (
      <LibraryHeader
        title="すべてのゲーム"
        count={24}
        query={query}
        onQueryChange={setQuery}
        view={view}
        onViewChange={setView}
      />
    )
  },
}

export const FavoritesView: StoryObj = {
  render: () => (
    <LibraryHeader
      title="お気に入り"
      count={5}
      query=""
      onQueryChange={() => {}}
      view="gallery"
      onViewChange={() => {}}
    />
  ),
}
