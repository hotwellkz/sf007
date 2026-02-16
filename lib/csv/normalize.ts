export type RawRow = Record<string, string | number | null>;
export type NormRow = Record<string, string | number | null>;

const SYMBOL_HEADERS = ["Ticker", "Symbol", "ticker", "symbol"] as const;

export function getSymbolFromRaw(raw: RawRow): string | null {
  for (const h of SYMBOL_HEADERS) {
    const v = raw[h];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return null;
}

function isEmpty(v: string): boolean {
  const s = v.trim();
  return s === "" || s === "-" || s.toLowerCase() === "n/a";
}

export function normalizeCell(value: string): string | number | null {
  const s = String(value).trim();
  if (s === "" || s === "-" || s.toLowerCase() === "n/a") return null;
  if (s.endsWith("%")) {
    const num = parseFloat(s.slice(0, -1).replace(/,/g, ""));
    return Number.isNaN(num) ? s : num;
  }
  const noCommas = s.replace(/,/g, "");
  const num = parseFloat(noCommas);
  if (!Number.isNaN(num) && noCommas !== s) return num;
  if (noCommas === s && !Number.isNaN(num)) return num;
  return s;
}

export function toRawRow(headers: string[], cells: string[]): RawRow {
  const raw: RawRow = {};
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]?.trim() || "col_" + i;
    const v = cells[i];
    raw[h] = v == null || (String(v).trim() === "" || String(v).trim() === "-") ? null : String(v).trim();
  }
  return raw;
}

export function toNormRow(raw: RawRow): NormRow {
  const norm: NormRow = {};
  for (const [k, v] of Object.entries(raw)) {
    norm[k] = v === null ? null : normalizeCell(String(v));
  }
  return norm;
}
