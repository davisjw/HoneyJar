import { createFileRoute } from "@tanstack/react-router";
import { GoalsPage } from "@/components/honey/screens/wealth";

export const Route = createFileRoute("/_app/goals")({
  component: GoalsPage,
});
