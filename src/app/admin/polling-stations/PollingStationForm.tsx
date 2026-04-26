"use client";

import { useState } from "react";
import { Plus, Pencil } from "lucide-react";

type Action = (formData: FormData) => void | Promise<void>;

type MunicipalityOption = {
  id: number;
  name: string;
  prefecture: string | null;
};

export function PollingStationForm({
  action,
  isEdit,
  municipalities,
  defaultId,
  defaultMunicipalityId,
  defaultName,
  defaultAddress,
  defaultLatitude,
  defaultLongitude,
  defaultIsActive,
  defaultNotes,
}: {
  action: Action;
  isEdit: boolean;
  municipalities: MunicipalityOption[];
  defaultId?: number;
  defaultMunicipalityId?: number;
  defaultName?: string;
  defaultAddress?: string;
  defaultLatitude?: number | null;
  defaultLongitude?: number | null;
  defaultIsActive?: boolean;
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

      <FormField label="投票所名" required>
        <input
          name="name"
          required
          defaultValue={defaultName ?? ""}
          className="u-input"
          placeholder="例: 深谷市第1投票所"
        />
      </FormField>

      <div className="md:col-span-2">
        <FormField label="住所">
          <input
            name="address"
            defaultValue={defaultAddress ?? ""}
            className="u-input"
            placeholder="例: 埼玉県深谷市仲町11-1（深谷市役所）"
          />
        </FormField>
      </div>

      <FormField label="緯度">
        <input
          name="latitude"
          type="number"
          step="any"
          defaultValue={defaultLatitude ?? ""}
          className="u-input"
          placeholder="例: 36.197500"
        />
      </FormField>
      <FormField label="経度">
        <input
          name="longitude"
          type="number"
          step="any"
          defaultValue={defaultLongitude ?? ""}
          className="u-input"
          placeholder="例: 139.281389"
        />
      </FormField>

      <div className="md:col-span-2">
        <FormField label="備考">
          <textarea
            name="notes"
            defaultValue={defaultNotes ?? ""}
            className="u-input min-h-[80px]"
            placeholder="バリアフリー有無・駐車場・特記事項など"
          />
        </FormField>
      </div>

      <div className="md:col-span-2">
        <label className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
          <input
            type="checkbox"
            name="is_active"
            value="1"
            defaultChecked={defaultIsActive ?? true}
            className="h-4 w-4"
          />
          有効（チェックを外すと「廃止」扱いになり、新規シフトで選択不可になります）
        </label>
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
              投票所を登録
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
