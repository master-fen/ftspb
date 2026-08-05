import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect, stripSearchParams, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { getSessionFn, loginFn } from "@/lib/auth-server-fn";

const searchSchema = z.object({
  redirect: fallback(z.string(), "").default(""),
});

/**
 * search.redirect приходит из query-строки — доверять ей нельзя без проверки,
 * иначе `/admin/login?redirect=https://чужой-сайт` уведёт после успешного
 * входа наружу (open redirect).
 */
function safeRedirectTarget(raw: string): string {
  return raw === "/admin" || raw.startsWith("/admin/") ? raw : "/admin";
}

const formSchema = z.object({
  login: z.string().min(1, "Введите логин"),
  password: z.string().min(1, "Введите пароль"),
});

export const Route = createFileRoute("/admin/login")({
  validateSearch: zodValidator(searchSchema),
  search: {
    middlewares: [stripSearchParams({ redirect: "" })],
  },
  beforeLoad: async () => {
    const session = await getSessionFn();
    if (session) {
      throw redirect({ to: "/admin" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { login: "", password: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof formSchema>) => loginFn({ data: values }),
  });

  const onSubmit = form.handleSubmit((values) => {
    mutation.mutate(values, {
      onSuccess: (result) => {
        if (result.ok) {
          navigate({ href: safeRedirectTarget(search.redirect) });
        }
      },
    });
  });

  const result = mutation.data;
  const errorMessage = mutation.isError
    ? "Не удалось выполнить вход, попробуйте позже"
    : result && !result.ok
      ? result.reason === "locked"
        ? `Слишком много попыток. Повторите через ${result.retryAfterMinutes} мин.`
        : "Неверный логин или пароль"
      : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Вход в админку</CardTitle>
          <CardDescription>Федерация тенниса Санкт-Петербурга</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <FormField
                control={form.control}
                name="login"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Логин</FormLabel>
                    <FormControl>
                      <Input autoComplete="username" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Пароль</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {errorMessage ? (
                <Alert variant="destructive">
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              ) : null}
              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending ? "Входим…" : "Войти"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
