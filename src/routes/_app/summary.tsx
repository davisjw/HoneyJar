import { createFileRoute } from "@tanstack/react-router";
import { SummaryPage } from "@/components/honey/screens/summary";

export const Route = createFileRoute("/_app/summary")({
  component: SummaryPage,
});
