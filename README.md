# Poker Rank v1.2

仲間内のポーカートーナメントを記録する、スマートフォン優先のローカルWebアプリです。
GitHub Pagesでそのまま公開でき、ビルド作業は不要です。

## v1.2 の主な変更

- HOMEを「現在開催中ゲームの観戦専用画面」に変更
- 開催中ゲームがない場合は `NO GAME IN PLAY` を表示
- iPhone Safe Areaを考慮し、上部の戻る／メニューボタンを押しやすく修正
- 現在順位をスタック順で大きく表示
- STACK HISTORYを棒グラフから実時間ベースの折れ線グラフへ変更
- プレイヤーごとの折れ線＋AVERAGE破線を表示
- OUTで線を終了し、RE-ENTRY時は開始スタックから新しい線を開始
- RE-ENTRY数は必ずPlayer IDで結果と紐付けて表示
- プレイヤー削除、ゲーム削除、Session削除を追加
- RECORDS画面をHall of Recordsとして再設計
- LIVE / Leader / Primary Action / OUTの視覚的優先順位を強化
- 深緑・シャンパンゴールド・エメラルドを中心に、ラスベガスの高級トーナメントルーム感を強化

## ファイル

この5ファイルをGitHubリポジトリ直下へアップロードしてください。

- `index.html`
- `style.css`
- `app.js`
- `storage.js`
- `README.md`

## データ保存

現在はブラウザの `localStorage` に保存します。同じ端末・同じブラウザで使用してください。
メニューからJSONバックアップのExport / Importが可能です。

将来の複数端末対応では、データアクセス部分をSupabaseへ移行する想定です。

## 注意

プレイヤー削除・ゲーム削除・Session削除は過去戦績にも影響します。削除前に確認ダイアログを表示しますが、必要に応じて先にバックアップをExportしてください。
