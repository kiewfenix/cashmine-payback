import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from "react";

import { ApiError, isApiError } from "@/api/client";

const STORAGE_KEY = "cashmine.apiToken";

function readStoredToken(): string | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

function writeStoredToken(token: string | null): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    if (token === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Storage unavailable (private mode, blocked): the token lives in memory for this visit only.
  }
}

interface TokenContextValue {
  token: string | null;
  /** Set when the API rejected the stored token (401) and it was cleared. */
  authError: string | null;
  setToken: (token: string) => void;
  clearToken: () => void;
  /** Runs an API call with the current token. A 401 clears the token, which sends the app back to the token screen. */
  withAuth: <T>(call: (token: string) => Promise<T>) => Promise<T>;
}

const TokenContext = createContext<TokenContextValue | null>(null);

export function TokenProvider({ children }: PropsWithChildren) {
  const [token, setTokenState] = useState<string | null>(readStoredToken);
  const [authError, setAuthError] = useState<string | null>(null);

  const setToken = useCallback((next: string) => {
    const trimmed = next.trim();
    writeStoredToken(trimmed);
    setTokenState(trimmed);
    setAuthError(null);
  }, []);

  const clearToken = useCallback(() => {
    writeStoredToken(null);
    setTokenState(null);
    setAuthError(null);
  }, []);

  const withAuth = useCallback(
    async <T,>(call: (token: string) => Promise<T>): Promise<T> => {
      if (token === null) throw new ApiError(401, "UNAUTHORIZED", "No API token.");
      try {
        return await call(token);
      } catch (error) {
        if (isApiError(error) && error.status === 401) {
          writeStoredToken(null);
          setTokenState(null);
          setAuthError("CashMine rejected this token. Paste a valid one to continue.");
        }
        throw error;
      }
    },
    [token],
  );

  const value = useMemo<TokenContextValue>(
    () => ({ token, authError, setToken, clearToken, withAuth }),
    [token, authError, setToken, clearToken, withAuth],
  );

  return <TokenContext.Provider value={value}>{children}</TokenContext.Provider>;
}

export function useToken(): TokenContextValue {
  const context = useContext(TokenContext);
  if (!context) throw new Error("useToken must be used inside TokenProvider");
  return context;
}
