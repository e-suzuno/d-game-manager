import { describe, expect, it } from 'vitest'
import type { MissingKind, UIGame } from '../types'
import { keepMissing } from './missing'

function game(id: number, missing: MissingKind = ''): UIGame {
  return {
    id,
    title: `ゲーム${id}`,
    exePath: 'Game.exe',
    folderPath: `D:\\Games\\${id}`,
    sizeBytes: 100,
    favorite: false,
    addedAt: '2026-07-25T12:00:00Z',
    coverPath: '',
    tool: 'Unity',
    tags: [],
    missing,
  }
}

describe('keepMissing', () => {
  it('再取得結果に既存の missing を引き継ぐ', () => {
    const current = [game(1, 'folder'), game(2, 'exe'), game(3)]
    // ListGames / ImportGames の結果は missing を持たない（常に空文字）
    const next = [game(1), game(2), game(3)]

    const got = keepMissing(current, next)

    expect(got.map((g) => g.missing)).toEqual(['folder', 'exe', ''])
  })

  it('新しく取り込まれたゲームは next の値のまま（空文字）', () => {
    const got = keepMissing([game(1, 'folder')], [game(1), game(9)])

    expect(got.map((g) => [g.id, g.missing])).toEqual([
      [1, 'folder'],
      [9, ''],
    ])
  })

  it('next に無いゲーム（削除済み）は落ちる', () => {
    const got = keepMissing([game(1, 'folder'), game(2, 'exe')], [game(2)])

    expect(got.map((g) => g.id)).toEqual([2])
    expect(got[0].missing).toBe('exe')
  })

  it('値が変わらないゲームは同じオブジェクトを返す（不要な再描画を避ける）', () => {
    const kept = game(1)
    const got = keepMissing([game(1)], [kept])

    expect(got[0]).toBe(kept)
  })

  it('current が空でも next をそのまま返す（初回取得）', () => {
    const next = [game(1), game(2)]

    expect(keepMissing([], next)).toEqual(next)
  })
})
