import { createFileRoute } from "@tanstack/react-router";
import { LeasesPage } from "@/components/honey/screens/leases";

export const Route = createFileRoute("/_app/leases")({
  component: LeasesPage,
});
