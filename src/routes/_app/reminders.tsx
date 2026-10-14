import { createFileRoute } from "@tanstack/react-router";
import { RemindersPage } from "@/components/honey/screens/desk";

export const Route = createFileRoute("/_app/reminders")({
  component: RemindersPage,
});
