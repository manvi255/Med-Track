import { chmod, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PRESCRIPTION_STORAGE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../storage/prescriptions"
);

const safeStorageKeyPattern = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}\.(jpg|png|webp)$/i;

export async function ensurePrescriptionStorageDirectory() {
  await mkdir(PRESCRIPTION_STORAGE_DIR, { recursive: true, mode: 0o700 });
  await chmod(PRESCRIPTION_STORAGE_DIR, 0o700);
}

export function resolvePrescriptionStoragePath(storageKey) {
  if (typeof storageKey !== "string" || !safeStorageKeyPattern.test(storageKey)) {
    throw new TypeError("Invalid prescription storage key");
  }
  const resolvedPath = path.resolve(PRESCRIPTION_STORAGE_DIR, storageKey);
  if (path.dirname(resolvedPath) !== PRESCRIPTION_STORAGE_DIR) {
    throw new TypeError("Invalid prescription storage key");
  }
  return resolvedPath;
}

export async function removePrescriptionFile(storageKey) {
  const filePath = resolvePrescriptionStoragePath(storageKey);
  try {
    await unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
