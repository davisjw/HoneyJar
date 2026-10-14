import { createFileRoute } from "@tanstack/react-router";

async function handle({ request }: { request: Request }) {
  const { handleMcp } = await import("@/lib/honey/public-api.server");
  return handleMcp(request);
}

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      POST: handle,
      OPTIONS: handle,
    },
  },
});
