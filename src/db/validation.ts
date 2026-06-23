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
  // Reliable on/off encoding: the editor renders a hidden "off" field before
  // the checkbox "on", so an unchecked box still submits a value. Absent only
  // for forms without the control (non-post kinds / older clients).
  comments_enabled: z.string().optional(),
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

/** Site template save form (POST /admin/layout/save). */
export const siteTemplateFormSchema = z.object({
  template: z.string().min(1, "Template JSON is required"),
});
export type SiteTemplateFormData = z.infer<typeof siteTemplateFormSchema>;

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

/** Member signup form (POST /api/members/signup). */
export const memberSignupFormSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please provide a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  display_name: z.string().trim().max(100).optional(),
  next: z.string().optional(),
});
export type MemberSignupFormData = z.infer<typeof memberSignupFormSchema>;

/** Member login form (POST /api/members/login). */
export const memberLoginFormSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please provide a valid email address"),
  password: z.string().min(1, "Password is required"),
  next: z.string().optional(),
});
export type MemberLoginFormData = z.infer<typeof memberLoginFormSchema>;
