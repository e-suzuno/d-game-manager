import { useEffect, useMemo, useRef, useState } from 'react'
import './LibraryPage.css'
import type { GameSection, GroupKey, SortDir, SortKey, TagAxis, UIGame, UITag, ViewKey } from '../types'
import { SideNav, type AxisGroup } from './SideNav'
import { LibraryHeader } from './LibraryHeader'
import { StatsBar } from './StatsBar'
import { Toolbar } from './Toolbar'
import { GameTable } from './GameTable'
import { GalleryGrid } from './GalleryGrid'
import { DetailDrawer } from './DetailDrawer'
import { ImportModal, type DetectedGame, type ScanProgress } from './ImportModal'
import { SettingsModal } from './SettingsModal'
import { TagManagerModal } from './TagManagerModal'
import { Toast } from './Toast'

/** ハンドラの戻り値。文字列を返すとトースト表示される（null/void は表示なし）。非同期可 */
export type ToastResult = string | null | void | Promise<string | null | void>

export interface LibraryPageProps {
  games: UIGame[]
  /** ライブラリ全体のタグ（孤児タグ含む。「既存タグから追加」の候補と重複判定に使う） */
  allTags: UITag[]
  onToggleFavorite: (id: number) => void
  /** 制作ツール属性の変更（ドロワーの選択から呼ばれる） */
  onSetTool: (id: number, tool: string) => ToastResult
  onLaunch: (id: number) => ToastResult
  onOpenFolder: (id: number) => ToastResult
  onAddTag: (gameID: number, name: string) => ToastResult
  onRemoveTag: (gameID: number, tag: UITag) => ToastResult
  onSetTagColor: (tag: UITag, color: string) => ToastResult
  /** タグ管理（調整版ハンドオフ 変更点4）: リネームは全ゲームの同タグへ一括反映される */
  onRenameTag: (tag: UITag, name: string) => ToastResult
  /** タグ管理: 削除は全ゲームから当該タグを除去する */
  onDeleteTag: (tag: UITag) => ToastResult
  /** タグ管理: 性質変換（ジャンル ⇄ その他タグ） */
  onSetTagAxis: (tag: UITag, axis: TagAxis) => ToastResult
  /** タグ管理: マスター語彙への新規登録（この時点ではどのゲームにも未割当） */
  onCreateTag: (name: string, axis: TagAxis) => ToastResult
  onRename: (id: number, title: string) => ToastResult
  onChangeCover: (id: number) => ToastResult
  onResetCover: (id: number) => ToastResult
  /** ライブラリから削除（登録解除）。ドロワーの確認 UI を通過した後に呼ばれる */
  onDelete: (id: number) => ToastResult
  /** 保存先フォルダの再指定（移動・リネームしたゲームの復帰）。フォルダ選択は OS ダイアログ */
  onRelink: (id: number) => ToastResult
  /** 整合性チェック（設定モーダル）: 存在確認を実行し、見つからないゲームを返す */
  onCheckMissing: () => Promise<UIGame[]>
  /** 整合性チェック: 見つからないゲームの一括削除（インライン確認を通過した後に呼ばれる） */
  onDeleteMissing: (ids: number[]) => ToastResult
  /** 取り込み: フォルダ選択 + スキャン。null はダイアログのキャンセル */
  onScanFolder: () => Promise<DetectedGame[] | null>
  /** 取り込み: ドロップされたパス群のスキャン（Wails 連携。Storybook では省略可） */
  onScanPaths?: (paths: string[]) => Promise<DetectedGame[] | null>
  /** OS のファイルドロップ購読（Wails の OnFileDrop 注入。Storybook では省略可） */
  subscribeFileDrop?: (cb: (paths: string[]) => void) => () => void
  /** 取り込みスキャン進捗の購読（Wails の EventsOn 注入。Storybook では省略可） */
  subscribeScanProgress?: (cb: (p: ScanProgress) => void) => () => void
  /** 取り込み実行。文字列を返すと既定の完了トーストの代わりに表示される */
  onImport: (selected: DetectedGame[]) => ToastResult
  /**
   * 全データ消去（設定モーダルの二段階確認を通過した後に呼ばれる）。
   * null/void = 成功（既定トースト表示＋フィルタ等を初期化）、文字列 = 失敗メッセージ
   */
  onResetLibrary: () => ToastResult
}

const VIEW_TITLES: Record<ViewKey, string> = {
  all: 'すべてのゲーム',
  fav: 'お気に入り',
  untagged: '未整理（タグなし）',
  missing: '見つからないゲーム',
}

/**
 * ライブラリ画面全体。
 * 適用順: ビュー → タグフィルタ(ジャンル同士OR・その他タグ同士OR・両群間AND) →
 * 制作ツールフィルタ(OR) → 検索(タイトル|ツール|タグ) → 並び替え → グループ。
 * 統計・サイドナビの件数は全ゲーム基準で算出する。
 */
export function LibraryPage({
  games,
  allTags,
  onToggleFavorite,
  onSetTool,
  onLaunch,
  onOpenFolder,
  onAddTag,
  onRemoveTag,
  onSetTagColor,
  onRenameTag,
  onDeleteTag,
  onSetTagAxis,
  onCreateTag,
  onRename,
  onChangeCover,
  onResetCover,
  onDelete,
  onRelink,
  onCheckMissing,
  onDeleteMissing,
  onScanFolder,
  onScanPaths,
  subscribeFileDrop,
  subscribeScanProgress,
  onImport,
  onResetLibrary,
}: LibraryPageProps) {
  const [view, setView] = useState<'table' | 'gallery'>('table')
  const [query, setQuery] = useState('')
  const [nav, setNav] = useState<ViewKey>('all')
  const [tagFilters, setTagFilters] = useState<string[]>([])
  const [toolFilters, setToolFilters] = useState<string[]>([])
  const [expanded, setExpanded] = useState<Record<TagAxis, boolean>>({
    genre: true,
    other: false,
  })
  const [sortKey, setSortKey] = useState<SortKey>('added')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [groupBy, setGroupBy] = useState<GroupKey>('none')
  const [detailId, setDetailId] = useState<number | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tagMgrOpen, setTagMgrOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const notify = async (msg: ToastResult) => {
    const resolved = await msg
    if (!resolved) return
    setToast(resolved)
    clearTimeout(toastTimer.current)
    // 長いメッセージ（取り込み失敗一覧の集約等）は読み切れるよう文字数に応じて延長する
    const ms = Math.min(8000, Math.max(2200, resolved.length * 60))
    toastTimer.current = setTimeout(() => setToast(null), ms)
  }

  const byView = (g: UIGame) =>
    nav === 'fav'
      ? g.favorite
      : nav === 'untagged'
        ? g.tags.length === 0
        : nav === 'missing'
          ? !!g.missing
          : true
  // タグ名 → 軸の解決表。フィルタはタグ名で持つため、軸はライブラリ全体のタグから引く
  const axisOf = useMemo(() => new Map(allTags.map((t) => [t.name, t.axis])), [allTags])
  // 調整版ハンドオフ 変更点5: ジャンル同士は OR、その他タグ同士も OR、両群の間は AND（軸不明は other 扱い）
  const genreFilters = tagFilters.filter((f) => axisOf.get(f) === 'genre')
  const otherFilters = tagFilters.filter((f) => axisOf.get(f) !== 'genre')
  const byTags = (g: UIGame) => {
    const has = (name: string) => g.tags.some((t) => t.name === name)
    return (
      (genreFilters.length === 0 || genreFilters.some(has)) &&
      (otherFilters.length === 0 || otherFilters.some(has))
    )
  }
  // 制作ツールは1ゲーム1値のため複数選択は OR
  const byTool = (g: UIGame) => toolFilters.length === 0 || toolFilters.includes(g.tool)
  // 大文字小文字を区別しない部分一致（Unity を unity でもヒットさせる）。tool 属性も検索対象
  const q = query.toLowerCase()
  const byQuery = (g: UIGame) =>
    !q ||
    g.title.toLowerCase().includes(q) ||
    g.tool.toLowerCase().includes(q) ||
    g.tags.some((t) => t.name.toLowerCase().includes(q))

  const filtered = useMemo(() => {
    const list = games.filter((g) => byView(g) && byTags(g) && byTool(g) && byQuery(g))
    // 降順は比較関数へ方向符号を掛けて表現する。配列全体の reverse だと同値区間の
    // タイブレーク順まで反転するが、符号を掛けても比較結果 0（同値）は 0 のままなので
    // 安定ソートが入力配列の元順序を保つ（同一秒 addedAt の一括インポート順を維持）
    const dir = sortDir === 'desc' ? -1 : 1
    const sorters: Record<SortKey, (a: UIGame, b: UIGame) => number> = {
      added: (a, b) => dir * a.addedAt.localeCompare(b.addedAt),
      title: (a, b) => dir * a.title.localeCompare(b.title, 'ja'),
      size: (a, b) => dir * (a.sizeBytes - b.sizeBytes),
    }
    list.sort(sorters[sortKey])
    return list
  }, [games, nav, tagFilters, axisOf, toolFilters, q, sortKey, sortDir])

  const sections = useMemo<GameSection[]>(() => {
    const list = filtered
    if (groupBy === 'none') {
      return [{ label: '', count: list.length, games: list, showHeader: false }]
    }
    const map = new Map<string, UIGame[]>()
    const push = (key: string, g: UIGame) => {
      let arr = map.get(key)
      if (!arr) {
        arr = []
        map.set(key, arr)
      }
      arr.push(g)
    }
    if (groupBy === 'tool') {
      // 制作ツールは属性ベース。常に値を持つので「未判別」も独立グループになる
      for (const g of list) push(g.tool, g)
    } else {
      for (const g of list) {
        // 該当軸のタグを複数持つゲームは各グループに重複して表示する
        const keys = g.tags.filter((t) => t.axis === groupBy).map((t) => t.name)
        if (keys.length === 0) push('未分類', g)
        else keys.forEach((key) => push(key, g))
      }
    }
    return [...map.keys()]
      .sort((a, b) => a.localeCompare(b, 'ja'))
      .map((label) => {
        const gs = map.get(label)!
        return { label, count: gs.length, games: gs, showHeader: true }
      })
  }, [filtered, groupBy])

  // グループ化で1ゲームが複数グループに重複しても、ヘッダー件数は絞り込み後の実数を出す
  const totalCount = filtered.length

  const counts = useMemo(
    () => ({
      all: games.length,
      fav: games.filter((g) => g.favorite).length,
      untagged: games.filter((g) => g.tags.length === 0).length,
      missing: games.filter((g) => g.missing).length,
    }),
    [games],
  )

  // 「見つからない」ビューは該当0件だとサイドナビから消えるため、選択されたまま
  // 空の一覧が残らないように「すべて」へ戻す（削除・再紐付けで解消したケース）
  useEffect(() => {
    if (nav === 'missing' && counts.missing === 0) setNav('all')
  }, [nav, counts.missing])

  // 制作ツールフィルタの候補: ライブラリ内の出現順 distinct（未判別含む）
  const allTools = useMemo(() => [...new Set(games.map((g) => g.tool))], [games])
  const toolItems = useMemo(
    () => allTools.map((name) => ({ name, active: toolFilters.includes(name) })),
    [allTools, toolFilters],
  )

  // タグ ID → 使用ゲーム数（タグ管理モーダルの「N 本」表示と削除確認に使う）
  const tagCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const g of games) {
      for (const t of g.tags) counts.set(t.id, (counts.get(t.id) ?? 0) + 1)
    }
    return counts
  }, [games])

  const groups = useMemo<AxisGroup[]>(() => {
    // allTags を土台にする（未割当の孤児タグも件数0でフィルタ候補に出す。
    // タグ管理で登録した語彙が即座に出現するため）。件数降順、0件は自然と末尾に並ぶ
    const axes: TagAxis[] = ['genre', 'other']
    return axes.map((axis) => ({
      axis,
      items: allTags
        .filter((t) => t.axis === axis)
        .map((t) => ({
          name: t.name,
          count: tagCounts.get(t.id) ?? 0,
          active: tagFilters.includes(t.name),
        }))
        .sort((a, b) => b.count - a.count),
    }))
  }, [allTags, tagCounts, tagFilters])

  // 総容量の GB 表記（全ゲーム基準）。StatsBar と設定モーダルで同じ値を使う
  const totalSizeGB = useMemo(
    () => (games.reduce((s, g) => s + g.sizeBytes, 0) / 1024 ** 3).toFixed(1),
    [games],
  )

  const stats = useMemo(
    () => [
      { label: '総ゲーム数', value: games.length, unit: '本' },
      { label: '総容量', value: totalSizeGB, unit: 'GB' },
      { label: 'お気に入り', value: counts.fav, unit: '本' },
      { label: '未整理', value: counts.untagged, unit: '本' },
    ],
    [games, counts, totalSizeGB],
  )

  const toggleTag = (name: string) =>
    setTagFilters((cur) => (cur.includes(name) ? cur.filter((t) => t !== name) : [...cur, name]))
  const toggleTool = (name: string) =>
    setToolFilters((cur) => (cur.includes(name) ? cur.filter((t) => t !== name) : [...cur, name]))

  const detail = detailId != null ? games.find((g) => g.id === detailId) : undefined

  return (
    <div className="library-page">
      <SideNav
        view={nav}
        counts={counts}
        onViewChange={setNav}
        tools={toolItems}
        onToggleTool={toggleTool}
        groups={groups}
        expanded={expanded}
        onToggleExpand={(a) => setExpanded((e) => ({ ...e, [a]: !e[a] }))}
        onToggleTag={toggleTag}
        onManageTags={() => setTagMgrOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        onImport={() => setImportOpen(true)}
      />
      <div className="library-page__main">
        <LibraryHeader
          title={VIEW_TITLES[nav]}
          count={totalCount}
          query={query}
          onQueryChange={setQuery}
          view={view}
          onViewChange={setView}
        />
        <StatsBar stats={stats} />
        <Toolbar
          tools={toolItems}
          activeTools={toolFilters}
          onToggleTool={toggleTool}
          groups={groups}
          activeTags={tagFilters}
          onToggleTag={toggleTag}
          onClearTools={() => setToolFilters([])}
          onClearTags={() => setTagFilters([])}
          onClearFilters={() => {
            setTagFilters([])
            setToolFilters([])
          }}
          sortKey={sortKey}
          sortDir={sortDir}
          onSortKey={setSortKey}
          onToggleSortDir={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
          groupBy={groupBy}
          onGroupBy={setGroupBy}
        />
        <div className="library-page__content">
          {view === 'table' ? (
            <GameTable
              sections={sections}
              onOpen={setDetailId}
              onToggleFavorite={onToggleFavorite}
              onLaunch={(id) => notify(onLaunch(id))}
            />
          ) : (
            <GalleryGrid sections={sections} onOpen={setDetailId} onToggleFavorite={onToggleFavorite} />
          )}
        </div>
      </div>

      {detail && (
        <DetailDrawer
          game={detail}
          allTags={allTags}
          allTools={allTools}
          onClose={() => setDetailId(null)}
          onSetTool={(tool) => notify(onSetTool(detail.id, tool))}
          onLaunch={() => notify(onLaunch(detail.id))}
          onOpenFolder={() => notify(onOpenFolder(detail.id))}
          onAddTag={(name) => notify(onAddTag(detail.id, name))}
          onRemoveTag={(tag) => notify(onRemoveTag(detail.id, tag))}
          onSetTagColor={(tag, color) => notify(onSetTagColor(tag, color))}
          onRename={(title) => notify(onRename(detail.id, title))}
          onChangeCover={() => notify(onChangeCover(detail.id))}
          onResetCover={() => notify(onResetCover(detail.id))}
          onDelete={() => {
            // 削除後のドロワーは対象を失うため先に閉じる
            setDetailId(null)
            notify(onDelete(detail.id))
          }}
          // 貼り替え後も同じゲームを見続けるのでドロワーは開いたままにする
          onRelink={() => notify(onRelink(detail.id))}
        />
      )}

      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onScan={onScanFolder}
          onScanPaths={onScanPaths}
          subscribeFileDrop={subscribeFileDrop}
          subscribeScanProgress={subscribeScanProgress}
          onError={(msg) => notify(msg)}
          onImport={async (selected) => {
            setImportOpen(false)
            // ハンドラがメッセージを返したらそれを優先（部分失敗の通知など）
            const msg = await onImport(selected)
            notify(msg ?? `${selected.length}本を取り込みました`)
          }}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          gameCount={games.length}
          totalSize={`${totalSizeGB} GB`}
          onClose={() => setSettingsOpen(false)}
          onManageTags={() => {
            // 設定を閉じてからタグ管理を開く（プロトタイプ openTagMgrFromSettings 準拠）
            setSettingsOpen(false)
            setTagMgrOpen(true)
          }}
          onClearAll={async () => {
            // ハンドラの戻り値: null/void = 成功、文字列 = 失敗（エラーメッセージ）
            const msg = await onResetLibrary()
            if (msg == null) {
              // 消去成功時のみ絞り込み・検索・ドロワー・ビューを初期化する（プロトタイプ
              // clearAll 準拠）。sortKey / sortDir / groupBy / view（テーブル・ギャラリー）/
              // expanded は維持する
              setTagFilters([])
              setToolFilters([])
              setDetailId(null)
              setNav('all')
              setQuery('')
            }
            setSettingsOpen(false)
            notify(msg ?? 'すべてのデータを消去しました')
          }}
          onCheckMissing={onCheckMissing}
          onDeleteMissing={async (ids) => {
            // 削除対象のゲームを開いていたらドロワーは対象を失うので閉じる
            if (detailId != null && ids.includes(detailId)) setDetailId(null)
            await notify(onDeleteMissing(ids))
          }}
        />
      )}

      {tagMgrOpen && (
        <TagManagerModal
          tags={allTags}
          counts={tagCounts}
          onClose={() => setTagMgrOpen(false)}
          onRename={async (tag, name) => {
            const old = tag.name
            const msg = await onRenameTag(tag, name)
            // 成功時はタグフィルタの旧名を新名へ置換して絞り込みを維持する
            if (msg == null) setTagFilters((cur) => cur.map((n) => (n === old ? name : n)))
            notify(msg ?? `「${old}」を「${name}」に変更しました`)
          }}
          onSetColor={(tag, color) => notify(onSetTagColor(tag, color))}
          onConvertAxis={async (tag) => {
            const axis: TagAxis = tag.axis === 'genre' ? 'other' : 'genre'
            const msg = await onSetTagAxis(tag, axis)
            notify(
              msg ??
                (axis === 'genre'
                  ? `「${tag.name}」をジャンルにしました`
                  : `「${tag.name}」をその他タグにしました`),
            )
          }}
          onDelete={async (tag) => {
            const msg = await onDeleteTag(tag)
            // 成功時は当該タグをフィルタからも除去する
            if (msg == null) setTagFilters((cur) => cur.filter((n) => n !== tag.name))
            notify(msg ?? `「${tag.name}」を削除しました`)
          }}
          onCreate={(name, axis) => notify(onCreateTag(name, axis))}
          onDuplicate={() => notify('同じ名前のタグが既にあります')}
        />
      )}

      <Toast message={toast} />
    </div>
  )
}
