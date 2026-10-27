import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getCurrentUser, login as loginRequest, logout as logoutRequest, register as registerRequest } from "../api/auth.js";

const AuthContext = createContext(null);
let currentUserRequest;

function loadCurrentUserOnce() {
  if (!currentUserRequest) {
    currentUserRequest = getCurrentUser().finally(() => {
      currentUserRequest = undefined;
    });
  }
  return currentUserRequest;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let active = true;
    loadCurrentUserOnce()
      .then((authenticatedUser) => {
        if (active) setUser(authenticatedUser);
      })
      .catch((error) => {
        if (active && error.status !== 401) {
          setAuthError(error.message);
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const authenticatedUser = await loginRequest(credentials);
    setUser(authenticatedUser);
    setAuthError("");
    return authenticatedUser;
  }, []);

  const register = useCallback(async (details) => {
    const authenticatedUser = await registerRequest(details);
    setUser(authenticatedUser);
    setAuthError("");
    return authenticatedUser;
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
    setAuthError("");
  }, []);

  const value = useMemo(() => ({
    user,
    isLoading,
    authError,
    login,
    register,
    logout
  }), [user, isLoading, authError, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
