import { createServerFn } from "@tanstack/react-start";
import { featuredNewsInput } from "@/lib/featured-news-input";
import { getFeaturedEditor, saveFeaturedEditor } from "@/server/news-featured-admin";

export const getFeaturedNews = createServerFn({ method: "GET" }).handler(() => getFeaturedEditor());
export const saveFeaturedNews = createServerFn({ method: "POST" })
  .validator(featuredNewsInput)
  .handler(({ data }) => saveFeaturedEditor(data));
