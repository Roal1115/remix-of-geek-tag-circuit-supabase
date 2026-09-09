import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Render-time guard for user-supplied URLs (store website / google_maps_url)
// going into <a href>. Server-side zod validation is the primary boundary;
// this covers rows persisted before that validation existed and any future
// sink that forgets to check. Uses the URL parser rather than a regex so
// "javascript:alert(1)//https://x" style tricks can't sneak past a prefix test.
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

// "YYYY-MM-DD" usando los campos LOCALES de la fecha — nunca usar
// toISOString() para esto: convierte a UTC y puede desplazar el día.
export function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "Hoy" en zona horaria de México ("YYYY-MM-DD"), sin importar dónde
// corra el proceso (el server en Cloudflare corre en UTC — a las 6pm MX
// el "hoy" UTC ya es mañana).
export function todayInMexicoStr(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
}

// Convención de semana estandarizada en toda la app: Lun–Dom.
// Siempre usar este helper — nunca recalcular a mano con getDay().
export function mondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}
