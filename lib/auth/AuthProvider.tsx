"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  type User,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendEmailVerification,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";

const DEFAULT_AFTER_LOGIN = "/portfolios";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  isVerified: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<string | null>;
  signUpWithEmail: (email: string, password: string) => Promise<string | null>;
  sendPasswordReset: (email: string) => Promise<string | null>;
  resendVerificationEmail: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    setPersistence(auth, browserLocalPersistence).catch(() => {});
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u ?? null);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const isVerified = !!user?.emailVerified;

  const signInWithGoogle = useCallback(async () => {
    if (!auth) {
      toast.show("Auth is not configured.");
      return;
    }
    try {
      // COOP warning in console ("policy would block the window.closed call") is from Firebase
      // popup auth; it does not break sign-in. To avoid it, use redirect flow (signInWithRedirect) instead.
      const res = await signInWithPopup(auth, new GoogleAuthProvider());
      await res.user.reload();
      const updated = auth.currentUser;
      if (updated && !updated.emailVerified) {
        toast.show("Please verify your email to access private sections.");
        router.push("/verify-email");
      } else {
        router.push(DEFAULT_AFTER_LOGIN);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Google sign-in failed";
      if (msg.includes("auth/popup-closed-by-user")) {
        toast.show("Sign-in was cancelled.");
      } else if (msg.includes("auth/network-request-failed")) {
        toast.show("Network error. Check your connection.");
      } else {
        toast.show(msg.includes("auth/") ? "Could not sign in with Google." : msg);
      }
    }
  }, [toast, router]);

  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      if (!auth) {
        const m = "Auth is not configured.";
        toast.show(m);
        return m;
      }
      try {
        const res = await signInWithEmailAndPassword(auth, email, password);
        await res.user.reload();
        const updated = auth.currentUser;
        if (updated && !updated.emailVerified) {
          toast.show("Please verify your email to access private sections.");
          router.push("/verify-email");
          return null;
        }
        router.push(DEFAULT_AFTER_LOGIN);
        return null;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        let userMsg = "Invalid email or password.";
        if (msg.includes("auth/user-not-found") || msg.includes("auth/invalid-credential")) {
          userMsg = "Invalid email or password.";
        } else if (msg.includes("auth/too-many-requests")) {
          userMsg = "Too many attempts. Try again later.";
        } else if (msg.includes("auth/invalid-email")) {
          userMsg = "Invalid email address.";
        } else if (msg.includes("auth/network-request-failed")) {
          userMsg = "Network error. Try again.";
        }
        toast.show(userMsg);
        return userMsg;
      }
    },
    [toast, router]
  );

  const sendPasswordReset = useCallback(
    async (email: string): Promise<string | null> => {
      if (!auth) {
        const m = "Auth is not configured.";
        toast.show(m);
        return m;
      }
      try {
        await sendPasswordResetEmail(auth, email);
        toast.show("If an account exists, we sent a reset link to that email.");
        return null;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        let userMsg = "Could not send reset email.";
        if (msg.includes("auth/invalid-email")) userMsg = "Invalid email address.";
        else if (msg.includes("auth/user-not-found")) userMsg = "If an account exists, we sent a reset link to that email.";
        toast.show(userMsg);
        return userMsg;
      }
    },
    [toast]
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      if (typeof window !== "undefined") {
        console.log("[register] submit", { email: email ? `${email.slice(0, 3)}***` : "" });
      }
      if (!auth) {
        const m = "Auth is not configured.";
        toast.show(m);
        return m;
      }
      try {
        if (typeof window !== "undefined") console.log("[register] creating user...");
        const res = await createUserWithEmailAndPassword(auth, email, password);
        if (typeof window !== "undefined") console.log("[register] created uid", res.user.uid);
        if (typeof window !== "undefined") console.log("[register] sending verification...");
        await sendEmailVerification(res.user);
        if (typeof window !== "undefined") console.log("[register] verification sent");
        toast.show("We sent a verification email. Check your inbox (and spam).");
        router.push("/verify-email");
        return null;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (typeof window !== "undefined") console.error("[register] error", e);
        let userMsg = "Registration failed. Check your details.";
        if (msg.includes("auth/email-already-in-use")) {
          userMsg = "This email is already registered. Sign in or reset your password.";
        } else if (msg.includes("auth/weak-password")) {
          userMsg = "Password is too short. Use at least 6 characters.";
        } else if (msg.includes("auth/invalid-email")) {
          userMsg = "Invalid email address.";
        } else if (msg.includes("auth/operation-not-allowed") || msg.includes("auth/configuration-not-found")) {
          userMsg = "Email sign-up is disabled.";
        } else if (msg.includes("auth/network-request-failed") || msg.includes("auth/network-error")) {
          userMsg = "Network error. Try again.";
        }
        toast.show(userMsg);
        return userMsg;
      }
    },
    [toast, router]
  );

  const resendVerificationEmail = useCallback(async () => {
    if (!auth?.currentUser) {
      toast.show("Сначала войдите в аккаунт.");
      return;
    }
    try {
      await sendEmailVerification(auth.currentUser);
      toast.show("Письмо отправлено повторно. Проверьте почту.");
    } catch (e: unknown) {
      toast.show("Не удалось отправить письмо. Попробуйте позже.");
    }
  }, [toast]);

  const signOut = useCallback(async () => {
    if (!auth) return;
    try {
      await fbSignOut(auth);
      toast.show("Вы вышли из аккаунта.");
      router.push("/");
    } catch {
      toast.show("Ошибка выхода.");
    }
  }, [toast, router]);

  const value: AuthContextValue = {
    user,
    loading,
    isVerified,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    resendVerificationEmail,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return {
      user: null,
      loading: false,
      isVerified: false,
      signInWithGoogle: async () => {},
      signInWithEmail: async () => null,
      signUpWithEmail: async () => null,
      sendPasswordReset: async () => null,
      resendVerificationEmail: async () => {},
      signOut: async () => {},
    };
  }
  return ctx;
}
