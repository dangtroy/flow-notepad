/**
 * Images pasted or dropped into the composer are kept inside the note itself.
 *
 * They are downscaled and re-encoded in the browser first, so a phone photo
 * becomes a small inline image instead of a multi-megabyte blob. The result is
 * a `data:` URL, which means an image never depends on an expiring link.
 */

const MAX_EDGE = 1400;
const QUALITY = 0.82;

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export function isImageFile(file: File | null | undefined): boolean {
  return Boolean(file && file.type.startsWith("image/"));
}

export function imageFilesFrom(list: FileList | File[] | null | undefined): File[] {
  if (!list) return [];
  return Array.from(list).filter(isImageFile);
}

/** True when a drag carries files (so the composer can show a drop target). */
export function dragHasFiles(transfer: DataTransfer | null): boolean {
  if (!transfer) return false;
  return Array.from(transfer.types ?? []).includes("Files");
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read that image"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not open that image"));
    image.src = src;
  });
}

/** Downscales to a sane edge length and returns an inline data URL. */
export async function prepareImage(file: File): Promise<{ src: string; alt: string }> {
  if (file.size > MAX_IMAGE_BYTES) throw new Error("That image is too large");

  const raw = await readAsDataUrl(file);
  const alt = file.name.replace(/\.[a-z0-9]+$/i, "");

  // GIFs would lose their animation on a canvas round-trip; keep them as-is.
  if (file.type === "image/gif") return { src: raw, alt };

  try {
    const image = await loadImage(raw);
    const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
    if (scale === 1 && file.size < 400 * 1024) return { src: raw, alt };

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return { src: raw, alt };
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    const encoded = canvas.toDataURL(type, QUALITY);
    return { src: encoded.length < raw.length ? encoded : raw, alt };
  } catch {
    return { src: raw, alt };
  }
}
