import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_site/federation/")({
  beforeLoad: () => {
    throw redirect({ to: "/federation/about" });
  },
});
