import { createFileRoute } from "@tanstack/react-router";
import { UtilitiesPage } from "@/components/honey/screens/utilities";

export const Route = createFileRoute("/_app/utilities")({
  component: UtilitiesPage,
});
