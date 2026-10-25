/*
  بصمات الملفات (magic bytes) — منطق صرف بلا خادم. لا نثق بالامتداد ولا
  بـContent-Type المرسَل؛ القرار على البايتات الفعلية. (فحص الصور في
  lib/image-processing.ts وlib/mosque/archive.ts، والصوت في lib/recitations.ts.)
*/

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((b, i) => bytes[i] === b);
}

/** حاوية zip (xlsx/docx…): PK\x03\x04 */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
}

/** بصمات ثنائية شائعة لا يصحّ أن يبدأ بها ملف نصي */
const BINARY_SIGNATURES: readonly (readonly number[])[] = [
  [0x50, 0x4b, 0x03, 0x04], // zip
  [0x25, 0x50, 0x44, 0x46], // %PDF
  [0x89, 0x50, 0x4e, 0x47], // png
  [0xff, 0xd8, 0xff], // jpeg
  [0x47, 0x49, 0x46, 0x38], // GIF8
  [0xd0, 0xcf, 0x11, 0xe0], // OLE (xls/doc قديم)
  [0x7f, 0x45, 0x4c, 0x46], // ELF
  [0x4d, 0x5a], // MZ (exe)
  [0x1f, 0x8b], // gzip
];

/**
 * هل يبدو الملف ثنائياً لا نصاً؟ بصمة ثنائية معروفة في أوله، أو بايت NUL
 * في أول ٨ كيلوبايت (النص UTF-8/Windows-1256 لا يحويه).
 */
export function looksLikeBinary(bytes: Uint8Array): boolean {
  if (BINARY_SIGNATURES.some((sig) => startsWith(bytes, sig))) return true;
  const end = Math.min(bytes.length, 8192);
  for (let i = 0; i < end; i++) if (bytes[i] === 0x00) return true;
  return false;
}
