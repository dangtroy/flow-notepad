import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Settings is a modal over the stream now, so this path only exists to keep old
 * links working: it sends you home with the settings dialog open.
 */
export const Route = createFileRoute("/_authenticated/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/", search: { settings: true } });
  },
  component: () => null,
});
