import { createFileRoute } from "@tanstack/react-router";
import { ReportsPage } from "@/components/honey/screens/desk";

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});
