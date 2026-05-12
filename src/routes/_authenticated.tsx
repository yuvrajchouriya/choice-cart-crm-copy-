import { createFileRoute, redirect, Link, Outlet, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { LayoutDashboard, Package, MessageSquare, Send, Smartphone, Settings, LogOut, MessageCircle, Phone, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.session.user.id);
    if (!roles?.some((r) => r.role === "admin")) throw redirect({ to: "/login", search: { error: "no_admin" } as any });
  },
  component: AuthLayout,
});

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/orders", label: "Orders", icon: Package },
  { to: "/replies", label: "Customer Replies", icon: MessageCircle },
  { to: "/calls", label: "AI Calls", icon: Phone },
  { to: "/agent", label: "AI Agent", icon: Bot },
  { to: "/templates", label: "Templates", icon: MessageSquare },
  { to: "/jobs", label: "Message Queue", icon: Send },
  { to: "/bridge", label: "WA Bridge", icon: Smartphone },
  { to: "/settings", label: "Settings", icon: Settings },
];

function AuthLayout() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/login" });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="w-60 border-r bg-card flex flex-col">
        <div className="p-4 border-b">
          <h1 className="text-lg font-bold">ChoiceCart CRM</h1>
          <p className="text-xs text-muted-foreground truncate">{email}</p>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to as any}
              activeOptions={{ exact: n.to === "/" }}
              activeProps={{ className: "bg-accent text-accent-foreground" }}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-accent/50"
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="p-2 border-t">
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
      <Toaster />
    </div>
  );
}
