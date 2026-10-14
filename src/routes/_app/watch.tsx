import { createFileRoute } from "@tanstack/react-router";
import { WatchPage } from "@/components/honey/screens/desk";

export const Route = createFileRoute("/_app/watch")({
  component: WatchPage,
});
