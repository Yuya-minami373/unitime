"use server";

import { redirect } from "next/navigation";
import { getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";
import { dbGet, dbRun } from "@/lib/db";

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: string };

export async function changePasswordAction(
  formData: FormData,
): Promise<ChangePasswordResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "ログインが必要です" };

  const current = String(formData.get("current_password") ?? "");
  const next = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  if (!current || !next || !confirm) {
    return { ok: false, error: "すべての項目を入力してください" };
  }
  if (next.length < 8) {
    return { ok: false, error: "新しいパスワードは8文字以上にしてください" };
  }
  if (next !== confirm) {
    return { ok: false, error: "新しいパスワードと確認用が一致しません" };
  }
  if (next === current) {
    return { ok: false, error: "現在のパスワードと同じものは設定できません" };
  }

  const row = await dbGet<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    [user.id],
  );
  if (!row) return { ok: false, error: "ユーザーが見つかりません" };

  if (!verifyPassword(current, row.password_hash)) {
    return { ok: false, error: "現在のパスワードが違います" };
  }

  const { hash } = hashPassword(next);
  await dbRun(`UPDATE users SET password_hash = ? WHERE id = ?`, [hash, user.id]);

  return { ok: true };
}

export async function changePasswordAndRedirect(formData: FormData): Promise<void> {
  const res = await changePasswordAction(formData);
  if (!res.ok) {
    redirect(`/profile?error=${encodeURIComponent(res.error)}`);
  }
  redirect(`/profile?success=1`);
}

export async function saveHomeLocationAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.employment_type !== "employee") {
    redirect(`/profile?home_error=${encodeURIComponent("自宅登録は社員のみ利用可能です")}`);
  }

  const lat = Number(formData.get("latitude"));
  const lng = Number(formData.get("longitude"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    redirect(`/profile?home_error=${encodeURIComponent("位置情報を取得できませんでした")}`);
  }

  await dbRun(
    `UPDATE users SET home_latitude = ?, home_longitude = ? WHERE id = ?`,
    [lat, lng, user.id],
  );
  redirect(`/profile?home_success=saved`);
}

export async function clearHomeLocationAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await dbRun(
    `UPDATE users SET home_latitude = NULL, home_longitude = NULL WHERE id = ?`,
    [user.id],
  );
  redirect(`/profile?home_success=cleared`);
}
