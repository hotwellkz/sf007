"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { authGateStyles } from "@/lib/ui/authGate.styles";
import { ChartMock } from "./ChartMock";

type AuthGateModalProps = {
  open: boolean;
  onClose: () => void;
};

export function AuthGateModal({ open, onClose }: AuthGateModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { signUpWithEmail, signInWithGoogle } = useAuth();

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      const t = requestAnimationFrame(() => setMounted(true));
      return () => cancelAnimationFrame(t);
    }
    setMounted(false);
  }, [open]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      try {
        await signUpWithEmail(email, password);
        onClose();
      } catch {
        // AuthProvider shows toast
      } finally {
        setBusy(false);
      }
    },
    [email, password, signUpWithEmail, onClose]
  );

  const handleGoogle = useCallback(async () => {
    setBusy(true);
    try {
      await signInWithGoogle();
      onClose();
    } catch {
      // AuthProvider shows toast
    } finally {
      setBusy(false);
    }
  }, [signInWithGoogle, onClose]);

  if (!open) return null;

  const modalContent = (
    <>
      <div
        className={`${authGateStyles.overlay} transition-opacity duration-200 ${mounted ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-gate-title"
        className={`${authGateStyles.modal} transition-transform duration-200 ${mounted ? "scale-100" : "scale-[0.98]"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className={authGateStyles.closeBtn}
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className={authGateStyles.grid}>
          {/* Left: blue promo panel */}
          <div className={authGateStyles.left}>
            <h2 className={authGateStyles.leftTitle}>
              StockForge Best Stocks* vs. S&P 500
            </h2>
            <p className={authGateStyles.leftSub}>
              The AI-powered strategy generated a return of +XXX% vs. +YYY% of the benchmark in the same period.
            </p>
            <div className={authGateStyles.chartWrap}>
              <div className={authGateStyles.chartInner}>
                <ChartMock />
              </div>
            </div>
            <div className={authGateStyles.legend}>
              <span className={authGateStyles.legendDotA} aria-hidden />
              <span>StockForge Best Stocks</span>
              <span className={authGateStyles.legendDotB} aria-hidden />
              <span>S&P 500</span>
            </div>
            <p className={authGateStyles.footnote}>
              *Strategy description text in small font, similar density to the reference. Keep under 5 lines, allow scrolling if needed. Backtested results. Not financial advice. Your capital is at risk.
            </p>
          </div>

          {/* Right: form panel */}
          <div className={authGateStyles.right}>
            <h1 id="auth-gate-title" className={authGateStyles.rightHeader}>
              Get the Top 10 Stocks to Buy for FREE
            </h1>
            <p className={authGateStyles.rightSubheader}>
              Receive every day our Top 10 stocks ranking, powered by Artificial Intelligence
            </p>

            <form onSubmit={handleSubmit} className={authGateStyles.form}>
              <label htmlFor="auth-gate-email" className={authGateStyles.fieldLabel}>
                Email
              </label>
              <input
                id="auth-gate-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className={authGateStyles.input}
              />

              <label htmlFor="auth-gate-password" className={authGateStyles.fieldLabel}>
                Password
              </label>
              <div className={authGateStyles.pwWrap}>
                <input
                  id="auth-gate-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className={authGateStyles.input}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className={authGateStyles.pwToggle}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className={authGateStyles.hint}>
                Minimum 6 characters, at least 1 number and 1 letter.
              </p>

              <button
                type="submit"
                disabled={busy}
                className={authGateStyles.primaryBtn}
              >
                {busy ? "..." : "Create my FREE Account"}
              </button>
            </form>

            <div className={authGateStyles.dividerRow}>
              <span className={authGateStyles.dividerLine} aria-hidden />
              <span className={authGateStyles.dividerText}>or</span>
              <span className={authGateStyles.dividerLine} aria-hidden />
            </div>

            <button
              type="button"
              onClick={handleGoogle}
              disabled={busy}
              className={authGateStyles.googleBtn}
            >
              <svg className={authGateStyles.googleIcon} viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </button>

            <p className={authGateStyles.footer}>
              By using StockForge AI you agree to our{" "}
              <Link href="/terms" className={authGateStyles.footerLink}>
                Terms of Use
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className={authGateStyles.footerLink}>
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(modalContent, document.body);
}
