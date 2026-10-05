import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ApplicationError } from "@yaren/shared-kernel";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../uploads");

const imageTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

const documentTypes = new Map([
  ...imageTypes,
  ["application/pdf", "pdf"],
]);

export const maxVisitDocumentBytes = 10 * 1024 * 1024;

export function uploadsRoot() {
  return root;
}

export function photoUrl(photoPath: string | null | undefined) {
  return photoPath ? `/uploads/${photoPath}` : null;
}

export function fileUrl(filePath: string | null | undefined) {
  return filePath ? `/uploads/${filePath}` : null;
}

export async function ensureUploadDirs() {
  await mkdir(path.join(root, "avatars"), { recursive: true });
  await mkdir(path.join(root, "visit-docs"), { recursive: true });
}

export async function saveAvatar(userId: string, file: { mimetype: string; toBuffer: () => Promise<Buffer> }, previousPath?: string | null) {
  const extension = imageTypes.get(file.mimetype);
  if (!extension) throw new ApplicationError(422, "invalid_photo", "Use a JPEG, PNG, or WebP photo");
  const buffer = await file.toBuffer();
  if (buffer.byteLength === 0) throw new ApplicationError(422, "invalid_photo", "Choose a photo to upload");
  if (buffer.byteLength > 2 * 1024 * 1024) throw new ApplicationError(422, "photo_too_large", "Photo must be 2 MB or smaller");
  await ensureUploadDirs();
  const relative = `avatars/${userId}.${extension}`;
  await writeFile(path.join(root, relative), buffer);
  if (previousPath && previousPath !== relative) await removeUpload(previousPath);
  return relative;
}

export async function saveVisitDocument(
  visitId: string,
  documentType: string,
  file: { mimetype: string; filename?: string; toBuffer: () => Promise<Buffer> },
  previousPath?: string | null,
) {
  const extension = documentTypes.get(file.mimetype);
  if (!extension) throw new ApplicationError(422, "invalid_document", "Use a PDF, JPEG, PNG, or WebP file");
  const buffer = await file.toBuffer();
  if (buffer.byteLength === 0) throw new ApplicationError(422, "invalid_document", "Choose a file to upload");
  if (buffer.byteLength > maxVisitDocumentBytes) throw new ApplicationError(422, "document_too_large", "File must be 10 MB or smaller");
  await ensureUploadDirs();
  const folder = path.join(root, "visit-docs", visitId);
  await mkdir(folder, { recursive: true });
  const relative = `visit-docs/${visitId}/${documentType}.${extension}`;
  await writeFile(path.join(root, relative), buffer);
  if (previousPath && previousPath !== relative) await removeUpload(previousPath);
  return {
    path: relative,
    originalName: file.filename?.trim() || `${documentType}.${extension}`,
    mimeType: file.mimetype,
  };
}

export async function removeUpload(photoPath: string | null | undefined) {
  if (!photoPath) return;
  await unlink(path.join(root, photoPath)).catch(() => undefined);
}
