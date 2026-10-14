import { createFileRoute } from "@tanstack/react-router";
import { BillsPage } from "@/components/honey/screens/money";

export const Route = createFileRoute("/_app/bills")({
  component: BillsPage,
});
