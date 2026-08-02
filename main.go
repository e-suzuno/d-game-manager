package main

import (
	"embed"
	"net/http"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// カバー画像（ユーザーデータフォルダ）を /covers/ で webview に配信する。
	// embed アセットに無いパスだけがこのハンドラに来る
	coverHandler := http.StripPrefix("/covers/", http.FileServer(http.Dir(coversDir())))

	// Create application with options
	err := wails.Run(&options.App{
		// タイトルは ASCII のみ（WSLg のタイトルバーは日本語フォントがなく豆腐になる。Windows では日本語も可）。
		Title:     "d-game-manager",
		Width:     1360,
		Height:    940,
		MinWidth:  1080,
		MinHeight: 700,
		AssetServer: &assetserver.Options{
			Assets: assets,
			Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if len(r.URL.Path) > 8 && r.URL.Path[:8] == "/covers/" {
					coverHandler.ServeHTTP(w, r)
					return
				}
				http.NotFound(w, r)
			}),
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 255},
		// 取り込みモーダルへのフォルダのドラッグ&ドロップを受け付ける。
		// ドロップ先は CSS の --wails-drop-target: drop を付けた要素だけ（ImportModal.css）。
		// DisableWebViewDrop は付けない: Windows の WebView2 では外部ドロップ経路
		// （HTML5 drop → file:drop メッセージ）が唯一のパス供給元で、これを無効化すると
		// EnableFileDrop があっても OnFileDrop が発火しなくなる。既定ドロップによる
		// ページ遷移は Wails ランタイムが Files ドラッグを常に preventDefault するため防がれる。
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop: true,
		},
		OnStartup:  app.startup,
		OnShutdown: app.shutdown,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
