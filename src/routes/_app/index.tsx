import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/honey/screens/dashboard";

export const Route = createFileRoute("/_app/")({
  component: Dashboard,
});
