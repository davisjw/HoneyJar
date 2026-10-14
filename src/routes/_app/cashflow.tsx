import { createFileRoute } from "@tanstack/react-router";
import { CashflowPage } from "@/components/honey/screens/money";

export const Route = createFileRoute("/_app/cashflow")({
  component: CashflowPage,
});
