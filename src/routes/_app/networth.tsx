import { createFileRoute } from "@tanstack/react-router";
import { NetWorthPage } from "@/components/honey/screens/wealth";

export const Route = createFileRoute("/_app/networth")({
  component: NetWorthPage,
});
