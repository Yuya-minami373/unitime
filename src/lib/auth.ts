import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { dbGet, dbRun } from "./db";

const SESSION_COOKIE = "unitime_session";
const SESSION_DAYS = 30;

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt ?? randomBytes(16).toString("hex");
  const hash = createHash("sha256")
    .update(actualSalt + password)
    .digest("hex");
  return { hash: `${actualSalt}:${hash}`, salt: actualSalt };
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const { hash } = hashPassword(password, salt);
  return hash === stored;
}

export async function createSession(userId: number): Promise<string> {
  const sessionId = randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);

  await dbRun(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
    [sessionId, userId, expiresAt.toISOString()],
  );

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });

  return sessionId;
}

export type SessionUser = {
  id: number;
  login_id: string;
  name: string;
  email: string | null;
  employment_type: string;
  role: string;
  standard_work_minutes: number; // 所定労働時間（分）
  home_latitude: number | null;
  home_longitude: number | null;
};

// 権限ヘルパー
export function isOwner(user: SessionUser | null): boolean {
  return user?.role === "owner";
}

export function isAdmin(user: SessionUser | null): boolean {
  return user?.role === "owner" || user?.role === "admin";
}

// 打刻対象外（代表取締役など）
export function canPunch(user: SessionUser | null): boolean {
  return !!user && user.role !== "owner";
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const row = await dbGet<{
    id: number;
    login_id: string;
    name: string;
    email: string | null;
    employment_type: string;
    role: string;
    standard_work_minutes: number | null;
    home_latitude: number | null;
    home_longitude: number | null;
    expires_at: string;
  }>(
    `SELECT u.id, u.login_id, u.name, u.email, u.employment_type, u.role,
            u.standard_work_minutes, u.home_latitude, u.home_longitude, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND u.status = 'active'`,
    [sessionId],
  );

  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) return null;

  return {
    id: row.id,
    login_id: row.login_id,
    name: row.name,
    email: row.email,
    employment_type: row.employment_type,
    role: row.role,
    standard_work_minutes: row.standard_work_minutes ?? 435,
    home_latitude: row.home_latitude,
    home_longitude: row.home_longitude,
  };
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    await dbRun(`DELETE FROM sessions WHERE id = ?`, [sessionId]);
    cookieStore.delete(SESSION_COOKIE);
  }
}
