// Rasmni yuklashdan oldin brauzerda siqish: ≤ 1600px, JPEG sifat 0.82 (SPEC 5).
export const MAX_SIDE = 1600;
export const JPEG_QUALITY = 0.82;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Faylni <img> ga yuklaydi (EXIF burilishi brauzer tomonidan hisobga olinadi). */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Rasmni o'qib bo'lmadi. Boshqa rasm tanlang (JPG, PNG yoki WebP)"));
    };
    img.src = url;
  });
}

/**
 * Rasmni siqadi va JPEG `File` qaytaradi.
 * @param {File|Blob} file
 * @returns {Promise<File>}
 */
export async function compressImage(file, { maxSide = MAX_SIDE, quality = JPEG_QUALITY } = {}) {
  if (!file || !/^image\//.test(file.type || 'image/')) {
    throw new Error('Faqat rasm fayli tanlang');
  }
  const { img, url } = await loadImage(file);
  try {
    const w0 = img.naturalWidth || img.width;
    const h0 = img.naturalHeight || img.height;
    if (!w0 || !h0) throw new Error("Rasmni o'qib bo'lmadi");
    const scale = Math.min(1, maxSide / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * scale));
    const h = Math.max(1, Math.round(h0 * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // PNG shaffofligi qora bo'lib qolmasin
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error("Rasmni qayta ishlab bo'lmadi");
    if (blob.size > MAX_UPLOAD_BYTES) throw new Error('Rasm juda katta (5 MB gacha)');

    const base = String(file.name || 'rasm').replace(/\.[^.]+$/, '') || 'rasm';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(url);
  }
}
