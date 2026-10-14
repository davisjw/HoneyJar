import { createFileRoute } from "@tanstack/react-router";
import { TransactionsPage } from "@/components/honey/screens/money";

export const Route = createFileRoute("/_app/transactions")({
  component: TransactionsPage,
});
