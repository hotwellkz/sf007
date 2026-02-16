# Netlify: Firebase Admin env vars

On Netlify there is no local filesystem for `GOOGLE_APPLICATION_CREDENTIALS`. Use **environment variables** only.

## Required (Netlify UI → Site settings → Environment variables)

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
