/**
 * Re-export from lib/adminAuth. Use requireAdmin(request) in API routes.
 */
export { getIdTokenFromRequest, requireAdmin, type RequireAdminResult } from "@/lib/adminAuth";
