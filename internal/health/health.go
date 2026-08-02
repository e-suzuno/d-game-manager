// Package health は登録済みゲームの実体（フォルダ・exe）が今も存在するかを確認する。
//
// 判定結果は DB に永続化しない実行時の値である。実体の状態は OS 側の操作（削除・移動・
// ドライブの着脱）でいつでも変わるため、永続化すると同期対象が二重になるだけで
// 正確さは増さない。呼び出し側は必要なタイミングで都度確認する。
//
// stat のエラーは種類を問わずすべて「不在」として扱う。ENOENT だけを不在にすると、
// 未接続ドライブや権限エラー（＝どちらも起動できない状態）を「正常」と誤って
// 報告してしまうため。この判定は表示のためだけに使い、DB の行を自動削除する
// 用途には使わない（誤判定でタグ・お気に入り等を失わせないため）。
package health

import (
	"os"
	"path/filepath"
	"sync"
)

// 実体の状態。Game.Missing / UIGame.missing の値と対応する（空文字＝正常）。
const (
	OK            = ""       // フォルダも exe も存在する
	MissingFolder = "folder" // ゲームフォルダ自体が見つからない（削除・移動・ドライブ未接続）
	MissingExe    = "exe"    // フォルダはあるが実行ファイルが見つからない（削除・リネーム）
)

// Target は CheckAll の入力1件。
type Target struct {
	ID         int64
	FolderPath string
	ExePath    string // フォルダからの相対パス。空文字ならフォルダの有無だけで判定する
}

// Result は確認結果1件。
type Result struct {
	ID      int64  `json:"id"`
	Missing string `json:"missing"` // OK / MissingFolder / MissingExe
}

// checkParallelism は stat の並列数。未接続のネットワークドライブ等で1件あたりの
// stat が待たされても全体が直列に伸びないよう並列化する。
const checkParallelism = 8

// Check は1件のゲームの実体を確認する。
func Check(folderPath, exePath string) string {
	fi, err := os.Stat(folderPath)
	if err != nil || !fi.IsDir() {
		return MissingFolder
	}
	if exePath == "" { // 旧 DB には exe_path が空の行がありうる
		return OK
	}
	fi, err = os.Stat(filepath.Join(folderPath, exePath))
	if err != nil || fi.IsDir() {
		return MissingExe
	}
	return OK
}

// CheckAll は targets を並列に確認し、入力と同じ順序・同じ件数の結果を返す。
func CheckAll(targets []Target) []Result {
	results := make([]Result, len(targets))
	sem := make(chan struct{}, checkParallelism)
	var wg sync.WaitGroup
	for i, t := range targets {
		wg.Add(1)
		go func(i int, t Target) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			results[i] = Result{ID: t.ID, Missing: Check(t.FolderPath, t.ExePath)}
		}(i, t)
	}
	wg.Wait()
	return results
}
