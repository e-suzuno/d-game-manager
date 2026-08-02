import { describe, expect, it } from 'vitest'
import { isEnterConfirm } from './keyboard'

/**
 * Issue #29: 日本語IME変換確定のためのEnterキー押下が、インライン編集の
 * 「確定・保存」操作としてそのまま拾われてしまうバグの回帰テスト。
 *
 * isEnterConfirm は「Enter キーによる確定操作か」を判定する共通ヘルパー
 * （まだ実装は存在しない = このテストは RED を確認するためのもの）。
 * IME変換中・変換確定の Enter では true を返してはいけない。
 */
describe('isEnterConfirm', () => {
  it('Enter キーかつ isComposing が false のとき true を返す（通常の確定操作）', () => {
    expect(isEnterConfirm({ key: 'Enter', nativeEvent: { isComposing: false } })).toBe(true)
  })

  it('Enter キーかつ isComposing が true のとき false を返す（IME変換確定中のEnterは確定操作ではない）', () => {
    expect(isEnterConfirm({ key: 'Enter', nativeEvent: { isComposing: true } })).toBe(false)
  })

  it('key が "Process"（IME変換中にブラウザが送る代替キー値）のとき false を返す', () => {
    expect(isEnterConfirm({ key: 'Process', nativeEvent: { isComposing: false } })).toBe(false)
  })

  it('Enter 以外のキーのとき false を返す', () => {
    expect(isEnterConfirm({ key: 'a', nativeEvent: { isComposing: false } })).toBe(false)
  })
})
