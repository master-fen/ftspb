import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/federation/")({
  beforeLoad: () => {
    throw redirect({ to: "/federation/about" });
  },
});
