---
type: Runbook
title: アプリアイコン
description: ゲームカートリッジ意匠のアイコンの構成と、マスター SVG から配布用アセットを再生成する手順。
resource: app-icon/generate.py
tags: [design, build]
verified: { by: human:e-suzuno, at: 2026-08-02 }
---

# アプリアイコン

ゲームカートリッジをモチーフにしたアプリアイコン。上段の細い段が端子、下段の広い段が本体で、
ラベル面にサイドバーロゴと同じ `◈` を白抜きで置いている。

## ファイル構成

マスター SVG と生成スクリプトは **リポジトリ直下の `app-icon/`** にある（ドキュメントは `docs/` に集約し、アセットはコードと同じ階層に置く）。

| ファイル（`app-icon/` 配下） | 役割 |
|---|---|
| `icon.svg` | マスター（1024×1024）。48px 以上の出力元 |
| `icon-small.svg` | 32px 以下向けの簡略版。端子ピンとグリップ溝を落とし、シルエットと `◈` を 1.1 倍に拡大 |
| `generate.py` | マスターから配布用アセットを書き出すスクリプト |

`icon-small.svg` を分けているのは、端子ピン（幅 34/1024 ≒ 0.5px @16px）とグリップ溝が
小サイズで潰れて濁り、`◈` まで判別できなくなるため。輪郭と `◈` だけを残す方が識別性が高い。

## 生成物

`generate.py` が次を上書きする。**手で編集せず、SVG を直してから再生成する**。

| 出力先 | 内容 |
|---|---|
| `build/appicon.png` | 1024×1024。Wails が Linux / macOS 用に使う |
| `build/windows/icon.ico` | 16 / 24 / 32 / 48 / 64 / 128 / 256 のマルチサイズ（16〜32 は簡略版から） |
| `frontend/public/favicon.svg` | ブラウザ・Storybook 用（Vite が `dist/` 直下へコピー） |
| `frontend/public/favicon.png` | 32×32 フォールバック |

`build/windows/icon.ico` は exe のアイコンと NSIS インストーラ（`build/windows/installer/project.nsi`
の `MUI_ICON` / `MUI_UNICON`）の両方で使われる。

## 再生成手順

```bash
pip install pillow cairosvg
python3 app-icon/generate.py
```

Pillow の ICO 書き出しは 1 枚の画像からしかマルチサイズを作れないため、サイズごとに
生成元を切り替える必要がある `icon.ico` は `generate.py` 内で ICO を直接組み立てている。

## カラー

アプリ本体のデザイントークンに準拠（[`design-tokens.md`](../reference/design-tokens.md)）。

| 用途 | 値 |
|---|---|
| 背景プレート | `#5d55ee` → `#3f37c9`（縦グラデーション） |
| カートリッジ本体 | `#ffffff` |
| ラベル / 端子 / 溝 | アクセント紫 `#4f46e5`（ラベル `.92`、端子・溝 `.26`） |
| 角丸半径 | 232 / 1024 = 22.7%（macOS の squircle 比率に合わせた） |
