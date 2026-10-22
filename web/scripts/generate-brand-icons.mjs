// توليد أيقونات المتصفح والتطبيق من شعار السلام:
// logo.png فوق مربع راودو دست #CDB49E مع حاشية — تُحفظ في public/brand/icons/
// ويُبنى favicon.ico بتنسيق PNG-inside-ICO (مدعوم في كل المتصفحات الحديثة).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "public", "brand", "logo.png");
const OUT = path.join(ROOT, "public", "brand", "icons");
const SAND = "#CDB49E";
const SIZES = {
  "favicon-32.png": 32,
  "apple-touch-icon.png": 180,
  "icon-192.png": 192,
  "icon-512.png": 512,
};

// أيقونة maskable: نفس الشعار كما هو لكن بحاشية أكبر (~20%) ليبقى داخل «المنطقة الآمنة»
// (دائرة بقطر 80%) حين يقصّها أندرويد بأشكال مختلفة.
const MASKABLE = { "icon-512-maskable.png": { size: 512, padding: 0.2 } };

async function squareWithPadding(size, paddingRatio = 0.12) {
  const inner = Math.round(size * (1 - paddingRatio * 2));
  const logo = await sharp(SRC).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: SAND },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toBuffer();
}

// ترويسة ICO: 6 بايت ICONDIR + 16 بايت ICONDIRENTRY ثم بايتات PNG الخام
function pngToIco(png, size) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count
  header.writeUInt8(size === 256 ? 0 : size, 6); // width
  header.writeUInt8(size === 256 ? 0 : size, 7); // height
  header.writeUInt8(0, 8); // palette
  header.writeUInt8(0, 9); // reserved
  header.writeUInt16LE(1, 10); // color planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14); // data size
  header.writeUInt32LE(22, 18); // data offset
  return Buffer.concat([header, png]);
}

await mkdir(OUT, { recursive: true });
for (const [name, size] of Object.entries(SIZES)) {
  await writeFile(path.join(OUT, name), await squareWithPadding(size));
  console.log("✓", name);
}
for (const [name, { size, padding }] of Object.entries(MASKABLE)) {
  await writeFile(path.join(OUT, name), await squareWithPadding(size, padding));
  console.log("✓", name);
}
// ————— أيقونات لوحة المطوّر (تطبيق منفصل على الشاشة الرئيسية) —————
// الشعار نفسه كما هو فوق نفس المربع الرملي، وتحته شارة «سطر أوامر» (كبسولة سوداء
// فيها >_) مرسومة حول الشعار لا فوقه، فيتميّز عن أيقونة «السلام». في نسخة maskable
// تبقى الشارة والشعار داخل المنطقة الآمنة (دائرة بقطر 80%).
const INK = "#000000";
const DEV_ICONS = {
  "dev-192.png": { size: 192, layout: "any" },
  "dev-512.png": { size: 512, layout: "any" },
  "dev-apple-touch-icon.png": { size: 180, layout: "any" },
  "dev-512-maskable.png": { size: 512, layout: "maskable" },
};
const DEV_LAYOUTS = {
  any: { logo: 0.58, logoY: 0.39, pillY: 0.83, pillW: 0.44, pillH: 0.15 },
  maskable: { logo: 0.42, logoY: 0.4, pillY: 0.74, pillW: 0.34, pillH: 0.13 },
};

function devBadgeSvg(size, { pillY, pillW, pillH }) {
  const w = size * pillW;
  const h = size * pillH;
  const cx = size / 2;
  const cy = size * pillY;
  const sw = h * 0.13;
  // الغلاف: >_ بحجم الكبسولة
  const chevron = `M ${cx - h * 0.55} ${cy - h * 0.28} L ${cx - h * 0.15} ${cy} L ${cx - h * 0.55} ${cy + h * 0.28}`;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="${INK}"/>` +
      `<path d="${chevron}" fill="none" stroke="${SAND}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<rect x="${cx}" y="${cy + h * 0.14}" width="${h * 0.55}" height="${sw}" rx="${sw / 2}" fill="${SAND}"/>` +
      `</svg>`,
  );
}

async function devIcon(size, layoutName) {
  const L = DEV_LAYOUTS[layoutName];
  const box = Math.round(size * L.logo);
  const logo = await sharp(SRC).resize(box, box, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: SAND } })
    .composite([
      { input: logo, left: Math.round((size - box) / 2), top: Math.round(size * L.logoY - box / 2) },
      { input: devBadgeSvg(size, L), left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}

for (const [name, { size, layout }] of Object.entries(DEV_ICONS)) {
  await writeFile(path.join(OUT, name), await devIcon(size, layout));
  console.log("✓", name);
}

const png32 = await readFile(path.join(OUT, "favicon-32.png"));
await writeFile(path.join(ROOT, "app", "favicon.ico"), pngToIco(png32, 32));
console.log("✓ app/favicon.ico");
