---
type: Playbook
title: ドキュメント執筆規約
description: docs/ を Open Knowledge Format v0.2 バンドルとして運用するための規約（type / tags 語彙・frontmatter の書き方・リンク規約・検証方法）。
tags: [meta]
verified: { by: human:e-suzuno, at: 2026-08-02 }
---

# ドキュメント執筆規約

`docs/` は Open Knowledge Format (OKF) v0.2 バンドルとして運用する。この文書がその規約の正典であり、新しい文書を追加・変更するときは必ずここに従う。

## なぜ OKF を使うのか

OKF は知識をプレーン Markdown + YAML frontmatter で表現するベンダ中立フォーマットで、**人間・LLM エージェント・検索インデックス・グラフ可視化のすべてが消費者**として想定されている。このリポジトリの `docs/` は Claude Code が常時参照する対象なので、用途が合致する。

採用の決め手は**撤回済み仕様を構造的に無効化できる**ことにある。以前の `docs/` と `design/` は、撤回された仕様（「制作ツールもタグとして扱う」「タグフィルタは全条件 AND」など）が取り消し線もなく現行文書に残り、別の文書の「据え置き」宣言だけが依存関係を担保している状態だった。OKF の `status: deprecated` と拡張フィールド `not:` を使えば、**何が誤りで・なぜ違って・正しくは何か**を機械可読に書き残せる。

## バンドルの構造

```
docs/                       ← バンドルルート
├── index.md                予約: 目録。okf_version を持つ唯一のファイル
├── log.md                  予約: このバンドルの更新履歴
├── docs-policy.md          この文書
├── architecture/           システム構造とデータフロー
├── reference/              API・スキーマ・デザイントークンの引きもの
├── specifications/         確定した振る舞いの仕様（正典）
├── processes/              複数レイヤをまたぐ処理シーケンス
├── guides/                 人が手で実行する手順・利用者向け説明
└── decisions/              決定記録
```

### 予約ファイル名

`index.md` と `log.md` は OKF の予約名で、**concept 文書として使ってはいけない**。

- **`index.md`** — ディレクトリの目録。frontmatter を持てるのは**バンドルルートの `docs/index.md` のみ**で、そこに `okf_version: "0.2"` を書く。サブディレクトリの `index.md` は frontmatter を持たない。本文は `# セクション見出し` と `* [Title](relative-url) - 説明` のリストで構成する
- **`log.md`** — このバンドルの更新履歴。`## YYYY-MM-DD` の見出しを**日付降順**に並べ、その下に `* **Creation**:` / `* **Update**:` / `* **Initialization**:` の箇条書きを置く。**プロダクト上の決定の年代記ではない**（それは `decisions/` の担当）。ファイル単位の変更履歴は git が持っているので、log.md には過去を遡って書き足さない

## concept 文書の frontmatter

```yaml
---
type: Specification              # 必須
title: タグフィルタの AND/OR 仕様   # 必須運用
description: ジャンル同士 OR・その他タグ同士 OR・両群の間 AND で評価する規則。  # 必須運用（1文）
tags: [ui, frontend]             # 必須運用（1〜4個）
resource: frontend/src/LibraryPage.tsx   # 主アセットが1つに特定できる場合のみ
verified: { by: human:e-suzuno, at: 2026-07-25 }
---
```

| フィールド | 運用 |
|---|---|
| `type` | **必須**（OKF 適合条件）。下の語彙表の閉じた集合から選ぶ。追加するときはこの文書も更新する |
| `title` / `description` / `tags` | **必須運用**。`index.md` の目録行の生成元で、LLM が文書を選ぶときの第一材料になる。`description` は1文で書く |
| `resource` | 主アセットが1つに特定できる文書だけに付ける（リポジトリルート相対パス。例 `app.go`、`internal/store/store.go`）。抽象的な概念の文書では省略する（OKF が明示的に許容している） |
| `status` | **`stable` は書かない**（省略時が `stable`）。`deprecated` は撤回された決定にのみ使う。`draft` は実装が未確定または未検証のもの |
| `stale_after` | 環境依存で腐る文書だけに付ける。現状は `guides/development-setup.md` のみ |
| `sources` | 移行元・引用元がある文書に付ける。`usage_count` / `usage_window` は使わない（クエリログ由来の知識ではないため） |
| `generated` | **本文の初稿を LLM が生成した文書にのみ**付ける。人と LLM が混在して書かれた既存文書には付けない（任意フィールドなので欠落は適合） |
| `verified` | **人が内容を確認した証跡**。レビュー済みの concept に付ける。まだ確認していない下書きには**付けず `status: draft` にする**（lint も `draft` なら欠落を警告しない） |
| `not` | **撤回済み仕様に言及する文書には必須**（後述） |
| `superseded_by` | OKF の拡張フィールド。撤回された決定に必須（後継の決定記録を指す） |

### actor の表記

| 主体 | 表記 | 例 |
|---|---|---|
| 人間 | `human:<GitHub ハンドル>` | `human:e-suzuno` |
| LLM エージェント | `<producer>/<version>` | `claude-code/opus-4.5` |
| 自動処理 | `process:<id>` | `process:github-actions` |

メールアドレスは使わない（表記揺れと個人情報の混入を避けるため）。OKF の consumer は `human:` プレフィクスの有無で信頼段階を分類する（`verified` に `human:` があれば human-reviewed）。

### 運用ルールは1つだけ

**レビュー済み文書を変更する PR では、その文書の `verified.at` を1行更新する。** これだけを守る。守られているかは lint が機械判定する（`git log` の最終更新が `verified.at` より新しければ警告）。破っても OKF 適合性は壊れないので運用が破綻しない。

ただし**確認していない内容に人の印を付けてはいけない**。次の3ケースで機械的に決まる。

| 状況 | 書き方 |
|---|---|
| 未レビューの新規文書（実装と突き合わせていない下書き） | `status: draft` にして `verified` を付けない。初稿を LLM が書いたなら `generated: {by, at}` を付ける |
| レビューを経る変更（PR を出して人が見る） | `verified.at` を変更日に更新する（マージがレビューの発生） |
| レビューを経ない変更（エージェントが単独で直す） | `status: draft` に落とす |

`verified.by` を人から機械の actor に差し替えるのは避ける。**誰がレビューしたかの記録を消してしまう**ため、`status: draft` に落とす方が情報が保たれる。

## `type` の語彙

OKF は `type` を中央登録しないので、このリポジトリで閉じた語彙を定める。

| `type` | 定義 |
|---|---|
| `Architecture` | システム構造・依存の向き・責務境界 |
| `API Surface` | 境界をまたぐ呼び出し契約 |
| `Data Model` | 永続化の構造とライフサイクル規則 |
| `Specification` | 確定した振る舞いの仕様 |
| `UI Specification` | 画面の見た目・インタラクション・状態 |
| `Design Tokens` | デザイン値の集合 |
| `Flow` | 複数レイヤをまたぐ処理シーケンス |
| `Runbook` | 人が手で実行する手順 |
| `User Guide` | エンドユーザー向けの操作説明 |
| `Decision` | 単一の決定とその背景 |
| `Decision Log` | 決定の年代記 |
| `Playbook` | このリポジトリでの作業規約 |

## `tags` の語彙

`go` / `frontend` / `sqlite` / `wails` / `ui` / `design` / `build` / `enduser` / `decision` / `meta`

## 撤回済み仕様の書き方

撤回された仕様は**消さずに無効化する**。読み手が古い理解を持っている可能性があるので、「それは違う」と明示的に打ち消すほうが、黙って消すより誤実装を防げる。

frontmatter の `not:` に `term`（誤った理解）/ `why`（なぜ違うか）/ `instead`（正しくは何か）の3点を書く:

```yaml
not:
  - term: "制作ツールもタグ（tool 軸）として扱う統一タグモデル"
    why: "初期の方針。1ゲーム=1ツールでタグの多対多モデルが過剰なため撤回した"
    instead: "Game.tool の一級属性（判別不能は「未判別」を一級状態として保存）。タグ軸は genre / other の2軸"
```

撤回された決定は `decisions/` に `status: deprecated` で残し、`superseded_by` で後継の決定記録を指す（例: [`decisions/0004-delete-orphan-tags.md`](decisions/0004-delete-orphan-tags.md)）。**採らなかった理由も実装の判断材料になる**ため、決定記録そのものは消さない。

## リンク規約

**相対パスを使う**（`../reference/app-api.md`）。

OKF は安定性のためバンドル絶対パス（`/reference/app-api.md`）を推奨しているが、このリポジトリの文書は GitHub の Web UI でも人間が読む一次資材であり、`/reference/…` は GitHub 上でリポジトリルートとして解決されて**必ずリンク切れになる**。OKF は相対パスを明示的に許容しているので適合性は損なわれない。

クレーム単位の出典は Markdown の footnote を `sources[].id` にキーづけて書く。ただし**据え置きか変更かが曖昧になる箇所に限定**し、乱用しない:

```markdown
カバーは正方形（1:1）で、中央にゲームパッドのグリフを薄く重ねる。[^handoff-adjusted]

[^handoff-adjusted]: 調整版デザインハンドオフ 変更点1・2
```

## デザインハンドオフの呼び方

**世代番号（v1 / v2 / v3）を引用してはいけない。** 番号は ①ディレクトリ名 ②zip のファイル名 ③コミットメッセージ ④文書の H1 表題 の4系統でそれぞれ別のものを指しており、どれを正としても他と矛盾する。代わりに固有名で呼ぶ。

| 固有名 | 実体 |
|---|---|
| **基本ハンドオフ** | 初版のフルスペック仕様（2A「コレクションDB」） |
| **調整版ハンドオフ** | 変更点1〜7 の差分仕様 |

引用は「調整版ハンドオフ 変更点3」のように**節名で指す**。原本はリポジトリに残していない（内容は [`specifications/library-screen.md`](specifications/library-screen.md) と [`reference/design-tokens.md`](reference/design-tokens.md) に統合済みで、そちらが正典）。

## 文書を追加するときの手順

1. どの `type` かを決め、対応するディレクトリに置く
2. frontmatter を書く（`type` / `title` / `description` / `tags` / `verified` は必ず）
3. そのディレクトリの `index.md` に1行追加する
4. `log.md` の当日セクションに `* **Creation**:` を追記する
5. 他の文書から参照される内容なら、参照元にも相対リンクを張る

## 検証

OKF バンドルの適合性は lint で機械検証できる。公式リポジトリに validator が存在しないため自作したものを使うが、**実体はこのリポジトリには置いていない**（開発環境側に用意した共通ツールを使う）。したがって検証は**ローカルからの任意実行**で、CI では走らない。

```bash
pip install pyyaml            # 初回のみ
python3 <lint のパス> docs
```

レポートは2層に分かれる。

- **`[OKF 適合条件]`** — 仕様が定める適合条件そのもの。外部の OKF consumer が見るべきもの
- **`[プロジェクト規約]`** — この文書が上に載せた運用規約

OKF は「任意フィールドの欠落・未知の `type`・未知のキー・リンク切れ・`index.md` の欠落で bundle を拒否してはならない」と定めている。そのため**語彙外の `type`・必須運用フィールドの欠落・`index.md` の網羅性はすべて警告に留める**。強く守りたいもの（値域・actor 表記・リンクの解決・バンドル絶対パスの混入）だけをエラーに格上げしている。警告で埋めると「警告を無視する習慣」ができて検証そのものが無効化されるため、この線引きは意図的なもの。

`type` / `tags` の語彙は**この文書の語彙表から読み取る**（正典を二重に持たないため）。表を読めなかった場合は警告を出して語彙チェックだけスキップする — lint の都合で正典側の書式を縛らないため。

リンクを走査する前に**インラインコードスパンとコードフェンスを除去する**。この文書自身が `index.md` の書式例をコードスパンで含んでいるため、除去しないと偽陽性になる。

`resource` / `sources[].resource` / `superseded_by` は、**ファイル相対 → リポジトリルート相対 → バンドル相対**の順に解決を試す。バンドル内の文書を指すときは本文リンクと同じファイル相対（`../reference/app-api.md`）、リポジトリ内のコードを指すときはリポジトリルート相対（`internal/store/store.go`）を使う規約なので、どちらでも通る。

集計として **trust 段階の分布**（unverified / machine-confirmed / human-reviewed）と `type` / `status` の分布を出力する。`verified` が形式的に付くだけになっていないかを継続的に観測するため。

`verified.at` の更新漏れ検査は `git log` を使うため、**shallow clone では自動的にスキップする**（全ファイルの「最終コミット」が同一になって比較が無意味になるため）。同じ理由で、履歴を作り直した直後は全ファイルの最終コミットが揃うため、この検査はいったん全件警告になる。

## この文書の位置づけ

進捗の管理は `tasks/` 配下と GitHub Issue が担う（`tasks/README.md` 参照）。プロダクト上の決定は `decisions/` が正典。`docs/` は**確定した仕様と設計**を持ち、作業中の状態は持たない。

設計判断のうちコードの近くにあるべきものは、Go のパッケージコメントに置いたままにする（例: exe 選択スコアリングの設計記録は `internal/scan/scan.go`）。その場合は該当する concept からリンクして到達可能にする。
