"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { auth } from "@/lib/firebase/client";
import Link from "next/link";

type FileInfo = {
  fileId: string;
  partIndex: number;
  originalName: string;
  sizeBytes: number;
  rowsDetected: number;
  status: string;
  error?: string;
};

type SessionInfo = {
  id: string;
  status: string;
  asOfDate: string;
  totals: { files: number; processedRows: number; inserted: number; updated: number; unchanged: number; failedRows: number };
  lastError?: string;
  files?: FileInfo[];
};

const API = (path: string) => `/api/admin${path}`;

/** Parse response body safely; never throws. Returns null for empty, { raw } if not JSON. */
async function safeJson(res: Response): Promise<Record<string, unknown> | { raw: string } | null> {
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

function errorMessage(
  data: Record<string, unknown> | { raw: string } | null,
  res: Response
): string {
  if (data && "raw" in data && typeof (data as { raw: string }).raw === "string")
    return (data as { raw: string }).raw.slice(0, 300);
  if (data && typeof (data as Record<string, unknown>).error === "string")
    return (data as Record<string, unknown>).error as string;
  if (data && typeof (data as Record<string, unknown>).message === "string")
    return (data as Record<string, unknown>).message as string;
  return res.statusText || "Request failed";
}

async function fetchWithAuth(url: string, options: RequestInit = {}, userIdToken?: string | null) {
  const token = userIdToken ?? (await auth?.currentUser?.getIdToken());
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers as Record<string, string>),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    },
  });
}

export default function AdminImportCsvPage() {
  const { user, loading: authLoading } = useAuth();
  const [adminOk, setAdminOk] = useState<boolean | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);

  const log = useCallback((msg: string) => {
    setEvents((prev) => [`${new Date().toISOString().slice(11, 19)} ${msg}`, ...prev].slice(0, 50));
  }, []);

  const checkAdmin = useCallback(async () => {
    setAdminError(null);
    const token = user ? await user.getIdToken() : null;
    const res = await fetchWithAuth(API("/me"), {}, token);
    const data = await safeJson(res);
    setAdminOk(res.ok);
    if (!res.ok) setAdminError(errorMessage(data, res));
    return res.ok;
  }, [user]);

  const loadSessions = useCallback(async () => {
    const token = user ? await user.getIdToken() : null;
    const res = await fetchWithAuth(API("/import-sessions?limit=20"), {}, token);
    const data = await safeJson(res);
    if (!res.ok) return;
    setSessions(Array.isArray((data as Record<string, unknown>)?.sessions) ? (data as Record<string, unknown>).sessions as SessionInfo[] : []);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    checkAdmin();
  }, [user, checkAdmin]);

  useEffect(() => {
    if (adminOk) loadSessions();
  }, [adminOk, loadSessions]);

  if (authLoading || (user && adminOk === null)) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
      </main>
    );
  }
  if (!user) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
        <p className="text-gray-600">Sign in required.</p>
        <Link href="/login" className="text-sky-600 hover:underline">Go to login</Link>
      </main>
    );
  }
  if (adminOk === false) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="text-red-600 font-medium">Access denied</p>
        {adminError && <p className="max-w-md text-sm text-gray-600">{adminError}</p>}
        <Link href="/" className="text-sky-600 hover:underline">Home</Link>
      </main>
    );
  }

  const createSession = async () => {
    log("Creating session...");
    const token = user ? await user.getIdToken() : null;
    const res = await fetchWithAuth(API("/import-sessions"), { method: "POST", body: JSON.stringify({ asOfDate }) }, token);
    const data = await safeJson(res);
    if (!res.ok) {
      log(`Error: ${errorMessage(data, res)}`);
      return;
    }
    const sessionId = (data as Record<string, unknown>)?.sessionId as string | undefined;
    if (sessionId) {
      log(`Session created: ${sessionId}`);
      setSession({ id: sessionId, status: "draft", asOfDate, totals: { files: 0, processedRows: 0, inserted: 0, updated: 0, unchanged: 0, failedRows: 0 }, files: [] });
      loadSessions();
    } else {
      log("Error: Server did not return sessionId");
    }
  };

  const uploadFile = async (file: File, partIndex: number) => {
    if (!session) {
      log("Create a session first");
      return;
    }
    setUploading(true);
    log(`Uploading part ${partIndex}: ${file.name}`);
    const form = new FormData();
    form.set("sessionId", session.id);
    form.set("partIndex", String(partIndex));
    form.set("file", file);
    const token = user ? await user.getIdToken() : null;
    const res = await fetchWithAuth(API("/upload-csv"), { method: "POST", body: form }, token);
    const data = await safeJson(res);
    setUploading(false);
    if (!res.ok) {
      log(`Upload failed: ${errorMessage(data, res)}`);
      return;
    }
    const rowsDetected = (data as Record<string, unknown>)?.rowsDetected;
    log(`Uploaded part ${partIndex}: ${typeof rowsDetected === "number" ? rowsDetected : "—"} rows`);
    await loadSession(session.id);
    loadSessions();
  };

  const loadSession = async (sessionId: string) => {
    const token = user ? await user.getIdToken() : null;
    const res = await fetchWithAuth(API(`/import-sessions/${sessionId}`), {}, token);
    const data = await safeJson(res);
    if (!res.ok) return;
    const sessionData = (data as Record<string, unknown>)?.session;
    if (sessionData && typeof sessionData === "object") setSession(sessionData as SessionInfo);
  };

  const processNow = async () => {
    if (!session) return;
    setProcessing(true);
    log("Processing...");
    const token = user ? await user.getIdToken() : null;
    const res = await fetchWithAuth(API("/process-csv"), { method: "POST", body: JSON.stringify({ sessionId: session.id }) }, token);
    const data = await safeJson(res);
    setProcessing(false);
    if (!res.ok) {
      log(`Process failed: ${errorMessage(data, res)}`);
      return;
    }
    const d = data as Record<string, unknown>;
    log(`Processed: inserted=${d?.inserted ?? "—"} updated=${d?.updated ?? "—"} unchanged=${d?.unchanged ?? "—"} failed=${d?.failed ?? "—"}`);
    loadSession(session.id);
    loadSessions();
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !session) return;
    const nextPart = (session.files?.length ?? 0) + 1;
    Array.from(files).forEach((file, i) => {
      uploadFile(file, nextPart + i);
    });
    e.target.value = "";
  };

  const validateParts = () => {
    if (!session?.files?.length) {
      log("No files to validate");
      return;
    }
    const hashes = new Set(session.files.map((f: FileInfo) => (f as FileInfo & { headersHash?: string }).headersHash));
    const parts = new Set(session.files.map((f: FileInfo) => f.partIndex));
    if (hashes.size > 1) log("Validation: headers mismatch across parts");
    else if (parts.size !== session.files.length) log("Validation: duplicate part index");
    else log("Validation: OK (headers match, part indices unique)");
  };

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold text-gray-900">Admin: CSV Import</h1>
        <p className="mt-1 text-sm text-gray-600">StockForge AI — snapshot import (Danelfin-style export parts)</p>

        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
          <label className="block text-sm font-medium text-gray-700">Snapshot date (asOfDate)</label>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="mt-1 rounded border border-gray-300 px-3 py-2 text-gray-900"
          />
          <button
            type="button"
            onClick={createSession}
            className="ml-3 mt-2 rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            Create import session
          </button>
        </div>

        {session && (
          <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="font-semibold text-gray-900">Session: {session.id}</h2>
            <p className="text-sm text-gray-600">Status: {session.status} · asOfDate: {session.asOfDate}</p>
            <p className="mt-1 text-sm text-gray-600">
              Totals: files={session.totals?.files ?? 0} · inserted={session.totals?.inserted ?? 0} · updated={session.totals?.updated ?? 0} · unchanged={session.totals?.unchanged ?? 0} · failed={session.totals?.failedRows ?? 0}
            </p>
            {session.lastError && <p className="mt-1 text-sm text-red-600">{session.lastError}</p>}

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700">Upload CSV part(s)</label>
              <input
                type="file"
                accept=".csv"
                multiple
                disabled={uploading}
                onChange={handleFileInput}
                className="mt-1 block text-sm text-gray-600 file:mr-2 file:rounded file:border-0 file:bg-sky-50 file:px-3 file:py-1 file:text-sky-700"
              />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={processNow}
                disabled={processing || !session.files?.length}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {processing ? "Processing…" : "Process now"}
              </button>
              <button type="button" onClick={validateParts} className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Validate parts
              </button>
            </div>

            {session.files && session.files.length > 0 && (
              <table className="mt-4 w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-2 font-medium">Part</th>
                    <th className="py-2 font-medium">Name</th>
                    <th className="py-2 font-medium">Size</th>
                    <th className="py-2 font-medium">Rows</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {session.files.map((f: FileInfo) => (
                    <tr key={f.fileId} className="border-b border-gray-100">
                      <td className="py-2">{f.partIndex}</td>
                      <td className="py-2">{f.originalName}</td>
                      <td className="py-2">{f.sizeBytes}</td>
                      <td className="py-2">{f.rowsDetected}</td>
                      <td className="py-2">{f.status} {f.error ? `(${f.error})` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="font-semibold text-gray-900">Recent sessions</h2>
          <button type="button" onClick={loadSessions} className="mt-1 text-sm text-sky-600 hover:underline">
            Refresh
          </button>
          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-2 font-medium">ID</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">asOfDate</th>
                <th className="py-2 font-medium">Files</th>
                <th className="py-2 font-medium">Inserted / Updated</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-gray-100">
                  <td className="py-2 font-mono text-xs">{s.id.slice(0, 8)}</td>
                  <td className="py-2">{s.status}</td>
                  <td className="py-2">{s.asOfDate}</td>
                  <td className="py-2">{s.totals?.files ?? 0}</td>
                  <td className="py-2">{s.totals?.inserted ?? 0} / {s.totals?.updated ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="font-semibold text-gray-900">Events (last 50)</h2>
          <pre className="mt-2 max-h-48 overflow-auto rounded bg-gray-100 p-2 text-xs text-gray-800">
            {events.length ? events.join("\n") : "—"}
          </pre>
        </div>
      </div>
    </main>
  );
}
