import { createFileRoute } from "@tanstack/react-router";
import { AdvisorPage } from "@/components/honey/screens/desk";

export const Route = createFileRoute("/_app/advisor")({
  component: AdvisorPage,
});
