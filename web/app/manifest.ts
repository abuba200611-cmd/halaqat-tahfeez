import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { requestHost } from "@/lib/hosts";
import { manifestForHost } from "@/lib/pwa";

/*
  مانيفست PWA — يخدم /manifest.webmanifest ويتبع المستضيف: مستضيف لوحة
  المطوّر يحصل على تطبيق منفصل (id=/dev)، والمنصة العامة على «السلام».
  قراءة headers() تجعل المسار ديناميكياً (لا يُخزَّن بين المستضيفين).
  الأيقونات من public/brand/icons (scripts/generate-brand-icons.mjs).
*/
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  return manifestForHost(requestHost(await headers()));
}
