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
const png32 = await readFile(path.join(OUT, "favicon-32.png"));
await writeFile(path.join(ROOT, "app", "favicon.ico"), pngToIco(png32, 32));
console.log("✓ app/favicon.ico");
