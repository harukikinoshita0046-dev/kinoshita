# HYROX AI Coach

「今日トレーニングする」とAIに伝えるだけで、AIが記録・分析・計画を回し続けるトレーニングOS（Phase 1 MVP）。

```
DATA ──▶ ANALYSIS ──▶ PROGRAM ──▶ TRAIN ──▶ DATA
 │          ChatGPT (AI Coach)        │
 │   GET /api/coach/context           │   App: 重量・回数・RPE・✓ だけ
 │   POST /api/coach/workouts ──▶ TODAY's WORKOUT
 └──────────── Supabase (Single Source of Truth) ◀─┘
```

| 役割 | 担当 |
|---|---|
| App（このリポジトリ） | 実行・記録（Next.js / React / TypeScript, PWA対応のモバイルUI） |
| Supabase | Single Source of Truth（Postgres + Auth + RLS） |
| ChatGPT | AI Coach（OpenAPI で定義された Coach API を GPT Action として呼ぶ） |
| Apple Watch / Apple Health | 身体データ（Phase 1: 手入力・インポート / Phase 2: ネイティブ連携） |

---

## 目次

- [Phase 1 で実装済みの機能](#phase-1-で実装済みの機能)
- [Setup](#setup)
- [Environment Variables](#environment-variables)
- [Supabase](#supabase)
- [Database](#database)
- [Development](#development)
- [Deployment](#deployment)
- [AI API](#ai-api)
- [Apple Health Phase 2](#apple-health-phase-2)
- [算出ロジック（Readiness ほか）](#算出ロジックreadiness-ほか)
- [既知の未実装・制約](#既知の未実装制約)

---

## Phase 1 で実装済みの機能

| 仕様 | 実装 |
|---|---|
| Authentication | Supabase Auth（メール + パスワード）。`proxy.ts` でセッション更新とログイン必須化。`ALLOWED_SIGNUP_EMAILS` でサインアップ制限 |
| Exercise Master | 30種目（仕様の20種目 + 10種目）を migration で投入。ID管理（`bench_press` など）。ユーザーごとに重量刻み（0.5〜10kg）・休憩秒数・非表示を設定、カスタム種目追加 |
| Workout Plan | `workout_plans` / `workout_plan_exercises`。`created_by` = `AI` / `USER`、`coach_reason`、セット・回数レンジ・重量・距離・時間・RPE・ペース・HRゾーン・休憩 |
| TODAY | 日付、Readiness（スコア + ラベル）、体重・睡眠・HRV・安静時心拍、今日のメニュー（AIバッジ・理由）、START WORKOUT / START RUN / START SIMULATION |
| Workout Logger | 大きな [−]/[＋] ステッパー（長押しで連続、数値タップで直接入力も可）、RPE タップ（6〜10 と .5）、✓ COMPLETE SET、Target / Previous / PB 表示、前回値・Target の自動入力、種目追加・入替、セット編集・削除、オフライン時は端末に保存して自動再送、画面スリープ防止 |
| Rest Timer | セット完了で自動開始（プラン or Exercise Master の秒数）、大きな残り時間、−15s / +15s / SKIP、終了時ビープ・振動、リロードしても継続 |
| Workout History | 週ごとのタイムライン（ワークアウト・ラン・HYROX）、詳細（Target vs 実績、PBバッジ、sRPE負荷）、削除 |
| Body Weight | 朝のチェックインで体重・睡眠・HRV・安静時心拍・主観（筋肉痛 / 疲労 / やる気 1〜5）を入力。7日平均・週変化・月変化・減量ペース・目標到達予測・グラフ |
| Running Log | ランタイプ8種、距離・時間・ペース・心拍・ケイデンス・RPE・HRゾーン・スプリット。プランからのインターバル実行画面（LAP・自動レスト・目標ペース判定） |
| HYROX Log | 8 Station の PB / Latest / Trend、相対的な弱点、ゴール差・必要ランペース、16セグメントのシミュレーションモード（Roxzone 計測・PB比較・Undo）、レース結果の手入力 |
| Coach Context API | `GET /api/coach/context` — AI向けに要約済みのコンテキスト（約15KB） |
| Coach Workout API | `POST /api/coach/workouts` ほか（計21オペレーション、OpenAPI 3.1） |
| Supabase RLS | 全テーブル RLS。所有者のみ CRUD、anon は全拒否、子テーブルは複合FKで他人の親に紐付け不可、トークンハッシュは本人も読めない |
| Responsive Mobile UI | iPhone 幅で横スクロールなし（E2Eで全画面チェック）、ダークモード基調、PWA manifest / アイコン |
| Dashboard / Progress | 7D / 30D / 3M / 6M / 1Y / ALL。BODY / RECOVERY / TRAINING / RUNNING / HYROX / STRENGTH、週次負荷（種類別）、走行距離、e1RM、HRV |
| AI INSIGHTS | ルールベースのインサイト（日本語）＋ ChatGPT が API で投稿したコーチノート |

---

## Setup

前提: Node.js 20.9 以上（22 推奨）、npm。

```bash
cd hyrox-coach
npm install
cp .env.example .env.local        # ローカル用の値がそのまま使えます
```

Supabase をローカルで起動します（どちらか一方）。

```bash
# A) Docker がある場合（公式）
npx supabase start                # .env.example の URL / キーと同じ値で起動します

# B) Docker がない場合（Linux x86_64 用の簡易スタック）
npm run db:start                  # Postgres 16 + Supabase Auth + PostgREST + ゲートウェイ（:54321）
```

マイグレーションとデモデータ:

```bash
npm run db:migrate                # supabase/migrations を適用（supabase db push --db-url）
npm run seed                      # demo@hyrox.local / hyrox-demo-2026 と42日分のデータ、Coach API トークンを出力
npm run dev                       # http://localhost:3000
```

`npm run seed` はデモユーザーを削除して作り直します。ローカル以外の Supabase には `SEED_ALLOW_REMOTE=1` を付けない限り実行されません。

---

## Environment Variables

| 変数 | 必須 | 公開範囲 | 説明 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ | ブラウザ | Supabase の API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✓ | ブラウザ | Publishable key（`sb_publishable_…`）または legacy anon key。`NEXT_PUBLIC_SUPABASE_ANON_KEY` でも可 |
| `SUPABASE_SECRET_KEY` | ✓ | **サーバーのみ** | Secret key（`sb_secret_…`）または legacy service_role key。`SUPABASE_SERVICE_ROLE_KEY` でも可。Coach API（トークン検証後）とシード・テストだけが使用。絶対に `NEXT_PUBLIC_` を付けない |
| `NEXT_PUBLIC_APP_URL` | 本番 ✓ | ブラウザ | 公開URL（例 `https://hyrox-coach.vercel.app`）。OpenAPI の `servers` と確認メールのリダイレクトに使用 |
| `COACH_API_RATE_LIMIT_PER_MINUTE` | | サーバー | トークンごとの上限（既定 60/分） |
| `ALLOWED_SIGNUP_EMAILS` | | サーバー | カンマ区切り。設定するとこのメールだけがアプリからサインアップ可能 |
| `SUPABASE_DB_URL` | | ローカル | `db:migrate` / `db:types` 用の Postgres URL（既定はローカル） |
| `APP_URL` | | テスト | 統合・E2Eテストの対象URL（既定 `http://localhost:3000`） |
| `SEED_EMAIL` / `SEED_PASSWORD` | | ローカル | デモユーザーを変える場合 |

---

## Supabase

### ホスト版プロジェクトの準備

1. [supabase.com](https://supabase.com) でプロジェクトを作成（リージョンは Tokyo 推奨）。
2. マイグレーションを適用（どちらか）:
   - **CLI**:
     ```bash
     npx supabase login
     npx supabase link --project-ref <project-ref>
     npx supabase db push
     ```
   - **ブラウザだけ**: [`supabase/setup-hosted.sql`](supabase/setup-hosted.sql)（全マイグレーションを1つにまとめたもの）の中身を Dashboard → SQL Editor に貼り付けて Run。空のプロジェクトで1回だけ実行します。マイグレーション履歴も記録するので、後から `db push` を使っても二重適用されません。マイグレーションを追加したら `npm run db:bundle` で再生成。
3. Authentication → URL Configuration: Site URL を本番URLに、Redirect URLs に `https://<your-app>/auth/confirm` を追加。
4. Authentication → Providers → Email を有効化（確認メールを使うかは任意。使う場合は `/auth/confirm` で処理されます）。
5. 自分のアカウントを作成したら **Authentication → Sign In / Up → Allow new users to sign up をオフ**（または `ALLOWED_SIGNUP_EMAILS` を設定）。
6. Project Settings → API Keys の publishable key / secret key を環境変数へ。

### ローカル

- `supabase start`（Docker）: `supabase/config.toml` を使用。ポート・キーは `.env.example` と一致。
- `npm run db:start`（Docker なし）: `scripts/local-stack/` が Postgres クラスタを `.local-stack/` に作成し、Supabase と同じロール（anon / authenticated / service_role / authenticator / supabase_auth_admin）とデフォルト権限を再現、Supabase Auth と PostgREST のリリースバイナリを起動します。PostgREST の `max_rows = 1000` も Supabase と同じ。停止は `npm run db:stop`。

---

## Database

マイグレーション（`supabase/migrations/`）:

| ファイル | 内容 |
|---|---|
| `…0100_core_schema.sql` | 全テーブル、制約、インデックス、`updated_at` トリガー |
| `…0200_rls_and_grants.sql` | RLS ポリシーと権限（anon には何も付与しない） |
| `…0300_analytics_views.sql` | `exercise_session_stats`（セッション×種目の集計）、`exercise_personal_bests`（heaviest / e1RM / most_reps / fastest）。どちらも `security_invoker` |
| `…0400_exercise_master_data.sql` | 組み込み種目（HYROX 8 Station は `hyrox_station_order` 1〜8） |
| `…0500_write_functions.sql` | `create_workout_plan`（冪等キー・同日置換）、`replace_workout_plan`、`create_hyrox_result` — 親子をまとめて1トランザクションで書き込む RPC |

主なテーブル:

| テーブル | 用途 |
|---|---|
| `profiles` | タイムゾーン（既定 Asia/Tokyo）、身長・最大心拍、目標体重、HYROX 部門・目標タイム・次のレース |
| `exercise_master` / `user_exercise_settings` | 種目マスタ（組み込み + カスタム）とユーザー別の重量刻み・休憩・非表示 |
| `workout_plans` / `workout_plan_exercises` | AI または本人が作ったメニュー（処方） |
| `workout_sessions` / `workout_sets` | 実績。`duration_seconds` は生成列 |
| `running_sessions` | ラン。`average_pace`（秒/km）は生成列、HRゾーン秒、スプリット |
| `hyrox_results` / `hyrox_splits` | レース・シミュレーション（16セグメント：奇数=Run、偶数=Station） |
| `body_metrics` / `health_metrics` / `readiness_checkins` | 日ごとの体組成・睡眠/HRV/安静時心拍・主観 |
| `coach_api_tokens` / `api_request_logs` | Coach API のトークン（SHA-256 のみ保存）とリクエストログ |
| `coach_insights` | AI が投稿したコーチノート |

設計ルール:

- 単位は列名かコメントで表し、値は数値（`weight = 82.5`）。重量 kg、距離 m（ランの集計のみ km）、時間・ペースは秒。
- `date` 列はアスリートのタイムゾーンでの暦日。サーバー（UTC）ではなくプロフィールのタイムゾーンで「今日」を決めます。
- すべてのユーザーデータ行に `user_id` を持たせ、RLS は列の比較だけ（`(select auth.uid()) = user_id`）。
- 子テーブルは `(parent_id, user_id)` の複合外部キーで親を参照するため、他人の親には絶対に紐付けられません。
- 型は `npm run db:types` で `src/lib/supabase/database.types.ts` に生成。

---

## Development

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm run build` / `npm start` | 本番ビルド / 起動 |
| `npm run lint` | ESLint（next/core-web-vitals + typescript + React Compiler ルール） |
| `npm run typecheck` | `next typegen && tsc --noEmit` |
| `npm test` | ユニットテスト（Vitest：Readiness、負荷/ACWR、e1RM・漸進性、体重トレンド、HYROX 分析、インサイト、フォーマット） |
| `npm run test:integration` | Supabase + 起動中のアプリに対する統合テスト（RLS、Coach API） |
| `npm run test:e2e` | Playwright（iPhone 13 サイズ、Chromium）。開始時にシードを入れ直す。`npm run build` 後に実行（`npm start` を自動起動） |
| `npm run seed` | デモデータ投入 |
| `npm run db:start` / `db:stop` / `db:migrate` / `db:types` | ローカル DB 操作 |

### テストと完成チェック（仕様 33）

| # | 項目 | テスト |
|---|---|---|
| ① | ログインできる | `tests/e2e/*`（全テストで UI ログイン） |
| ② | 今日のメニューが表示される | `workout.spec.ts` |
| ③④⑤⑥ | 重量・Reps 変更、RPE、Set Complete | `workout.spec.ts` |
| ⑦⑧ | Rest Timer が動く・次の Set へ | `workout.spec.ts` |
| ⑨⑩⑪ | 終了・Supabase 保存・History | `workout.spec.ts`（DBを直接確認） |
| ⑫ | Running 保存 | `logging.spec.ts` |
| ⑬ | HYROX 記録 | `logging.spec.ts`（16セグメントのシミュレーション） |
| ⑭⑮ | 体重保存・Context API に反映 | `logging.spec.ts` |
| ⑯⑰ | Workout API で作成 → TODAY に反映 | `logging.spec.ts`, `tests/integration/api.test.ts` |
| ⑱⑲ | RLS・他ユーザーのデータにアクセス不可 | `tests/integration/rls.test.ts`, `api.test.ts` |
| ⑳ | スマホ画面で操作できる | `mobile.spec.ts`（全主要画面で横スクロールなし・エラー画面なし） |

最終確認時の結果: ユニット 35件、統合 19件、E2E 7件すべて成功。`npm run build`・lint・typecheck エラーなし。

### ディレクトリ構成

```
src/
  app/
    (app)/            タブバー付き画面（today, history, hyrox, progress, profile, checkin, body, run/new …）
    (focus)/          トレーニング中の全画面（workout/[sessionId], run/live/[planId], hyrox/simulation）
    api/coach/        AI Coach API（Bearer トークン）
    login, auth/      認証
  components/         UI（Stepper, RPE, RestPanel, WorkoutLogger, charts …）
  lib/
    domain/           純粋関数（readiness, training-load, strength, body, hyrox, insights …）
    data/             Supabase アクセス（必ず user_id で絞り込み）
    coach/            API 基盤（認証・レート制限・ログ）、コンテキスト生成、OpenAPI、GPT 指示文
    supabase/         クライアント（browser / server / admin）と生成型
  proxy.ts            セッション更新・ログイン必須化（Next.js 16 の middleware）
supabase/             config.toml, migrations, seed.sql
scripts/              seed.ts, local-stack/
tests/                unit, integration, e2e
```

---

## Deployment

Vercel + Supabase（ホスト版）を想定しています。

1. 上記「Supabase」の手順でホスト版プロジェクトにマイグレーションを適用。
2. Vercel で GitHub リポジトリをインポートし、**Root Directory を `hyrox-coach`** に設定（Framework: Next.js、ビルドは既定のまま）。
3. Environment Variables に `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、`SUPABASE_SECRET_KEY`、`NEXT_PUBLIC_APP_URL`（Vercel のURL）、必要なら `ALLOWED_SIGNUP_EMAILS` を設定。
4. デプロイ後、アプリでアカウントを作成 → Supabase でサインアップを無効化。
5. Profile → AI Coach API でトークンを作成し、ChatGPT を接続（下記）。
6. iPhone の Safari で開き「ホーム画面に追加」すると全画面の PWA として使えます。

Vercel Functions のリージョンを Supabase と同じ東京（`hnd1`）にすると API が速くなります（Project Settings → Functions）。

> このセッションでは Supabase / Vercel の認証情報がないため、実際のデプロイは行っていません。ローカル（本番ビルド）でのみ検証済みです。

---

## AI API

外部の AI（ChatGPT など）がデータを読み、メニューを書き込むための API です。ブラウザ用の Supabase キーは使わず、**サーバー側でトークンを検証してから、そのトークン所有者の `user_id` に限定して** Supabase を操作します。

### 認証・セキュリティ

- トークン: アプリの Profile → AI Coach API で作成（`hxc_` + 256bit）。表示は作成時の1回だけで、DB には SHA-256 ハッシュのみ保存。スコープ `read` / `write`、有効期限、失効が設定可能。
- ヘッダー: `Authorization: Bearer hxc_…`
- レート制限: トークンごとに 60 リクエスト/分（`COACH_API_RATE_LIMIT_PER_MINUTE`）。認証失敗は IP ごとに 10分30回まで。
- 入力検証: zod + 種目IDの解決（名前やエイリアスも可）。未知の種目は 422 と有効なID一覧を返します。
- ボディ上限 256KB。全リクエストを `api_request_logs` に記録（アプリで直近のアクティビティを確認可能）。
- エラー形式: `{"error": {"code": "validation_error", "message": "...", "details": [...]}}`

### エンドポイント

| メソッド | パス | 用途 |
|---|---|---|
| GET | `/api/coach/context` | 今日の判断に必要な要約（体・回復・負荷/ACWR・直近セッション・ラン・HYROX・主要種目の直近3回とPB・今日/今後のプラン・インサイト） |
| GET | `/api/coach/exercises` | 種目ID一覧と記録方式 |
| GET | `/api/coach/exercises/{id}/history` | 種目ごとの直近セッション、PB、e1RM、Volume、平均RPE、漸進性ヒント |
| GET / POST | `/api/coach/workouts` | プラン一覧 / 作成（`replace_existing`, `idempotency_key`） |
| GET / PUT / PATCH / DELETE | `/api/coach/workouts/{id}` | 詳細（実績付き）/ 置換 / スキップ・キャンセル等 / キャンセル |
| GET | `/api/coach/sessions` | 実績（全セットとターゲット比較）—「今日の結果どうだった？」 |
| GET / POST | `/api/coach/runs` | ラン一覧 / 記録 |
| GET / POST | `/api/coach/hyrox` | HYROX 分析（弱点・ゴール差）/ 結果記録 |
| GET / POST | `/api/coach/body` | 体重トレンド / 記録 |
| GET / POST | `/api/coach/health` | 睡眠・HRV・安静時心拍 / インポート（1日分 or `{metrics:[…]}`） |
| GET / POST | `/api/coach/insights` | コーチノート一覧 / 投稿（アプリの AI INSIGHTS に表示） |
| GET | `/api/coach/ping` | トークン確認 |
| GET | `/api/coach/openapi.json` | OpenAPI 3.1（認証不要） |

### 例

```bash
curl -H "Authorization: Bearer $TOKEN" https://<app>/api/coach/context

curl -X POST https://<app>/api/coach/workouts \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "date": "2026-10-06",
    "title": "HYROX Upper",
    "workout_type": "Upper",
    "coach_reason": "HYROX pulling strength development",
    "idempotency_key": "2026-10-06-hyrox-upper",
    "exercises": [
      { "exercise_id": "pull_up", "sets": 4, "reps_min": 6, "reps_max": 10, "target_rpe": 8 },
      { "exercise_id": "bench_press", "sets": 4, "reps_min": 6, "reps_max": 8, "target_weight": 82.5, "target_rpe": 8 },
      { "exercise_id": "running", "sets": 6, "target_distance": 1000, "pace": "4:20-4:30", "hr_zone": 4, "rest_seconds": 90 }
    ]
  }'
```

`reps: "6-8"`、`pace: "4:20-4:30"`、`rest: "1:30"`、`"Wall Balls"` のような書き方も受け付けます（正規化して保存）。

### ChatGPT との接続（GPT Actions）

1. アプリを HTTPS で公開し、`NEXT_PUBLIC_APP_URL` を設定。
2. Profile → AI Coach API でトークン（read + write）を作成。
3. ChatGPT → GPT を作成 → Configure → Actions → Import from URL: `https://<app>/api/coach/openapi.json`
4. Authentication: API Key / Auth type: **Bearer** / トークンを貼り付け。
5. Instructions に [`src/lib/coach/gpt-instructions.ts`](src/lib/coach/gpt-instructions.ts) の文面（アプリの同じ画面からコピー可）を貼る。公開範囲は「自分のみ」。
6. 「今日トレーニングする」と送ると、GPT が `getCoachContext` → `createWorkoutPlan` を実行し、アプリの TODAY にメニューが表示されます。

GPT 指示文には優先順位（HYROX > 筋力 > 減量 > 筋量維持 > ラン > 回復）、漸進性（`suggestion` を基準）、回復が悪い日の Volume 削減（Readiness < 55、HRV 低下の連続、RHR 上昇、睡眠不足、主観）、ACWR > 1.5 での負荷調整、減量ペース、弱点 Station の処方、単位のルールを含めています。

---

## Apple Health Phase 2

**Web アプリは HealthKit に直接アクセスできません。** HealthKit は Apple のネイティブアプリ（iOS / watchOS）にだけ公開されています。そのため現在は次の形です。

| フェーズ | 内容 | 状態 |
|---|---|---|
| Phase 1: Manual | 朝のチェックイン画面で体重・睡眠・HRV・安静時心拍を入力（前日値から1〜2タップで調整） | ✅ 実装済み |
| Phase 1: Import-ready | `POST /api/coach/health`（日付ごとにマージ、`source: apple_health / import`）、ラン・体重も API で記録可能。ChatGPT に「睡眠7時間、HRV 58」と伝えると記録できる | ✅ 実装済み |
| Phase 1.5: iOS ショートカット | ショートカットの「ヘルスケアサンプルを検索」→「URLの内容を取得」で毎朝 `/api/coach/health` に POST（手順は Profile → Apple Health） | ⚠️ 手順のみ。実機では未検証 |
| Phase 2: iOS Companion | HealthKit から睡眠（Sleep Analysis）、HRV（SDNN）、安静時心拍、心拍、ワークアウト、ランの距離・ペース・HRゾーン、消費カロリー、歩数を Background Delivery で取得し、同じ API に書き込む（`external_id` で重複排除） | ❌ 未実装 |
| Phase 5: Watch App | 次の種目・重量確認、Reps 入力、Set Complete、Rest Timer、心拍 | ❌ 未実装 |

データモデルは最初から `health_metrics.source`（`apple_health / manual / import`）と `running_sessions.external_id` を持っているので、ネイティブアプリは API を呼ぶだけで追加できます。API とアプリ UI は分離しているため、iOS ネイティブ化の際も Supabase と Coach API はそのまま使えます。

---

## 算出ロジック（Readiness ほか）

- **Readiness（0〜100）**: 睡眠 25%（8時間基準）、HRV 25%（過去28日の個人ベースラインとの z スコア）、安静時心拍 15%（同）、前日の負荷 15%（普段のトレーニング日比 + ACWR）、主観 20%（筋肉痛・疲労・やる気）。データがない要素は除外して重みを再配分、2要素未満なら表示しません。85+ READY TO PUSH / 70+ GOOD / 55+ MODERATE / 40+ LOW / それ未満 RECOVER。**医学的な診断ではなく、トレーニング判断の補助指標です。**
- **トレーニング負荷**: session RPE × 分（Foster の sRPE）。ランで RPE が未入力ならランタイプから推定。ACWR = 直近7日 ÷（28日の週平均）。
- **e1RM**: Epley（重量 × (1 + 回数/30)、1〜12回のみ）。
- **漸進性ヒント**: ダブルプログレッション。全セットで上限回数かつ目標RPE以下 → 1刻み増量、下限未達が多い → 減量、それ以外 → 同重量で回数を伸ばす。
- **体重**: 7日平均、週変化（今週の7日平均 − 前週の7日平均）、月変化、週あたりの変化率、目標到達予測。
- **HYROX の相対的な弱点**: 各 Station がStation合計に占める割合を、約60分フィニッシャーの目安配分（`REFERENCE_STATION_SHARE`、概算）と比較。1より大きいほど相対的に時間がかかっている Station です。

---

## 既知の未実装・制約

- **Apple Health / Apple Watch のネイティブ連携は未実装**（Phase 2）。現在は手入力・API インポートのみ。iOS ショートカットの手順は実機で検証していません。
- **デプロイは未実施**（Vercel / Supabase の認証情報が必要）。ローカルの本番ビルドで検証済み。
- レストタイマー終了の通知は画面表示中のビープ・振動のみ（iOS Safari は振動非対応）。バックグラウンド通知（Push / ローカル通知）は未実装。
- Service Worker は未導入。セット記録はページ表示中であればオフラインでも端末に保存され、再接続時に送信されますが、アプリ自体のオフライン起動はできません。
- アプリ内でゼロからメニューを組む「プランビルダー」は未実装（AI がメニューを作る前提。手動はクイックスタート + 種目追加で対応）。
- アプリ内の AI チャットは未実装（ChatGPT 側で対話する設計）。AI INSIGHTS はルールベース + ChatGPT の投稿。
- HYROX Station の基準配分は概算です。Readiness・ACWR は個人ベースラインに基づくヒューリスティックで、医学的に検証されたものではありません。
- レート制限は DB のリクエストログを数える方式（同時多発リクエストでは多少超えることがあります）。
- E2E は Chromium の iPhone エミュレーションで実施しており、実機の iOS Safari では未検証です。
- タイムゾーンを変更しても過去データの日付は移動しません。
