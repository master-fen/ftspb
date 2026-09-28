import { Link, type LinkProps } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type AdminBackLinkProps = {
  to: LinkProps["to"];
  label: string;
  /** Необязательно: состояние списка (фильтры/страница), на которое должна
   *  вести ссылка, вместо адреса `to` с умолчаниями. */
  search?: LinkProps["search"];
};

export function AdminBackLink({ to, label, search }: AdminBackLinkProps) {
  return (
    <Button variant="ghost" size="sm" className="-ml-3 w-fit text-muted-foreground" asChild>
      <Link to={to} search={search}>
        <ArrowLeft />
        {label}
      </Link>
    </Button>
  );
}
