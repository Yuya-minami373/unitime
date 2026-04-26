"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil } from "lucide-react";

type Action = (formData: FormData) => void | Promise<void>;

type RoleOption = { id: number; name: string };
type MunicipalityOption = {
  id: number;
  name: string;
  prefecture: string | null;
};

export function CrewForm({
  action,
  isEdit,
  roles,
  municipalities,
  defaultId,
  defaultName,
  defaultLoginId,
  defaultEmail,
  defaultPhone,
  defaultPostalCode,
  defaultAddress,
  defaultEmergencyContact,
  defaultStatus,
  defaultRoleId,
  defaultHasPrevoting,
  defaultHasElectionDay,
  defaultHasCounting,
  defaultTransportationUnitCost,
  defaultNotes,
  defaultMunicipalityIds,
  defaultExperiencedRoleIds,
  defaultTrainingStatus,
  defaultTrainingCompletedAt,
  defaultTrainingNotes,
}: {
  action: Action;
  isEdit: boolean;
  roles: RoleOption[];
  municipalities: MunicipalityOption[];
  defaultId?: number;
  defaultName?: string;
  defaultLoginId?: string;
  defaultEmail?: string;
  defaultPhone?: string;
  defaultPostalCode?: string;
  defaultAddress?: string;
  defaultEmergencyContact?: string;
  defaultStatus?: string;
  defaultRoleId?: number | null;
  defaultHasPrevoting?: boolean;
  defaultHasElectionDay?: boolean;
  defaultHasCounting?: boolean;
  defaultTransportationUnitCost?: number;
  defaultNotes?: string;
  defaultMunicipalityIds?: number[];
  defaultExperiencedRoleIds?: number[];
  defaultTrainingStatus?: string;
  defaultTrainingCompletedAt?: string;
  defaultTrainingNotes?: string;
}) {
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [loginId, setLoginId] = useState(defaultLoginId ?? "");
  const [muniIds, setMuniIds] = useState<Set<number>>(
    () => new Set(defaultMunicipalityIds ?? []),
  );
  const [expRoleIds, setExpRoleIds] = useState<Set<number>>(
    () => new Set(defaultExperiencedRoleIds ?? []),
  );
  const [trainingStatus, setTrainingStatus] = useState(
    defaultTrainingStatus ?? "not_started",
  );

  // 自治体を都道府県別にグループ化（自治体マスタが多くなった時の見通し）
  const municipalitiesByPref = useMemo(() => {
    const map = new Map<string, MunicipalityOption[]>();
    for (const m of municipalities) {
      const key = m.prefecture ?? "（未分類）";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, "ja"));
  }, [municipalities]);

  function toggleMuni(id: number) {
    setMuniIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleExpRole(id: number) {
    setExpRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleEmailChange(value: string) {
    setEmail(value);
    // login_id 未入力なら email を自動コピー
    if (!loginId.trim() && value.trim()) {
      setLoginId(value.trim());
    }
  }

  return (
    <form action={action} className="grid grid-cols-1 gap-5">
      {isEdit && defaultId !== undefined && (
        <input type="hidden" name="id" value={defaultId} />
      )}

      {/* 基本情報 */}
      <fieldset className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Legend>基本情報</Legend>
        <Field label="氏名" required>
          <input
            name="name"
            required
            defaultValue={defaultName ?? ""}
            className="u-input"
            placeholder="例: 山田 太郎"
          />
        </Field>
        <Field
          label="ログインID"
          required
          hint="メールアドレスまたは任意の英数字。重複不可。"
        >
          <input
            name="login_id"
            required
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            className="u-input"
            placeholder="例: tanaka@example.com / tanaka-2026"
            autoComplete="off"
          />
        </Field>
        <Field label="メールアドレス" hint="シフト連絡用（任意）">
          <input
            name="email"
            type="email"
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            className="u-input"
            placeholder="任意"
          />
        </Field>
        <Field label="電話番号">
          <input
            name="phone"
            defaultValue={defaultPhone ?? ""}
            className="u-input"
            placeholder="例: 080-1234-5678"
          />
        </Field>
        <Field label="郵便番号">
          <input
            name="postal_code"
            defaultValue={defaultPostalCode ?? ""}
            className="u-input"
            placeholder="例: 236-0058"
          />
        </Field>
        <Field label="住所">
          <input
            name="address"
            defaultValue={defaultAddress ?? ""}
            className="u-input"
            placeholder="例: 神奈川県横浜市..."
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="緊急連絡先" hint="氏名・続柄・電話番号などを自由記述">
            <input
              name="emergency_contact"
              defaultValue={defaultEmergencyContact ?? ""}
              className="u-input"
              placeholder="例: 配偶者 山田花子 080-9876-5432"
            />
          </Field>
        </div>
      </fieldset>

      {/* クルー情報 */}
      <fieldset className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Legend>クルー情報</Legend>
        <Field label="登録ステータス">
          <select
            name="status"
            defaultValue={defaultStatus ?? "active"}
            className="u-input"
          >
            <option value="active">稼働中</option>
            <option value="inactive">休止中</option>
          </select>
        </Field>
        <Field label="デフォルト役割" hint="シフト割当時の初期値">
          <select
            name="default_role_id"
            defaultValue={defaultRoleId ? String(defaultRoleId) : ""}
            className="u-input"
          >
            <option value="">未設定</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="md:col-span-2">
          <Field label="経験あり業務">
            <div className="flex flex-wrap gap-3 pt-1.5 text-[12px]">
              <CheckboxLabel
                name="has_prevoting_experience"
                defaultChecked={defaultHasPrevoting}
                label="期日前投票"
              />
              <CheckboxLabel
                name="has_election_day_experience"
                defaultChecked={defaultHasElectionDay}
                label="当日投票"
              />
              <CheckboxLabel
                name="has_counting_experience"
                defaultChecked={defaultHasCounting}
                label="開票"
              />
            </div>
          </Field>
        </div>
        <Field label="1出勤あたり交通費" hint="単純定額。実費精算は別運用">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[var(--text-tertiary)]">¥</span>
            <input
              name="transportation_unit_cost"
              type="number"
              min="0"
              step="100"
              defaultValue={defaultTransportationUnitCost ?? 0}
              className="u-input w-[140px] tabular-nums"
            />
          </div>
        </Field>
        <div className="md:col-span-2">
          <Field
            label="経験役割"
            hint="過去に従事した役割（複数選択可）。ヒアリング・実績ベースで管理者が記録"
          >
            <div className="flex flex-wrap gap-2 pt-1">
              {roles.map((r) => {
                const checked = expRoleIds.has(r.id);
                return (
                  <label
                    key={r.id}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-[6px] border px-2.5 py-1.5 text-[12px] transition ${
                      checked
                        ? "border-[var(--brand-accent)] bg-[var(--brand-accent-soft)] text-[var(--brand-accent)]"
                        : "border-[var(--border-light)] bg-white text-[var(--text-secondary)] hover:border-[var(--border-default)]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="experienced_role_id"
                      value={r.id}
                      checked={checked}
                      onChange={() => toggleExpRole(r.id)}
                      className="h-3.5 w-3.5"
                    />
                    {r.name}
                  </label>
                );
              })}
            </div>
          </Field>
        </div>
      </fieldset>

      {/* 当社研修 */}
      <fieldset className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Legend>当社研修</Legend>
        <Field label="受講ステータス">
          <select
            name="training_status"
            value={trainingStatus}
            onChange={(e) => setTrainingStatus(e.target.value)}
            className="u-input"
          >
            <option value="not_started">未受講</option>
            <option value="in_progress">受講中</option>
            <option value="completed">受講済</option>
          </select>
        </Field>
        <Field label="受講完了日" hint="受講済の場合に設定">
          <input
            name="training_completed_at"
            type="date"
            defaultValue={defaultTrainingCompletedAt ?? ""}
            disabled={trainingStatus !== "completed"}
            className="u-input disabled:opacity-50"
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="研修メモ" hint="受講内容・特記事項など（任意）">
            <textarea
              name="training_notes"
              defaultValue={defaultTrainingNotes ?? ""}
              className="u-input min-h-[60px]"
              placeholder="例: 2026年4月新人研修受講 / 投票所運営マニュアル習得済"
            />
          </Field>
        </div>
      </fieldset>

      {/* 稼働可能自治体 */}
      <fieldset>
        <Legend>稼働可能自治体（最低1つ） *</Legend>
        <div className="rounded-[8px] border border-[var(--border-light)] bg-white p-3">
          {municipalitiesByPref.map(([pref, list]) => (
            <div key={pref} className="mb-2 last:mb-0">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                {pref}
              </div>
              <div className="flex flex-wrap gap-2">
                {list.map((m) => {
                  const checked = muniIds.has(m.id);
                  return (
                    <label
                      key={m.id}
                      className={`flex cursor-pointer items-center gap-1.5 rounded-[6px] border px-2.5 py-1.5 text-[12px] transition ${
                        checked
                          ? "border-[var(--brand-accent)] bg-[var(--brand-accent-soft)] text-[var(--brand-accent)]"
                          : "border-[var(--border-light)] bg-white text-[var(--text-secondary)] hover:border-[var(--border-default)]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        name="available_municipality_id"
                        value={m.id}
                        checked={checked}
                        onChange={() => toggleMuni(m.id)}
                        className="h-3.5 w-3.5"
                      />
                      {m.name}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="mt-2 text-[11px] text-[var(--text-tertiary)] tabular-nums">
            選択中: {muniIds.size} 自治体
          </div>
        </div>
      </fieldset>

      {/* 備考 */}
      <Field label="備考">
        <textarea
          name="notes"
          defaultValue={defaultNotes ?? ""}
          className="u-input min-h-[80px]"
          placeholder="シフト調整時に参考にしたい個別事情など"
        />
      </Field>

      <div>
        <button type="submit" className="u-btn u-btn-primary">
          {isEdit ? (
            <>
              <Pencil size={14} strokeWidth={1.75} />
              変更を保存
            </>
          ) : (
            <>
              <Plus size={14} strokeWidth={1.75} />
              クルーを登録
            </>
          )}
        </button>
      </div>
    </form>
  );
}

function Legend({ children }: { children: React.ReactNode }) {
  return (
    <legend className="col-span-full mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
      {children}
    </legend>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">
        {label}
        {required && <span className="ml-0.5 text-[var(--accent-indigo)]">*</span>}
        {hint && (
          <span className="ml-1.5 text-[11px] font-normal text-[var(--text-tertiary)]">
            {hint}
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

function CheckboxLabel({
  name,
  defaultChecked,
  label,
}: {
  name: string;
  defaultChecked?: boolean;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5">
      <input
        type="checkbox"
        name={name}
        value="1"
        defaultChecked={defaultChecked}
        className="h-3.5 w-3.5"
      />
      <span>{label}</span>
    </label>
  );
}
