// React.KeyboardEvent<HTMLInputElement> の必要最小限の形。単体テストではプレーンな
// オブジェクトリテラルを渡すため、フル形状ではなく利用箇所（key / nativeEvent.isComposing）
// だけを要求する形にしている（実際の KeyboardEvent はこの形の上位互換なのでそのまま渡せる）
interface EnterKeyEvent {
  key: string
  nativeEvent: { isComposing: boolean }
}

/**
 * Enter キーによる確定操作かどうかを判定する（Issue #29）。
 * IME変換確定のための Enter は確定操作として扱ってはいけない。
 * `isComposing` は明示的にチェックしているが、変換中の代替キー値 `Process` は
 * `e.key === 'Enter'` の時点で false になるため自然に除外される（個別の分岐はない）
 */
export function isEnterConfirm(e: EnterKeyEvent): boolean {
  return e.key === 'Enter' && !e.nativeEvent.isComposing
}
