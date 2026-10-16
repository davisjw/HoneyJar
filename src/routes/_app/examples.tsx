import { createFileRoute } from "@tanstack/react-router";
import { SummaryExamples } from "@/components/honey/summary-examples";

export const Route = createFileRoute("/_app/examples")({
  component: SummaryExamples,
});
