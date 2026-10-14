import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/honey/screens/desk";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});
