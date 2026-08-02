import type { Preview } from '@storybook/react-vite'
import '@fontsource-variable/manrope'
import '@fontsource-variable/noto-sans-jp'
import '@fontsource-variable/jetbrains-mono'
import '../src/styles/global.css'

// モーダル・ドロワー・トーストのマウント時アニメーション（popIn / fadeIn / slideInRight）は
// いずれも opacity: 0 から始まる。jest-dom の toBeVisible() は祖先まで含めて
// computed opacity が '0' かどうかを見るため、play 関数がアニメーションの先頭フレームに
// 当たると「要素はあるが not visible」で落ちる。Vitest のブラウザモードは複数タブで
// テストを並走させ、非アクティブなタブではアニメーションの進行が止まるので、
// 実行のたびに落ちる件数が変わる flaky になっていた（Issue #52）。
// 検証したいのは最終的な描画結果なので、テスト実行時だけアニメーションを潰して
// 即座に最終フレームへ落ち着かせる。Storybook の UI では従来どおり再生される。
if ((globalThis as { __vitest_browser__?: boolean }).__vitest_browser__) {
  const style = document.createElement('style')
  style.textContent = `*, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
  }`
  document.head.appendChild(style)
}

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo'
    }
  },
};

export default preview;