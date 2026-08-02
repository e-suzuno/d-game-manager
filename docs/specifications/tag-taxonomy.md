---
type: Specification
title: タグは genre / other の2軸でユーザーが手で付ける
description: タグ軸は genre / other の2軸で、色はタグ名ごとにグローバル、語彙の管理（リネーム・色・軸変換・削除・新規登録）はタグ管理モーダルで行う。
resource: internal/store/store.go
tags: [go, sqlite, ui]
generated: { by: claude-code/opus-5, at: 2026-07-25T00:00:00Z }
verified: { by: human:e-suzuno, at: 2026-08-02 }
not:
  - term: "タグ軸は genre / tool / other の3軸"
    why: "制作ツールが属性化された（調整版ハンドオフ 変更点3）ため tool 軸は使われなくなった。tags.axis の CHECK 制約に 'tool' が残っているのは、SQLite が CHECK の ALTER をできずテーブル再作成のコストを避けた歴史的経緯にすぎない"
    instead: "genre / other の2軸。アプリからは tool 軸タグを二度と作らない（AddTag 経路では未知の axis を other に丸め、CreateTag / SetTagAxis では拒否する）"
  - term: "タグ行はゲームから外されて孤児になった時点で削除する"
    why: "ユーザーが設定した色と軸まで一緒に失われ、付け直しても復元できなかったため、2026-07-21 のコードレビューで方式を変えた"
    instead: "タグ行は温存する。消えるのはタグ管理からの明示的な削除（DeleteTag）のときだけ"
sources:
  - id: handoff-base
    title: 基本デザインハンドオフ「タグの色システム」
    last_modified: 2026-07-21
  - id: handoff-adjusted
    title: 調整版デザインハンドオフ 変更点4「タグ管理ページ」
    last_modified: 2026-07-23
---

# タグは genre / other の2軸でユーザーが手で付ける

タグは**ユーザーが手動で付ける分類**で、軸は **genre（ジャンル）/ other（その他タグ）の2軸**。ジャンルや進行状況の記録に使う。

> **Not:** タグ軸に `tool` は無い（制作ツールは属性 — [`tool-attribute.md`](tool-attribute.md)）。また、タグ行は孤児になっても削除しない。

## 規則

- **名前は一意**。登録経路（`AddTag` / `CreateTag` / `RenameTag`）によらず `TrimSpace` してから保存する。前後の空白の違いだけで別タグが併存するのを防ぐため
- **検索・サジェストは大文字小文字を区別しない**
- **軸は作成時に決まる。** 同名タグを別の軸で追加しようとした場合は既存タグ（元の軸）が使われる。明示的な変更は `SetTagAxis`（genre ↔ other）で行い、色は維持される
- **色はタグ名ごとにグローバル。** 同じタグを持つ全ゲームで同色になる。未設定時の既定色は軸で決まる（**genre → blue / other → gray**）
- **タグは語彙として先行登録できる。** どのゲームにも付いていない（count 0 の）タグも `ListTags` に現れ、サイドナビの候補やフィルタ軸に出る
- **サイドナビのタグ候補は全語彙基準**で並べる（使用中のタグだけに絞らない）
- **グループ化では、同一軸に複数タグを持つゲームは複数のグループに重複して現れる**

## タグ行のライフサイクル

| 操作 | タグ行 |
|---|---|
| ゲームを削除 | **残る**（`game_tags` はカスケード削除） |
| ゲームからタグを外す（`RemoveTag`） | **残る**（色・軸を保持し、付け直しで復元できる） |
| タグ管理から削除（`DeleteTag`） | **消える**（`game_tags` はカスケードで全ゲームから外れる） |

タグ行を温存するのは、ユーザーが設定した色と軸が**そのタグに対する設定**であり、たまたま今どのゲームにも付いていないことと無関係だからである。孤児削除方式では、最後の1件を外した瞬間に色の設定が失われて戻せなかった。

## 語彙の管理

リネーム・色変更・軸変換（genre ↔ other）・削除・新規登録は**タグ管理モーダル**で行い、**変更は付与済みの全ゲームに反映される**。

- リネームは空名・別タグとの重複を拒否する（**マージはしない**）
- 新規登録した語彙はどのゲームにも未割当のまま候補に出る
- UI の詳細は [`library-screen.md`](library-screen.md) の「タグ管理モーダル」

## 実装

| 関心 | 参照先 |
|---|---|
| スキーマ・`axis` の CHECK 制約・ライフサイクル規則 | [`data-model.md`](../reference/data-model.md) |
| `AddTag` / `RemoveTag` / `CreateTag` / `RenameTag` / `SetTagColor` / `SetTagAxis` / `DeleteTag` の契約 | [`app-api.md`](../reference/app-api.md) |
| 絞り込みでの AND/OR | [`tag-filter.md`](tag-filter.md) |
| 9色パレットの値・既定色 | [`design-tokens.md`](../reference/design-tokens.md) |

**サイドナビ・フィルタのチェックボックスはタグ色と紐づけない**（一律アクセント紫）。軸見出しに色付きの四角も置かない — 値行のチェックボックスと色がかぶって「チェック済み」に見えるため撤去された。
