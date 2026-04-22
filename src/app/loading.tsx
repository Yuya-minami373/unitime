// 全ページ共通のフォールバックスケルトン（ページ遷移時の体感速度向上）

export default function Loading() {
  return (
    <div className="min-h-screen bg-[var(--bg-body)]">
      <div className="mx-auto max-w-[1200px] px-5 py-8 md:px-8 md:py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-7 w-48 rounded-[6px] bg-[var(--bg-subtle)]" />
          <div className="h-4 w-64 rounded-[6px] bg-[var(--bg-subtle)]" />
          <div className="mt-6 h-32 w-full rounded-[8px] bg-[var(--bg-subtle)]" />
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            <div className="h-24 rounded-[8px] bg-[var(--bg-subtle)]" />
            <div className="h-24 rounded-[8px] bg-[var(--bg-subtle)]" />
            <div className="h-24 rounded-[8px] bg-[var(--bg-subtle)]" />
            <div className="h-24 rounded-[8px] bg-[var(--bg-subtle)]" />
          </div>
          <div className="mt-4 h-[420px] w-full rounded-[8px] bg-[var(--bg-subtle)]" />
        </div>
      </div>
    </div>
  );
}
