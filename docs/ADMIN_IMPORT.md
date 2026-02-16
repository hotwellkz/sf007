# Admin CSV Import

Импорт снапшотов из CSV (формат Danelfin export), по частям, с сохранением в Firestore и Storage.

## Где что лежит

| Путь | Назначение |
|------|------------|
| `/app/admin/import-csv/page.tsx` | UI: дата снапшота, создание сессии, загрузка файлов, Process, Validate, лог событий |
| `/app/api/admin/import-sessions/route.ts` | GET — список сессий, POST — создание сессии |
| `/app/api/admin/import-sessions/[sessionId]/route.ts` | GET — одна сессия + список файлов |
| `/app/api/admin/upload-csv/route.ts` | POST multipart: sessionId, partIndex, file → Storage + документ в files |
| `/app/api/admin/process-csv/route.ts` | POST: sessionId [, fileId] → потоковая обработка CSV, upsert в snapshots |
| `/app/api/admin/me/route.ts` | GET — проверка, что текущий пользователь admin |
| `/lib/admin.ts` | Инициализация Firebase Admin, `isAdminByEmail`, `verifyAdminToken` |
| `/lib/admin/import-types.ts` | Типы: ImportSession, ImportFile, SnapshotItem, DEFAULT_TOTALS |
| `/lib/csv/hash.ts` | `headersHash`, `rowHash` (sha1) |
| `/lib/csv/normalize.ts` | `toRawRow`, `toNormRow`, `getSymbolFromRaw`, `normalizeCell` |
| `/lib/firestore/bulkUpsert.ts` | `upsertSnapshotItem` (с fallback в Storage при размере >1MB) |

## Окружение

- **ADMIN_EMAILS** — список email через запятую, кому доступен `/admin/import-csv`.
- **Firebase Admin** — либо `GOOGLE_APPLICATION_CREDENTIALS`, либо `FIREBASE_PROJECT_ID` + `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` (см. `env.local.example`).

## Схема Firestore

- **import_sessions/{sessionId}** — status, createdAt, createdBy, asOfDate, headersHash, totals, lastError.
- **import_sessions/{sessionId}/files/{fileId}** — partIndex, storagePath, originalName, sizeBytes, rowsDetected, headersHash, fileHash, status.
- **import_sessions/{sessionId}/errors** — логи ошибочных строк (rowNumber, reason, rawPreview).
- **snapshots/{asOfDate}/items/{symbol}** — symbol, raw (или rawStoragePath при большом размере), norm, rowHash, updatedAt, source.

Файлы загружаются в Storage: `imports/{sessionId}/part-{partIndex}-{fileHash}.csv`.

## Как пользоваться

1. В `.env.local` задать `ADMIN_EMAILS` и Firebase Admin (см. выше).
2. Войти под пользователем с email из `ADMIN_EMAILS`.
3. Открыть `/admin/import-csv`.
4. Выбрать дату снапшота (asOfDate), нажать «Create import session».
5. Загрузить один или несколько CSV (части). Заголовки всех частей должны совпадать (проверка по headersHash).
6. При необходимости нажать «Validate parts».
7. Нажать «Process now» — обработаются все файлы со статусом uploaded; данные пишутся в `snapshots/{asOfDate}/items/{symbol}`.
8. Повторный Process для уже processed файлов не выполняется (идемпотентность по fileId). По rowHash не перезаписываются неизменённые строки.

## Идемпотентность

- Один и тот же fileId обрабатывается один раз (status → processed).
- Строки с тем же rowHash не обновляются (unchanged).
- Разные части могут содержать один symbol — побеждает последняя обработанная запись (по partIndex/порядку).
