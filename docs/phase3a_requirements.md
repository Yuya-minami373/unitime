# UniTime Phase 3a 要件定義書

| 項目 | 内容 |
|------|------|
| 作成日 | 2026-04-26 |
| 作成者 | カイ（業務アプリ構築エージェント）+ 見波祐哉 |
| 対象 | UniTime（社内労務管理ツール） |
| Phase | **Phase 3a: クルー名簿・案件マスタ・希望日入力・手動シフト・代行打刻・案件別稼働コスト集計** |
| ステータス | ユニポcheck待ち |

---

## 1. 背景・目的

### 1.1 背景
- UniTime Phase 1（2026-04-21〜）: 社員・業務委託向けの打刻・立替精算・領収書管理が稼働中
- UniPollクルー事業: 直近受託予定はないが、将来の数百人規模を見据えた基盤を **先回りで構築** したい
- 受託発生後では運用しながらの仕様変更で混乱するため、**事前構築でリリース時の手戻りを最小化** する

### 1.2 目的
1. **クルー数百人時代を支える運用基盤** を確立する
2. **案件別クルー稼働コスト** を自動集計し、unipoll-finance（管理会計）に渡せる形にする
3. クルー本人・現場マネージャー・管理者の三者が無理なく使える UX を提供する
4. 将来の AI シフト生成（Phase 3b・ジン経由）の **データ土台** を整える

### 1.3 非目的（スコープ外）
- 売上・請求額の管理（unipoll-finance に集約）
- AI 自動シフト生成（Phase 3b）
- LINE / SMS 通知（Phase 3b 以降）
- 採用フロー（ジンが担当）
- UniGuide への配置可視化（Phase 5 以降）

---

## 2. スコープ

### 2.1 Phase 3a スコープ（本要件）

| カテゴリ | 内容 |
|---------|------|
| **マスタ** | 自治体・投票所・役割・案件・案件×役割の標準時給・必要人数定義 |
| **クルー名簿** | プロフィール（経験・登録ステータス・交通費単価）・稼働可能自治体（N対N） |
| **シフト希望** | クルーが日付×フェーズで希望入力（○ 前半／○ 後半／○ 1日／× NG） |
| **シフト確定** | 管理者が期間一括コピー＋個別調整で作成 |
| **打刻** | クルー本人打刻（出退勤ボタンのみ）＋ 現場マネージャー代行打刻（投票所単位の一括チェック） |
| **集計** | 案件別クルー稼働コスト（時給×シフト予定時間 + 交通費）の自動集計 API |
| **通知** | UniTime 内通知センター + メール（Resend or AWS SES） |

### 2.2 Phase 3b（次フェーズ・別要件）

- AI 自動シフト生成（ジン経由・Claude API + Structured Outputs）
- LINE 公式アカウント連携（セグメント配信）
- シフト調整チャット（管理者×クルー）
- 採算ダッシュボード高度化

### 2.3 Phase 5 以降

- ジン採用フローとの自動連携（応募者 → クルー登録）
- UniGuide 可視化 API（投票所単位の配置人数を UniGuide-prod から閲覧）
- unipoll-finance への稼働コスト自動連携（freee タグ＝自治体名で名寄せ）

---

## 3. ユーザー種別と権限

### 3.1 ユーザー種別

| 種別 | `users.employment_type` | UniTime ログイン |
|------|------------------------|----------------|
| オーナー | `owner` | ✅ 全権限 |
| 社員 | `employee` | ✅ 自分の打刻・立替精算 |
| 業務委託 | `contractor` | ✅ 自分の打刻・立替精算 |
| **クルー（一般）** | `crew` | ✅ 出退勤ボタン + シフト希望入力 + 自分のシフト閲覧 |
| **クルー（庶務）** | `crew` + `role_in_election=庶務` | ✅ 同上 |
| **クルー（現場マネージャー）** | `crew` + `role_in_election=現場マネージャー` | ✅ 同上 + 担当投票所のクルー代行打刻 |

### 3.2 既存仕様との変更点

| 既存 | 変更後 | 理由 |
|------|-------|------|
| `users.password_hash` NOT NULL | **NULLABLE** | クルー本人ログイン未利用ケースに対応（紙運用 → 段階的にスマホ化） |
| クルー対象画面: 打刻のみ | 打刻 + シフト希望入力 + 自分のシフト閲覧 | 祐哉さん意向: クルー本人にもアプリで完結させたい |
| `attendance_records.user_id` のみ | `attendance_records.user_id` + **`crew_shift_id` FK 追加** | クルー打刻はシフト紐付け必須（採算計算のため） |

### 3.3 権限マトリクス（Phase 3a 実装範囲）

| 操作 | オーナー | 現場マネージャー | クルー | 社員/業務委託 |
|------|---------|-----------------|--------|--------------|
| 案件マスタ作成・編集 | ✅ | ❌ | ❌ | ❌ |
| 投票所マスタ作成・編集 | ✅ | ❌ | ❌ | ❌ |
| クルー名簿管理 | ✅ | ❌ | ❌ | ❌ |
| 必要人数定義 | ✅ | ❌ | ❌ | ❌ |
| シフト確定（自分の案件） | ✅ | ❌ | ❌ | ❌ |
| シフト希望入力（自分の） | ❌ | ✅ | ✅ | ❌ |
| 自分のシフト閲覧 | ✅ | ✅ | ✅ | ❌ |
| 自分の打刻（出退勤） | ✅ | ✅ | ✅ | ✅ |
| 担当投票所のクルー代行打刻 | ✅ | ✅（自分の担当投票所のみ） | ❌ | ❌ |
| 案件別稼働コスト閲覧 | ✅ | ❌ | ❌ | ❌ |

---

## 4. データモデル

### 4.1 ER 図（テキスト版）

```
┌────────────────┐
│ municipalities │ 自治体マスタ（深谷市・市原市…）freee タグキー
└───────┬────────┘
        │
        ├──────────────────┐
        ▼                  ▼
┌────────────────┐  ┌────────────────┐
│polling_stations│  │   elections    │ 案件マスタ（自治体×選挙日）
│投票所マスタ     │  └───────┬────────┘
│uniguide_polling_id│          │
└───────┬────────┘            │
        │                      │
        │                      ├──────────────────┐
        │                      ▼                  ▼
        │            ┌──────────────────┐  ┌────────────────┐
        │            │election_role_rates│  │election_staffing│
        │            │ 案件×役割の時給   │  │ _requirements   │
        │            └──────────────────┘  │ 投票所×日×フェーズ│
        │                                   │ ×役割の必要人数   │
        │                                   └────────┬───────┘
        │                                            │
        ▼                                            ▼
        └──────────┬─────────────┐         ┌──────────────────┐
                   ▼             │         │  shift_preferences│
            ┌────────────┐       │         │ クルーの希望入力   │
            │crew_shifts │◄──────┘         └──────────────────┘
            │ シフト確定  │
            └─────┬──────┘
                  │
                  ▼
        ┌──────────────────┐         ┌────────────────┐
        │attendance_records│         │      users     │
        │ + crew_shift_id  │◄────────┤ + phone/address│
        │ + registered_by  │         │ + password NULL│
        └──────────────────┘         │ OK             │
                                     └───────┬────────┘
                                             │
                          ┌──────────────────┼─────────────────┐
                          ▼                  ▼                 ▼
                 ┌────────────────┐  ┌──────────────┐  ┌────────────┐
                 │crew_profiles   │  │crew_available│  │notifications│
                 │ プロフィール    │  │_municipalities│  │ 通知センター│
                 │ (1:1)          │  │ (N対N)       │  └────────────┘
                 └────────────────┘  └──────────────┘
                                       │       │
                                       ▼       │
                                 (municipalities)│
                                                │
                          ┌────────────────┐
                          │  roles         │ 役割マスタ
                          │ 一般/庶務/      │
                          │ 現場マネージャー│
                          └────────────────┘
```

### 4.2 テーブル定義（CREATE 文）

#### 4.2.1 自治体マスタ（新規）

```sql
CREATE TABLE municipalities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,           -- 深谷市・市原市…（freee タグと一致させる）
  prefecture TEXT,                     -- 埼玉県・千葉県…
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_municipalities_name ON municipalities(name);
```

#### 4.2.2 投票所マスタ（新規）

```sql
CREATE TABLE polling_stations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  municipality_id INTEGER NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                  -- ○○小学校・△△公民館
  address TEXT,
  latitude REAL,
  longitude REAL,
  uniguide_polling_id TEXT,            -- 将来 UniGuide-prod と連携時の参照ID（NULL OK）
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(municipality_id, name)
);

CREATE INDEX idx_polling_stations_municipality ON polling_stations(municipality_id);
```

#### 4.2.3 役割マスタ（新規）

```sql
CREATE TABLE roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,           -- 一般・庶務・現場マネージャー
  description TEXT,
  is_default INTEGER NOT NULL DEFAULT 0, -- シード3件は1
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- シードデータ
INSERT INTO roles (name, description, is_default, display_order) VALUES
  ('一般', '用紙交付・名簿対照・受付・案内整理を回しながら担当', 1, 1),
  ('庶務', '事務作業・備品管理・記録', 1, 2),
  ('現場マネージャー', '投票所責任者・クルーの代行打刻可', 1, 3);
```

#### 4.2.4 案件マスタ（新規）

```sql
CREATE TABLE elections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  municipality_id INTEGER NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                  -- 「2026年4月深谷市議選」「2026年7月参院選＋県知事選」
  election_date TEXT NOT NULL,         -- 投開票日（YYYY-MM-DD）
  prevoting_start_date TEXT,           -- 期日前開始日
  prevoting_end_date TEXT,             -- 期日前終了日
  status TEXT NOT NULL DEFAULT 'planning', -- planning / recruiting / in_progress / completed / cancelled
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_elections_municipality ON elections(municipality_id);
CREATE INDEX idx_elections_date ON elections(election_date);
CREATE INDEX idx_elections_status ON elections(status);
```

> 補足: 同日複数選挙（県知事＋県議の同日執行など）は `name` に複合表記（例: 「2026年7月参院選＋県知事選」）して 1案件にまとめる。

#### 4.2.5 案件×役割 標準時給（新規）

```sql
CREATE TABLE election_role_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  hourly_rate INTEGER NOT NULL,        -- 円/時
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(election_id, role_id)
);

CREATE INDEX idx_election_role_rates_election ON election_role_rates(election_id);
```

#### 4.2.6 必要人数定義（新規）

```sql
CREATE TABLE election_staffing_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  polling_station_id INTEGER NOT NULL REFERENCES polling_stations(id) ON DELETE CASCADE,
  date TEXT NOT NULL,                  -- YYYY-MM-DD
  phase TEXT NOT NULL,                 -- prevoting / election_day / counting
  shift_type TEXT NOT NULL,            -- first_half / second_half / full_day
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  required_count INTEGER NOT NULL,
  scheduled_start TEXT,                -- HH:MM (シフト枠の予定時刻)
  scheduled_end TEXT,                  -- HH:MM
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(election_id, polling_station_id, date, phase, shift_type, role_id)
);

CREATE INDEX idx_staffing_election ON election_staffing_requirements(election_id);
CREATE INDEX idx_staffing_date ON election_staffing_requirements(date);
```

#### 4.2.7 users テーブル拡張（既存変更）

```sql
-- マイグレーション (既存テーブルへの ALTER)
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN postal_code TEXT;
ALTER TABLE users ADD COLUMN address TEXT;
ALTER TABLE users ADD COLUMN emergency_contact TEXT;

-- password_hash を NULLABLE に変更（SQLite は ALTER で NULL 化できないため、テーブル再作成が必要）
-- ※マイグレーション実装時は既存データを退避→新スキーマで作り直し→データ戻しの手順を踏む
```

#### 4.2.8 クループロフィール（新規）

```sql
CREATE TABLE crew_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  registration_status TEXT NOT NULL DEFAULT 'active', -- active / suspended / withdrawn
  registered_at TEXT NOT NULL DEFAULT (datetime('now')),
  default_role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL,
  has_election_day_experience INTEGER NOT NULL DEFAULT 0,
  has_prevoting_experience INTEGER NOT NULL DEFAULT 0,
  has_counting_experience INTEGER NOT NULL DEFAULT 0,
  transportation_unit_cost INTEGER NOT NULL DEFAULT 0, -- 1出勤あたりの交通費（円）
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_crew_profiles_status ON crew_profiles(registration_status);
```

#### 4.2.9 稼働可能自治体（新規・N対N）

```sql
CREATE TABLE crew_available_municipalities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  municipality_id INTEGER NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
  registered_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, municipality_id)
);

CREATE INDEX idx_crew_avail_user ON crew_available_municipalities(user_id);
CREATE INDEX idx_crew_avail_municipality ON crew_available_municipalities(municipality_id);
```

#### 4.2.10 シフト希望（新規）

```sql
CREATE TABLE shift_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,                  -- YYYY-MM-DD
  preference TEXT NOT NULL,            -- full_day / first_half / second_half / unavailable
  notes TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(election_id, user_id, date)
);

CREATE INDEX idx_shift_pref_election ON shift_preferences(election_id);
CREATE INDEX idx_shift_pref_user ON shift_preferences(user_id);
CREATE INDEX idx_shift_pref_date ON shift_preferences(date);
```

#### 4.2.11 シフト確定（新規）

```sql
CREATE TABLE crew_shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  polling_station_id INTEGER NOT NULL REFERENCES polling_stations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  date TEXT NOT NULL,                  -- YYYY-MM-DD
  phase TEXT NOT NULL,                 -- prevoting / election_day / counting
  shift_type TEXT NOT NULL,            -- first_half / second_half / full_day
  scheduled_start TEXT NOT NULL,       -- HH:MM
  scheduled_end TEXT NOT NULL,         -- HH:MM
  hourly_rate INTEGER NOT NULL,        -- 円/時（election_role_rates から自動セット、上書き可能）
  status TEXT NOT NULL DEFAULT 'confirmed', -- confirmed / cancelled / completed
  cancellation_reason TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(election_id, user_id, date, shift_type)
);

CREATE INDEX idx_crew_shifts_election ON crew_shifts(election_id);
CREATE INDEX idx_crew_shifts_user ON crew_shifts(user_id);
CREATE INDEX idx_crew_shifts_polling ON crew_shifts(polling_station_id);
CREATE INDEX idx_crew_shifts_date ON crew_shifts(date);
```

> 補足:
> - 半日交代の場合は同じユーザーが同じ日に最大2レコード（first_half + second_half）入る。`UNIQUE(election_id, user_id, date, shift_type)` でこれを許容。
> - 通し勤務は `shift_type=full_day` で1レコードのみ。

#### 4.2.12 attendance_records 拡張（既存変更）

```sql
ALTER TABLE attendance_records ADD COLUMN crew_shift_id INTEGER REFERENCES crew_shifts(id) ON DELETE SET NULL;
ALTER TABLE attendance_records ADD COLUMN registered_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_attendance_crew_shift ON attendance_records(crew_shift_id);
```

> `registered_by_user_id`: 代行打刻時に「誰が代行したか」を記録。本人打刻時は NULL or `user_id` と同値。

#### 4.2.13 通知センター（新規）

```sql
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                  -- shift_confirmed / shift_changed / reminder / system
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  related_election_id INTEGER REFERENCES elections(id) ON DELETE SET NULL,
  related_shift_id INTEGER REFERENCES crew_shifts(id) ON DELETE SET NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  email_sent_at TEXT,                  -- メール送信完了時刻
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_created ON notifications(created_at);
```

---

## 5. 業務フロー

### 5.1 案件発生から完了までの全体フロー

```
[1. 案件登録]
管理者 → 案件マスタ作成（自治体・選挙名・期日前期間・投開票日）
       → 投票所マスタ確認/追加（自治体に未登録なら追加）
       → 案件×役割の標準時給を設定
       → 必要人数定義（投票所×日×フェーズ×役割×人数）
       ↓
[2. クルー募集]
管理者 → 案件のステータスを「recruiting」に変更
       → クルー名簿から「該当自治体に登録があるクルー」を抽出
       → 通知（メール+UniTime内）「○○市選挙 期日前4/15-4/27 当日4/28 募集」
       → クルー本人画面に「希望日入力」リンクを表示
       ↓
[3. 希望日収集]
クルー → ログイン → 「希望日入力」画面
       → 日付ごとに ○ 前半 / ○ 後半 / ○ 1日 / × NG を選択
       → 締切日まで何度でも修正可能
       ↓
[4. シフト作成]
管理者 → 「希望日マトリクス」画面で希望状況を確認
       → 「シフト編集」画面で:
         a. 期間一括コピー（4/15-4/27 月-土・前半=田中・後半=佐藤）
         b. 個別日調整（4/20 だけ別の人）
       → シフト確定ボタン → crew_shifts に INSERT
       → 案件のステータスを「in_progress」に変更
       → 確定通知（メール+UniTime内）「シフトが確定しました。詳細は確認してください」
       ↓
[5. 当日打刻]
クルー → ログイン → ホーム画面に「今日のシフト」カード
       → [出勤] ボタン → attendance_records INSERT (crew_shift_id 紐付け)
       → 退勤時に [退勤] ボタン
   OR
現場マネージャー → 「本日の配置一覧」画面（投票所単位）
                → 未打刻者をハイライト
                → ワンタップで代行確定（registered_by_user_id 記録）
       ↓
[6. 案件終了・集計]
管理者 → 案件のステータスを「completed」に変更
       → 案件別稼働コスト集計画面
         - クルーごとの稼働時間（シフト予定ベース）
         - クルーごとの支払額（時給×時間）
         - 交通費（出勤日数×単価）
         - 案件総コスト
       → CSV エクスポート → unipoll-finance に取り込み
```

### 5.2 シフト時刻と実時刻の扱い

| 用途 | 使う時刻 |
|------|---------|
| 表示・記録 | 実時刻（クルーが押した時刻） |
| **支払い計算** | シフト予定時刻（`crew_shifts.scheduled_start/end` ベース） |

> 「早く来たから余計に払う／遅刻したから減額」は無し。極端な遅刻・欠勤は管理者が `crew_shifts.status='cancelled'` + `cancellation_reason` で記録する運用。

---

## 6. UI 構想

### 6.1 管理者画面（オーナー / 既存 `/admin` 系を拡張）

| パス | 画面 | 主要機能 |
|------|------|---------|
| `/admin/municipalities` | 自治体マスタ管理 | CRUD |
| `/admin/polling-stations` | 投票所マスタ管理 | CRUD・自治体フィルタ |
| `/admin/crews` | クルー名簿 | 一覧・新規登録・編集・ステータス変更・経験フラグ |
| `/admin/elections` | 案件一覧 | ステータス別フィルタ・新規登録 |
| `/admin/elections/[id]` | 案件詳細 | 概要・必要人数定義・標準時給・候補クルー一覧 |
| `/admin/elections/[id]/preferences` | 希望日マトリクス | 行=クルー、列=日付。色分け表示 |
| `/admin/elections/[id]/shifts` | シフト編集 | 期間一括コピー＋個別調整・投票所別タブ |
| `/admin/elections/[id]/coverage` | 充足状況 | 必要人数 vs 確定人数を投票所×日×フェーズで可視化 |
| `/admin/elections/[id]/cost` | 案件別稼働コスト | クルー別支払額・交通費・総コスト・CSV出力 |
| `/admin/polling-stations/[id]/today` | 本日の配置一覧 | 現場マネージャーが代行打刻する画面 |

### 6.2 クルー本人画面（新規 `/crew` 系）

| パス | 画面 | 主要機能 |
|------|------|---------|
| `/crew` | ホーム | 今日のシフト・出退勤ボタン・未読通知バッジ |
| `/crew/shifts` | 自分のシフト一覧 | 確定済みシフトをカレンダー表示 |
| `/crew/preferences/[election_id]` | 希望日入力 | 日付ごとに ○/× 入力 |
| `/crew/notifications` | 通知センター | 過去の通知履歴 |
| `/profile` | プロフィール（既存） | 連絡先・住所・パスワード変更 |

### 6.3 主要画面の UI 詳細

#### 6.3.1 クルーホーム画面（モバイル最適化）

```
┌─────────────────────┐
│  UniTime  [🔔3]      │ ← ナビ
├─────────────────────┤
│  田中 太郎さん         │
│  深谷市選挙 受付       │
├─────────────────────┤
│  📅 今日のシフト       │
│  4/20(土) 前半         │
│  深谷市第1投票所       │
│  8:00 - 14:15         │
│                       │
│  ┌─────────────┐    │
│  │  [出勤]     │     │
│  └─────────────┘    │
│                       │
│  まだ出勤していません  │
├─────────────────────┤
│  📋 募集中            │
│  ・市原市選挙          │
│   [希望日を入力する]   │
└─────────────────────┘
```

#### 6.3.2 希望日マトリクス（管理者画面）

```
○○市選挙 — 期日前 4/15-4/27 + 投開票 4/28 + 開票 4/28
═══════════════════════════════════════════════════════
クルー名     │ 4/15 │ 4/16 │ 4/17 │ 4/18 │ ... │ 4/28
─────────────┼──────┼──────┼──────┼──────┼─────┼──────
田中太郎     │ 前半 │ 1日 │  -  │ 後半 │ ... │ 1日
佐藤花子     │ 後半 │ 後半 │ NG  │ 1日 │ ... │ 開票
山田次郎     │  -  │ 前半 │ 前半 │  -  │ ... │ NG
─────────────┼──────┼──────┼──────┼──────┼─────┼──────
必要(前半)   │  2  │  2  │  2  │  2  │  ...│  3
希望(前半)   │  1  │  1  │  1  │  0  │  ...│  2
不足         │  -1 │  -1 │  -1 │  -2 │  ...│  -1  ← 赤字表示
```

#### 6.3.3 シフト編集画面（管理者）

- タブ: 投票所別（深谷市第1〜第31）
- 表: 行=日付、列=シフト枠（前半/後半/1日）
- セル: クルー選択ドロップダウン（候補は希望日と稼働可能自治体で絞り込み済）
- 「期間一括コピー」ボタン: 開始日〜終了日 + 曜日選択 + クルー指定で一気にINSERT

#### 6.3.4 本日の配置一覧（現場マネージャー画面）

```
深谷市第1投票所 — 2026/4/20(土) 前半シフト
═══════════════════════════════════════════
氏名      │ 役割    │ 予定時刻      │ 状況
──────────┼─────────┼───────────────┼────────
田中太郎  │ 一般    │ 8:00-14:15    │ ✅ 出勤(8:05)
佐藤花子  │ 一般    │ 8:00-14:15    │ ⏳ 未打刻 [代行]
山田次郎  │ 庶務    │ 8:00-14:15    │ ✅ 出勤(7:58)

[全員出勤確定] ← 一括ボタン
```

---

## 7. 通知設計

### 7.1 通知種別

| 種別 | トリガー | 経路 |
|------|---------|------|
| `shift_recruiting` | 案件のステータスを `recruiting` に変更 | UniTime内 + メール |
| `shift_confirmed` | シフト確定 | UniTime内 + メール |
| `shift_changed` | 確定シフトを編集 | UniTime内 + メール |
| `reminder_day_before` | シフト前日 18:00 自動送信 | UniTime内 + メール |
| `reminder_punch` | シフト開始30分前に未打刻 | PWA Push |
| `system` | 管理者からのカスタムメッセージ | UniTime内 + メール |

### 7.2 メール送信実装

- ライブラリ: **Resend**（無料枠 100通/日 = 月3,000通） or **AWS SES**（¥10/1,000通）
- ドメイン: `noreply@unipoll.co.jp`（要 SPF/DKIM/DMARC 設定）
- テンプレート: 案件名・シフト詳細・UniTimeログインリンクをパーソナライズ

### 7.3 PWA Push 通知

- Service Worker + Web Push API
- iOS: Safari 16.4+ で対応（ホーム画面追加が必須）
- Android: Chrome で標準対応
- 用途: 緊急性が高い「シフト開始30分前未打刻」に限定

### 7.4 通知のセグメント抽出ロジック

```typescript
// ○○市選挙の対象クルーだけに通知
const targetUsers = await dbAll(`
  SELECT DISTINCT u.id, u.name, u.email
  FROM users u
  INNER JOIN crew_available_municipalities cam ON cam.user_id = u.id
  INNER JOIN elections e ON e.municipality_id = cam.municipality_id
  WHERE e.id = ?
    AND u.employment_type = 'crew'
    AND EXISTS (SELECT 1 FROM crew_profiles cp WHERE cp.user_id = u.id AND cp.registration_status = 'active')
`, [electionId]);

// 各ユーザーに notifications INSERT + メール送信キュー
```

---

## 8. 実装順序

### 8.1 フェーズ分割

| ステップ | 内容 | 想定工数 |
|---------|------|---------|
| **S1: マイグレーション** | 全12テーブルの CREATE 文 + users/attendance_records ALTER + roles シード | 1日 |
| **S2: マスタ管理画面** | 自治体・投票所・役割・案件・案件×役割時給・必要人数定義の CRUD | 2日 |
| **S3: クルー名簿管理** | クルー登録・編集・稼働可能自治体管理 | 1日 |
| **S4: クルー本人画面（基礎）** | ログイン・ホーム（今日のシフト）・出退勤ボタン・自分のシフト一覧 | 1日 |
| **S5: 希望日入力フロー** | 案件募集通知 → クルーが希望入力 → 管理者が希望マトリクス確認 | 2日 |
| **S6: シフト作成フロー** | 期間一括コピー＋個別調整・充足状況可視化 | 2日 |
| **S7: 代行打刻画面** | 現場マネージャー用「本日の配置一覧」画面・一括打刻 | 1日 |
| **S8: 案件別稼働コスト集計** | API + UI + CSV エクスポート | 1日 |
| **S9: 通知システム** | 通知センター UI + メール送信（Resend）+ PWA Push | 2日 |
| **S10: 統合テスト** | 案件1件をエンドツーエンドで通す（架空データ） | 1日 |
| **S11: 本番デプロイ** | Turso マイグレーション + Vercel デプロイ + 動作確認 | 0.5日 |

**合計想定工数: 14.5日（約3週間）**

### 8.2 マイルストーン

| マイルストーン | 内容 | 期日（目安） |
|--------------|------|-----------|
| M1: マスタ完成 | S1〜S3完了。データ投入可能な状態 | 2026-05-初旬 |
| M2: 希望〜シフト〜打刻フロー完成 | S4〜S7完了。1案件をエンド開通 | 2026-05-中旬 |
| M3: 集計・通知完成 | S8〜S9完了。MVP機能全て揃う | 2026-05-下旬 |
| M4: Phase 3a リリース | S10〜S11完了。本番デプロイ | 2026-06-初旬 |

---

## 9. ジン連携設計（Phase 3b 用メモ）

> Phase 3a では実装しない。Phase 3a の DB 構造を整えておけば、Phase 3b で「ジンを呼び出す API + UI ボタン」を追加するだけで済む。

### 9.1 ジン側の役割追加（Phase 3b 着手時に SKILL.md 更新）

ジンに以下の機能を追加:
- インプット: 案件情報・必要人数定義・候補クルー一覧（経験・希望日・自治体紐付け）
- 処理: Claude API（Sonnet 4.6 + Structured Outputs）でシフト案を生成
- アウトプット: 配置案 JSON（クルー×投票所×日×フェーズ×役割×時間帯）+ 自然言語コメント

### 9.2 UniTime 側のエンドポイント

```
POST /api/elections/[id]/generate-shifts
  → 内部でジンを呼び出し → 配置案を返す
  → 管理者画面に「ジンからの提案」として表示
  → 管理者が承認/編集 → crew_shifts に INSERT
```

### 9.3 プロンプト設計の方向性

```
ジンへのインプット（System Prompt + User Prompt）:
- ユニポールの方針: 公平性 > 経験者バランス > 通勤負担 > 希望反映
- 案件情報: 自治体・選挙日・期日前期間
- 必要人数: 投票所×日×フェーズ×役割×人数
- 候補クルー: 各自の経験・希望日・自治体紐付け
- 制約: 同じクルーが同日複数シフト不可・現場マネージャー必須・etc

ジンのアウトプット（Structured Outputs JSON）:
{
  "shifts": [
    { "user_id": 12, "polling_station_id": 3, "date": "2026-04-15", "phase": "prevoting", "shift_type": "first_half", "role_id": 1 },
    ...
  ],
  "comments": "田中さんは経験者なので難しい第1投票所に配置しました。佐藤さんは...",
  "warnings": ["4/20 後半が1名不足です。追加募集が必要です"]
}
```

---

## 10. 未確定事項・将来課題

### 10.1 Phase 3a 内で要確認

| 項目 | 内容 |
|------|------|
| メール送信ドメイン | `noreply@unipoll.co.jp` で SPF/DKIM/DMARC 設定 |
| Resend or AWS SES | 月のメール量で選定（〜月3,000通なら Resend 無料枠で十分） |
| クルーの初期パスワード設定 | 管理者が登録時に発行 → メールで送付 → 初回ログイン時に変更必須 |
| 初期データの投入順序 | 自治体マスタ → 投票所マスタ（市原市・深谷市の既存データ）→ 役割マスタ（シード）→ クルー名簿（テストデータ）|

### 10.2 Phase 3b 以降に持ち越す課題

| 項目 | Phase |
|------|-------|
| AI 自動シフト生成（ジン経由） | 3b |
| LINE 公式アカウント連携 | 3b |
| シフト調整チャット | 3b |
| 採算ダッシュボード高度化（ジン経由のシナリオ分析） | 3b |
| ジン採用フローとの自動連携 | 5+ |
| UniGuide-prod への配置可視化 API | 5+ |
| unipoll-finance への稼働コスト自動連携 | 5+ |

### 10.3 運用設計の課題

| 項目 | 検討タイミング |
|------|--------------|
| クルーへの初回オンボーディング（アプリの使い方説明） | M2 完成時 |
| メール到達率モニタリング | M3 完成時 |
| 万一クルーがアプリ使えない場合のバックアップ運用（紙打刻 + 管理者代行） | M4 リリース前 |
| 監査ログ（誰がいつどのシフトを変更したか） | Phase 3b 検討 |

---

## 11. 受領後の確認ポイント（祐哉さんへ）

このドキュメントの最終確認をお願いします。特に以下の点が業務妥当性的に問題ないか確認をお願いします。

| カテゴリ | 確認内容 |
|---------|---------|
| **役割定義** | 一般・庶務・現場マネージャーの3種で過不足ないか。投票管理者・立会人・開票・運搬は本当にスコープ外でよいか |
| **シフト時刻** | 前半 8:00-14:15 / 後半 14:10-20:10 が標準パターンでよいか（現場慣行と一致するか） |
| **支払い計算** | シフト予定時刻ベースで一律支払い（実時刻ベースの増減なし）の方針が法的・労務的に問題ないか |
| **クルー本人ログイン** | クルーがアプリにログインして打刻・希望入力する運用が、年配層含めて受け入れられるか（紙運用とのハイブリッドが必要か） |
| **メール送信元ドメイン** | `noreply@unipoll.co.jp` を新規設定してよいか（SPF/DKIM 設定が必要） |
| **想定工数3週間** | リリース時期の希望（5月内・6月初旬・夏まで等） |

---

## 12. 承認後のフロー

1. 祐哉さんが本要件定義書を最終確認
2. カイのスキル（SKILL.md）を更新（UniTime Phase 3a 実装ノウハウを蓄積）
3. メモリ（auto memory）を更新（UniTime Phase 3a 着手・Phase 3b ロードマップ確定）
4. コンテキストをコンパクト
5. 実装着手（S1: マイグレーション から順次）

---

*作成日: 2026-04-26*
*作成者: カイ（業務アプリ構築エージェント）+ 見波祐哉*
*次回更新: 祐哉さん最終確認後・実装着手時*
