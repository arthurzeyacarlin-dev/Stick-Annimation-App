// The profile picture, made small in the browser (SPEC-0020 Phase 1). Shared by the Profile page and the testimonial
// "Add a photo" nudge (SPEC-0029), so both save exactly the same picture through the account system's own update.
import { ACCOUNT_PROFILE_IMAGE_MAX_CHARS } from "./accountConfig";

const PICTURE_SIZE = 256;

/** Center-crops and shrinks a picture to a small square JPEG, so it stays light to save and show. */
export async function pictureToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = PICTURE_SIZE;
  canvas.height = PICTURE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("picture_unreadable");
  context.fillStyle = "#232328";
  context.fillRect(0, 0, PICTURE_SIZE, PICTURE_SIZE);
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, PICTURE_SIZE, PICTURE_SIZE);
  bitmap.close();
  for (const quality of [0.86, 0.72, 0.58]) {
    const url = canvas.toDataURL("image/jpeg", quality);
    if (url.length <= ACCOUNT_PROFILE_IMAGE_MAX_CHARS) return url;
  }
  throw new Error("picture_too_large");
}

/** Saves a picked file as the profile picture (the same call the Profile page makes). True when it was saved. */
export async function saveProfilePicture(file: File): Promise<boolean> {
  if (!file.type.startsWith("image/")) return false;
  const image = await pictureToDataUrl(file);
  const response = await fetch("/api/auth/update-user", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) });
  return response.ok;
}
