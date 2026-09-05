# Shadowing Studio

ChatGPT などで作った英会話スクリプトを、男性 AI 音声のシャドーイング教材に変換する、モバイルファーストの Web アプリです。ログインはなく、教材・音声・録音は端末内に保存します。

ライブデモは GitHub Pages で配信します。TTS を使うには、下の手順で自分の Gemini API キーと Google Apps Script プロキシを用意し、アプリの設定画面に URL とトークンを入力してください。キーとトークンはリポジトリにもフロントエンドのビルドにも含めません。

## できること

- 英文スクリプトの貼り付け、文分割、結合・分割・並べ替え
- Gemini TTS による男性音声の生成（既定は Natural のみ。ゆっくり音声は設定でオプトイン）
- 先頭の文ができた時点で再生を開始（残りはバックグラウンド生成）
- 文単位の再生、前後移動、ループ、3 秒巻き戻し、0.8 / 1.0 / 1.2 倍速
- 英文の表示 / 非表示（非表示中はタップで 3 秒だけ表示）
- 自分の声の録音と、お手本 → 自分 → お手本の比較再生
- 苦手マーク、前回位置からの再開、JSON バックアップ / 復元
- ホーム画面追加と、生成済み音声のオフライン再生（PWA）

含めないもの: ユーザー登録、クラウド同期、音声クローン、発音採点、プッシュ通知、独自の間隔反復。

## 使い方

1. スクリプトをコピーし、「スクリプトを貼り付けて教材を作る」から貼り付ける
2. 分割結果を確認し、声を選んで「保存して音声を生成」
3. 先頭の文ができたら再生する。プレーヤーで速度・ループ・ポーズ・英文の表示を切り替える
4. マイクで録音し、比較再生する

TTS プロキシの前でも、設定の **デモモード** でダミー音声による操作確認ができます。

## 技術構成

| 層 | 技術 |
| --- | --- |
| Frontend | TypeScript, React, Vite, Tailwind CSS |
| PWA | vite-plugin-pwa / Workbox |
| 端末内 DB | IndexedDB + Dexie |
| TTS | Gemini Developer API（Google Apps Script プロキシ経由） |
| テスト | Vitest, Playwright |
| 配信 | GitHub Pages + GitHub Actions |

```text
[PWA]
  ├─ Script Parser / Lesson Editor / Player / Recorder
  └─ IndexedDB (lessons, segments, audio, recordings)

        HTTPS POST (text/plain JSON)

[Google Apps Script]
  ├─ SHARED_TOKEN の検証、文字数・日次上限
  └─ Gemini Developer API（キーは Script Properties）
```

API キーは GAS の Script Properties にだけ置きます。ブラウザのバンドル、IndexedDB、このリポジトリには含めません。GitHub Actions にもプロキシ URL とトークンを渡さないでください。渡すと Pages の JavaScript に焼き込まれます。

## 開発

```bash
npm install
npm run dev        # http://localhost:5173
```

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー（`--host` 付き） |
| `npm run build` | 型チェック + 本番ビルド |
| `npm run preview` | ビルド結果のローカル配信 |
| `npm test` | Vitest |
| `npm run test:e2e` | Playwright（初回は `npx playwright install chromium`） |
| `npm run lint` | ESLint |

開発ルールは [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

## TTS プロキシ（Google Apps Script）

1. [script.google.com](https://script.google.com) で新規プロジェクトを作成する
2. `gas/Code.gs` を貼り付ける。`gas/appsscript.json` は「マニフェストを表示」を有効にして置き換える
3. スクリプト プロパティを設定する

   | プロパティ | 値 |
   | --- | --- |
   | `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) の API キー |
   | `SHARED_TOKEN` | 長いランダム文字列（アプリ設定と一致させる） |
   | `MAX_CHARS` | 1 リクエストの最大文字数。既定 600 |
   | `DAILY_LIMIT` | 1 日あたりの最大生成回数。既定 400 |

4. `testSynthesize` を実行し、権限を承認する
5. ウェブアプリとしてデプロイする。「次のユーザーとして実行: 自分」「アクセスできるユーザー: 全員」
6. アプリの設定に Web App URL と共有トークンを入力し、接続テストする

コード更新時は「デプロイを管理 → 編集 → 新バージョン」で同じ URL のまま反映できます。Script Properties の変更は再デプロイ不要です。

補足:

- ブラウザからは `Content-Type: text/plain` の POST を送ります（GAS は CORS preflight に応答できないため）
- `localhost` では Vite の `/__tts_proxy` が GAS へ中継します。GitHub Pages では Web App URL へ直接 POST します
- Gemini の応答は raw PCM（16bit / 24kHz / mono）なので、ブラウザ側で WAV ヘッダを付けます
- 既定モデルは `gemini-2.5-flash-preview-tts`。請求残高が $0 の前払いプロジェクトでは全リクエストが 429 になります

## iPhone（PWA）

1. GitHub Pages の URL を Safari で開く（`npm run dev` の HTTP では録音できません）
2. 共有メニューから **ホーム画面に追加**
3. 設定でプロキシ URL とトークンを入力する（端末の localStorage）
4. 録音時はマイクを許可する
5. データ管理から永続ストレージを要求し、定期的に JSON バックアップを書き出す

## 再生速度と音声

- 0.8 / 1.0 / 1.2 倍。既定は Natural 音声を `playbackRate` で再生します
- 0.6〜0.7 倍相当が必要なときだけ、設定で Learning 音声（約 25% 遅く生成）をオンにします。API 呼び出しは 2 倍になります
- 既定の声は Schedar、予備は Iapetus

Natural / Learning のスタイルプロンプトは `src/services/tts/prompts.ts` にあります。

## ライセンス

[MIT](LICENSE)
