"use client";

import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import {
  PREFECTURES,
  getMunicipalitiesByPrefecture,
} from "@/lib/jp-municipalities";

type Action = (formData: FormData) => void | Promise<void>;

export function MunicipalityForm({
  action,
  isEdit,
  defaultId,
  defaultName,
  defaultPrefecture,
  defaultNotes,
}: {
  action: Action;
  isEdit: boolean;
  defaultId?: number;
  defaultName?: string;
  defaultPrefecture?: string;
  defaultNotes?: string;
}) {
  const [prefecture, setPrefecture] = useState(defaultPrefecture ?? "");
  const [name, setName] = useState(defaultName ?? "");
  const cities = prefecture ? getMunicipalitiesByPrefecture(prefecture) : [];
  const isInList = !!name && cities.includes(name);

  function onPrefectureChange(value: string) {
    setPrefecture(value);
    // 都道府県を変えた瞬間、市区町村は一度クリア（旧値が残ると不整合になる）
    setName("");
  }

  return (
    <form action={action} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {isEdit && defaultId !== undefined && (
        <input type="hidden" name="id" value={defaultId} />
      )}

      <FormField label="都道府県" required>
        <input
          name="prefecture"
          list="prefecture-options"
          value={prefecture}
          onChange={(e) => onPrefectureChange(e.target.value)}
          required
          autoComplete="off"
          className="u-input"
          placeholder="入力して候補から選択（例: さい → 埼玉県）"
        />
        <datalist id="prefecture-options">
          {PREFECTURES.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </FormField>

      <FormField label="自治体名" required>
        <input
          name="name"
          list={prefecture ? "city-options" : undefined}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={!prefecture}
          autoComplete="off"
          className="u-input"
          placeholder={
            prefecture
              ? "入力して候補から選択（例: ふか → 深谷市）"
              : "先に都道府県を選択"
          }
        />
        {prefecture && (
          <datalist id="city-options">
            {cities.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        )}
        <p className="mt-1.5 text-[11px] text-[var(--text-tertiary)]">
          {prefecture ? (
            <>
              {cities.length} 件の市区町村が候補に表示されます。
              {name && !isInList && (
                <span className="ml-1 text-amber-700">
                  ※ 候補にない名称（手入力扱い）
                </span>
              )}
            </>
          ) : (
            "都道府県を選ぶと自治体候補が表示されます。"
          )}
        </p>
      </FormField>

      <div className="md:col-span-2">
        <FormField label="備考">
          <textarea
            name="notes"
            defaultValue={defaultNotes ?? ""}
            className="u-input min-h-[80px]"
            placeholder="freeeタグキー、特記事項など"
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
              自治体を登録
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
