"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  House,
  History,
  Users,
  Settings,
  Menu,
  X,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  KeyRound,
  MapPin,
  Building2,
  UserCog,
  CalendarCheck,
  IdCard,
  type LucideIcon,
} from "lucide-react";

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavGroup = { label?: string; items: NavItem[] };
type User = { name: string; role: string; employment?: string };

const baseMemberNav: NavItem[] = [
  { href: "/", label: "ホーム", icon: House },
  { href: "/history", label: "勤怠履歴", icon: History },
];

const expenseNavItem: NavItem = { href: "/expenses", label: "立替精算", icon: Receipt };

const teamNav: NavItem[] = [
  { href: "/admin", label: "チーム", icon: Users },
  { href: "/admin/expenses", label: "精算承認", icon: Receipt },
];

const crewMgmtNav: NavItem[] = [
  { href: "/admin/elections", label: "案件マスタ", icon: CalendarCheck },
  { href: "/admin/crews", label: "クルー名簿", icon: IdCard },
  { href: "/admin/municipalities", label: "自治体マスタ", icon: Building2 },
  { href: "/admin/polling-stations", label: "投票所マスタ", icon: MapPin },
  { href: "/admin/roles", label: "役割マスタ", icon: UserCog },
];

const ownerNav: NavItem[] = [
  { href: "/admin/users", label: "ユーザー管理", icon: Settings },
];

// role + 雇用形態で表示するナビをグループ単位で組み立てる
// クルー（crew）は打刻のみ。立替精算メニューは非表示
// 社員（employment=employee）には「クルー管理」セクションも表示
function navFor(role: string, employment?: string): NavGroup[] {
  const memberItems =
    employment === "crew" ? baseMemberNav : [...baseMemberNav, expenseNavItem];

  if (role === "owner") {
    return [
      { items: teamNav },
      { label: "クルー管理", items: crewMgmtNav },
      { items: ownerNav },
    ];
  }

  if (role === "admin") {
    return [
      { items: memberItems },
      { items: teamNav },
      ...(employment === "employee"
        ? [{ label: "クルー管理", items: crewMgmtNav }]
        : []),
    ];
  }

  // member
  if (employment === "employee") {
    return [
      { items: memberItems },
      { label: "クルー管理", items: crewMgmtNav },
    ];
  }
  return [{ items: memberItems }];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  return (first + second).toUpperCase() || first.toUpperCase();
}

function BrandMark({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle?: () => void;
}) {
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-3">
        <Image
          src="/logo-icon.png"
          alt="UniPoll"
          width={28}
          height={28}
          priority
          className="h-7 w-7 shrink-0 object-contain"
        />
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            title="サイドバーを展開"
            aria-label="サイドバーを展開"
            className="hidden rounded-[6px] p-1.5 text-[var(--brand-primary)]/70 transition-colors hover:bg-white/60 hover:text-[var(--brand-primary)] md:block"
          >
            <PanelLeftOpen size={16} strokeWidth={1.75} />
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 pl-1">
      <Image
        src="/logo.png"
        alt="UniPoll"
        width={160}
        height={40}
        priority
        className="h-8 w-auto object-contain"
      />
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          title="サイドバーを折りたたむ"
          aria-label="サイドバーを折りたたむ"
          className="hidden rounded-[6px] p-1.5 text-[var(--brand-primary)]/70 transition-colors hover:bg-white/60 hover:text-[var(--brand-primary)] md:block"
        >
          <PanelLeftClose size={16} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

function NavLink({
  item,
  active,
  collapsed,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      className={`group relative flex items-center rounded-[8px] text-[13px] font-medium transition-colors ${
        collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2"
      } ${
        active
          ? "bg-white text-[var(--brand-primary)] shadow-[var(--shadow-subtle)]"
          : "text-[var(--brand-primary)]/80 hover:bg-white/60 hover:text-[var(--brand-primary)]"
      }`}
    >
      <Icon
        size={16}
        strokeWidth={1.75}
        className={active ? "text-[var(--brand-accent)]" : "text-[var(--brand-primary)]/70"}
      />
      {!collapsed && <span>{item.label}</span>}
      {active && !collapsed && (
        <span className="u-dot u-dot-brand ml-auto" aria-hidden />
      )}
      {active && collapsed && (
        <span
          className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r bg-[var(--brand-primary)]"
          aria-hidden
        />
      )}
    </Link>
  );
}

function SidebarContent({
  user,
  pathname,
  collapsed,
  onToggle,
  onNavigate,
}: {
  user: User;
  pathname: string;
  collapsed: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const navGroups = navFor(user.role, user.employment);
  const empLabel =
    user.role === "owner"
      ? "CEO"
      : user.employment === "contractor"
      ? "BP"
      : user.employment === "crew"
      ? "CREW"
      : "FTE";
  const roleLabel =
    user.role === "owner"
      ? "代表取締役"
      : user.role === "admin"
      ? "Administrator"
      : "Member";

  return (
    <div className="u-sidebar flex h-full flex-col justify-between">
      <div className={`py-6 ${collapsed ? "px-3" : "px-5"}`}>
        {/* Brand */}
        <div className={collapsed ? "mb-8" : "mb-9 border-b border-white/50 pb-5"}>
          <BrandMark collapsed={collapsed} onToggle={onToggle} />
          {!collapsed && (
            <div className="mt-2 pl-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--brand-primary)]/70">
              UniTime
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-4">
          {navGroups.map((group, gi) => (
            <div key={gi}>
              {group.label && !collapsed && (
                <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-primary)]/55">
                  {group.label}
                </div>
              )}
              {group.label && collapsed && gi > 0 && (
                <div className="my-2 mx-2 border-t border-white/40" aria-hidden />
              )}
              <ul className="flex flex-col gap-1">
                {group.items.map((item) => {
                  const isActive =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <NavLink
                        item={item}
                        active={isActive}
                        collapsed={collapsed}
                        onClick={onNavigate}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      {/* User profile cell + toggle */}
      <div
        className={`border-t border-white/50 ${collapsed ? "p-2" : "p-3"}`}
      >
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div
              title={user.name}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white bg-white/90 text-[11px] font-semibold text-[var(--brand-primary)] shadow-[var(--shadow-subtle)]"
            >
              {initials(user.name)}
            </div>
            <form action="/api/logout" method="POST">
              <button
                type="submit"
                title="ログアウト"
                className="rounded-[6px] p-1.5 text-[var(--brand-primary)]/70 transition-colors hover:bg-white/60 hover:text-[var(--brand-primary)]"
              >
                <LogOut size={14} strokeWidth={1.75} />
              </button>
            </form>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5 rounded-[8px] bg-white/60 p-2 shadow-[var(--shadow-subtle)] backdrop-blur-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[var(--brand-accent)] to-[var(--brand-primary)] text-[11px] font-semibold text-white">
                {initials(user.name)}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] font-semibold tracking-tight text-[var(--brand-primary)]">
                  {user.name}
                </span>
                <span className="truncate text-[11px] text-[var(--brand-primary)]/70">
                  {roleLabel}
                </span>
              </div>
              <span className="rounded-[4px] bg-[var(--brand-accent)]/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--brand-primary)]">
                {empLabel}
              </span>
            </div>
            <Link
              href="/profile"
              className="mt-2 flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-[12px] font-medium text-[var(--brand-primary)]/70 transition-colors hover:bg-white/60 hover:text-[var(--brand-primary)]"
            >
              <KeyRound size={14} strokeWidth={1.75} />
              プロフィール・パスワード
            </Link>
            <form action="/api/logout" method="POST">
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-[12px] font-medium text-[var(--brand-primary)]/70 transition-colors hover:bg-white/60 hover:text-[var(--brand-primary)]"
              >
                <LogOut size={14} strokeWidth={1.75} />
                ログアウト
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function AppShell({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // 永続化: localStorage から初期状態を読み込む
  useEffect(() => {
    const saved = localStorage.getItem("unitime-sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
    setHydrated(true);
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("unitime-sidebar-collapsed", String(next));
      return next;
    });
  }

  const sidebarWidth = collapsed ? 64 : 240;

  return (
    <div className="min-h-screen bg-[var(--bg-body)]">
      {/* Mobile header */}
      <header className="u-sidebar fixed top-0 left-0 right-0 z-30 flex items-center justify-between border-b border-white/50 px-4 py-3 md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="メニュー"
          className="rounded-[6px] p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-body)]"
        >
          <Menu size={20} strokeWidth={1.75} />
        </button>
        <Image
          src="/logo.png"
          alt="UniPoll"
          width={104}
          height={26}
          priority
          className="h-6 w-auto object-contain"
        />
        <div className="w-7" />
      </header>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* Mobile slide-over */}
      <aside
        className={`fixed left-0 top-0 z-50 flex h-[100dvh] w-[260px] transform flex-col border-r border-white/40 transition-transform md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex shrink-0 items-center justify-end p-3">
          <button
            onClick={() => setMobileOpen(false)}
            className="rounded-[6px] p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-body)]"
            aria-label="閉じる"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <SidebarContent
            user={user}
            pathname={pathname}
            collapsed={false}
            onNavigate={() => setMobileOpen(false)}
          />
        </div>
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={`fixed left-0 top-0 hidden h-full border-r border-white/50 transition-[width] duration-200 md:block ${
          hydrated && collapsed ? "md:w-[64px]" : "md:w-[240px]"
        }`}
      >
        <SidebarContent
          user={user}
          pathname={pathname}
          collapsed={hydrated && collapsed}
          onToggle={toggle}
        />
      </aside>

      {/* Main */}
      <main
        className={`min-h-screen pt-14 transition-[margin] duration-200 md:pt-0 ${
          hydrated && collapsed ? "md:ml-[64px]" : "md:ml-[240px]"
        }`}
      >
        <div className="mx-auto max-w-[1200px] px-5 py-8 md:px-8 md:py-10">
          {children}
        </div>
      </main>
    </div>
  );
}
