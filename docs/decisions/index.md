# このディレクトリについて

プロダクト上の決定とその背景を記録する場所。**背景まで書ける決定は1件1ファイル**にし、それ以外は [`chronicle.md`](chronicle.md) に原文のまま保持している。

撤回された決定は消さず `status: deprecated` にして `superseded_by` で後継を指す。**「なぜその案を採らなかったか」は、採用した案の理由と同じくらい実装の判断材料になる**ため。

進捗の管理はここではなく `tasks/` と GitHub Issue が担う。振る舞いの確定仕様は [`specifications/`](../specifications/index.md) が正典。

# Decisions

* [0001 デスクトップフレームワークに Wails v2 を採用する](0001-tech-stack-wails.md) - 2026-07-21。OS のファイルシステムとプロセスに素直に触れる必要があったため。
* [0002 開発は WSL2 上で行い、Windows 向けビルドだけを Windows / CI に任せる](0002-develop-on-wsl2.md) - 2026-07-21。当初の Windows 開発案から同日中に方向転換した。
* [0003 SQLite ドライバに modernc.org/sqlite（pure Go）を使う](0003-sqlite-pure-go.md) - 2026-07-21。CGO 不要でクロスビルドが単純になるため。
* [0004 孤児になったタグ行はタグ解除時に削除する（撤回）](0004-delete-orphan-tags.md) - 2026-07-21 決定・同日撤回。色と軸が失われて復元できなかった。
* [0005 タグ行は孤児になっても温存する](0005-retain-tag-rows.md) - 2026-07-21。0004 を置き換えた現行方針。
* [0006 exe の選択を整数優先度からスコアリング方式へ再設計する](0006-exe-scoring.md) - 2026-07-21。本命が埋もれて補助ツールが選ばれていたため。

# Chronicle

* [決定の年代記](chronicle.md) - 上記に分離していない決定を旧 docs/workflow.md から原文のまま引き継いだもの。
