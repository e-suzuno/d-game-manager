---
type: Architecture
title: 主要なデータフロー
description: 起動・取り込み・編集・存在確認・起動といった操作が Go とフロントエンドの間をどう流れるか。
tags: [go, frontend, wails]
verified: { by: human:e-suzuno, at: 2026-07-25 }
---

# 主要なデータフロー

レイヤの構造と各パッケージの責務は [`overview.md`](overview.md) を参照。ここでは操作ごとに、どのレイヤをどの順で通るかをまとめる。

## 起動

`main.go` が `App` を生成して DB を初期化し、フロントが `ListGames` / `ListTags` を呼んで初期表示する。

DB を開けなかった場合はエラーダイアログを出して終了する。万一その後に API が呼ばれても「ライブラリDBが初期化されていません」を返す。

## 保存先の存在確認

初期表示のあと、フロントが `CheckMissingGames` を**非同期で**呼ぶ。`internal/health` が `stat` を並列に走らせ、見つからなかったゲームだけを `{ id, missing }` で返す。

一覧取得（`ListGames`）に存在確認を埋め込まないのは、未接続のネットワークドライブ等で `stat` が待たされると初回描画がブロックされるため。結果に含まれないゲームの `missing` は空に戻すので、実体が復帰したケースの反映も兼ねる。

判定結果は DB に持たない実行時の値で、**これを根拠に行を自動削除することはしない**。

## 取り込み

```
ダイアログ経路: SelectAndScanFolder → （scan）→ レビュー → ImportGames
D&D 経路:      ScanFolders(paths) → （scan）→ レビュー → ImportGames
```

`ImportGames` は途中で失敗しても残りを続行し、成功分と失敗理由を返す。登録が成功したゲームごとに `internal/icon` が exe のアイコン抽出を試み、取れれば既定カバーになる（失敗はログのみ）。

詳細なシーケンスとエッジケースは [`import-flow.md`](../processes/import-flow.md) にある。

## タグ・お気に入り・タイトル・カバーの編集

フロントで**楽観的に**反映してから、対応する `app.go` の API を呼ぶ。失敗した場合は `refresh()` で実データを取り直して巻き戻す。

この方針は `App.tsx` に集約されており、個々のコンポーネントは props とコールバックだけを受け取る表示専用として保たれている。

## カバー表示

`games.cover_path` が空なら手続き的グラデーション（`lib/format.ts` で id から生成）、指定ありなら `/covers/…` から画像を配信する。

`/covers/` は埋め込みアセットに無いため、`main.go` の独自 AssetServer ハンドラがユーザーデータフォルダを配信している。アイコン抽出由来のカバーはファイル名の `_icon.png` サフィックスで区別され、低解像度画像を全面に引き伸ばさず既定グラデーションの上に中央表示する。

## ゲームの起動・フォルダ表示

`LaunchGame` / `OpenGameFolder` が `internal/launch` に委譲する。起動は作業ディレクトリをゲームフォルダに設定して exec するだけで、**プロセス監視はしない**（プレイ時間や進行状況を自動取得しない方針のため）。

フォルダ表示は OS ごとに分岐する（Windows: Explorer / WSL: `wslpath -w` + `explorer.exe` / Linux: `xdg-open` / macOS: `open`）。
