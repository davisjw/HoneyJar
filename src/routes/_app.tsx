import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { BookProvider } from "@/components/honey/book";
import { Shell } from "@/components/honey/shell";
import { Boot, Welcome } from "@/components/honey/welcome";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, isPending } = useCurrentUserState();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || isPending) return <Boot />;
  if (!user) return <Welcome />;
  return (
    <BookProvider>
      <Shell>
        <Outlet />
      </Shell>
    </BookProvider>
  );
}
