package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"d-game-manager/internal/health"
	"d-game-manager/internal/icon"
	"d-game-manager/internal/launch"
	"d-game-manager/internal/scan"
	"d-game-manager/internal/store"
)

// iconCoverSuffix は exe アイコン由来カバーのファイル名サフィックス。
// Go/TS 双方（frontend/src/lib/format.ts）で同じサフィックスを使う。値を変える場合は両方揃えること。
const iconCoverSuffix = "_icon.png"

// App struct
type App struct {
	ctx   context.Context
	store *store.Store
	// emitEvent はフロントへのイベント通知（startup で Wails runtime に束ねる）。
	// nil のとき（テスト等、Wails ランタイム外）は通知しない
	emitEvent func(name string, data any)
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.emitEvent = func(name string, data any) { runtime.EventsEmit(ctx, name, data) }
	s, err := store.Open(defaultDBPath())
	if err != nil {
		// DB ロック（二重起動）や設定ディレクトリの権限エラーで起こりうる。
		// ハードエグジットせず、ダイアログで通知してから正常終了する
		runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
			Type:    runtime.ErrorDialog,
			Title:   "起動エラー",
			Message: fmt.Sprintf("ライブラリDBを開けませんでした。\nアプリを二重起動していないか確認してください。\n\n%v", err),
		})
		runtime.Quit(ctx)
		return
	}
	a.store = s
}

// shutdown is called when the app is closing
func (a *App) shutdown(ctx context.Context) {
	if a.store != nil {
		a.store.Close()
	}
}

// st は初期化済みの store を返す。startup が失敗した場合のエラーガード。
func (a *App) st() (*store.Store, error) {
	if a.store == nil {
		return nil, fmt.Errorf("ライブラリDBが初期化されていません")
	}
	return a.store, nil
}

// appDataDir はアプリのデータ保存先を返す（例: ~/.config/d-game-manager）。
func appDataDir() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		dir = "."
	}
	return filepath.Join(dir, "d-game-manager")
}

// defaultDBPath はライブラリ DB の保存先を返す。
func defaultDBPath() string {
	return filepath.Join(appDataDir(), "library.db")
}

// coversDirOverride はテストからカバー保存先を差し替えるためのフック（本番では空文字のまま）。
var coversDirOverride string

// coversDir はカバー画像の保存先を返す。
func coversDir() string {
	if coversDirOverride != "" {
		return coversDirOverride
	}
	return filepath.Join(appDataDir(), "covers")
}

// ListGames は登録済みの全ゲームを返す。0件でも null にしない（空配列）。
func (a *App) ListGames() ([]store.Game, error) {
	s, err := a.st()
	if err != nil {
		return nil, err
	}
	games, err := s.ListGames(a.ctx)
	if err != nil {
		return nil, err
	}
	if games == nil {
		games = []store.Game{} // JSON で null にしない
	}
	return games, nil
}

// CheckMissingGames は登録済みゲームの実体（フォルダ・exe）を確認し、
// **見つからなかったものだけ**を返す。0件でも null にしない（空配列）。
//
// ListGames と分離しているのは、未接続のネットワークドライブ等で stat が待たされても
// 初回描画をブロックしないため。フロントは一覧取得のあとにこれを非同期で呼び、
// 返らなかったゲームの missing は空に戻す（実体が復帰したケースの反映）。
//
// 見つからない行を自動削除は**しない**。外部ドライブ未接続やクラウド同期の
// オフロードでも同じ結果になり、誤判定でタグ・お気に入り・カバー・編集済みタイトルを
// 失わせてしまうため、削除は必ずユーザーの明示操作に委ねる。
func (a *App) CheckMissingGames() ([]health.Result, error) {
	s, err := a.st()
	if err != nil {
		return nil, err
	}
	games, err := s.ListGames(a.ctx)
	if err != nil {
		return nil, fmt.Errorf("ゲーム一覧の取得に失敗しました: %w", err)
	}
	targets := make([]health.Target, 0, len(games))
	for _, g := range games {
		targets = append(targets, health.Target{ID: g.ID, FolderPath: g.FolderPath, ExePath: g.ExePath})
	}
	missing := []health.Result{} // JSON で null にしない
	for _, r := range health.CheckAll(targets) {
		if r.Missing != health.OK {
			missing = append(missing, r)
		}
	}
	return missing, nil
}

// ListTags は全タグを付与ゲーム数付きで返す。0件でも null にしない（空配列）。
func (a *App) ListTags() ([]store.TagWithCount, error) {
	s, err := a.st()
	if err != nil {
		return nil, err
	}
	tags, err := s.ListTags(a.ctx)
	if err != nil {
		return nil, err
	}
	if tags == nil {
		tags = []store.TagWithCount{} // JSON で null にしない
	}
	return tags, nil
}

// SetFavorite はお気に入りフラグを設定する。
func (a *App) SetFavorite(id int64, fav bool) error {
	s, err := a.st()
	if err != nil {
		return err
	}
	return s.SetFavorite(a.ctx, id, fav)
}

// SetTool は制作ツール属性を設定する。空文字は「未判別」に正規化される。
func (a *App) SetTool(id int64, tool string) error {
	s, err := a.st()
	if err != nil {
		return err
	}
	return s.SetTool(a.ctx, id, tool)
}

// AddTag はゲームにタグを付与する。axis は未登録タグの新規作成時のみ使われ、
// 既存タグでは無視される（元の axis・color が維持される）。実際の軸は戻り値で確認できる。
func (a *App) AddTag(gameID int64, name, axis string) (store.Tag, error) {
	s, err := a.st()
	if err != nil {
		return store.Tag{}, err
	}
	return s.AddTagToGame(a.ctx, gameID, name, axis)
}

// RemoveTag はゲームからタグを外す。
func (a *App) RemoveTag(gameID, tagID int64) error {
	s, err := a.st()
	if err != nil {
		return err
	}
	return s.RemoveTagFromGame(a.ctx, gameID, tagID)
}

// SetTagColor はタグの色（パレットキー）を設定する。
func (a *App) SetTagColor(tagID int64, color string) error {
	s, err := a.st()
	if err != nil {
		return err
	}
	return s.SetTagColor(a.ctx, tagID, color)
}

// RenameTag はタグ名を変更する（タグ管理モーダル）。付与済みの全ゲームに新名が波及する。
func (a *App) RenameTag(tagID int64, name string) error {
	s, err := a.st()
	if err != nil {
		return err
	}
	return s.RenameTag(a.ctx, tagID, name)
}

// DeleteTag はタグをライブラリから完全に削除する（タグ管理モーダル）。
// RemoveTag と違い、付与されていた全ゲームからも外れる。
func (a *App) DeleteTag(tagID int64) error {
	s, err := a.st()
	if err != nil {
		return err
	}
	return s.DeleteTag(a.ctx, tagID)
}

// SetTagAxis はタグの軸（genre / other）を変更する（タグ管理モーダル）。
func (a *App) SetTagAxis(tagID int64, axis string) error {
	s, err := a.st()
	if err != nil {
		return err
	}
	return s.SetTagAxis(a.ctx, tagID, axis)
}

// CreateTag はゲームに紐付けない新規タグを登録する（タグ管理モーダル）。
func (a *App) CreateTag(name, axis string) (store.Tag, error) {
	s, err := a.st()
	if err != nil {
		return store.Tag{}, err
	}
	return s.CreateTag(a.ctx, name, axis)
}

// emitScanProgress は取り込みスキャンの進捗をフロントへ通知する
// （ImportModal のプログレスバー用。イベント名・ペイロードは frontend/src/App.tsx と対）。
func (a *App) emitScanProgress(current, total int, name string) {
	if a.emitEvent == nil {
		return
	}
	a.emitEvent("scan:progress", map[string]any{
		"current": current,
		"total":   total,
		"folder":  name,
	})
}

// SelectAndScanFolder はディレクトリ選択ダイアログを開き、選択フォルダをスキャンして
// ゲーム候補を返す。キャンセル時は nil を返す（エラーではない）。
// 既にライブラリ登録済みのフォルダは候補から除外する。
func (a *App) SelectAndScanFolder() ([]scan.Detected, error) {
	s, err := a.st()
	if err != nil {
		return nil, err
	}
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "ゲームフォルダを選択",
	})
	if err != nil {
		return nil, err
	}
	if dir == "" { // キャンセル
		return nil, nil
	}
	found, err := scan.ScanFolderProgress(dir, a.emitScanProgress)
	if err != nil {
		return nil, fmt.Errorf("スキャンに失敗しました: %w", err)
	}
	out, err := filterUnregisteredFolders(a.ctx, s, found, nil, nil)
	if err != nil {
		return nil, err
	}
	if out == nil {
		out = []scan.Detected{} // JSON で null にしない（null はキャンセルの意味）
	}
	return out, nil
}

// ScanFolders はドラッグ&ドロップで渡されたパス群をスキャンしてゲーム候補を返す。
// ドロップにはファイルが混ざりうるため、ディレクトリ以外は黙って読み飛ばす。
// SelectAndScanFolder と同様に、登録済みフォルダは候補から除外する。
// 複数パスの配下で同じフォルダが重複検出された場合も1件にまとめる。
// 1件の失敗（stat 失敗・スキャン失敗・DB エラー）でも他のパスの処理は続行し、
// 収集できた候補は捨てずに返す（失敗はログにのみ残す）。
func (a *App) ScanFolders(paths []string) ([]scan.Detected, error) {
	s, err := a.st()
	if err != nil {
		return nil, err
	}
	out := []scan.Detected{} // JSON で null にしない
	seen := map[string]bool{}
	// HasFolder のエラーは他の要素の処理を止めない方針なので、ログのみ残して continue する
	onHasFolderErr := func(d scan.Detected, err error) {
		log.Printf("scan: %q の登録済み判定に失敗（読み飛ばし）: %v", d.FolderPath, err)
	}
	// 進捗の分母は走査前に全ルート分を合算し、通し番号で通知する
	// （ルートごとに分母が変わるとプログレスバーが行き来して見えるため）
	var dirs []string
	seenInput := map[string]bool{}
	for _, p := range paths {
		info, err := os.Stat(p)
		if err != nil {
			log.Printf("scan: %q の stat に失敗（読み飛ばし）: %v", p, err)
			continue
		}
		if !info.IsDir() {
			continue
		}
		// 同じフォルダを2回ドロップした等の**完全重複**は走査前に畳む。走査時間の
		// 大半は detectGame の folderSize（配下の全ファイル走査）なので重複すると
		// 丸ごと倍になり、CountScanTargets の合算＝進捗の分母も二重に計上される。
		//
		// **ネストは畳まない**。ScanFolderProgress は1階層しか見ない（root 自体が
		// ゲームでなければ直下のサブフォルダだけを判定する）ため、親をスキャンしても
		// 子フォルダの配下は検出されない。親が入力にあるからと子を捨てると、子の
		// 配下にあるゲームを丸ごと取りこぼす（Issue #50）
		key := normFolderKey(p)
		if seenInput[key] {
			continue
		}
		seenInput[key] = true
		dirs = append(dirs, p)
	}
	total := 0
	for _, p := range dirs {
		total += scan.CountScanTargets(p)
	}
	done := 0
	for _, p := range dirs {
		found, err := scan.ScanFolderProgress(p, func(_, _ int, name string) {
			done++
			a.emitScanProgress(done, total, name)
		})
		if err != nil {
			log.Printf("scan: %q のスキャンに失敗（読み飛ばし）: %v", p, err)
			continue
		}
		filtered, _ := filterUnregisteredFolders(a.ctx, s, found, seen, onHasFolderErr)
		out = append(out, filtered...)
	}
	return out, nil
}

// filterUnregisteredFolders は found のうち、seen（重複排除用、nil 可）に未登録で
// かつライブラリに未登録のフォルダのみを返す。onErr が nil なら HasFolder の
// エラーを即座に返す。onErr が nil でなければエラー発生時に onErr へ通知したうえで
// 当該要素をスキップし処理を続行する（＝呼び出し元が onErr を渡した時点でエラーは返らない）。
func filterUnregisteredFolders(ctx context.Context, s *store.Store, found []scan.Detected, seen map[string]bool, onErr func(scan.Detected, error)) ([]scan.Detected, error) {
	// seen による重複排除を先に済ませ、残った候補の登録済み判定は1クエリでまとめる
	// （候補ごとに HasFolder を呼ぶと、親フォルダに数十タイトル入っているケースで
	// 検出数と同じ回数のクエリが走る）
	candidates := make([]scan.Detected, 0, len(found))
	for _, d := range found {
		if seen != nil {
			key := normFolderKey(d.FolderPath)
			if seen[key] {
				continue
			}
			seen[key] = true
		}
		candidates = append(candidates, d)
	}
	if len(candidates) == 0 {
		return nil, nil
	}

	folderPaths := make([]string, len(candidates))
	for i, d := range candidates {
		folderPaths[i] = d.FolderPath
	}
	registered, err := s.HasFolders(ctx, folderPaths)
	if err != nil {
		if onErr == nil {
			return nil, err
		}
		// バッチは全件同時に失敗するため、1回のエラーで候補を全部捨てないよう
		// 候補ごとの判定に落とす（onErr を渡した呼び出し元の「1件の失敗で他を
		// 止めない」方針を保つ）
		log.Printf("scan: 登録済み判定のバッチクエリに失敗（候補ごとの判定にフォールバック）: %v", err)
		return filterUnregisteredOneByOne(ctx, s, candidates, onErr), nil
	}

	var out []scan.Detected
	for _, d := range candidates {
		if !registered[d.FolderPath] {
			out = append(out, d)
		}
	}
	return out, nil
}

// filterUnregisteredOneByOne は候補ごとに HasFolder を呼ぶ従来の判定。
// バッチクエリが失敗したときのフォールバック専用。
func filterUnregisteredOneByOne(ctx context.Context, s *store.Store, candidates []scan.Detected, onErr func(scan.Detected, error)) []scan.Detected {
	var out []scan.Detected
	for _, d := range candidates {
		exists, err := s.HasFolder(ctx, d.FolderPath)
		if err != nil {
			onErr(d, err)
			continue
		}
		if !exists {
			out = append(out, d)
		}
	}
	return out
}

// normFolderKey はフォルダパスの重複判定キーを正規化する。Windows パスは
// 大文字小文字を区別しないため、同一ドロップ内の綴り違い重複も1件に畳む。
func normFolderKey(p string) string {
	return strings.ToLower(filepath.Clean(p))
}

// ImportResult は取り込みの結果。一部が失敗しても成功分は登録済みのため、
// 常に登録後の全ゲームと失敗情報の両方を返す。
type ImportResult struct {
	// Games は登録後の全ゲーム。空ライブラリでも必ず []（null にしない）。
	// RefreshFailed が true の場合のみ内容は無効
	Games  []store.Game    `json:"games"`
	Failed []ImportFailure `json:"failed"` // 登録に失敗した項目
	// RefreshFailed は「登録は完了したが一覧の再取得に失敗した」ことを示す。
	// 空ライブラリ（Games=[]）と区別するための明示フラグ
	RefreshFailed bool `json:"refreshFailed"`
}

// ImportFailure は取り込みに失敗した1項目。
type ImportFailure struct {
	Title  string `json:"title"`
	Reason string `json:"reason"`
}

// ImportGames は選択された候補をライブラリに登録する。
// 検出された制作ツール（判別不能なら「未判別」）は games.tool 属性として保存する。
// 途中で失敗しても残りの候補の登録を続行し、失敗分は理由付きで ImportResult.Failed に
// 記録する（ログにも残す）。
func (a *App) ImportGames(items []scan.Detected) (ImportResult, error) {
	s, err := a.st()
	if err != nil {
		return ImportResult{}, err
	}
	result := ImportResult{Failed: []ImportFailure{}}
	added := []store.Game{} // この呼び出しで登録できたゲーム（再取得失敗時のフォールバック用）
	for _, it := range items {
		g, err := s.AddGame(a.ctx, store.NewGame{
			Title:      it.Title,
			ExePath:    it.ExePath,
			FolderPath: it.FolderPath,
			SizeBytes:  it.SizeBytes,
			Tool:       it.Tool,
		})
		if err != nil {
			log.Printf("import: %q (%s) の登録に失敗: %v", it.Title, it.FolderPath, err)
			result.Failed = append(result.Failed, ImportFailure{Title: it.Title, Reason: err.Error()})
			continue
		}
		// 既定カバー: exe のアイコンをベストエフォートで抽出して設定する。
		// アイコンが無い exe も普通にあるため、失敗してもログに残すだけで登録は成立させる
		if coverPath, err := a.applyIconCover(g); err != nil {
			log.Printf("import: %q のアイコン抽出をスキップ: %v", it.Title, err)
		} else {
			g.CoverPath = coverPath
		}
		added = append(added, g)
	}
	games, err := s.ListGames(a.ctx)
	if err != nil {
		// 登録自体は完了しているため、蓄積した結果（Failed 含む）は捨てずに返す。
		// Games には全ゲームの代わりに「この取り込みで登録できた分」を入れ、
		// フロントが既存一覧へマージして表示を欠落させないようにする（第7回 #3）
		log.Printf("import: 取り込み後の一覧取得に失敗: %v", err)
		result.RefreshFailed = true
		result.Games = added
		return result, nil
	}
	if games == nil {
		games = []store.Game{} // 空ライブラリと再取得失敗を区別するため null にしない
	}
	result.Games = games
	return result, nil
}

// DeleteGame はゲームをライブラリから登録解除する。ゲーム本体のフォルダ・ファイルには
// 一切触れない。ユーザー指定カバー画像（アプリのデータフォルダ内）だけは掃除する。
func (a *App) DeleteGame(id int64) error {
	s, err := a.st()
	if err != nil {
		return err
	}
	g, err := s.GetGame(a.ctx, id)
	if err != nil {
		return fmt.Errorf("ゲーム情報の取得に失敗しました: %w", err)
	}
	if err := s.DeleteGame(a.ctx, id); err != nil {
		return fmt.Errorf("ゲームの削除に失敗しました: %w", err)
	}
	removeOldCover(g.CoverPath)
	return nil
}

// DeleteResult は一括削除の結果。一部が失敗しても成功分は削除済みのため、
// 常に成功件数と失敗情報の両方を返す（ImportResult と同じ方針）。
type DeleteResult struct {
	Deleted int             `json:"deleted"`
	Failed  []DeleteFailure `json:"failed"` // 削除に失敗した項目。0件でも null にしない
}

// DeleteFailure は削除に失敗した1項目。
type DeleteFailure struct {
	ID     int64  `json:"id"`
	Title  string `json:"title"`
	Reason string `json:"reason"`
}

// DeleteGames は複数のゲームをまとめてライブラリから登録解除する（整合性チェックの一括削除）。
// DeleteGame と同じくゲーム本体のフォルダ・ファイルには一切触れない。
// 途中で失敗しても残りの削除を続行し、失敗分は理由付きで DeleteResult.Failed に記録する。
func (a *App) DeleteGames(ids []int64) (DeleteResult, error) {
	s, err := a.st()
	if err != nil {
		return DeleteResult{}, err
	}
	result := DeleteResult{Failed: []DeleteFailure{}}
	for _, id := range ids {
		// 失敗を報告するときにタイトルを添えたいので先に引く（DeleteGame 内でも引くが、
		// 削除後は取得できないため。ローカル SQLite なのでこの二重取得は許容する）
		title := ""
		if g, err := s.GetGame(a.ctx, id); err == nil {
			title = g.Title
		}
		if err := a.DeleteGame(id); err != nil {
			log.Printf("delete: id=%d (%q) の削除に失敗: %v", id, title, err)
			result.Failed = append(result.Failed, DeleteFailure{ID: id, Title: title, Reason: err.Error()})
			continue
		}
		result.Deleted++
	}
	return result, nil
}

// RelinkGame はフォルダ選択ダイアログを開き、ゲームの保存先を選んだフォルダへ貼り替える
// （移動・リネームしたゲームの復帰）。タイトル・タグ・お気に入り・カバーは保たれる。
// 戻り値は更新後のゲームで、キャンセル時はゼロ値（ID が 0）を返す。
func (a *App) RelinkGame(id int64) (store.Game, error) {
	s, err := a.st()
	if err != nil {
		return store.Game{}, err
	}
	g, err := s.GetGame(a.ctx, id)
	if err != nil {
		return store.Game{}, fmt.Errorf("ゲーム情報の取得に失敗しました: %w", err)
	}
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: fmt.Sprintf("「%s」の保存先フォルダを選択", g.Title),
	})
	if err != nil {
		return store.Game{}, err
	}
	if dir == "" { // キャンセル
		return store.Game{}, nil
	}
	return a.relinkTo(g, dir)
}

// relinkTo は選択済みフォルダへの貼り替え本体（ダイアログを分離してテストできるようにしている）。
// dir はゲームフォルダ自体を指す必要がある。exe はスキャンで再検出するため、
// 同じフォルダを選び直せば「exe だけリネームされた」ケースの復帰にも使える。
func (a *App) relinkTo(g store.Game, dir string) (store.Game, error) {
	s, err := a.st()
	if err != nil {
		return store.Game{}, err
	}
	dir = filepath.Clean(dir)
	found, err := scan.ScanFolder(dir)
	if err != nil {
		return store.Game{}, fmt.Errorf("フォルダのスキャンに失敗しました: %w", err)
	}
	// ScanFolder は root がゲームフォルダでなければ直下のサブフォルダを返すため、
	// dir 自身の検出結果だけを採用する（親フォルダの誤選択を黙って別フォルダに
	// 貼り替えてしまわないように）
	var target *scan.Detected
	for i := range found {
		if normFolderKey(found[i].FolderPath) == normFolderKey(dir) {
			target = &found[i]
			break
		}
	}
	if target == nil {
		return store.Game{}, fmt.Errorf("選択したフォルダで実行ファイルが見つかりませんでした。ゲームフォルダ自体を選んでください")
	}
	// 同じフォルダの選び直し（exe 再検出）は許可し、他ゲームのフォルダは拒否する
	if normFolderKey(g.FolderPath) != normFolderKey(dir) {
		exists, err := s.HasFolder(a.ctx, dir)
		if err != nil {
			return store.Game{}, fmt.Errorf("登録済み判定に失敗しました: %w", err)
		}
		if exists {
			return store.Game{}, fmt.Errorf("そのフォルダは別のゲームで登録済みです")
		}
	}
	if err := s.SetLocation(a.ctx, g.ID, target.FolderPath, target.ExePath, target.SizeBytes); err != nil {
		return store.Game{}, err
	}
	updated, err := s.GetGame(a.ctx, g.ID)
	if err != nil {
		return store.Game{}, fmt.Errorf("ゲーム情報の取得に失敗しました: %w", err)
	}
	return updated, nil
}

// ResetLibrary はアプリの管理データを全消去して初期状態に戻す（設定画面の「すべてのデータを消去」）。
// 消すのは DB の全行（games / tags / game_tags）と covers ディレクトリだけで、
// **ゲーム本体のフォルダ・ファイル（folderPath 配下）には一切触れない**（アプリの不変条件）。
// 順序は DB → covers。DB の消去に失敗したら covers には手を付けずに返す。
// covers の削除失敗はログのみで成功扱いにする（DB 参照が消えた後の孤児ファイルは
// 無参照で無害。saveCover が毎回 MkdirAll するためディレクトリの再作成も不要）。
func (a *App) ResetLibrary() error {
	s, err := a.st()
	if err != nil {
		return err
	}
	if err := s.ResetAll(a.ctx); err != nil {
		return err
	}
	if err := os.RemoveAll(coversDir()); err != nil {
		log.Printf("reset: covers ディレクトリの削除に失敗（無視）: %v", err)
	}
	return nil
}

// applyIconCover は exe のアイコンを PNG に変換してカバーに設定し、cover_path を返す。
// ファイル名の iconCoverSuffix でユーザー指定カバーと区別する
// （フロントは低解像度アイコンを引き伸ばさず、グラデーションに重ねて中央表示する）。
func (a *App) applyIconCover(g store.Game) (string, error) {
	data, err := icon.ExtractPNG(filepath.Join(g.FolderPath, g.ExePath))
	if err != nil {
		return "", err
	}
	name := fmt.Sprintf("%d_%d%s", g.ID, time.Now().UnixNano(), iconCoverSuffix)
	return a.saveCover(g.ID, name, func(dst string) error {
		if err := os.WriteFile(dst, data, 0o644); err != nil {
			return fmt.Errorf("アイコン画像の保存に失敗しました: %w", err)
		}
		return nil
	})
}

// saveCover はカバー画像を保存先ディレクトリに書き込み、cover_path を DB に反映する。
// write は dst（保存先の絶対パス）にファイルを書き込む処理を担う（呼び出し側の書き込み方式を注入する）。
// DB 更新に失敗した場合は書き込み済みファイルを削除してロールバックする。
func (a *App) saveCover(gameID int64, name string, write func(dst string) error) (string, error) {
	s, err := a.st()
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(coversDir(), 0o755); err != nil {
		return "", fmt.Errorf("カバー保存先の作成に失敗しました: %w", err)
	}
	dst := filepath.Join(coversDir(), name)
	if err := write(dst); err != nil {
		return "", err
	}
	coverPath := "covers/" + name
	if err := s.SetCoverPath(a.ctx, gameID, coverPath); err != nil {
		// DB 更新に失敗したら書き込み済みファイルを回収する（cover_path 参照が付かず
		// removeOldCover / DeleteGame では拾えないため、ここで消さないと孤児化する）
		os.Remove(dst)
		return "", err
	}
	return coverPath, nil
}

// RenameGame は表示タイトルを変更する（フォルダ名・パスは変更しない）。
func (a *App) RenameGame(id int64, title string) error {
	s, err := a.st()
	if err != nil {
		return err
	}
	return s.SetTitle(a.ctx, id, title)
}

// SelectCoverImage は画像選択ダイアログを開き、選んだ画像をアプリのデータフォルダへ
// コピーしてカバーに設定する。戻り値は新しい coverPath（キャンセル時は空文字）。
func (a *App) SelectCoverImage(id int64) (string, error) {
	s, err := a.st()
	if err != nil {
		return "", err
	}
	g, err := s.GetGame(a.ctx, id)
	if err != nil {
		return "", fmt.Errorf("ゲーム情報の取得に失敗しました: %w", err)
	}
	src, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "カバー画像を選択",
		Filters: []runtime.FileFilter{
			{DisplayName: "画像ファイル", Pattern: "*.png;*.jpg;*.jpeg;*.gif;*.webp;*.bmp"},
		},
	})
	if err != nil {
		return "", err
	}
	if src == "" { // キャンセル
		return "", nil
	}
	// ファイル名にタイムスタンプを含めて webview のキャッシュを無効化する
	name := fmt.Sprintf("%d_%d%s", id, time.Now().UnixNano(), strings.ToLower(filepath.Ext(src)))
	coverPath, err := a.saveCover(id, name, func(dst string) error {
		if err := copyFile(src, dst); err != nil {
			return fmt.Errorf("画像のコピーに失敗しました: %w", err)
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	removeOldCover(g.CoverPath)
	return coverPath, nil
}

// ResetCover はカバー画像を既定（手続き的グラデーション）に戻す。
func (a *App) ResetCover(id int64) error {
	s, err := a.st()
	if err != nil {
		return err
	}
	g, err := s.GetGame(a.ctx, id)
	if err != nil {
		return fmt.Errorf("ゲーム情報の取得に失敗しました: %w", err)
	}
	if err := s.SetCoverPath(a.ctx, id, ""); err != nil {
		return fmt.Errorf("カバー画像のリセットに失敗しました: %w", err)
	}
	removeOldCover(g.CoverPath)
	return nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

// removeOldCover は差し替え前のカバー画像ファイルを削除する（失敗しても無視）。
func removeOldCover(coverPath string) {
	if coverPath == "" || !strings.HasPrefix(coverPath, "covers/") {
		return
	}
	os.Remove(filepath.Join(coversDir(), strings.TrimPrefix(coverPath, "covers/")))
}

// LaunchGame はゲームの実行ファイルを起動する。
func (a *App) LaunchGame(id int64) error {
	s, err := a.st()
	if err != nil {
		return err
	}
	g, err := s.GetGame(a.ctx, id)
	if err != nil {
		return fmt.Errorf("ゲーム情報の取得に失敗しました: %w", err)
	}
	return launch.Game(g.FolderPath, g.ExePath)
}

// OpenGameFolder はゲームの保存先フォルダをファイラーで開く。
func (a *App) OpenGameFolder(id int64) error {
	s, err := a.st()
	if err != nil {
		return err
	}
	g, err := s.GetGame(a.ctx, id)
	if err != nil {
		return fmt.Errorf("ゲーム情報の取得に失敗しました: %w", err)
	}
	return launch.Folder(g.FolderPath)
}
