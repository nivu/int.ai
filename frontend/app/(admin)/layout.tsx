import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/shared/logout-button";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/candidates", label: "Candidates" },
  { href: "/templates", label: "Templates" },
  { href: "/analytics", label: "Analytics" },
  { href: "/settings", label: "Settings" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <div className="flex h-screen">
      <aside className="w-64 border-r bg-muted/30 p-6 flex flex-col">
        <div className="mb-8">
          <h1 className="text-xl font-bold">int.ai</h1>
          <p className="text-sm text-muted-foreground">Hiring Automation</p>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto pt-4 border-t space-y-2">
          <p className="text-sm text-muted-foreground truncate">{user.email}</p>
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
