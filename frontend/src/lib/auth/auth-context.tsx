"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  UNAUTHORIZED_EVENT,
  api,
  getToken,
  setToken,
} from "@/lib/api/client";
import type { LoginResult, Role, User } from "@/lib/api/types";

type AuthState =
  | { status: "loading"; user: null }
  | { status: "anonymous"; user: null }
  | { status: "authenticated"; user: User };

interface AuthContextValue {
  state: AuthState;
  login(email: string, password: string): Promise<User>;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Where each role lands after signing in. */
export function homeFor(role: Role): string {
  return role === "OFFICE_MANAGER" ? "/manager" : "/portal";
}

/**
 * The signed-in principal. The token lives in localStorage; on load it is
 * checked against GET /auth/me rather than trusted, so a revoked account or
 * an expired token signs out instead of rendering a broken dashboard.
 *
 * The role here only decides which screens to show. What data comes back is
 * decided by the API, which scopes every client request to their own rows.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({
    status: "loading",
    user: null,
  });

  const logout = useCallback(() => {
    setToken(null);
    queryClient.clear();
    setState({ status: "anonymous", user: null });
  }, [queryClient]);

  useEffect(() => {
    // No token is answered the same way as a rejected one: signed out.
    const check = getToken()
      ? api<User>("/auth/me")
      : Promise.reject(new Error("No session"));

    check
      .then((user) => setState({ status: "authenticated", user }))
      .catch(() => logout());
  }, [logout]);

  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, logout);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, logout);
  }, [logout]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api<LoginResult>("/auth/login", {
        method: "POST",
        body: { email, password },
      });

      setToken(result.accessToken);
      queryClient.clear();
      setState({ status: "authenticated", user: result.user });

      return result.user;
    },
    [queryClient],
  );

  const value = useMemo(
    () => ({ state, login, logout }),
    [state, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }

  return context;
}

/** The signed-in user, for components rendered inside <RequireRole>. */
export function useUser(): User {
  const { state } = useAuth();

  if (state.status !== "authenticated") {
    throw new Error("useUser must be used inside <RequireRole>");
  }

  return state.user;
}
