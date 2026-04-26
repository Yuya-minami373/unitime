"use client";

import { useState } from "react";
import { Pencil, Save, Trash2, X, Plus } from "lucide-react";

type Action = (formData: FormData) => void | Promise<void>;

export function RateRow({
  electionId,
  roleId,
  roleName,
  roleDescription,
  isDefault,
  hourlyRate,
  notes,
  upsertAction,
  deleteAction,
}: {
  electionId: number;
  roleId: number;
  roleName: string;
  roleDescription: string | null;
  isDefault: number;
  hourlyRate: number | null;
  notes: string | null;
  upsertAction: Action;
  deleteAction: Action;
}) {
  const isSet = hourlyRate !== null;
  const [editing, setEditing] = useState(!isSet);

  if (editing) {
    return (
      <li className="px-4 py-3">
        <form action={upsertAction} className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
          <input type="hidden" name="election_id" value={electionId} />
          <input type="hidden" name="role_id" value={roleId} />

          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-[var(--text-primary)]">
                {roleName}
              </span>
              {isDefault === 1 && (
                <span className="rounded-[4px] border border-[var(--brand-accent-border)] bg-[var(--brand-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--brand-accent)]">
                  標準
                </span>
              )}
            </div>
            {roleDescription && (
              <span className="text-[11px] text-[var(--text-tertiary)]">
                {roleDescription}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[var(--text-tertiary)]">¥</span>
            <input
              name="hourly_rate"
              type="number"
              min="0"
              step="10"
              required
              defaultValue={hourlyRate ?? ""}
              className="u-input w-[110px] tabular-nums"
              placeholder="1500"
              autoFocus
            />
            <span className="text-[12px] text-[var(--text-tertiary)]">/時</span>
          </div>

          <input
            name="notes"
            type="text"
            defaultValue={notes ?? ""}
            className="u-input md:w-[200px]"
            placeholder="備考（任意）"
          />

          <div className="flex shrink-0 items-center gap-2">
            <button type="submit" className="u-btn u-btn-primary !py-1.5 !text-[12px]">
              <Save size={12} />
              保存
            </button>
            {isSet && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              >
                <X size={12} className="inline" /> 取消
              </button>
            )}
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-[var(--text-primary)]">
              {roleName}
            </span>
            {isDefault === 1 && (
              <span className="rounded-[4px] border border-[var(--brand-accent-border)] bg-[var(--brand-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--brand-accent)]">
                標準
              </span>
            )}
            <span className="text-[15px] font-semibold tabular-nums text-[var(--text-primary)]">
              ¥{(hourlyRate ?? 0).toLocaleString()}
              <span className="text-[11px] font-normal text-[var(--text-tertiary)]"> /時</span>
            </span>
          </div>
          {roleDescription && (
            <span className="text-[11px] text-[var(--text-tertiary)]">
              {roleDescription}
            </span>
          )}
          {notes && (
            <span className="text-[11px] text-[var(--text-secondary)]">
              {notes}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[12px] font-medium text-[var(--brand-accent)] hover:text-[var(--brand-primary)]"
          >
            <Pencil size={12} className="inline" /> 編集
          </button>
          <form
            action={deleteAction}
            onSubmit={(e) => {
              if (!confirm(`${roleName} の時給設定を削除します。よろしいですか？`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="election_id" value={electionId} />
            <input type="hidden" name="role_id" value={roleId} />
            <button
              type="submit"
              className="text-[12px] font-medium text-rose-600 hover:text-rose-800"
            >
              <Trash2 size={12} className="inline" /> 削除
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}

export function UnsetRoleRow({
  electionId,
  roleId,
  roleName,
  roleDescription,
  isDefault,
  upsertAction,
}: {
  electionId: number;
  roleId: number;
  roleName: string;
  roleDescription: string | null;
  isDefault: number;
  upsertAction: Action;
}) {
  const [adding, setAdding] = useState(false);

  if (adding) {
    return (
      <RateRow
        electionId={electionId}
        roleId={roleId}
        roleName={roleName}
        roleDescription={roleDescription}
        isDefault={isDefault}
        hourlyRate={null}
        notes={null}
        upsertAction={upsertAction}
        deleteAction={async () => {}}
      />
    );
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-medium text-[var(--text-tertiary)]">
              {roleName}
            </span>
            {isDefault === 1 && (
              <span className="rounded-[4px] border border-[var(--border-light)] bg-white px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)]">
                標準
              </span>
            )}
            <span className="text-[11px] text-[var(--text-quaternary)]">未設定</span>
          </div>
          {roleDescription && (
            <span className="text-[11px] text-[var(--text-tertiary)]">
              {roleDescription}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-[12px] font-medium text-[var(--brand-accent)] hover:text-[var(--brand-primary)]"
        >
          <Plus size={12} className="inline" /> 時給を設定
        </button>
      </div>
    </li>
  );
}
