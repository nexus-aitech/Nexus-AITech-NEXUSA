// src/lib/courses.ts
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";

// ---------- Schema (انعطاف‌پذیر ولی سخت‌گیر روی کلیدهای اصلی)
const Lesson = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  durationMin: z.number().int().positive().optional(),
});

const Module = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().optional(),
  lessons: z.array(Lesson).default([]),
});

const Link = z.object({ label: z.string(), href: z.string().url().optional() }).partial().refine(
  (v) => v.label, { message: "resources[].label is required" }
);

export const CourseSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  tagline: z.string().optional(),
  level: z.string().min(1),
  durationH: z.number().positive().optional(),
  prerequisites: z.array(z.string()).default([]),
  objectives: z.array(z.string()).default([]),
  resources: z.array(Link).default([]),
  quiz: z.object({ id: z.string(), title: z.string().optional() }).optional(),
  project: z.object({ id: z.string(), title: z.string().optional() }).optional(),
  cover: z.string().optional(),
  modules: z.array(Module).default([]),
}).strict();

export type Course = z.infer<typeof CourseSchema>;

// ---------- Paths
const COURSES_ROOT = path.resolve(process.cwd(), "src/content/courses");

async function readJSONIfExists(file: string) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function listCourseSlugs(): Promise<string[]> {
  const entries = await fs.readdir(COURSES_ROOT, { withFileTypes: true });
  return entries.filter((d) => d.isDirectory()).map((d) => d.name);
}

const CANDIDATE_FILES = ["meta.json", "course.json", "index.json"];

export async function loadCourse(slug: string): Promise<Course> {
  const courseDir = path.join(COURSES_ROOT, slug);
  // فایل‌های محتمل را امتحان کن
  for (const name of CANDIDATE_FILES) {
    const p = path.join(courseDir, name);
    const json = await readJSONIfExists(p);
    if (json) {
      // اگر slug داخل فایل نبود، از نام پوشه ست کن
      if (!json.slug) json.slug = slug;
      const parsed = CourseSchema.safeParse(json);
      if (!parsed.success) {
        const issues = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
        throw new Error(`[courses] Invalid schema for "${slug}": ${issues}`);
      }
      return parsed.data;
    }
  }
  throw new Error(`[courses] No JSON found for "${slug}". Expected one of: ${CANDIDATE_FILES.join(", ")}`);
}

export async function loadAllCoursesMeta() {
  const slugs = await listCourseSlugs();
  const items: Array<Pick<Course, "slug"|"title"|"tagline"|"level"|"durationH"|"cover">> = [];
  for (const s of slugs) {
    try {
      const c = await loadCourse(s);
      items.push({ slug: c.slug, title: c.title, tagline: c.tagline, level: c.level, durationH: c.durationH, cover: c.cover });
    } catch (e) {
      console.warn(String(e));
    }
  }
  // سورت سطحی: beginner→advanced داخل استرینگ
  return items.sort((a,b)=> (a.title||"").localeCompare(b.title||""));
}

export function totalDurationMin(course: Course) {
  return course.modules.reduce((acc, m) => acc + m.lessons.reduce((s,l)=> s + (l.durationMin ?? 0), 0), 0);
}
