【Poker Rank アイコン実装用ファイル】

既存のGitHub Pagesに、今回のラスベガス風ポーカーアイコンを設定するための差し替え・追加ファイルです。

1. 既存の index.html を、このフォルダ内の index.html に置き換え
2. manifest.webmanifest をリポジトリ直下に追加
3. icons フォルダをリポジトリ直下に追加
   - icon-192.png
   - icon-512.png
   - apple-touch-icon.png（iPhone/iPadのホーム画面用）
   - favicon-32.png
   - favicon.ico

他の app.js / style.css / cloud.js / storage.js / config.js は変更不要です。

【配置後の構成】
index.html
manifest.webmanifest
icons/icon-192.png
icons/icon-512.png
icons/apple-touch-icon.png
icons/favicon-32.png
icons/favicon.ico

※ index.html は icons/ 配下を参照するように修正済みです。
※ iPhoneで既にホーム画面へ追加済みの場合、古いアイコンが残ることがあります。その場合はいったんホーム画面から旧アイコンを削除し、Safariでページを開き直してから「ホーム画面に追加」してください。
