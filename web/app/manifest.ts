import type { MetadataRoute } from "next";
import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME, THEME_COLOR } from "@/lib/pwa";

/* مانيفست PWA — يخدم /manifest.webmanifest. الأيقونات من public/brand/icons (scripts/generate-brand-icons.mjs). */
const SHORTCUT_ICONS = [{ src: "/brand/icons/icon-192.png", sizes: "192x192", type: "image/png" }];

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: APP_DESCRIPTION,
    lang: "ar",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    categories: ["education", "productivity"],
    icons: [
      { src: "/brand/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "دخول", short_name: "دخول", url: "/login", icons: SHORTCUT_ICONS },
      { name: "رسائل", short_name: "رسائل", url: "/messages", icons: SHORTCUT_ICONS },
      { name: "الحضور", short_name: "الحضور", url: "/attendance", icons: SHORTCUT_ICONS },
    ],
  };
}
