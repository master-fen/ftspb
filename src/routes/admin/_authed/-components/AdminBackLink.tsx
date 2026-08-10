import { Link, type LinkProps } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type AdminBackLinkProps = {
  to: LinkProps["to"];
  label: string;
};

export function AdminBackLink({ to, label }: AdminBackLinkProps) {
  return (
    <Button variant="ghost" size="sm" className="-ml-3 w-fit text-muted-foreground" asChild>
      <Link to={to}>
        <ArrowLeft />
        {label}
      </Link>
    </Button>
  );
}
