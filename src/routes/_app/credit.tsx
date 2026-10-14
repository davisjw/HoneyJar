import { createFileRoute } from "@tanstack/react-router";
import { CreditPage } from "@/components/honey/screens/wealth";

export const Route = createFileRoute("/_app/credit")({
  component: CreditPage,
});
