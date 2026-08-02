---
type: Runbook
title: リリース手順
description: Windows 向け配布物（exe + NSIS インストーラー）をバージョン更新からタグ push・Release 公開まで作る手順。
tags: [build]
status: draft
generated: { by: claude-code/opus-5, at: 2026-07-26 }
resource: .github/workflows/build-windows.yml
---

# リリース手順

配布物は **Windows 向けのみ**（`d-game-manager.exe` と NSIS インストーラー `d-game-manager-amd64-installer.exe`）。ビルドとリリース作成は GitHub Actions の [`build-windows.yml`](../../.github/workflows/build-windows.yml) が行うので、手元で `.exe` を作って配ることはしない。

## バージョンの正は `wails.json`

バージョン番号は `wails.json` の `info.productVersion` **1箇所だけ**が正。

- `build/windows/info.json` と `build/windows/installer/project.nsi` は `{{.Info.ProductVersion}}` としてこの値を参照するテンプレートなので、手で書き換えない
- `frontend/package.json` の `version`（`0.0.0`）は配布物に出てこない。更新しない
- Git タグは `v` + `productVersion` に**手で合わせる**（自動照合はしていない）

## 手順

1. **`main` が緑であることを確認する。** CI の3ジョブ（Frontend / Go / OKF）が通っていること
2. **バージョンを上げる。** `wails.json` の `info.productVersion` を更新し（例 `0.1.0` → `0.2.0`）、feature ブランチから PR を出して `main` に取り込む（コミットは `chore: バージョンを 0.2.0 に更新`）
3. **タグを打って push する。**

   ```bash
   git checkout main
   git pull origin main
   git tag v0.2.0
   git push origin v0.2.0
   ```

4. **ワークフローの完走を確認する。** Actions の `Build Windows` が走り、次の順で処理する。

   | ステップ | 内容 |
   |---|---|
   | setup-go / setup-node | `go.mod` の Go バージョン、Node 24 |
   | Install Wails CLI | `wails@v2.13.0` |
   | Build frontend | `npm ci` → `npm run build`（`go:embed` 用の `frontend/dist` を作る） |
   | Run Go tests | `go test ./...` |
   | Build | `wails build -platform windows/amd64 -nsis` |
   | Upload artifacts | `.exe` と インストーラーを artifact に添付 |
   | Create release | **`v*` タグのときのみ** GitHub Release を作成し、exe・インストーラーと `LICENSE`・`THIRD_PARTY_NOTICES.md` の4ファイルを添付 |

5. **Release ページを確認する。** exe とインストーラー、`LICENSE`、`THIRD_PARTY_NOTICES.md` が添付されていること。リリースノートは自動生成のままなので、書き足すならこのタイミングで編集する
6. **実機で確認する。** インストール → 取り込み → 起動 → アンインストールの通し確認

## タグを打たずに検証したいとき

Actions から `Build Windows` を **手動実行**（`workflow_dispatch`）する。ビルドと artifact のアップロードまで走り、**Release は作られない**（`Create release` ステップが `refs/tags/v` 判定で飛ぶ）。ビルドが壊れていないかだけ見たい場合はこちら。

## ライセンス表示の同梱

同梱している第三者ソフトウェア（とくに OFL のフォント3種）は、**再配布時にライセンス全文を伴わせること**を条件にしている。配布経路が2つあるので両方に載せている。

- **インストーラー**: `project.nsi` が `LICENSE` と `THIRD_PARTY_NOTICES.md` をインストール先に展開する
- **単体の .exe**: インストーラーを通らないので、`build-windows.yml` が同じ2ファイルを Release の添付資材に加える

`THIRD_PARTY_NOTICES.md` は `scripts/gen-third-party-notices.py` の生成物で、手で編集しない。**依存を更新したら再生成する**（Dependabot の PR を取り込んだときを含む）。

```bash
python3 scripts/gen-third-party-notices.py
```

生成には Go モジュールキャッシュと `frontend/node_modules` の実体が要る（`go list` と各パッケージ同梱のライセンスファイルを読むため）。ライセンスを判定できないモジュールがあるとスクリプトは失敗するので、その場合は手で確認して `SIGNATURES` に追加する。

## アンインストーラーの挙動

`build/windows/installer/project.nsi` の `uninstall` セクションで、ライブラリのユーザーデータ（`%AppData%\d-game-manager`＝`library.db` と `covers\`）の削除を**確認ダイアログで尋ねる**。

- **既定は「残す」**（`/SD IDNO`）。サイレントアンインストール（`/S`）でもデータは消えない
- WebView2 のデータパスはアプリ固有なので確認なしで削除する
- **ゲーム本体のフォルダには一切触らない**（アプリの不変条件。[`storage-integrity.md`](../specifications/storage-integrity.md)）

インストーラーの挙動を変えた場合は、この節と実機確認の項目を合わせて更新する。

## 失敗したとき

| 症状 | 見るところ |
|---|---|
| `Run Go tests` で落ちる | `main` の CI は `go test ./...` を通しているので、Windows 固有の失敗（パス区切り・大文字小文字）を疑う |
| `pattern all:frontend/dist: no matching files found` | `Build frontend` ステップが失敗している。フロントのビルドエラーが本体 |
| Release が作られない | タグが `v` で始まっているか。手動実行では作られない仕様 |
| Release 作成が 403 で失敗する | ワークフローの `permissions: contents: write`（`build` ジョブ）が消えていないか |

タグを打ち直す場合は、リモートのタグと Release を削除してから同じ手順をやり直す（`git push --delete origin v0.2.0`）。**公開済みのバージョン番号は再利用しない**方が安全なので、可能なら次の番号に進める。
