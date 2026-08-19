# Poker Rank v1.9

仲間内のポーカートーナメントを記録する、スマートフォン優先のWebアプリです。

## v1.9 の変更

- SESSION画面の見出し下にあった日本語の説明コピーを削除。
- PLAYERS画面の見出し下にあった日本語の説明コピーを削除。
- 説明コピー削除後に残った縦余白を詰め、見出しから主要操作・一覧へ自然につながるレイアウトに調整。
- その他の機能・デザインはv1.7から変更していません。

## ファイル構成

すべて同一階層です。

- `index.html`
- `style.css`
- `app.js`
- `storage.js`
- `cloud.js`
- `config.js`
- `schema-v1.9.sql`
- `README.md`

## GitHub Pages

ZIPを展開し、8ファイルをGitHubリポジトリのルートへまとめてアップロードしてください。

`index.html` はCSS/JSを `?v=1.8` 付きで読み込むため、GitHub PagesやiPhone Safariで旧ファイルが残る問題を抑えています。

## Supabase

既存の `poker_*` テーブルを作成済みの場合、v1.9ではDB構造の変更はありません。SQLの再実行は不要です。

新規セットアップの場合のみ `schema-v1.9.sql` をSupabase SQL Editorで実行してください。


## v1.9 changes
- OUT時刻でスタック線を0まで下降
- HOMEでプレイヤー別RE-ENTRY回数を表示
- PLAYERカード枠をトランプ要素込みで強化
