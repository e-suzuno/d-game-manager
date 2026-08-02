# ログ

## 2026-08-02（コードコメントの世代番号を呼称規約に統一）

* **Update**: フロントのコードコメントに残っていた世代番号 `v2 変更点N` を **「調整版ハンドオフ 変更点N」** に統一した（13箇所: `Toolbar.tsx` / `Toolbar.stories.tsx` / `SideNav.tsx` / `SideNav.stories.tsx` / `LibraryPage.tsx` / `LibraryPage.stories.tsx` / `TagManagerModal.tsx` / `GameTable.css` / `mockGames.ts`）。2026-07-26 に「リポジトリ全体から世代番号の引用が無くなった」と記録していたが**取りこぼしがあった**（当時直したのは7箇所）。Storybook のストーリー表示名3件も併せて改名している。

## 2026-08-02（製品名から「(仮)」を外して正式名称に固定）

* **Decision**: 製品名を **`d-game-manager`** に正式決定した（従来の表記は `d-game-manager(仮)`）。`wails.json` の `productName` / `README.md` / `CLAUDE.md` / `THIRD_PARTY_NOTICES.md` とその生成元 `scripts/gen-third-party-notices.py` / サイドナビのロゴ / [`architecture/overview.md`](architecture/overview.md) の計8箇所を更新した。
* **Update**: `main.go` のウィンドウタイトルのコメントから「『仮』は日本語なのでタイトルバーでは省く」という但し書きを削除した（製品名自体が ASCII になったため理由が消滅）。タイトルを ASCII に保つ理由（WSLg の豆腐対策）はそのまま残している。
* **Update**: [`specifications/library-screen.md`](specifications/library-screen.md) のロゴ行を実装に合わせた。仕様は「**MY GAMES**」と書いていたが、実装（`SideNav.tsx`）は製品名を表示しており**文言が食い違っていた**（寸法・ウェイトは一致）。ロゴには製品名を出す方を正とした。
* **Update**: これに伴い Windows インストーラーの導入先が `$LOCALAPPDATA\Programs\d-game-manager(仮)` → `d-game-manager` に変わる（`project.nsi` は `${INFO_PRODUCTNAME}` 経由で `wails.json` を参照している）。**未リリースのため既存インストールへの影響はない**。

## 2026-08-02（開発環境の記述を実環境に合わせる）

* **Update**: [`guides/development-setup.md`](guides/development-setup.md) と `README.md` の必要ツール表を実環境に合わせた（Ubuntu 20.04→**24.04**、Go 1.26.5→**1.25.7**、Node は `nvm install 24` でバージョン明示）。**Ubuntu 24.04 には `libwebkit2gtk-4.0-dev` が存在せず、記載どおりに実行すると環境構築が失敗する状態**だった。4.1 を使うには `wails` の Linux ビルドに `-tags webkit2_41` が要ることを併記し、`CLAUDE.md` のコマンド表にも反映した。`wails doctor` は 4.0 を案内してくるので従わない旨も明記している。
* **Update**: Windows クロスビルドは **webkit2gtk を使わないためタグ不要**であることを確認して追記した（`wails build -platform windows/amd64` / `-tags webkit2_41` 付き Linux ビルド ともに実行して検証済み）。
* **Update**: [`decisions/0002-develop-on-wsl2.md`](decisions/0002-develop-on-wsl2.md) の帰結から webkit2gtk の版番号を外し、版とビルドタグの正典を `development-setup.md` に一本化した。
* **Update**: 未使用の `frontend/src/assets/fonts/OFL.txt` を削除した。**Nunito のライセンス全文**だったが、実際に同梱するフォントは Manrope / Noto Sans JP / JetBrains Mono（`main.tsx`）で、コードからもインストーラーからも参照されていなかった。3種のライセンス表示は `THIRD_PARTY_NOTICES.md` が担う。

## 2026-08-02（skill をリポジトリ外の共通ツールへ、docs から参照を排除）

* **Decision**: 作業支援 skill と OKF lint を**リポジトリに置かず開発環境側の共通ツールとして持つ**方針に変えた。これに伴い CI の `OKF bundle validation` ジョブを削除している（リポジトリに実体が無い以上 CI からは実行できないため）。**ドキュメントの検証はローカルからの任意実行になった。**
* **Update**: [`docs-policy.md`](docs-policy.md) の「検証」節から skill 同梱の記述と CI 実行の前提を外し、`actions/checkout` の `fetch-depth: 0` に関する記述を削除した。履歴を作り直した直後は `verified.at` 検査が全件警告になることを代わりに書いた。
* **Update**: [`guides/development-flow.md`](guides/development-flow.md) の CI 節を 4→3 ジョブに戻し、「CI で検証されないもの」に docs の lint を加えた。テスト戦略表のドキュメント行を「ローカル（任意）」に変え、ブランチ保護の status checks から `OKF bundle validation` を外した。着手・コミット・PR の各節と末尾の「作業を支援する skill」表からも skill への言及を削除した。
* **Update**: `CLAUDE.md` の git 運用から skill 一覧を削除した。

## 2026-08-02（アプリアイコン資材のパスを実体に合わせる）

* **Update**: [`guides/app-icon.md`](guides/app-icon.md) / [`guides/development-setup.md`](guides/development-setup.md) / [`reference/design-tokens.md`](reference/design-tokens.md) の `design/app-icon/` 参照を、実体のある **リポジトリ直下の `app-icon/`** に直した（frontmatter の `resource` を含む6箇所）。**記載どおりの `python3 design/app-icon/generate.py` が動かない状態**だった。`app-icon.md` にあった「アセットは移動していない」という括弧書きは移動済みなので理由ごと削除した。

## 2026-08-01（公開前のライセンス整備）

* **Update**: [`guides/release.md`](guides/release.md) に「ライセンス表示の同梱」を新設した（[Issue #72](https://github.com/e-suzuno/d-game-manager/issues/72)）。同梱フォント3種が **SIL OFL 1.1 で再配布時のライセンス全文同梱を義務付けている**のに、配布物のどこにも入っていなかった。配布経路がインストーラーと単体 `.exe` の2つあるため、`project.nsi` がインストール先に展開し、`build-windows.yml` が Release の添付資材にも加える二重の手当てをしている。`THIRD_PARTY_NOTICES.md` は `scripts/gen-third-party-notices.py` の生成物で、**依存更新のたびに再生成が要る**ことをここに記録した。
* **Update**: 同ファイルのリリース手順の表と確認項目を、添付ファイル2つ→4つに更新した。
* **Decision**: リポジトリを public にするにあたり、**ライセンスはプロプライエタリ（権利留保）のまま**とし、OSS ライセンスは付与しない方針を採った。個人の学習用アプリで、公開の目的はポートフォリオとバイナリ配布にあり、コントリビュートの受け入れを目的としないため。`LICENSE` にはバイナリの個人利用と学習目的の clone・ローカル改変を明示的に許諾する条項を足した（**従来の文面は複製を全面禁止しており、Releases から exe を配る意図と矛盾していた**）。

## 2026-07-29（取り込みの入力パス正規化と登録済み判定のバッチ化）

* **Update**: [`processes/import-flow.md`](processes/import-flow.md) のシーケンス図を `HasFolder` の候補ごとループから `HasFolders` の1クエリに更新し、エッジケース表に「同じフォルダを重複してドロップ」「親フォルダと子フォルダを同時にドロップ」の2行を追加した（[Issue #50](https://github.com/e-suzuno/d-game-manager/issues/50) の項目1・2）。
* **Update**: [`reference/app-api.md`](reference/app-api.md) の `ScanFolders` に入力パスの完全重複を走査前に畳む挙動を追記した。
* **Decision**: Issue #50 が提案していた**入力パスのネスト排除は採用しなかった**。`scan.ScanFolderProgress` は再帰せず1階層しか見ないため（root 自体がゲームでなければ直下のサブフォルダだけを判定）、親をスキャンしても子の配下にあるゲームには届かない。「親が入力にあるから子は不要」は成り立たず、畳むと取りこぼす。テストで実証済み（`TestScanFoldersKeepsNestedInputPaths`）。

## 2026-07-29（file-drop 購読の制約を実装メモに記録）

* **Update**: [`processes/import-flow.md`](processes/import-flow.md) のドラッグ&ドロップの実装メモに「購読できるのは1箇所だけ（2箇所目を足す前に読む）」を新設した（[Issue #51](https://github.com/e-suzuno/d-game-manager/issues/51)）。Wails ランタイムの `OnFileDrop` は `flags.registered` で**2回目以降の登録を警告もエラーも出さずに無視し**、`OnFileDropOff` は `EventsOff` でイベント名ごと全解除する。**購読が1箇所の現状では実害がないため コードは修正せず**、2箇所目を足す時点で踏む地雷として記録する方針を採った（症状が無言のため、コードだけでは気づけない種類の制約）。

## 2026-07-29（一覧取得の非 null 保証を契約に明記）

* **Update**: [`reference/app-api.md`](reference/app-api.md) の `ListGames` / `ListTags` に「0件でも `null` にしない」を追記した（[Issue #20](https://github.com/e-suzuno/d-game-manager/issues/20)）。**同じ表の `DeleteGames` / `CheckMissingGames` / `SelectAndScanFolder` は当初からこの保証を契約として書いていたのに、この2つだけ書かれておらず実装にもガードが無かった**。store 層は0件で nil スライスを返すため JSON が `null` になり、`App.d.ts` の非 nullable な型定義と矛盾していた。

## 2026-07-29（フロントのコンポーネントテストを CI に組み込み）

* **Update**: [`guides/development-flow.md`](guides/development-flow.md) の CI 節を3ジョブ→4ジョブに更新した。**flaky 4件（[Issue #52](https://github.com/e-suzuno/d-game-manager/issues/52)）の原因がモーダルのマウント時アニメーションだと分かり、テスト実行時のみアニメーションを無効化して解消した**ため、`npx vitest` を CI で回せるようになった。
* **Update**: テスト戦略表の「フロントのコンポーネント」を**振る舞い（ローカル / CI）と見た目・アニメーション（人）の2行に分割**した。アニメーションを無効化して走らせる以上、**動きそのものは CI では一度も再生されない**ため、自動化された範囲と人が見る範囲の境界がここに移った。「CI で検証されないもの」にも同じ趣旨の行を足し、`.github/pull_request_template.md` のテスト計画欄の注記も追随させた。

## 2026-07-29（取り込みモーダル: 誤クローズ防止とスキャン進捗）

* **Update**: [`specifications/library-screen.md`](specifications/library-screen.md) のフォルダ取り込みモーダル節に「閉じる操作（誤クローズ防止）」を新設し、scanning の進捗表示（プログレスバー＋ N/M フォルダ）を追記した（Issue #65）。
* **Update**: [`reference/app-api.md`](reference/app-api.md) の取り込み節に Wails イベント `scan:progress` の契約（ペイロードと通し番号の合算）を追記した。

## 2026-07-26（開発フローとリリース手順の文書化）

* **Creation**: [`guides/development-flow.md`](guides/development-flow.md) を新設した。ブランチ運用・コミット規約・PR・**CI が検証する範囲と検証しない範囲**・テスト戦略・`main` のブランチ保護の推奨設定をまとめている。これらは `CLAUDE.md` にしか無く、**エージェント向けの指示と人が読む手順が同一ファイルに同居していた**ため docs 側に正典を置いた。
* **Creation**: [`guides/release.md`](guides/release.md) を新設した。バージョンの正が `wails.json` の `productVersion` 1箇所であること、タグ push で何が起きるか、アンインストーラーがユーザーデータを既定で残すことを記録している。これまでリリース手順は `README.md` の1節（ワークフローへのリンク）だけだった。
* **Update**: `README.md` のドキュメント導線に上記2本を追加し、Go のバージョン表記に `go.mod` の `go 1.25.0` が最低要求宣言である旨の注記を入れた（[`development-setup.md`](guides/development-setup.md) と同じ説明が README 側に無く、不一致に見えていた）。
* **Update**: 両文書は初稿を LLM が書いた未レビューの下書きなので `status: draft` ＋ `generated` で登録している（`verified` は人の確認後に付ける）。

## 2026-07-26（lint を okf-docs スキルへ一本化）

* **Update**: lint の実体を `.claude/skills/okf-docs/scripts/okf_lint.py`（`okf-docs` スキル同梱）に一本化し、`scripts/okf-lint.py` を削除した。**467行のほぼ同一ファイルが2箇所にある状態**を解消するため。CI と [`docs-policy.md`](docs-policy.md) の参照先も追随させた。
* **Update**: `verified` の意味を「人が内容を確認した証跡」に固定し、**未レビューの下書きは `status: draft` にして `verified` を付けない**ことを明記した。lint も `draft` のとき欠落を警告しないようにした。以前は「全 concept に付ける」と書きつつ「確認していないなら付けない方が正直」とも読める状態で、**筋を通すと警告が出る**矛盾があった（スキルの検証中に発覚）。

## 2026-07-26（フェーズ4: 適合性 lint の自作と CI 組み込み）

* **Creation**: `scripts/okf-lint.py` を追加した。OKF 適合条件と [`docs-policy.md`](docs-policy.md) の運用規約を検証し、**レポートを2層に分ける**（適合条件そのものと、このリポジトリの追加規約）。公式リポジトリに validator が存在しないため自作した。
* **Update**: `.github/workflows/ci.yml` に `docs` ジョブを追加した。PR ごとに実行される。
* **Update**: lint の指摘を受けて既存文書を修正した — `description` が2文になっていた11本を1文に、目録の記載形式を統一し、`guides/development-setup.md` の `verified.at` を更新（フェーズ3b で本文を触ったのにレビュー印を上げ忘れていた）。**検証の機械化が実在する不備を14件見つけた。**
* **Update**: [`docs-policy.md`](docs-policy.md) の「検証」節を実装に合わせて書き直した。何をエラーにし何を警告に留めるかの線引きと、その理由（無関係な PR が落ちると検証そのものが無効化される）を明記した。
* **Update**: CI 初回実行で `verified.at` の更新漏れ検査が**17件の偽陽性**を出したため lint を修正した。`actions/checkout` の shallow clone では `git log -1 -- <file>` がどのファイルにも同じコミット日を返すため比較が無意味になる。**shallow を検出したら自動でスキップ**し、CI 側は `fetch-depth: 0` を指定して検査を有効にした。偽陽性で警告を埋めると「警告を無視する習慣」ができ、検証そのものが無効化されるため。

## 2026-07-26（フェーズ3b: 決定記録の昇格と呼称統一）

* **Initialization**: [`decisions/`](decisions/index.md) を新設し、旧 `workflow.md` の決定事項ログから**背景まで書ける6件を独立した決定記録**にした。撤回された決定（孤児タグ削除方式）は `status: deprecated` ＋ `superseded_by` で後継を指す形で残した。**採らなかった理由も実装の判断材料になる**ため消していない。
* **Creation**: [`decisions/chronicle.md`](decisions/chronicle.md) に残り6件を**原文のまま**保持した。表の1行が持つ以上の背景は書き足していない（推測で補うより原文の方が正確なため）。
* **Update**: `design/app-icon/README.md` を [`guides/app-icon.md`](guides/app-icon.md) へ移設した。**マスター SVG と `generate.py` は移動していない**（`generate.py` のパス解決と実行コマンドを不変に保つため）。これで `design/` 配下に `.md` は残っていない。
* **Update**: `README.md` の撤回済み仕様3件を現行仕様に直した（制作ツールの「タグ付け」→属性として記録／タグの AND 絞り込み→OR・AND の規則／統一タグモデル→属性＋2軸）。アーキテクチャ図に `internal/health` と `internal/icon` を追記し、Go のバージョンを実導入値に合わせた。
* **Update**: コードコメントの世代番号を「基本ハンドオフ / 調整版ハンドオフ」表記に統一した（Go 5箇所・フロント7箇所）。`store.go` の `migrate()` の `v2:` `v3:` `v4:` は**マイグレーション版番号なので保持**し、「デザイン vN」の部分だけ直した。**これでリポジトリ全体から世代番号の引用が無くなった**（経緯を説明している `docs-policy.md` / `chronicle.md` / この `log.md` を除く）。

## 2026-07-25（フェーズ3a: 仕様の正典を集約）

* **Creation**: `specifications/` に振る舞いの確定仕様を5本新設した — [`tool-attribute.md`](specifications/tool-attribute.md) / [`tag-taxonomy.md`](specifications/tag-taxonomy.md) / [`tag-filter.md`](specifications/tag-filter.md) / [`exe-detection.md`](specifications/exe-detection.md) / [`storage-integrity.md`](specifications/storage-integrity.md)。
* **Update**: `CLAUDE.md` の「確定済みの仕様」節から仕様本文を削除し、`specifications/` への導線表に置き換えた。**正典が CLAUDE.md と docs に二重にある状態を解消**した。
* **Update**: 重複を作らないため、方針の記述を `reference/app-api.md` から `specifications/` へ**移動**した（コピーではない）。「設計上の決めごと」5点 → `storage-integrity.md`、「スキャン仕様（internal/scan）」→ `exe-detection.md`。`app-api.md` は API 契約に専念する形になった。
* **Update**: `CLAUDE.md` のレイヤ列挙に `internal/icon/` を追記した（実装済みだが記載が漏れていた）。
* **Update**: `specifications/library-screen.md` の参照を `storage-integrity.md`（3箇所）と `tag-filter.md` に向け直した。
* **Update**: 撤回済み仕様の `not:` を4本の仕様文書にも置いた（タグ軸3軸・孤児タグ削除方式・全条件AND・exe の整数優先度方式）。

## 2026-07-25（フェーズ2: デザイン仕様の統合）

* **Creation**: [`specifications/library-screen.md`](specifications/library-screen.md) を新設。基本ハンドオフと調整版ハンドオフを統合し、**単体で読める現行 UI 仕様の正典**にした。差分形式（調整版が基本ハンドオフに「据え置き」で依存する構造）を解消している。
* **Creation**: [`reference/design-tokens.md`](reference/design-tokens.md) を新設。基本ハンドオフの Design Tokens と調整版の追加・変更分を1つの表にマージした。
* **Update**: 撤回済み仕様を `not:`（term / why / instead）として構造化した。`library-screen.md` に5件（制作ツールのタグ扱い・自動判別しない方針・タグフィルタ全AND・tool 軸の既定色 teal・フィルタUI単一ボタン）、`design-tokens.md` に3件（虹色カバー・カバー上の白文字・3軸の既定色）。
* **Initialization**: デザインハンドオフ4ファイルを `design/` 配下から撤去した。デザイン仕様の `.md` が `design/` から無くなり、ドキュメントは `docs/` に一元化された。
* **Update**: `frontend/src/styles/tokens.css` と `CLAUDE.md` のデザイン節の参照先を新体系へ追随させた。

## 2026-07-25（フェーズ1: バンドルの初期化）

* **Initialization**: `docs/` を Open Knowledge Format v0.2 バンドルとして初期化した。`index.md`（`okf_version` を持つ唯一のファイル）と この `log.md` を追加し、執筆規約を [`docs-policy.md`](docs-policy.md) に定めた。準拠した仕様のリビジョンは `GoogleCloudPlatform/knowledge-catalog` の `3fcbb9f828c2`。
* **Update**: 既存6文書を concept の種類別ディレクトリへ移し、frontmatter を付与した（`architecture.md` → `architecture/`、`api.md` / `data-model.md` → `reference/`、`import-flow.md` → `processes/`、`setup.md` / `usage.md` → `guides/`）。移動で切れた相対リンクは追随させた。
* **Creation**: `architecture/data-flow.md` を新設し、旧 `architecture.md` の「主要なデータフロー」節を独立した concept に分離した。保存先の存在確認・ゲーム起動のフローを加筆している。
* **Update**: `architecture/overview.md` のレイヤ構成に `internal/icon/`（exe アイコン抽出）を追記した。実装済みだが構成図に載っていなかった。
* **Update**: `architecture/overview.md` の「タグは `axis`（genre / tool / other）の統一モデル」という記述を genre / other の2軸に修正し、旧記述を `not:` として構造化した。`tags.axis` の CHECK 制約に `'tool'` が残るのは SQLite の制約変更コストを避けた歴史的経緯で、アプリからは二度と作られない。
* **Update**: デザインハンドオフの世代番号（「デザイン v2 / v3 変更点N」）による引用をやめ、「基本ハンドオフ」「調整版ハンドオフ」の固有名＋節名で指すようにした（`reference/data-model.md` 5箇所、`processes/import-flow.md` 1箇所）。番号は ディレクトリ名 / zip のファイル名 / コミットメッセージ / 文書の H1 表題 の4系統で別のものを指しており、どれを正としても矛盾するため放棄した。


     プロダクト上の決定の年代記は docs/decisions/ が担う（後続フェーズで新設）。 -->
