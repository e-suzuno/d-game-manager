import { useCallback, useEffect, useState } from 'react'
import { LibraryPage } from './components/LibraryPage'
import type { DetectedGame, ScanProgress } from './components/ImportModal'
import type { MissingKind, UIGame, UITag } from './types'
import { UNKNOWN_TOOL } from './types'
import { keepMissing } from './lib/missing'
import {
  AddTag,
  CheckMissingGames,
  CreateTag,
  DeleteGame,
  DeleteGames,
  DeleteTag,
  ImportGames,
  LaunchGame,
  ListGames,
  ListTags,
  OpenGameFolder,
  RelinkGame,
  RemoveTag,
  RenameGame,
  RenameTag,
  ResetCover,
  ResetLibrary,
  ScanFolders,
  SelectAndScanFolder,
  SelectCoverImage,
  SetFavorite,
  SetTagAxis,
  SetTagColor,
  SetTool,
} from '../wailsjs/go/main/App'
import { EventsOn, OnFileDrop, OnFileDropOff } from '../wailsjs/runtime/runtime'

/** Go の store.Game を UI 型へ（tags の null を空配列に正規化。tool は NOT NULL だが念のため防御） */
function toUIGame(g: unknown): UIGame {
  const game = g as Omit<UIGame, 'tags' | 'missing'> & {
    tags: Parameters<typeof toUITag>[0][] | null
    missing?: string
  }
  return {
    ...game,
    tool: game.tool || UNKNOWN_TOOL,
    tags: (game.tags ?? []).map(toUITag),
    // ListGames は存在確認をしないので実際には常に空。値は CheckMissingGames で後から入る
    missing: toMissingKind(game.missing),
  }
}

/** Go の health パッケージの値（'' / 'folder' / 'exe'）を UI 型へ。未知の値は正常扱い */
function toMissingKind(v: unknown): MissingKind {
  return v === 'folder' || v === 'exe' ? v : ''
}

function toUITag(t: { id: number; name: string; axis: string; color: string }): UITag {
  // 未知の axis（旧 DB に残りうる 'tool' 等）は 'other' に丸める
  return { id: t.id, name: t.name, axis: t.axis === 'genre' ? 'genre' : 'other', color: t.color }
}

function errorMessage(e: unknown): string {
  return typeof e === 'string' ? e : e instanceof Error ? e.message : String(e)
}

function toDetectedGame(d: {
  title: string
  folderPath: string
  exePath: string
  sizeBytes: number
  tool: string
}): DetectedGame {
  return {
    title: d.title,
    folderPath: d.folderPath,
    exePath: d.exePath,
    sizeBytes: d.sizeBytes,
    tool: d.tool || UNKNOWN_TOOL,
  }
}

/**
 * Wails の OS ファイルドロップ購読（ImportModal へ注入する）。
 * useDropTarget=true なので --wails-drop-target: drop の要素（ドロップゾーン）上でだけ発火する
 */
function subscribeFileDrop(cb: (paths: string[]) => void): () => void {
  OnFileDrop((_x, _y, paths) => cb(paths), true)
  return () => OnFileDropOff()
}

/**
 * 取り込みスキャン進捗の購読（ImportModal へ注入する）。
 * イベント名・ペイロードは Go 側 app.go の emitScanProgress と対
 */
function subscribeScanProgress(cb: (p: ScanProgress) => void): () => void {
  return EventsOn('scan:progress', (p: ScanProgress) => cb(p))
}

const byName = (a: UITag, b: UITag) => a.name.localeCompare(b.name, 'ja')

function App() {
  const [games, setGames] = useState<UIGame[]>([])
  // ライブラリ全体のタグ（孤児タグ含む）。ドロワーの候補・重複判定に使う
  const [allTags, setAllTags] = useState<UITag[]>([])

  const refresh = useCallback(async () => {
    const [gameList, tagList] = await Promise.all([ListGames(), ListTags()])
    // missing は Go の一覧取得が返さない UI 専用の状態なので、既存の判定結果を引き継ぐ。
    // 上書きするとバッジ・「見つからない」ビュー・ドロワーの警告（＝保存先を指定し直す
    // 導線）が再取得のたびに消える
    setGames((cur) => keepMissing(cur, (gameList ?? []).map(toUIGame)))
    setAllTags((tagList ?? []).map(toUITag).sort(byName))
  }, [])

  /**
   * 実体（フォルダ・exe）の存在確認。結果に含まれないゲームは missing を空に戻すので、
   * ドライブを繋ぎ直した等で復帰したケースもこれ1本で反映できる。
   * 一覧取得とは分離して非同期に実行する（未接続ドライブの stat で初回描画を待たせない）。
   * 戻り値は「ゲーム ID → 見つからない理由」で、整合性チェックの一覧表示に使う
   */
  const checkMissing = useCallback(async () => {
    const results = await CheckMissingGames()
    const byId = new Map((results ?? []).map((r) => [r.id, toMissingKind(r.missing)]))
    setGames((cur) =>
      cur.map((g) => {
        const missing = byId.get(g.id) ?? ''
        return g.missing === missing ? g : { ...g, missing }
      }),
    )
    return byId
  }, [])

  useEffect(() => {
    refresh()
      // 存在確認は一覧表示の付加情報なので、失敗しても一覧はそのまま出す（ログのみ）
      .then(() => checkMissing().catch((e) => console.warn('checkMissing:', e)))
      .catch((e) => console.error('refresh:', e))
  }, [refresh, checkMissing])

  /** 対象ゲームのタグだけを局所更新する（全件再取得を避ける） */
  const updateGameTags = (id: number, fn: (tags: UITag[]) => UITag[]) =>
    setGames((cur) => cur.map((g) => (g.id === id ? { ...g, tags: fn(g.tags) } : g)))

  return (
    <div style={{ height: '100vh' }}>
      <LibraryPage
        games={games}
        allTags={allTags}
        onToggleFavorite={(id) => {
          const g = games.find((x) => x.id === id)
          if (!g) return
          // 楽観的更新 + 失敗時は再読込で巻き戻す
          setGames((cur) => cur.map((x) => (x.id === id ? { ...x, favorite: !x.favorite } : x)))
          SetFavorite(id, !g.favorite).catch(() => refresh())
        }}
        onSetTool={async (id, tool) => {
          // 楽観的更新 + 失敗時は再読込で巻き戻す（onToggleFavorite と同じパターン）
          setGames((cur) => cur.map((g) => (g.id === id ? { ...g, tool } : g)))
          try {
            await SetTool(id, tool)
            return '制作ツールを変更しました'
          } catch (e) {
            await refresh().catch(() => {})
            return `制作ツールを変更できませんでした: ${errorMessage(e)}`
          }
        }}
        onLaunch={async (id) => {
          const g = games.find((x) => x.id === id)
          try {
            await LaunchGame(id)
            return `「${g?.title}」を起動します…`
          } catch (e) {
            return errorMessage(e)
          }
        }}
        onOpenFolder={async (id) => {
          const g = games.find((x) => x.id === id)
          try {
            await OpenGameFolder(id)
            return `フォルダを開きます： ${g?.folderPath}`
          } catch (e) {
            return errorMessage(e)
          }
        }}
        onAddTag={async (id, name) => {
          try {
            // 新規タグの axis はドロワーからの追加なので「その他」（既存タグでは無視される）
            const tag = toUITag(await AddTag(id, name, 'other'))
            updateGameTags(id, (tags) =>
              tags.some((t) => t.id === tag.id) ? tags : [...tags, tag].sort(byName),
            )
            setAllTags((cur) =>
              cur.some((t) => t.id === tag.id) ? cur : [...cur, tag].sort(byName),
            )
            return null
          } catch (e) {
            return `タグを追加できませんでした: ${errorMessage(e)}`
          }
        }}
        onRemoveTag={async (id, tag) => {
          try {
            await RemoveTag(id, tag.id)
            // タグ行は温存される方針のため allTags からは消さない
            updateGameTags(id, (tags) => tags.filter((t) => t.id !== tag.id))
            return null
          } catch (e) {
            return `タグを外せませんでした: ${errorMessage(e)}`
          }
        }}
        onSetTagColor={async (tag, color) => {
          try {
            await SetTagColor(tag.id, color)
            // 色はタグ名ごとにグローバルなので、全ゲームの同名タグを更新する
            setGames((cur) =>
              cur.map((g) => ({
                ...g,
                tags: g.tags.map((t) => (t.id === tag.id ? { ...t, color } : t)),
              })),
            )
            setAllTags((cur) => cur.map((t) => (t.id === tag.id ? { ...t, color } : t)))
            return null
          } catch (e) {
            return `色を変更できませんでした: ${errorMessage(e)}`
          }
        }}
        onRenameTag={async (tag, name) => {
          try {
            await RenameTag(tag.id, name)
            // 名前はタグ ID にグローバルなので、全ゲームの同 ID タグを差し替える。
            // バックエンドはゲームのタグを name 順で返すため、表示順も揃え直す（onAddTag と同様）
            setGames((cur) =>
              cur.map((g) => ({
                ...g,
                tags: g.tags
                  .map((t) => (t.id === tag.id ? { ...t, name } : t))
                  .sort(byName),
              })),
            )
            setAllTags((cur) =>
              cur.map((t) => (t.id === tag.id ? { ...t, name } : t)).sort(byName),
            )
            return null
          } catch (e) {
            return `タグ名を変更できませんでした: ${errorMessage(e)}`
          }
        }}
        onDeleteTag={async (tag) => {
          try {
            await DeleteTag(tag.id)
            setGames((cur) =>
              cur.map((g) => ({ ...g, tags: g.tags.filter((t) => t.id !== tag.id) })),
            )
            setAllTags((cur) => cur.filter((t) => t.id !== tag.id))
            return null
          } catch (e) {
            return `タグを削除できませんでした: ${errorMessage(e)}`
          }
        }}
        onSetTagAxis={async (tag, axis) => {
          try {
            await SetTagAxis(tag.id, axis)
            setGames((cur) =>
              cur.map((g) => ({
                ...g,
                tags: g.tags.map((t) => (t.id === tag.id ? { ...t, axis } : t)),
              })),
            )
            setAllTags((cur) => cur.map((t) => (t.id === tag.id ? { ...t, axis } : t)))
            return null
          } catch (e) {
            return `タグの性質を変更できませんでした: ${errorMessage(e)}`
          }
        }}
        onCreateTag={async (name, axis) => {
          try {
            // 登録のみ（どのゲームにも未割当）。games は変わらない
            const tag = toUITag(await CreateTag(name, axis))
            setAllTags((cur) =>
              cur.some((t) => t.id === tag.id) ? cur : [...cur, tag].sort(byName),
            )
            return null
          } catch (e) {
            return `タグを登録できませんでした: ${errorMessage(e)}`
          }
        }}
        onRename={async (id, title) => {
          try {
            await RenameGame(id, title)
            setGames((cur) => cur.map((g) => (g.id === id ? { ...g, title } : g)))
            return 'タイトルを変更しました'
          } catch (e) {
            return errorMessage(e)
          }
        }}
        onChangeCover={async (id) => {
          try {
            const coverPath = await SelectCoverImage(id)
            if (!coverPath) return null // ダイアログのキャンセル
            setGames((cur) => cur.map((g) => (g.id === id ? { ...g, coverPath } : g)))
            return 'カバー画像を変更しました'
          } catch (e) {
            return errorMessage(e)
          }
        }}
        onResetCover={async (id) => {
          try {
            await ResetCover(id)
            setGames((cur) => cur.map((g) => (g.id === id ? { ...g, coverPath: '' } : g)))
            return 'カバー画像を初期に戻しました'
          } catch (e) {
            return errorMessage(e)
          }
        }}
        onDelete={async (id) => {
          const g = games.find((x) => x.id === id)
          try {
            await DeleteGame(id)
            setGames((cur) => cur.filter((x) => x.id !== id))
            return `「${g?.title}」をライブラリから削除しました`
          } catch (e) {
            return `削除できませんでした: ${errorMessage(e)}`
          }
        }}
        onRelink={async (id) => {
          try {
            const g = await RelinkGame(id)
            if (!g?.id) return null // ダイアログのキャンセル
            const updated = toUIGame(g)
            // 貼り替えが成功した時点で実体はある（Go 側がスキャンで exe を確認している）
            setGames((cur) => cur.map((x) => (x.id === id ? { ...updated, missing: '' } : x)))
            return `保存先を更新しました： ${updated.folderPath}`
          } catch (e) {
            return `保存先を更新できませんでした: ${errorMessage(e)}`
          }
        }}
        onCheckMissing={async () => {
          const byId = await checkMissing()
          // 一覧は現在の games から組む（setGames の反映を待たずに結果を返せる）
          return games
            .filter((g) => byId.has(g.id))
            .map((g) => ({ ...g, missing: byId.get(g.id)! }))
        }}
        onDeleteMissing={async (ids) => {
          try {
            const result = await DeleteGames(ids)
            const failed = new Set((result.failed ?? []).map((f) => f.id))
            setGames((cur) => cur.filter((g) => !ids.includes(g.id) || failed.has(g.id)))
            if (failed.size > 0) {
              return `${result.deleted}本を削除しました（${failed.size}本は削除できませんでした）`
            }
            return `${result.deleted}本をライブラリから削除しました`
          } catch (e) {
            // 一部だけ削除されている可能性があるので一覧を作り直す
            await refresh().catch(() => {})
            return `削除できませんでした: ${errorMessage(e)}`
          }
        }}
        onScanFolder={async () => {
          const found = await SelectAndScanFolder()
          if (found == null) return null // ダイアログのキャンセル
          return found.map(toDetectedGame)
        }}
        onScanPaths={async (paths) => {
          const found = await ScanFolders(paths)
          return (found ?? []).map(toDetectedGame)
        }}
        subscribeFileDrop={subscribeFileDrop}
        subscribeScanProgress={subscribeScanProgress}
        onImport={async (selected) => {
          let result
          try {
            result = await ImportGames(selected)
          } catch (e) {
            // ImportGames 自体の失敗（それでも一部登録済みの可能性があるため再読込）
            await refresh().catch(() => {})
            return `取り込みに失敗しました: ${errorMessage(e)}`
          }

          // トーストは早期 return せず配列に集約して最後にまとめて出す
          // （失敗項目・一覧更新・タグ更新の警告が互いを潰し合わないように）
          const messages: string[] = []
          if (result.failed && result.failed.length > 0) {
            // タイトルは先頭3件だけ表示（トーストが青天井に伸びないように。全件はログにある）
            const titles = result.failed.slice(0, 3).map((f) => f.title).join('、')
            const more = result.failed.length > 3 ? `、他${result.failed.length - 3}件` : ''
            messages.push(`取り込みに失敗した項目があります（${result.failed.length}件）: ${titles}${more}`)
          }

          if (result.refreshFailed) {
            // 登録は完了したが Go 側の一覧再取得に失敗 → refresh() でリカバリを試み、
            // それも失敗したときだけ警告する（成功すれば画面は正しいので成功扱い）
            try {
              await refresh() // ListGames + ListTags の両方を再取得
            } catch (e) {
              console.error('refresh after import:', e)
              // 二重失敗時、result.games には「この取り込みで登録できた分」が入っている。
              // 既存一覧へマージして、登録済みゲームが画面から欠落しないようにする
              const addedGames = result.games.map(toUIGame)
              setGames((cur) => {
                const have = new Set(cur.map((g) => g.id))
                return [...addedGames.filter((g) => !have.has(g.id)), ...cur]
              })
              if (addedGames.length > 0) {
                messages.push(`${addedGames.length}本を取り込みました`)
              }
              messages.push('一覧の更新に失敗しました')
            }
          } else {
            // refresh() と同じく missing は引き継ぐ（取り込み1本で既存ゲームのバッジと
            // 再指定の導線が消えないように）。新規ゲームは空文字のまま
            setGames((cur) => keepMissing(cur, result.games.map(toUIGame)))
            // タグ一覧は個別に更新（取り込みの成否とは独立。失敗は警告で通知）
            try {
              const tagList = await ListTags()
              setAllTags((tagList ?? []).map(toUITag).sort(byName))
            } catch (e) {
              console.warn('ListTags after import:', e)
              messages.push('タグ一覧の更新に失敗しました')
            }
          }

          // null なら既定の「N本を取り込みました」を表示
          return messages.length > 0 ? messages.join('\n') : null
        }}
        onResetLibrary={async () => {
          try {
            // DB・covers の消去はすべて Go 側（ゲーム本体フォルダには一切触れない）
            await ResetLibrary()
            setGames([])
            setAllTags([])
            // 成功は null（既定トーストは LibraryPage 側。onAddTag 等と同じ慣習）
            return null
          } catch (e) {
            return `データを消去できませんでした: ${errorMessage(e)}`
          }
        }}
      />
    </div>
  )
}

export default App
