"use client";

import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { STATUS_OPTIONS } from "@/lib/elections";

type Action = (formData: FormData) => void | Promise<void>;

type MunicipalityOption = {
  id: number;
  name: string;
  prefecture: string | null;
};

export function ElectionForm({
  action,
  isEdit,
  municipalities,
  defaultId,
  defaultMunicipalityId,
  defaultName,
  defaultElectionDate,
  defaultPrevotingStartDate,
  defaultPrevotingEndDate,
  defaultStatus,
  defaultNotes,
}: {
  action: Action;
  isEdit: boolean;
  municipalities: MunicipalityOption[];
  defaultId?: number;
  defaultMunicipalityId?: number;
  defaultName?: string;
  defaultElectionDate?: string;
  defaultPrevotingStartDate?: string | null;
  defaultPrevotingEndDate?: string | null;
  defaultStatus?: string;
  defaultNotes?: string;
}) {
  const [municipalityId, setMunicipalityId] = useState<string>(
    defaultMunicipalityId ? String(defaultMunicipalityId) : "",
  );

  return (
    <form action={action} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {isEdit && defaultId !== undefined && (
        <input type="hidden" name="id" value={defaultId} />
      )}

      <FormField label="自治体" required>
        <select
          name="municipality_id"
          value={municipalityId}
          onChange={(e) => setMunicipalityId(e.target.value)}
          required
          className="u-input"
        >
          <option value="">選択してください</option>
          {municipalities.map((m) => (
            <option key={m.id} value={m.id}>
              {m.prefecture ? `${m.prefecture} ・ ${m.name}` : m.name}
            </option>
          ))}
        </select>
        {municipalities.length === 0 && (
          <p className="mt-1.5 text-[11px] text-rose-700">
            自治体が未登録です。先に「自治体マスタ」で登録してください。
          </p>
        )}
      </FormField>

      <FormField label="案件名" required>
        <input
          name="name"
          required
          defaultValue={defaultName ?? ""}
          className="u-input"
          placeholder="例: 2026年4月深谷市議選"
        />
      </FormField>

      <FormField label="投開票日" required>
        <input
          name="election_date"
          type="date"
          required
          defaultValue={defaultElectionDate ?? ""}
          className="u-input"
        />
      </FormField>

      <FormField label="ステータス">
        <select
          name="status"
          defaultValue={defaultStatus ?? "planning"}
          className="u-input"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="期日前投票 開始日">
        <input
          name="prevoting_start_date"
          type="date"
          defaultValue={defaultPrevotingStartDate ?? ""}
          className="u-input"
        />
      </FormField>

      <FormField label="期日前投票 終了日">
        <input
          name="prevoting_end_date"
          type="date"
          defaultValue={defaultPrevotingEndDate ?? ""}
          className="u-input"
        />
      </FormField>

      <div className="md:col-span-2">
        <FormField label="備考">
          <textarea
            name="notes"
            defaultValue={defaultNotes ?? ""}
            className="u-input min-h-[80px]"
            placeholder="同日複数選挙の場合の構成、特記事項など"
          />
        </FormField>
      </div>

      <div className="flex items-end md:col-span-2">
        <button type="submit" className="u-btn u-btn-primary">
          {isEdit ? (
            <>
              <Pencil size={14} strokeWidth={1.75} />
              変更を保存
            </>
          ) : (
            <>
              <Plus size={14} strokeWidth={1.75} />
              案件を登録
            </>
          )}
        </button>
      </div>
    </form>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">
        {label}
        {required && <span className="ml-0.5 text-[var(--accent-indigo)]">*</span>}
      </label>
      {children}
    </div>
  );
}
