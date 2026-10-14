import { createFileRoute } from "@tanstack/react-router";
import { TaxesPage } from "@/components/honey/screens/desk";

export const Route = createFileRoute("/_app/taxes")({
  component: TaxesPage,
});
