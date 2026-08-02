// Package launch はゲームの起動と OS ファイラーでのフォルダ表示を担う。
package launch

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// Game は exe を起動する。作業ディレクトリはゲームフォルダに設定する
// （RPGツクール等は相対パスでアセットを読むため必須）。
func Game(folderPath, exePath string) error {
	exe := filepath.Join(folderPath, exePath)
	if _, err := os.Stat(exe); err != nil {
		return fmt.Errorf("実行ファイルが見つかりません: %s", exe)
	}
	cmd := exec.Command(exe)
	cmd.Dir = folderPath
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("起動に失敗しました: %w", err)
	}
	// 子プロセスの終了は待たない（プロセス監視はしない方針）
	go cmd.Wait()
	return nil
}

// Folder はフォルダを OS のファイラー（Explorer / Finder 等）で開く。
func Folder(path string) error {
	if _, err := os.Stat(path); err != nil {
		return fmt.Errorf("フォルダが見つかりません: %s", path)
	}
	switch {
	case runtime.GOOS == "windows":
		// explorer.exe は成功時も非 0 を返すことがあるため Start のみ
		return exec.Command("explorer.exe", path).Start()
	case runtime.GOOS == "darwin":
		return exec.Command("open", path).Start()
	case isWSL():
		// WSL では Windows の Explorer を interop 経由で使う（パスは Windows 形式に変換）
		winPath, err := exec.Command("wslpath", "-w", path).Output()
		if err != nil {
			return fmt.Errorf("wslpath: %w", err)
		}
		return exec.Command("explorer.exe", strings.TrimSpace(string(winPath))).Start()
	default:
		return exec.Command("xdg-open", path).Start()
	}
}

// isWSL は WSL 環境かどうかを判定する。
func isWSL() bool {
	data, err := os.ReadFile("/proc/version")
	if err != nil {
		return false
	}
	return strings.Contains(strings.ToLower(string(data)), "microsoft")
}
