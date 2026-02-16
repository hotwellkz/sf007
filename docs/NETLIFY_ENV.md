# Netlify: Firebase env vars

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

## UNAUTHENTICATED (16) in production

- **From API (e.g. /api/top-stocks):** Server uses Firebase Admin. Set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (and optionally `FIREBASE_STORAGE_BUCKET`). If Admin is not configured, the API returns 503 with a hint instead of a raw gRPC message.
- **From frontend:** Ensure all `NEXT_PUBLIC_FIREBASE_*` vars are set in Netlify so they are available at **build** time. Open the site in the browser and check the console for "Firebase config loaded:" to confirm client config is present.
