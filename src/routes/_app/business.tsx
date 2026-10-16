import { createFileRoute } from "@tanstack/react-router";
import { BusinessPage } from "@/components/honey/screens/business";

export const Route = createFileRoute("/_app/business")({
  component: BusinessPage,
});
