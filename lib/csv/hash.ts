import { createHash } from "node:crypto";

export function headersHash(headers: string[]): string {
  const normalized = headers.map((h) => String(h).trim().toLowerCase()).sort().join(",");
  return createHash("sha1").update(normalized).digest("hex");
}

export function rowHash(raw: Record<string, string | number | null>): string {
  const keys = Object.keys(raw).sort();
  const obj: Record<string, string | number | null> = {};
  for (const k of keys) obj[k] = raw[k];
  return createHash("sha1").update(JSON.stringify(obj)).digest("hex");
}
