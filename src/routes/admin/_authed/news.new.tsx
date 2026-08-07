import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { createNews, suggestSlug } from "@/lib/news-admin-server-fn";

export const Route = createFileRoute("/admin/_authed/news/new")({
  component: AdminNewsNew,
});

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const formSchema = z.object({
  title: z.string().min(1, "Введите заголовок"),
  publishedAt: z.string().min(1, "Укажите дату"),
});

function AdminNewsNew() {
  const navigate = useNavigate();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: "", publishedAt: todayIso() },
  });

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      const slug = await suggestSlug({ data: values });
      return createNews({
        data: { slug, title: values.title, publishedAt: values.publishedAt, status: "draft" },
      });
    },
    onSuccess: ({ id }) => navigate({ to: "/admin/news/$id", params: { id } }),
    onError: () => toast.error("Не удалось создать новость"),
  });

  const onSubmit = form.handleSubmit((values) => mutation.mutate(values));

  return (
    <div className="flex min-h-screen justify-center bg-background px-4 py-8">
      <Card className="h-fit w-full max-w-md">
        <CardHeader>
          <CardTitle>Новая новость</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Заголовок</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="publishedAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Дата</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending ? "Создаём…" : "Создать черновик"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
