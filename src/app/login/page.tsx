import Image from "next/image";
import { redirect } from "next/navigation";
import { dbGet } from "@/lib/db";
import { verifyPassword, createSession, getCurrentUser } from "@/lib/auth";

async function login(formData: FormData) {
  "use server";
  const loginId = String(formData.get("login_id") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!loginId || !password) redirect("/login?error=empty");

  const user = await dbGet<{ id: number; password_hash: string; status: string }>(
    `SELECT id, password_hash, status FROM users WHERE login_id = ?`,
    [loginId],
  );

  if (!user || user.status !== "active" || !verifyPassword(password, user.password_hash)) {
    redirect("/login?error=invalid");
  }

  await createSession(user.id);
  redirect("/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const current = await getCurrentUser();
  if (current) redirect("/");

  const params = await searchParams;
  const errorMsg =
    params.error === "invalid"
      ? "ログインIDまたはパスワードが違います"
      : params.error === "empty"
      ? "ログインIDとパスワードを入力してください"
      : null;

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{
        background:
          "radial-gradient(ellipse 900px 600px at 50% 0%, rgba(37, 99, 235, 0.18), transparent 70%), radial-gradient(ellipse 700px 500px at 50% 100%, rgba(30, 58, 138, 0.12), transparent 70%), linear-gradient(180deg, #dbeafe 0%, #eff6ff 60%, #f0f5ff 100%)",
      }}
    >
      <div className="w-full max-w-[380px]">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center">
          <Image
            src="/logo.png"
            alt="UniPoll"
            width={200}
            height={50}
            priority
            className="mb-3 h-10 w-auto object-contain"
          />
          <div className="text-[14px] font-medium tracking-tight text-[var(--text-secondary)]">
            UniTime
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--text-tertiary)]">
            Workforce time management
          </div>
        </div>

        {/* Card */}
        <div className="u-card p-7">
          <div className="mb-5">
            <h1 className="text-[16px] font-semibold tracking-tight">サインイン</h1>
            <p className="mt-1 text-[12px] text-[var(--text-tertiary)]">
              ログインIDとパスワードを入力してください
            </p>
          </div>

          {errorMsg && (
            <div className="mb-4 rounded-[6px] border border-[var(--border-light)] bg-[var(--bg-subtle)] px-3 py-2 text-[12px] text-[var(--text-secondary)]">
              {errorMsg}
            </div>
          )}

          <form action={login} className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">
                ログインID
              </label>
              <input
                name="login_id"
                type="text"
                required
                autoComplete="username"
                className="u-input"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[var(--text-secondary)]">
                パスワード
              </label>
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="u-input"
              />
            </div>

            <button type="submit" className="u-btn u-btn-primary mt-1 w-full">
              サインイン
            </button>
          </form>
        </div>

        <div className="mt-5 text-center text-[11px] text-[var(--text-quaternary)]">
          © UniPoll Inc.
        </div>
      </div>
    </div>
  );
}
