# Netlify: Firebase env vars

## Подключение проекта к Netlify (CLI)

1. Установи зависимости: `npm install`
2. Привяжи папку к сайту Netlify: `npm run netlify:link`  
   (или `npx netlify link`) — выбери team, затем существующий site или создай новый.
3. Локальный запуск в режиме Netlify (с env из Netlify): `npm run netlify:dev`

Переменные окружения для продакшена задаются в Netlify UI (Site settings → Environment variables). После `netlify link` их можно просматривать через дашборд.

---

On Netlify there is no local filesystem for `GOOGLE_APPLICATION_CREDENTIALS`. Use **environment variables** for the Admin SDK. Client SDK needs `NEXT_PUBLIC_*` at **build time**.

## Client SDK (frontend Auth / Firestore)

Set these so the client bundle gets config at build time. Without them, Firebase client won’t initialize and you may see auth or UNAUTHENTICATED issues.

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Web API key from Firebase Console |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | e.g. `project.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Sender ID from Firebase Console |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | App ID from Firebase Console |

## Admin SDK (server: Firestore / Storage)

Required for API routes that use Firestore or Storage (e.g. `/api/top-stocks`, `/api/admin/*`). Netlify UI → Site settings → Environment variables:

| Variable | Description | Example (do not paste real keys) |
|----------|-------------|----------------------------------|
| `FIREBASE_PROJECT_ID` | Firebase project ID | `stockforgeai-fa6b8` |
| `FIREBASE_CLIENT_EMAIL` | Service account email from JSON | `firebase-adminsdk-xxx@stockforgeai-fa6b8.iam.gserviceaccount.com` |
| `FIREBASE_PRIVATE_KEY` | Private key from JSON; use literal `\n` for newlines (Netlify preserves them) | `"-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"` |
| `FIREBASE_STORAGE_BUCKET` | Storage bucket for CSV upload | `stockforgeai-fa6b8.firebasestorage.app` |
| `ADMIN_EMAILS` | Comma-separated emails allowed for /admin | `you@example.com` |

## Remove on Netlify

- **Do not set** `GOOGLE_APPLICATION_CREDENTIALS` on Netlify. Unset it if it exists (it points to a path that does not exist in the build environment).

## Where to get values

From Firebase Console → Project settings → Service accounts → Generate new private key. Open the JSON:

- `project_id` → `FIREBASE_PROJECT_ID`
- `client_email` → `FIREBASE_CLIENT_EMAIL`
- `private_key` → `FIREBASE_PRIVATE_KEY` (paste as-is; the key contains newlines; Netlify and our code accept `\n`)

## Health checks after deploy

- `GET https://your-site.netlify.app/api/admin/health`  
  Success: `{ "ok": true, "credentialSource": "env-vars", "projectId": "..." }`
- `GET https://your-site.netlify.app/api/admin/storage-health`  
  Success: `{ "ok": true, "bucket": "..." }`

If you see `ok: false` and `source: "none"`, one of the three env vars is missing or invalid (check spelling and that the private key is the full PEM block with `\n`).

## Redeploy and verify

1. **Redeploy:** Push to the branch connected to Netlify, or in Netlify: Deploys → Trigger deploy → Deploy site.
2. **Node:** Netlify uses Node 18 (set in `netlify.toml` and `.nvmrc`). Ensure no override with an older version.
3. **Verify health:** Open in browser:
   - `https://YOUR-SITE.netlify.app/api/admin/health`
   - Expect JSON: `{ "ok": true, "hasProjectId": true, "hasClientEmail": true, "hasPrivateKey": true, "nodeVersion": "v18.x.x", "timestamp": "...", "credentialSource": "env-vars", "projectId": "..." }`.
   - If `ok: false`, check `hasProjectId`, `hasClientEmail`, `hasPrivateKey` to see which env var is missing; fix in Site settings → Environment variables → Redeploy.
4. **Verify top-stocks:** Open `https://YOUR-SITE.netlify.app/api/top-stocks?source=db` (or with `asOfDate=YYYY-MM-DD`). Expect JSON with `ok: true` and `items` array, or `ok: false` with `error` and `hint` (no credentials).

## UNAUTHENTICATED (16) in production

- **From API (e.g. /api/top-stocks):** Server uses Firebase Admin. Set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (and optionally `FIREBASE_STORAGE_BUCKET`). If Admin is not configured, the API returns 503 with a hint instead of a raw gRPC message.
- **From frontend:** Ensure all `NEXT_PUBLIC_FIREBASE_*` vars are set in Netlify so they are available at **build** time. Open the site in the browser and check the console for "Firebase config loaded:" to confirm client config is present.
