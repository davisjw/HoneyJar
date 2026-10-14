import { createFileRoute } from "@tanstack/react-router";
import { MilestonesPage } from "@/components/honey/screens/wealth";

export const Route = createFileRoute("/_app/milestones")({
  component: MilestonesPage,
});
