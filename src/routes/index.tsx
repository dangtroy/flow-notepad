import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  // Flow is one permanent conversation, so the root simply opens it.
  beforeLoad: () => {
    throw redirect({ to: "/flow" });
  },
});
