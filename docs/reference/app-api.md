---
type: API Surface
title: Go ⇔ フロントエンド API
description: app.go でフロントにバインドしている全メソッドの契約と失敗時の振る舞い。
resource: app.go
tags: [go, frontend, wails]
verified: { by: human:e-suzuno, at: 2026-07-29 }
---

# Go ⇔ フロントエンド API

`app.go` でバインドされているメソッド一覧。TypeScript の型定義は `frontend/wailsjs/go/main/App.d.ts` に自動生成される（`wails build` / `wails dev` 時に更新。手編集禁止）。

## ライブラリ

| メソッド | 説明 |
|---|---|
| `ListGames(): store.Game[]` | 全ゲーム（タグ込み、追加日降順）。0件でも `null` にしない |
| `ListTags(): store.TagWithCount[]` | 全タグ + 付与ゲーム数。0件でも `null` にしない |
| `SetFavorite(id, fav)` | お気に入り切替 |
| `SetTool(id, tool)` | 制作ツール属性の変更（詳細ドロワーで確定）。空文字は「未判別」に正規化 |
| `RenameGame(id, title)` | 表示タイトル変更（フォルダ名・パスは不変。空文字は拒否） |
| `SelectCoverImage(id): string` | 画像選択ダイアログ → 設定フォルダへコピー → カバー設定。戻り値は新 coverPath（空文字=キャンセル）。画像は `/covers/…` で webview に配信 |
| `ResetCover(id)` | カバーを既定（手続き的グラデーション）に戻し、保存画像を削除 |
| `DeleteGame(id)` | ライブラリから登録解除。**ゲーム本体のフォルダ・ファイルには一切触れない**。アプリ管理下のカバー画像（`covers/`）だけ削除する。タグ行は温存 |
| `DeleteGames(ids): DeleteResult` | 複数まとめて登録解除（整合性チェックの一括削除）。1件の失敗で中断せず、成功分は削除して失敗分を `failed`（id / title / reason）に記録する。`{ deleted: number, failed: [] }` を返し、0件でも `failed` は `null` にしない |
| `ResetLibrary()` | 全データ消去（設定画面）。DB の全行（games / tags / game_tags、採番もリセット）と `covers/` ディレクトリを削除して初期状態に戻す。**ゲーム本体のフォルダ（folderPath 配下）には一切触れない**（アプリの不変条件）。順序は DB → covers で、DB の消去に失敗したら covers には手を付けない。covers の削除失敗はログのみで成功扱い |

## 保存先の存在確認（internal/health）

| メソッド | 説明 |
|---|---|
| `CheckMissingGames(): health.Result[]` | 全ゲームの実体（フォルダ・exe）を確認し、**見つからなかったものだけ** `{ id, missing }` で返す（0件でも `null` にしない）。`missing` は `folder`（フォルダ不在）/ `exe`（実行ファイル不在） |
| `RelinkGame(id): store.Game` | フォルダ選択ダイアログを開き、保存先を選んだフォルダへ貼り替える。exe はスキャンで再検出し、サイズも再計算する。戻り値は更新後のゲーム（**キャンセル時は ID が 0 のゼロ値**）。タイトル・タグ・お気に入り・カバーは保たれる |

**`missing` を永続化しない理由・`stat` のエラーを一律で不在とする理由・自動削除しない原則・`RelinkGame` が選択フォルダ自身の結果だけを採る理由**は [`storage-integrity.md`](../specifications/storage-integrity.md) にまとめている。

## タグ

| メソッド | 説明 |
|---|---|
| `AddTag(gameID, name, axis): store.Tag` | タグ付与。axis は**新規作成時のみ**有効（既存タグでは無視され元の axis・color を維持）。実際の軸は戻り値で確認 |
| `RemoveTag(gameID, tagID)` | タグ解除。タグ行は温存される（色・axis 保持） |
| `SetTagColor(tagID, color)` | タグ色（パレットキー）変更。タグ名ごとにグローバル |
| `CreateTag(name, axis): store.Tag` | ゲームに紐付けない新規タグ登録（タグ管理モーダルの語彙追加）。空名・既存タグとの重複は拒否。axis は genre / other のみ許容 |
| `RenameTag(tagID, name)` | タグ名の変更。付与済みの全ゲームに反映される。空名・別タグとの重複（マージはしない）・不在 ID は日本語エラー。同名への変更は no-op |
| `SetTagAxis(tagID, axis)` | タグの軸（genre / other）を変更（性質変換）。color は維持。genre / other 以外は拒否。不在 ID はエラー（`RenameTag` と同じ。`SetTagColor` の黙認とは異なる） |
| `DeleteTag(tagID)` | タグ行そのものを削除し、全ゲームから外れる（game_tags はカスケード削除）。`RemoveTag` が「1ゲームから解除・タグ行温存」なのに対し、こちらは語彙ごと消す。不在 ID は冪等成功 |

## 取り込み

| メソッド | 説明 |
|---|---|
| `SelectAndScanFolder(): scan.Detected[] \| null` | ディレクトリ選択ダイアログ → スキャン。**null はキャンセル**、空配列は「検出0件」。登録済みフォルダは候補から除外 |
| `ScanFolders(paths: string[]): scan.Detected[]` | ドラッグ&ドロップされたパス群をスキャン（ダイアログなし）。ディレクトリ以外のパスは無視。**入力パスの完全重複（末尾セパレータ・大文字小文字の違いを含む）は走査前に1つに畳む**が、親子関係にあるパスは畳まない（走査が1階層しか見ないため畳むと取りこぼす）。登録済みフォルダの除外は `SelectAndScanFolder` と同じで、複数パス間の重複検出も1件に統合。キャンセル概念が無いため戻り値は常に配列 |
| `ImportGames(items: scan.Detected[]): ImportResult` | 候補を登録。途中で失敗しても残りを続行し、`{games, failed: {title, reason}[], refreshFailed}` を返す（失敗理由はログにも記録）。`games` は空でも必ず `[]`。`refreshFailed=false` なら `games` は**全ゲーム**、`true` なら「登録完了済みだが一覧再取得に失敗」の印で `games` には**この呼び出しで登録できた分**が入る（フロントは既存一覧へマージ）。検出した制作ツール（判別不能なら「未判別」）は `games.tool` 属性として保存する（タグは作らない）。登録成功時は exe のアイコン抽出（下記）もベストエフォートで行う |

`scan.Detected`: `{ title, folderPath, exePath, sizeBytes, tool: string }`

**スキャン進捗イベント**: 両スキャンメソッドは走査中、フォルダを1つ調べるたびに Wails イベント `scan:progress` を発火する（ペイロード `{ current, total, folder }`。`current` は1始まりの通し番号、`total` は調べるフォルダ総数、`folder` はフォルダ名）。`ScanFolders` は複数パスの分母を走査前に合算して通し番号にする。フロントは `EventsOn('scan:progress', …)` で購読し、取り込みモーダルの進捗表示に使う（[`library-screen.md`](../specifications/library-screen.md) の「フォルダ取り込みモーダル」）。

取り込みフロー全体のシーケンス図は [`import-flow.md`](../processes/import-flow.md) 参照。

**何をゲームフォルダと見なし、どの exe を本命として選ぶか**（ハード除外 → helper-only 除外 → スコアリングの3層）と**制作ツールの推定**の規則は [`exe-detection.md`](../specifications/exe-detection.md) にまとめている。

### アイコン抽出による既定カバー（internal/icon）

- `ImportGames` は登録成功したゲームごとに exe の PE リソースからメインアイコン（最初の `RT_GROUP_ICON`）を読み、グループ内の最大サイズ画像を PNG 化して `covers/<id>_<ts>_icon.png` に保存、`cover_path` に設定する
- **ベストエフォート**: アイコンが無い・PE として読めない場合はログに残すだけで登録は成立し、従来どおりグラデーション既定になる
- pure Go（`github.com/tc-hib/winres` + `github.com/sergeymakinen/go-ico`）のため WSL2/Linux 開発環境でも動作する
- フロントはファイル名の `_icon.png` サフィックスでユーザー指定カバーと区別し、低解像度アイコンを全面に引き伸ばさず既定グラデーションの上に中央表示する（`lib/format.ts` の `coverBackground`）

## 起動・フォルダ

| メソッド | 説明 |
|---|---|
| `LaunchGame(id)` | 実行ファイルを起動（作業ディレクトリ=ゲームフォルダ）。プロセス監視はしない |
| `OpenGameFolder(id)` | 保存先フォルダをファイラーで表示。Windows: Explorer / WSL: wslpath 変換 + Explorer / Linux: xdg-open / macOS: open |

## エラーの扱い

- 各メソッドは Go 側の error を reject として返す（フロントは `catch` でトースト or console）
- 起動時に DB が開けなかった場合はエラーダイアログ表示後に終了。万一 API が呼ばれても「ライブラリDBが初期化されていません」を返す
