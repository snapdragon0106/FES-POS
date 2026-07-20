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

## 未完了タスク

- [ ] **旧DB（Manus所有）の削除依頼** — 必須ではないが、気になるなら Manus サポートへ連絡
- [ ] **新DBパスワードのリセット** — 文化祭前の空き時間に。リセット後 `.env` と Render の両方を更新
- [ ] **`localStorage` へのJWT平文保存の見直し** — `client/src/pages/POSApp.tsx` が `pos_token` を `localStorage` に
      保存し、`main.tsx` が `x-pos-session` ヘッダで送る実装になっており、これが `httpOnly` cookieのXSS耐性を
      無効化している。元々はManusのiframeプレビュー内でサードパーティCookieが使えないための回避策だったが、
      現在はRenderの直接URLに移行済みなので**iframeプレビューを今後使わないと確定できれば、この回避策を削除して
      cookieのみに一本化できる**（保留中、iframe利用の有無が未確認のため）
- [ ] **スワイプ削除の実機確認** — タッチ操作の感触（吸い付き感・閾値の重さ）は実機でしか確認できていない。
      粒の粗さ・速度など、触った感想次第で `dissolve.ts` / `SwipeToDelete.tsx` の定数を微調整する想定
- [ ] （任意）会計のTOCTOU等は対処済みだが、それ以外の未監査領域（例: Manus由来の未使用OAuth/storageルートの
      完全削除）は今回のセキュリティ監査で「低リスクとして保留」扱いにしたものが残っている。詳細はコミット
      `b95406e` のコミットメッセージ参照
