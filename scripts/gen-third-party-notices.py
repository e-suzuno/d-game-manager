#!/usr/bin/env python3
"""THIRD_PARTY_NOTICES.md を生成する。

リポジトリルートで `python3 scripts/gen-third-party-notices.py` を実行する。
依存を更新したら（Dependabot の PR を取り込んだときを含む）再生成すること。

対象は**配布物に実際に含まれる第三者成果物**だけに絞っている。

- Go: `GOOS=windows go list -tags desktop,production -deps` が返すモジュール。
  `go.mod` の require 全部ではない（`wails dev` でしか使わないものが混ざるため）。
  ビルドタグは `wails build` が渡すものに合わせている。
- npm: `frontend/package.json` の `dependencies` とその推移的依存のみ。
  `devDependencies`（Storybook / Vite / TypeScript / Playwright など）はビルド時に
  しか使われず配布物に入らないので対象外。

ライセンス本文は各パッケージ同梱のファイルをそのまま埋め込む。手で転記すると
著作権表示を取りこぼすため、このファイルを直接編集しないこと。
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
NODE_MODULES = REPO / "frontend" / "node_modules"

LICENSE_FILE_RE = re.compile(r"^(licen[cs]e|copying)", re.I)

# 判定はその license に固有の一文で行う。緩いキーワード一致だと MIT と BSD を
# 取り違える。BSD-3 は BSD-2 の文言を含むので、判定の順序に意味がある。
# 「Neither the name of」ではなく「Neither the name」で見るのは、modernc.org の
# 各モジュールが「Neither the names of」と複数形で書いているため。
SIGNATURES = [
    ("MIT", "permission is hereby granted, free of charge"),
    ("BSD-3-Clause", "neither the name"),
    ("BSD-2-Clause", "redistributions in binary form must reproduce"),
    ("Apache-2.0", "apache license"),
    ("ISC", "permission to use, copy, modify, and/or distribute"),
    ("OFL-1.1", "sil open font license"),
    ("MPL-2.0", "mozilla public license"),
]

# 配布物に入る npm パッケージ。react は依存なし、react-dom は scheduler のみ、
# フォントは依存なしなので、推移的依存まで含めてこの一覧で尽きている。
NPM_PACKAGES = [
    ("react", "React（UI ライブラリ）"),
    ("react-dom", "React の DOM レンダラ"),
    ("scheduler", "React の協調スケジューラ（react-dom の依存）"),
    ("@fontsource-variable/manrope", "フォント Manrope（UI の欧文）"),
    ("@fontsource-variable/noto-sans-jp", "フォント Noto Sans JP（和文）"),
    ("@fontsource-variable/jetbrains-mono", "フォント JetBrains Mono（等幅）"),
]

HEADER = """# 第三者ソフトウェアのライセンス表示

d-game-manager の配布物には、以下の第三者ソフトウェアおよびフォントが含まれます。
それぞれの著作権は各権利者に帰属し、以下に転記した条件のもとで利用しています。
本リポジトリの [`LICENSE`](LICENSE) はこれら第三者の成果物には適用されません。

対象は**配布されるバイナリに実際に含まれるもの**に限っています。ビルド時にしか
使われない開発ツール（Storybook / Vite / TypeScript / Playwright など、
`frontend/package.json` の `devDependencies`）は配布物に含まれないため記載しません。

> このファイルは `scripts/gen-third-party-notices.py` が `go list` と `node_modules`
> の実データから生成しています。手で編集せず、依存を更新したら再生成してください。
"""

WEBVIEW2_NOTE = """## Microsoft Edge WebView2

本アプリは画面描画に **Microsoft Edge WebView2 Runtime** を使用します。ランタイム本体は
アプリに同梱しておらず、Windows にインストール済みのものを利用します。

NSIS インストーラーは、ランタイムが未インストールの場合にのみ、Microsoft が配布する
ブートストラッパー `MicrosoftEdgeWebview2Setup.exe` を同梱・実行してランタイムを
取得します。ブートストラッパーおよびランタイムの著作権は Microsoft Corporation に
帰属し、その利用条件は Microsoft が定める配布条件に従います。

- WebView2 の配布について:
  https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution
"""


def detect(text):
    lowered = text.lower()
    for name, signature in SIGNATURES:
        if signature in lowered:
            return name
    return "UNKNOWN"


def read_license(directory):
    files = sorted(f for f in directory.iterdir() if LICENSE_FILE_RE.match(f.name))
    if not files:
        sys.exit(f"ライセンスファイルが見つかりません: {directory}")
    return files[0].name, files[0].read_text(encoding="utf-8").strip()


def go_modules():
    """Windows 本番ビルドにリンクされる Go モジュールを列挙する。"""
    env = dict(os.environ, GOOS="windows")
    result = subprocess.run(
        [
            "go", "list", "-tags", "desktop,production", "-deps",
            "-f", "{{with .Module}}{{.Path}}|{{.Version}}|{{.Dir}}{{end}}",
            ".", "./...",
        ],
        cwd=REPO, capture_output=True, text=True, env=env,
    )
    if result.returncode != 0:
        sys.exit(f"go list に失敗しました:\n{result.stderr}")

    modules = {}
    for line in result.stdout.splitlines():
        line = line.strip()
        # 自分自身のモジュールは第三者ではないので除く。
        if not line or line.startswith("d-game-manager|"):
            continue
        path, version, directory = line.split("|", 2)
        modules[path] = (version, directory)

    entries = []
    for path in sorted(modules):
        version, directory = modules[path]
        filename, text = read_license(Path(directory))
        entries.append({
            "module": path, "version": version, "license": detect(text),
            "file": filename, "text": text,
        })
    return entries


def npm_packages():
    entries = []
    for name, purpose in NPM_PACKAGES:
        pkg_dir = NODE_MODULES / name
        if not pkg_dir.is_dir():
            sys.exit(f"{name} が見つかりません。frontend/ で npm ci を実行してください。")
        meta = json.loads((pkg_dir / "package.json").read_text(encoding="utf-8"))
        filename, text = read_license(pkg_dir)
        entries.append({
            "name": name, "version": meta["version"],
            "license": meta.get("license", detect(text)),
            "purpose": purpose, "file": filename, "text": text,
        })
    return entries


def main():
    go_entries = go_modules()
    npm_entries = npm_packages()

    unknown = [e["module"] for e in go_entries if e["license"] == "UNKNOWN"]
    if unknown:
        sys.exit("ライセンスを判定できないモジュールがあります: " + ", ".join(unknown))

    out = [HEADER, "", "## 一覧", "", "### Go モジュール", ""]
    out.append("| モジュール | バージョン | ライセンス |")
    out.append("|---|---|---|")
    for e in go_entries:
        out.append(f"| `{e['module']}` | {e['version']} | {e['license']} |")

    out += ["", "### npm パッケージ", ""]
    out.append("| パッケージ | バージョン | ライセンス | 用途 |")
    out.append("|---|---|---|---|")
    for e in npm_entries:
        out.append(
            f"| `{e['name']}` | {e['version']} | {e['license']} | {e['purpose']} |"
        )

    out += ["", WEBVIEW2_NOTE, "", "---", "", "## ライセンス全文（Go モジュール）", ""]
    for e in go_entries:
        out.append(f"### {e['module']} v{e['version']}")
        out.append("")
        out.append(f"ライセンス: {e['license']}（{e['file']}）")
        out.append("")
        out.append("```text\n" + e["text"] + "\n```")
        out.append("")

    out += ["---", "", "## ライセンス全文（npm パッケージ）", ""]
    for e in npm_entries:
        out.append(f"### {e['name']} v{e['version']}")
        out.append("")
        out.append(f"ライセンス: {e['license']}（{e['file']}）")
        out.append("")
        out.append("```text\n" + e["text"] + "\n```")
        out.append("")

    dest = REPO / "THIRD_PARTY_NOTICES.md"
    dest.write_text("\n".join(out).rstrip() + "\n", encoding="utf-8")
    print(f"生成しました: {dest.relative_to(REPO)} "
          f"（Go {len(go_entries)}件 / npm {len(npm_entries)}件）")


if __name__ == "__main__":
    main()
