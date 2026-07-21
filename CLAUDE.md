# FES-POS — Claude Code 向けメモ

文化祭（経高祭）の物販POSシステム。React 19 + Vite + tRPC v11 + Drizzle ORM（MySQL/TiDB）。
実際の売上を扱う本番システムであり、Renderに自動デプロイされている。

## 環境

- **ローカルコマンドは PowerShell 前提**。`pnpm` は未インストールなので `corepack pnpm@10.4.1 <cmd>` を使う
  （例: `corepack pnpm@10.4.1 run check` / `run test` / `run build` / `exec drizzle-kit push` / `exec drizzle-kit studio`）
- `pnpm dev` の script は `NODE_ENV=development tsx watch ...` という POSIX 構文で **PowerShell では動かない**（Git Bash か cross-env が必要）
- `.env` はリポジトリ直下にあり `.gitignore` 済み。`DATABASE_URL`（自前のTiDB Cloudクラスタ、後述）を保持
- ローカルの `.env` の拡張子 `.env` は Windows で Maya に関連付けられているため、開くときは右クリック→メモ帳、または `notepad .env`

## DBについて（重要な経緯）

- **旧DB（Manus所有のTiDBクラスタ）から、ユーザー自身のTiDB Cloudクラスタへ移行済み**。移行日は会話ログ参照。
  Render の `DATABASE_URL` は新クラスタを指している
- 旧DBの認証情報は過去のチャット履歴に平文で残っているが、**Manus所有のため我々の側では無効化できない**。
  気になる場合はユーザーからManusサポートへ削除依頼が必要
- 新DBのパスワードもチャット履歴に一度露出している。**文化祭前の落ち着いたタイミングでリセット推奨**
  （TiDB Cloud → Connect → Reset Password → `.env` と Render 双方を更新。一時的に本番が落ちる）
- DBのスキーマは `drizzle/schema.ts` が正。**`drizzle-kit push`（マイグレーションファイル方式ではない）を使うこと**。
  過去に `drizzle-kit generate && drizzle-kit migrate`（`db:push` script）と実DBの間でドリフトが起きた前科があるため
- `server/db.ts` の `ensure*` 系関数（`ensurePinColumnWidth` / `ensureAccountingTable` / `ensureTimestampColumns`）は
  起動のたびに実行される自己修復マイグレーション。スキーマを変えたら、ここに同種の `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
  を足すのが最も安全（本番DBに手動でSQLを流す前提を作らない）

## セキュリティ上の設計判断（変更時に注意）

- `server/_core/env.ts` は起動時に **`JWT_SECRET` が32文字未満だとthrowする**（fail-fast）。
  Renderには設定済みだが、ローカルの `vitest.config.ts` にテスト専用のダミー値を注入している。
  このダミー値を消すとテストスイート全体が起動時に落ちる
- `server/rateLimiter.ts` は `posSession.login` と `accessCode.verify` 用の簡易メモリ内レート制限（5回失敗で5分ロック）。
  **単一インスタンス前提**。複数インスタンスにスケールする場合は共有ストアへの移行が必要
- `server/posAuth.ts` の `verifyPosSession` は、JWTの署名検証に加えて毎リクエスト `MEMBERS` 名簿とID範囲を再検証する
  （多層防御）。署名鍵が万一漏れても、名簿外のoperatorIdでは通らない
- `server/routers.ts` の `transaction.create` は `db.createTransactionSerialized`（`server/db.ts`）でDBトランザクション化されており、
  関係する `products` 行を `SELECT ... FOR UPDATE` でロックしてから在庫チェック→挿入する。複数レジの同時会計で在庫が
  マイナスになる問題（TOCTOU）と、同一商品の重複明細が在庫チェックを素通りする問題への対処。**この構造を崩さないこと**
- `restock.create` は管理者限定（`posAdminProcedure`）。過去に一度 `posAuthenticatedProcedure` へ格下げされ、
  UI側の権限ゲート（`InventoryTab.tsx` の `isAdmin` 表示制御）だけに頼る状態になっていた実例があるため、
  **サーバー側の権限チェックとUI側の表示制御は必ず両方揃える**

## モーション設計（HarmonyOS方針）

最新HarmonyOS（ArkUI）のモーション値を実測ベースで移植している。詳細は以下のファイル参照:

- `client/src/index.css` の `/* ===== HarmonyOS (ArkUI) motion system ===== */` 以下 —
  ArkUIの標準イージング5種（cubic-bezier）と、物理定数（springMotion 130/19、interpolatingSpring 225/30）から
  生成した `linear()` スプリングイージング。**この `linear()` 文字列は手打ちしない**。
  `spring→linear()` ジェネレータで生成すること（会話ログにNode.jsスクリプトあり）
- `client/src/lib/dissolve.ts` — 削除時の「粉々に散って消える」ディゾルブ演出。ノイズアルファマスク＋高さ折り畳みで、
  GPU完結（canvasパーティクル爆発やライブSVGフィルタは中級スマホで重いため不採用）。`prefers-reduced-motion` では
  マスクなしの単純フェードに劣化する
- `client/src/components/pos/SwipeToDelete.tsx` — スマホの通知風スワイプ削除。**タッチのみ反応**（PCマウスは従来の
  確認ダイアログ付きゴミ箱ボタンのまま）。取引履歴は復元不能なデータのため `commitFraction={0.55}` `allowFlick={false}`
  で長い意図的なドラッグのみ確定するよう厳しくしてある。商品管理は標準（`0.4`、フリック可）
- **リスト行のCSSクラス（`.ws-card`）には `transition: transform 0.3s` が付いている**。JSでドラッグ中に`transform`を
  書き換えるコードを新設する場合、このトランジションと必ず競合する（指の位置に遅延して追従する不具合になる）。
  `SwipeToDelete.tsx` の実装のように、ドラッグ開始時に `el.style.transition = 'none'` を明示的に設定し、
  ジェスチャ終了時に空文字へ戻すこと
- framer-motionは依存関係にあるが、`AnimatePresence`/`usePresence` による退場アニメーションは**一度試して実機で
  機能しなかった**（原因未特定）。以降、リストの退場演出は `dissolveOut()` のような命令的（WAAPI直接操作）な方式に
  統一している。retryする場合は必ず実機（または本物のブラウザでの`getAnimations()`チェック等）で動作確認すること

## Androidアプリ（Capacitor）

文化祭という短期イベント用途・Apple製品を所有していないという制約から、iOSネイティブ化は見送り、
**Androidのみ** Capacitorでネイティブラップし、APKを直接配布（Google Play審査なし）する方針にした。

- `capacitor.config.ts` の `server.url` が `https://fes-pos.onrender.com` を直接指す構成。つまりWebViewが
  本番Renderをそのまま表示するだけで、**アプリ側のコードは一切変更していない**（tRPCクライアントの相対URL
  `/api/trpc` もそのまま機能する）。デメリットは起動のたびにネット接続が必須なこと ＝ 現状のブラウザ版と同条件
- Render側を更新すれば、アプリ側は再ビルド・再配布なしに次回起動時から反映される
- appId: `com.keikousai.fespos` / appName: `FES POS`
- ビルド手順（Windows・PowerShell前提）:
  1. `corepack pnpm@10.4.1 exec vite build`（`dist/public` を生成）
  2. `corepack pnpm@10.4.1 exec cap sync android`（webの変更をネイティブプロジェクトに反映。ただし
     `server.url` を使っている限り実際にWebViewが読むのは常にRenderの最新版なので、このステップ自体は
     必須ではない。ネイティブ側の設定・プラグイン変更をしたときだけ必要）
  3. `cd android`
  4. `$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"`
     （`java` がPATHに無いため、Android Studio同梱のJBRを明示的に指定する）
  5. `$env:ANDROID_HOME = "C:\Users\snapd\AppData\Local\Android\Sdk"`
  6. `.\gradlew.bat assembleDebug` → `android/app/build/outputs/apk/debug/app-debug.apk` が生成される
- `android/gradle.properties` に `android.overridePathCheck=true` を追加済み。このリポジトリがOneDrive配下の
  日本語パス（`ドキュメント`）にあるため、Android Gradle Pluginの非ASCIIパスチェックでビルドが失敗する対策
- `android/local.properties`（SDKパスを書いたマシン固有ファイル）は `.gitignore` 済み。他のマシンでビルドする
  場合は `sdk.dir=<そのマシンのAndroid SDKパス>` を書いた同名ファイルを自分で作る必要がある
- 現在のAPKは**デバッグ署名**。サイドローディング配布には問題ないが、Google Play公開には別途リリース署名が必要
- アイコン・スプラッシュ画面はCapacitor初期テンプレートのまま未変更

## 未完了タスク

- [ ] **旧DB（Manus所有）の削除依頼** — 必須ではないが、気になるなら Manus サポートへ連絡
- [ ] **新DBパスワードのリセット** — 文化祭前の空き時間に。リセット後 `.env` と Render の両方を更新
- [ ] **スワイプ削除の実機確認** — タッチ操作の感触（吸い付き感・閾値の重さ）は実機でしか確認できていない。
      粒の粗さ・速度など、触った感想次第で `dissolve.ts` / `SwipeToDelete.tsx` の定数を微調整する想定
- [ ] **Androidアプリのアイコン・スプラッシュ画面差し替え** — 現状Capacitorの初期テンプレート画像のまま。
      店舗絵文字（🏪）ベースのアイコンに差し替える想定（`android/app/src/main/res/mipmap-*` 等）
- [ ] **Androidアプリのリリース署名** — 現在のAPKはデバッグ署名（サイドローディング配布には十分）。
      Google Playに公開する場合は別途リリースキーストアの作成・署名設定が必要
- [ ] （任意）会計のTOCTOU等は対処済みだが、それ以外の未監査領域（例: Manus由来の未使用OAuth/storageルートの
      完全削除）は今回のセキュリティ監査で「低リスクとして保留」扱いにしたものが残っている。詳細はコミット
      `b95406e` のコミットメッセージ参照

### 完了済み: `localStorage` へのJWT平文保存の見直し

Manusのiframeプレビューは今後使わないと確定したため、POS session token（JWT）は **httpOnly cookieのみに一本化**した。
- `server/posAuth.ts` — `x-pos-session` ヘッダによるトークン抽出経路を削除。`pos_session` cookieのみを見る
- `server/routers.ts` — `posSession.login` のレスポンスから生JWT（`token`フィールド）を削除。cookieは
  `setPosSessionCookie` で従来通りサーバー側から発行
- `client/src/main.tsx` — `localStorage` からトークンを読んで `x-pos-session` ヘッダに載せる処理を削除。
  `credentials: "include"` によりcookieが自動送信される。移行期に残る古い `pos_token` は起動時に一度だけ削除
- `client/src/pages/POSApp.tsx` / `POSLogin.tsx` — `pos_token` の保存・参照を全廃。ログイン状態の復元は
  `pos_operator`（IDのみ、秘密情報ではない）の有無だけで判断し、cookieが無効ならAPI呼び出しが401になって
  自動的にログイン画面へ戻る（既存の `redirectToLoginIfUnauthorized` の仕組みをそのまま利用）
