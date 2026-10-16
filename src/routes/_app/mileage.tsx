import { createFileRoute } from "@tanstack/react-router";
import { MileagePage } from "@/components/honey/screens/billing";

export const Route = createFileRoute("/_app/mileage")({
  component: MileagePage,
});
