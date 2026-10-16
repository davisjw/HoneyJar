import { createFileRoute } from "@tanstack/react-router";
import { JarsPage } from "@/components/honey/screens/jars";

export const Route = createFileRoute("/_app/jars")({
  component: JarsPage,
});
