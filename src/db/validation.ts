import { z } from "zod";

/** Page create/update form (POST /admin/editor/save). */
export const pageFormSchema = z.object({
  id: z.string().trim().optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens"),
  title: z.string().trim().min(1, "Title is required").max(200),
  content: z.string().default(""),
  excerpt: z.string().trim().max(500).default(""),
  tags: z.string().default(""),
  date: z.string().optional(),
  published: z.literal("on").optional(),
  kind: z.enum(["home", "page", "post"]).default("post"),
  nav_label: z.string().trim().optional(),
  nav_order: z.string().optional(),
});
export type PageFormData = z.infer<typeof pageFormSchema>;

/** Content view create/update form (POST /admin/views/save). */
export const viewFormSchema = z.object({
  id: z.string().trim().optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens"),
  title: z.string().trim().min(1, "Title is required"),
  kind: z.enum(["post_list", "custom"]).default("post_list"),
  published: z.literal("on").optional(),
  limit: z.string().optional(),
  query: z.string().optional(),
  template: z.string().optional(),
});
export type ViewFormData = z.infer<typeof viewFormSchema>;

/** Site bundle / layout save form (POST /admin/site/save, POST /admin/layout/save). */
export const siteBundleFormSchema = z.object({
  html: z.string().default(""),
  css: z.string().default(""),
  ts: z.string().default(""),
});
export type SiteBundleFormData = z.infer<typeof siteBundleFormSchema>;

/** Subscribe form (POST /api/subscribe). */
export const subscribeFormSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please provide a valid email address"),
});
export type SubscribeFormData = z.infer<typeof subscribeFormSchema>;

/** Login form (POST /admin/login). */
export const loginFormSchema = z.object({
  password: z.string().min(1, "Password is required"),
});
export type LoginFormData = z.infer<typeof loginFormSchema>;
