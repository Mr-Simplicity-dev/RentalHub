import React, { createContext, useEffect, useState, useCallback } from 'react';
import { authService } from '../services/authService';
import api from '../services/api';
import { setAuthSession, setAuthUser } from '../services/authStorage';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionError, setSessionError] = useState(false);
  const [sessionAttempt, setSessionAttempt] = useState(0);

  useEffect(() => {
    const expired = () => { setUser(null); setIsAuthenticated(false); };
    window.addEventListener('rentalhub:session-expired', expired);
    return () => window.removeEventListener('rentalhub:session-expired', expired);
  }, []);

  useEffect(() => {
    let active = true;
    const initAuth = async () => {
      setLoading(true);
      setSessionError(false);
      try {
        // Server-first check supports HttpOnly cookie auth after page refresh.
        const response = await authService.getCurrentUser();

        if (!active) return;
        if (response.success) {
          setUser(response.data);
          setIsAuthenticated(true);
        } else {
          throw new Error('Invalid session');
        }
      } catch (error) {
        if (!active) return;
        if (error.response?.status === 401) {
          authService.clearLocalSession();
          setUser(null);
          setIsAuthenticated(false);
        } else {
          setSessionError(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    initAuth();
    return () => { active = false; };
  }, [sessionAttempt]);

  const login = async (email, password, turnstileToken) => {
    const response = await authService.login(
      email,
      password,
      turnstileToken
    );

    if (response.success) {
      setUser(response.data.user);
      setIsAuthenticated(true);
    }

    return response;
  };

  const register = async (userData) => {
    const response = await authService.register(userData);

    if (response.success) {
      setUser(response.data.user);
      setIsAuthenticated(true);
    }

    return response;
  };

  const logout = () => {
    authService.logout();
    setUser(null);
    setIsAuthenticated(false);
  };

  const updateUser = useCallback((userData) => {
    setUser(userData);
    setAuthUser(userData);
  }, []);

  const establishSession = async (data) => {
    setAuthSession(data.token,data.user);
    if(data.token)api.defaults.headers.common.Authorization='Bearer '+data.token;
    const current=await authService.getCurrentUser();
    setUser(current.data);setIsAuthenticated(true);
  };

  const googleLogin = async (credential) => {
    const response = await authService.googleAuth(credential);

    if (response.success && response.data) {
      setUser(response.data.user);
      setIsAuthenticated(true);
    }

    return response;
  };

  const value = {
    establishSession,
    user,
    isAuthenticated,
    loading,
    login,
    googleLogin,
    register,
    logout,
    updateUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {sessionError ? <main className="mx-auto my-10 max-w-xl p-6 text-center"><p role="alert">We could not check your sign-in. Please try again.</p><button type="button" className="mt-4 min-h-11 rounded-xl bg-blue-900 px-5 py-3 text-white" onClick={() => setSessionAttempt(n => n + 1)}>Try again</button></main> : children}
    </AuthContext.Provider>
  );
};