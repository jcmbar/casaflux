import { createHash } from "node:crypto";

export function normalizeImportContent(content: string): string {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function hashImportContent(content: string): string {
  const normalized = normalizeImportContent(content);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export async function hashImportContentAsync(content: string): Promise<string> {
  const normalized = normalizeImportContent(content);
  const data = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
