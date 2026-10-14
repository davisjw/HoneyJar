import { createFileRoute } from "@tanstack/react-router";
import { AccountsPage } from "@/components/honey/screens/desk";

export const Route = createFileRoute("/_app/accounts")({
  component: AccountsPage,
});
