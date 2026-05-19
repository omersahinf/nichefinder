// app/components/NavBar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavBarProps {
  quotaUsed?: number;
  quotaLimit?: number;
  userEmail?: string;
  userAvatarUrl?: string;
  onSignOut?: () => void;
}

export function NavBar({ quotaUsed, quotaLimit, userEmail, userAvatarUrl, onSignOut }: NavBarProps) {
  const pathname = usePathname();

  const fmt = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
    return String(n);
  };

  const navItems = [
    { href: "/app",     label: "Search"  },
    { href: "/saved",   label: "Saved"   },
    { href: "/alerts",  label: "Alerts"  },
    { href: "/docs",    label: "API"     },
    { href: "/account", label: "Account" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur-sm">
      <div className="mx-auto flex h-12 max-w-screen-xl items-center gap-6 px-5">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-1.5 text-sm font-bold tracking-tight text-neutral-100 hover:text-white">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="2" y="2" width="7" height="7" rx="1" fill="#dc2626"/>
            <rect x="11" y="2" width="7" height="7" rx="1" fill="#dc2626" opacity="0.5"/>
            <rect x="2" y="11" width="7" height="7" rx="1" fill="#dc2626" opacity="0.5"/>
            <rect x="11" y="11" width="7" height="7" rx="1" fill="#dc2626" opacity="0.3"/>
          </svg>
          NicheFinder
          <span className="font-mono text-red-500">.</span>
        </Link>

        <div className="h-5 w-px bg-neutral-800" />

        {/* Nav */}
        <nav className="flex items-center gap-1">
          {navItems.map(item => {
            const active = pathname === item.href || (item.href === "/app" && pathname.startsWith("/app"));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-neutral-800 text-neutral-100"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* Right side */}
        <div className="flex items-center gap-3">
          {quotaUsed !== undefined && quotaLimit !== undefined && (
            <span className="font-mono text-[11px] text-neutral-600">
              Quota: {fmt(quotaUsed)} / {fmt(quotaLimit)}
            </span>
          )}

          <div className="h-4 w-px bg-neutral-800" />

          <Link
            href="/pricing"
            className="rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 transition-colors"
          >
            Upgrade Pro
          </Link>

          {userEmail ? (
            <div className="flex items-center gap-2">
              {userAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={userAvatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-neutral-300">
                  {userEmail[0].toUpperCase()}
                </div>
              )}
              <button
                type="button"
                onClick={onSignOut}
                className="text-[11px] text-neutral-500 hover:text-red-300 transition-colors"
              >
                Logout
              </button>
            </div>
          ) : (
            <Link href="/login" className="text-xs font-medium text-neutral-400 hover:text-neutral-200 transition-colors">
              Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
