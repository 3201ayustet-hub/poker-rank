# Poker Performance Book

仲間内のポーカートーナメント成績を管理する、スマートフォン優先のWebアプリです。

## 特徴

- GitHubへiPhoneから一括アップロードしやすい「完全1階層」構成
- GitHub Pagesでそのまま公開可能
- 外部ライブラリ・ビルド作業不要
- データはブラウザの localStorage に保存
- 最大10名のプレイヤー登録
- マイハンド登録
- 1 Session内で複数Tournamentを管理
- 開始スタック設定
- Breakごとのスタック記録
- CHIP AUDIT（理論総チップとの照合）
- OUT / RE-ENTRY
- Re-entry受付終了後の順位自動確定
- 最終1名をChampionとして確定
- 平均Performance %、優勝数、勝率、平均Re-entry
- Room Records
- JSONバックアップのExport / Import

## GitHubへのアップロード

このZIPをiPhoneの「ファイル」で展開すると、以下の4ファイルが同じ階層にあります。

- `index.html`
- `style.css`
- `storage.js`
- `app.js`
- `README.md`

GitHubの **Add file → Upload files → choose your files** から、この5ファイルをまとめて選択してアップロードしてください。

## GitHub Pages

Repository Settings → Pages で、Branchを `main`、Folderを `/ (root)` に設定すると公開できます。

## 現在の保存方式

初期版は使い勝手確認のため、Supabaseを使用せずブラウザの `localStorage` に保存します。

Safariのサイトデータを削除すると記録も消えるため、メニューの **EXPORT BACKUP** で定期的にJSONバックアップを保存してください。

次フェーズでSupabaseを導入し、複数端末同期へ移行する想定です。
