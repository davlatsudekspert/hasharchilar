// To'lov webhook'lari tanasini cheklangan hajmda o'qish: Content-Length bo'lmasa ham (chunked) oqim baytlab
// sanaladi (validate.js → readBodyLimited) — chegaradan katta tana xotiraga yig'ilmaydi.
import { readBodyLimited } from './validate.js';

/** Tana matni yoki null (chegaradan katta / o'qib bo'lmadi). */
export async function readTextLimited(req, max) {
  const len = req.headers.get('content-length');
  if (len != null && !(Number(len) <= max)) return null;
  try {
    return new TextDecoder().decode(await readBodyLimited(req, max));
  } catch {
    return null;
  }
}
