import { createFileRoute } from "@tanstack/react-router";
import { SharePage } from "@/components/honey/screens/desk";

export const Route = createFileRoute("/_app/share")({
  component: SharePage,
});
