---
type: Flow
title: フォルダ取り込みの処理フロー
description: 「フォルダを取り込む」からスキャン・レビューを経て登録に至るまでの内部処理とエッジケース。
resource: internal/scan/scan.go
tags: [go, frontend]
verified: { by: human:e-suzuno, at: 2026-07-29 }
---

# フォルダ取り込みの処理フロー

「フォルダを取り込む」→ スキャン → レビュー → 登録 の内部処理。実装は
`frontend/src/components/ImportModal.tsx` / `app.go` / `internal/scan/scan.go` / `internal/store/store.go`。

## 全体シーケンス

```mermaid
sequenceDiagram
    actor U as ユーザー
    participant M as ImportModal<br>(React)
    participant A as App.tsx
    participant G as App (Go)
    participant OS as OS ダイアログ
    participant S as scan パッケージ
    participant DB as store (SQLite)

    U->>M: 「フォルダを取り込む」クリック
    Note over M: step: drop

    alt ドロップゾーンをクリック
        U->>M: フォルダを選択
        Note over M: step: scanning（スピナー）
        M->>A: onScan()
        A->>G: SelectAndScanFolder()
        G->>OS: OpenDirectoryDialog
        OS-->>G: フォルダパス（空文字=キャンセル）
        alt キャンセル
            G-->>A: null
            A-->>M: null
            Note over M: step: drop に戻る
        else フォルダ選択
            G->>S: ScanFolder(dir)
            S-->>G: Detected[]（候補一覧）
        end
    else OS からフォルダをドラッグ&ドロップ
        U->>M: ドロップゾーンへドロップ
        Note over M: OnFileDrop → onScanPaths(paths)<br>step: scanning
        M->>A: onScanPaths(paths)
        A->>G: ScanFolders(paths)
        Note over G: ディレクトリ以外は無視<br>入力パスの完全重複は走査前に統合<br>複数パスの重複検出も統合
        G->>S: ScanFolder(各 dir)
        S-->>G: Detected[]（候補一覧）
    end

    G->>DB: HasFolders(候補の folderPath 一覧)
    DB-->>G: 登録済みのものを候補から除外
    G-->>A: Detected[]（未登録のみ）
    A-->>M: DetectedGame[]
    Note over M: step: review（全件チェック済みで表示）

    U->>M: 取り込む項目を選択 →「N本を取り込む」
    M->>A: onImport(selected)
    A->>G: ImportGames(selected)
    loop 各選択項目
        G->>DB: AddGame(title, exePath, folderPath, size, tool)
        Note over DB: games INSERT<br>（tool 属性込み。タグは作らない）
        Note over G: 失敗しても中断せず<br>failed[] に記録して続行
        G->>G: applyIconCover（ベストエフォート）<br>exe のアイコン → PNG → covers/ → cover_path
        Note over G: アイコンが無い等の失敗は<br>ログのみ（グラデーション既定のまま）
    end
    G->>DB: ListGames()
    DB-->>G: 全ゲーム
    G-->>A: ImportResult{games, failed, refreshFailed}
    A->>A: setGames(games)（成功分は必ず反映）<br>refreshFailed 時は refresh() でリカバリ
    alt 警告あり（登録失敗 / 一覧更新失敗 / タグ更新失敗）
        Note over M: 警告を改行区切りで集約して<br>1つのトーストに表示
    else すべて成功
        Note over M: トースト「N本を取り込みました」
    end
```

## スキャンの内部ロジック（`scan.ScanFolder`）

```mermaid
flowchart TD
    A["ScanFolder(root)"] --> B{"root 自体が<br>ゲームフォルダ?<br>(detectGame)"}
    B -- はい --> C["その1件を返す"]
    B -- いいえ --> D["root 直下の<br>サブフォルダを列挙"]
    D --> E{"各サブフォルダで<br>detectGame"}
    E -- 検出 --> F["候補に追加"]
    E -- exe なし --> G["スキップ"]
    F --> H["タイトル順にソートして返す"]

    subgraph detectGame["detectGame(dir)"]
        P1["pickExe: フォルダ直下の .exe を列挙"] --> P2{"ハード除外・helper-only を除く<br>unins*/vcredist* 等（前方一致）<br>crashreport.exe 等（完全一致）<br>install/config2/installer/SetupTool<br>（補助ツールそのもの）"}
        P2 -- "実質候補なし → 非ゲーム" --> PX["検出なし"]
        P2 -- "候補あり" --> P3["本命らしさスコアで1つ選ぶ<br>完全一致(+100) > Game.exe(+80) ><br>双方向包含(+50) > 一般名(0)<br>setup 等含む名前は -10<br>同点は決定的タイブレーク"]
        P3 --> P4["detectTool: エンジン判別"]
        P4 --> P5["folderSize: 配下の合計サイズ"]
        P5 --> P6["Detected{title=フォルダ名, exe, size, tool}"]
    end
```

### エンジン判別の根拠（`detectTool`）

フォルダ直下のファイル / ディレクトリ名で判定する（優先順に評価）:

| 判定 | 根拠となるファイル構成 | `tool` の値 |
|---|---|---|
| Unity | `<exe名>_Data/` ディレクトリ | `Unity` |
| WOLF RPG | `*.wolf`（例: `Data.wolf`） | `WOLF RPG` |
| Godot | `<exe名>.pck` | `Godot` |
| RPGツクール VX/XP系 | `*.rgss3a` / `*.rgss2a` / `*.rgssad` | `RPGツクール` |
| RPGツクール MV/MZ | NW.js 構成（`nw.dll` / `nw_elf.dll`）＋ `www/` ディレクトリ または `Game.exe` | `RPGツクール` |
| ティラノ | `tyrano/` または `tyrano_data/` ディレクトリ | `ティラノ` |
| 判別不能 | 上記どれにも該当しない | `未判別` |

- 判別したツール名は **`games.tool` 属性**として保存される（タグは作らない。調整版ハンドオフ 変更点3）。取り込み後にドロワーの `SetTool` で変更できる
- タイトルは**フォルダ名**をそのまま使う（取り込み後にドロワーで変更可能）
- exe の探索は**フォルダ直下のみ**（サブフォルダの exe は見ない）。サイズ集計は配下すべてを再帰的に合計

## エラー・エッジケースの扱い

| ケース | 挙動 |
|---|---|
| ダイアログをキャンセル | `null` が返り、モーダルは drop 画面に戻る |
| .exe が1つも見つからない | 空配列 → review 画面に「ゲームが見つかりませんでした」 |
| 全候補が登録済み | 同上（`HasFolders` で除外された結果 0 件） |
| 同じフォルダを重複してドロップ | 走査前に1つに畳む（`normFolderKey` で `filepath.Clean` ＋ 小文字化するので、末尾セパレータ違い・大文字小文字違いも同一とみなす）。走査時間の大半は `folderSize` なので二重走査を避け、進捗の分母も水増ししない |
| 親フォルダと子フォルダを同時にドロップ | **どちらも走査する**（畳まない）。走査は1階層しか見ないため、親の走査では子の配下にあるゲームに届かない。畳むと取りこぼす（[Issue #50](https://github.com/e-suzuno/d-game-manager/issues/50)）。同じフォルダが両方から検出された場合は結果側の重複排除で1件になる |
| スキャン中の読み取りエラー | エラーを reject → モーダルは drop 画面に戻る |
| 登録時の失敗（DB エラー等） | 失敗した項目だけ `failed[]` に記録して残りは続行。トーストに失敗件数とタイトルを表示（成功分は一覧に反映） |
| 登録後の一覧再取得に失敗 | `refreshFailed=true` → フロントが `refresh()` でリカバリ。それも失敗したときは `games`（この取り込みで登録できた分）を既存一覧へマージして表示し、「N本を取り込みました」+「一覧の更新に失敗しました」を警告 |
| 直下に複数ゲームの exe が混在する1フォルダ | **1件として検出**（exe は優先順位で1つだけ選択、サイズは合算）。1フォルダ=1ゲームが前提のため、フォルダを分けて取り込む |
| ゲームフォルダの中にゲームが入れ子 | 親の1件だけ検出（root がゲームと判定された時点で打ち切り）。子は**子フォルダを直接選択**すれば別ゲームとして登録可能 |
| ファイルをドロップ（フォルダでない） | `ScanFolders` が読み飛ばす。全部ファイルなら検出0件として review 画面へ |
| exe にアイコンリソースが無い | カバーは従来どおりグラデーション既定（ログに抽出スキップを記録） |

## ドラッグ&ドロップの実装メモ

- `main.go` の `DragAndDrop{EnableFileDrop: true}` で Wails のネイティブ D&D を有効化。ドロップを受け付けるのは CSS で `--wails-drop-target: drop` を宣言した要素（= ImportModal のドロップゾーン）だけ
- ドラッグ中は Wails が `wails-drop-target-active` クラスを付与するので、hover と同じハイライトを当てている
- コンポーネント純粋性の方針（Go / wailsjs 依存はトップレベル隔離）のため、`OnFileDrop` の購読は `App.tsx` から `subscribeFileDrop` として注入する。ImportModal は drop ステップの間だけ購読する（Storybook では模擬ボタンで発火）

### 購読できるのは1箇所だけ（2箇所目を足す前に読む）

Wails ランタイムの `OnFileDrop` / `OnFileDropOff` は**アプリ全体で1組しか持てない**。実装は `github.com/wailsapp/wails/v2@v2.13.0/internal/frontend/runtime/desktop/draganddrop.js`。

- `OnFileDrop` は `flags.registered` を見て、2回目以降の登録を**警告もエラーも出さずに無視する**。2箇所目のコールバックは置き換わるのでも累積するのでもなく、単に捨てられる
- `OnFileDropOff` は引数を取らず、`EventsOff("wails:file-drop")` でそのイベント名の全リスナを一括削除する。`dragover` / `dragleave` / `drop` の window リスナも外れるため `wails-drop-target-active` のハイライトも止まる。`flags.registered` も false に戻る

現在 `OnFileDrop` を購読しているのは ImportModal の1箇所だけなので**実害はない**（`App.tsx` の `subscribeFileDrop` が返す解除関数は素で `OnFileDropOff()` を呼ぶ）。ただし2箇所目が購読した瞬間に次の2つが同時に起きる。

- 2箇所目のコールバックは一度も呼ばれない（登録が無視されるため）
- どちらか一方がアンマウントすると、残った側のドロップ受付も死ぬ（全解除されるため）

どちらも例外もログも出ないので、症状から原因に辿り着くのが難しい。**2箇所目を足すときは `subscribeFileDrop` を購読箇所の集合で管理する形に変えること**（登録が0→1になったときだけ `OnFileDrop`、1→0になったときだけ `OnFileDropOff` を呼ぶ）。その際の注意点は2つ。

- `OnFileDropOff` で `flags.registered` が false に戻るため、**0→1 の再購読では必ず `OnFileDrop` を呼び直す**。忘れると2回目にモーダルを開いたときドロップが死ぬ
- `useDropTarget` は初回登録時の値が焼き付いて以降は無視される。購読ごとに違う値を渡せるように見せてはいけない（現状は全箇所 `true` 固定）

経緯は [Issue #51](https://github.com/e-suzuno/d-game-manager/issues/51)。**コードは未修正のまま**で、この記録が2箇所目を足す時点でのガードを兼ねている。

## 補足

- プロトタイプにあった「約1.4秒のスキャン演出」は実装していない。実際のスキャン時間（フォルダサイズ集計に依存）だけスピナーが表示される
