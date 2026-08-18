# Poker Rank v1.3

仲間内のポーカートーナメントを管理する、スマートフォン優先のWebアプリです。

## v1.3

- Supabase同期 / Realtime対応（同一URLを複数端末で共有）
- ローカル保存を残し、通信失敗時も端末側にデータ保持
- HOMEを観戦専用ライブボード化
- OUT後のAVERAGE STACKを「理論総チップ ÷ ACTIVE人数」に修正
- 実時間ベースの折れ線STACK HISTORY
- OUTで個人線を終了、RE-ENTRY時に開始スタックから新しい線を開始
- PLAYERSをMembers Card + My Handカードのデザインへ刷新
- RECORDSを4枚のPlaying CardによるHall of Recordsへ刷新
- HOME / SESSION / PLAYERS / RECORDSで物理モチーフを変え、単調な1色背景を廃止
- Safe Areaを拡大し、iPhone上部の操作性を改善

## GitHubへアップロード

すべてのファイルは1階層です。ZIPを展開し、GitHubの Upload files からまとめて選択してください。

- `index.html`
- `style.css`
- `app.js`
- `storage.js`
- `config.js`
- `cloud.js`
- `schema-v1.3.sql`
- `README.md`

## Supabase

`config.js` にProject URLとPublishable keyを設定済みです。

Supabase SQL Editorで `schema-v1.3.sql` の内容を実行してから公開してください。既存のhorse-bet-battle用テーブルには触れず、`poker_*` テーブルだけを使用します。

### セキュリティ

現在は「ログインなし・URLを知っている人が入力可能」というプロトタイプ仕様のため、`poker_*` テーブルをanonで読み書き可能にしています。Publishable keyはブラウザ利用を前提とするキーですが、URLを広く公開する運用には向きません。必要になったら共有コードや認証を追加してください。

## データ同期

画面操作時はまずLocalStorageに保存し、その後Supabaseへ同期します。Supabase Realtimeの変更を検知すると、他端末も最新データを再取得します。

## AVERAGE STACK

AVERAGEは各プレイヤーの直近入力値の単純平均ではありません。

`開始スタック × (初期参加人数 + 累計RE-ENTRY) ÷ ACTIVE人数`

で計算します。このため、OUT直後にもフィールドの理論平均スタックが正しく上昇します。
