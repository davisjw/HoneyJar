import { createFileRoute } from "@tanstack/react-router";
import { PlanPage } from "@/components/honey/screens/money";

export const Route = createFileRoute("/_app/plan")({
  component: PlanPage,
});
