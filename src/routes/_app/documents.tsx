import { createFileRoute } from "@tanstack/react-router";
import { DocumentsPage } from "@/components/honey/screens/desk";

export const Route = createFileRoute("/_app/documents")({
  component: DocumentsPage,
});
