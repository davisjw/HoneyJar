import { createFileRoute } from "@tanstack/react-router";
import { ContactsPage } from "@/components/honey/screens/contacts";

export const Route = createFileRoute("/_app/contacts")({
  component: ContactsPage,
});
