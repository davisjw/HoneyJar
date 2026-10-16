import { createFileRoute } from "@tanstack/react-router";
import { InvoicesPage } from "@/components/honey/screens/billing";

export const Route = createFileRoute("/_app/invoices")({
  component: InvoicesPage,
});
