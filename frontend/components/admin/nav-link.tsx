"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

function PendingIndicator() {
  const { pending } = useLinkStatus();
  // Always rendered at a fixed size so toggling it never shifts the layout.
  return (
    <>
      <Loader2
        aria-hidden
        className={`h-4 w-4 animate-spin text-muted-foreground transition-opacity ${
          pending ? "opacity-100" : "opacity-0"
        }`}
      />
      <span role="status" className="sr-only">
        {pending ? "Loading" : ""}
      </span>
    </>
  );
}

export function NavLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active ? "bg-muted text-foreground" : "hover:bg-muted"
      }`}
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <PendingIndicator />
    </Link>
  );
}
