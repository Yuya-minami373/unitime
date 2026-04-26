"use client";

import { Save } from "lucide-react";

type Action = (formData: FormData) => void | Promise<void>;

export type Station = {
  id: number;
  name: string;
};

export type Role = {
  id: number;
  name: string;
  is_default: number;
};

export type CellKey = `${number}_${number}_${"early" | "late" | "full"}`;

export const SHIFT_COLUMNS: Array<{
  key: "early" | "late" | "full";
  label: string;
  time: string;
}> = [
  { key: "early", label: "前半", time: "8:30-14:30" },
  { key: "late", label: "後半", time: "14:30-20:00" },
  { key: "full", label: "1日", time: "8:30-20:00" },
];

export function StaffingGrid({
  electionId,
  stations,
  roles,
  initialCounts,
  prevotingStart,
  prevotingEnd,
  saveAction,
}: {
  electionId: number;
  stations: Station[];
  roles: Role[];
  initialCounts: Record<CellKey, number>;
  prevotingStart: string;
  prevotingEnd: string;
  saveAction: Action;
}) {
  return (
    <form action={saveAction}>
      <input type="hidden" name="election_id" value={electionId} />

      <div className="border-b border-[var(--border-light)] bg-[var(--bg-body)] px-4 py-2.5 text-[11px] text-[var(--text-secondary)]">
        対象期間: <span className="tabular-nums font-medium">{prevotingStart}</span> 〜{" "}
        <span className="tabular-nums font-medium">{prevotingEnd}</span>{" "}
        <span className="text-[var(--text-tertiary)]">
          （入力した人数を期間中の全日に一括保存。0/空欄は削除）
        </span>
      </div>

      <ul className="divide-y divide-[var(--border-light)]">
        {stations.map((station) => (
          <li key={station.id} className="px-4 py-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-[13px] font-semibold tracking-tight text-[var(--text-primary)]">
                {station.name}
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[11px] text-[var(--text-tertiary)]">
                    <th className="w-[160px] py-1.5 pr-3 font-normal">役割</th>
                    {SHIFT_COLUMNS.map((c) => (
                      <th key={c.key} className="w-[100px] py-1.5 pr-3 font-normal">
                        {c.label}
                        <span className="ml-1 text-[10px] text-[var(--text-quaternary)]">
                          {c.time}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-light)]">
                  {roles.map((role) => (
                    <tr key={role.id}>
                      <td className="py-1.5 pr-3">
                        <span className="text-[12px] text-[var(--text-primary)]">
                          {role.name}
                        </span>
                        {role.is_default === 1 && (
                          <span className="ml-1.5 rounded-[3px] border border-[var(--border-light)] bg-white px-1 py-0.5 text-[9px] text-[var(--text-tertiary)]">
                            標準
                          </span>
                        )}
                      </td>
                      {SHIFT_COLUMNS.map((c) => {
                        const key: CellKey = `${station.id}_${role.id}_${c.key}`;
                        const initial = initialCounts[key] ?? 0;
                        return (
                          <td key={c.key} className="py-1 pr-3">
                            <input
                              name={`cell_${key}`}
                              type="number"
                              min="0"
                              step="1"
                              defaultValue={initial > 0 ? initial : ""}
                              placeholder="0"
                              className="u-input w-[70px] tabular-nums !py-1 text-[12px]"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--border-light)] bg-[var(--bg-body)] px-4 py-3">
        <span className="text-[11px] text-[var(--text-tertiary)]">
          ※ 投票所×役割×シフト種別ごとに人数を入力してください。
        </span>
        <button type="submit" className="u-btn u-btn-primary">
          <Save size={14} strokeWidth={1.75} />
          期日前期間の全日に一括保存
        </button>
      </div>
    </form>
  );
}
