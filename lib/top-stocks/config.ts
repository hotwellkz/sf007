/**
 * App config from Firestore config/app. Server-only.
 */

import { getFirestore } from "@/lib/firebaseAdmin";

export type DataSourceMode = "auto" | "db" | "api";

export interface AppConfig {
  dataSource: DataSourceMode;
  defaultAsOfDate: string | null;
}

const DEFAULT_CONFIG: AppConfig = {
  dataSource: "auto",
  defaultAsOfDate: null,
};

export async function getAppConfig(): Promise<AppConfig> {
  try {
    const db = getFirestore();
    const configRef = db.collection("config").doc("app");
    const snap = await configRef.get();
    if (!snap.exists) return DEFAULT_CONFIG;
    const data = snap.data();
    const dataSource = data?.dataSource;
    const validSource =
      dataSource === "auto" || dataSource === "db" || dataSource === "api"
        ? dataSource
        : DEFAULT_CONFIG.dataSource;
    const defaultAsOfDate =
      typeof data?.defaultAsOfDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.defaultAsOfDate)
        ? data.defaultAsOfDate
        : null;
    return { dataSource: validSource, defaultAsOfDate };
  } catch {
    return DEFAULT_CONFIG;
  }
}
