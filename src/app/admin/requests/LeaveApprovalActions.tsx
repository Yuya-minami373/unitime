"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import {
  approveLeaveRequest,
  rejectLeaveRequest,
} from "@/app/requests/actions";

export function LeaveApprovalActions({
  id,
  userName,
}: {
  id: number;
  userName: string;
}) {
  const [showReject, setShowReject] = useState(false);

  if (showReject) {
    return (
      <form
        action={rejectLeaveRequest}
        className="flex flex-col gap-2 md:items-end"
      >
        <input type="hidden" name="id" value={id} />
        <input
          name="rejection_reason"
          required
          placeholder="却下理由（必須）"
          className="u-input md:w-[260px]"
          autoFocus
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowReject(false)}
            className="text-[12px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            取消
          </button>
          <button
            type="submit"
            className="u-btn !bg-rose-600 !text-white !border-rose-600 !py-1.5 !text-[12px] hover:!bg-rose-700"
          >
            <X size={12} />
            却下する
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <form
        action={approveLeaveRequest}
        onSubmit={(e) => {
          if (!confirm(`${userName} の休暇申請を承認します。よろしいですか？`)) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          className="u-btn u-btn-primary !py-1.5 !text-[12px]"
        >
          <Check size={12} />
          承認
        </button>
      </form>
      <button
        type="button"
        onClick={() => setShowReject(true)}
        className="u-btn u-btn-secondary !py-1.5 !text-[12px]"
      >
        <X size={12} />
        却下
      </button>
    </div>
  );
}
