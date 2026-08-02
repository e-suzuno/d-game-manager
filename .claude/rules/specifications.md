---
paths:
  - "**/*.go"
  - "frontend/src/**"
---

# 確定済みの仕様

**正典は `docs/specifications/` にある。** 仕様を確認・変更するときは以下を読むこと（ここに本文を書くと二重管理になるため要点と導線だけを置く）。

| 仕様 | 正典 |
|---|---|
| 制作ツールは `Game.tool` の一級属性（判別不能は「未判別」を一級状態として保存） | `docs/specifications/tool-attribute.md` |
| タグは genre / other の2軸。色はタグ名ごとにグローバル、語彙管理はタグ管理モーダル | `docs/specifications/tag-taxonomy.md` |
| 絞り込みはジャンル同士 OR・その他タグ同士 OR・両群間 AND。制作ツールは独立フィルタで OR。適用順は ビュー → タグ → 制作ツール → 検索 | `docs/specifications/tag-filter.md` |
| .exe の自動検出は取り込み時のスキャンのみ。3層（ハード除外 → helper-only 除外 → スコアリング）で1つ選ぶ | `docs/specifications/exe-detection.md` |
| 実体が消えたゲームは検出して知らせるが**自動削除はしない** | `docs/specifications/storage-integrity.md` |
| 画面・インタラクション・状態の全体 | `docs/specifications/library-screen.md` |

特に外しやすい前提は `CLAUDE.md` の「特に外しやすい前提」に常時ロードで置いてある。
