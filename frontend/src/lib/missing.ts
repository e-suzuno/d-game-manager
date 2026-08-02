import type { UIGame } from '../types'

/**
 * next（Go の一覧取得結果）に、current が持っている missing を id で引き継ぐ。
 *
 * missing は `ListGames` / `ImportGames` が返さない **UI 専用の状態**で、値が入るのは
 * 存在確認（`CheckMissingGames`）のときだけ。引き継がずに上書きすると、取り込みや
 * 失敗時の再読込のたびにバッジ・「見つからない」ビュー・ドロワーの警告バナー
 * （＝保存先を指定し直す唯一の導線）が消えてしまう。
 *
 * - next に無いゲーム（削除済み）は結果から落ちる
 * - next にしかいないゲーム（新規取り込み）は next の値（通常は空文字）のまま
 * - 引き継いでも値が変わらないゲームは同じオブジェクトを返す（不要な再描画を避ける）
 */
export function keepMissing(current: UIGame[], next: UIGame[]): UIGame[] {
  const byId = new Map(current.map((g) => [g.id, g.missing]))
  return next.map((g) => {
    const kept = byId.get(g.id)
    return kept === undefined || kept === g.missing ? g : { ...g, missing: kept }
  })
}
