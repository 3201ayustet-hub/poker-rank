# Poker Rank v1.5

仲間内のポーカートーナメントを記録する、スマートフォン優先のWebアプリです。

## v1.5 の主な変更

- RECORDS: 4枚重ね表示を廃止し、安定した横スワイプ式1枚カルーセルへ変更
- RECORDS: カード選択に合わせて詳細パネルが切り替わる仕様を維持
- SESSION: Sessionごとにトーナメントチケット風の枠付きLedger表示へ変更
- PLAYERS: マイハンドを文字入力から、2枚それぞれ「ランク＋スート」のプルダウン選択へ変更
- MY HAND: 同じ物理カードを2枚選ぶ組み合わせは禁止
- OUT: プレイヤー名・現在スタックを確認してから確定する2段階操作
- HOME: LIVE順位・実時間ベースのスタック折れ線・理論AVERAGE表示
- Supabase CRUD / Realtime 同期を維持

## ファイル構成

すべて同一階層です。

- `index.html`
- `style.css`
- `app.js`
- `storage.js`
- `cloud.js`
- `config.js`
- `schema-v1.5.sql`
- `README.md`

## GitHub Pages

ZIPを展開し、上記8ファイルをGitHubリポジトリのルートへまとめてアップロードしてください。

## Supabase

v1.4までの `poker_*` テーブルを作成済みの場合、v1.5ではDB列の追加はありません。マイハンドは `my_hand` に `A♠K♥` のような2枚の実カード表現として保存します。

新規セットアップの場合は `schema-v1.5.sql` をSupabase SQL Editorで実行してください。

`config.js` にはSupabase Project URLとPublishable keyが設定されています。Secret/service_role keyはブラウザに置かないでください。
