import React, { createContext, useEffect, useState, useCallback } from 'react';
import { authService } from '../services/authService';
import api from '../services/api';
import { setAuthSession, setAuthUser, getAuthToken, authGeneration } from '../services/authStorage';

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
      const generation=authGeneration();
      setLoading(true);
      setSessionError(false);
      try {
        // Server-first check supports HttpOnly cookie auth after page refresh.
        const response = await authService.getCurrentUser();

        if (!active || generation!==authGeneration()) return;
        if (response.success) {
          setUser(response.data);
          setIsAuthenticated(true);
        } else {
          throw new Error('Invalid session');
        }
      } catch (error) {
        if (!active || generation!==authGeneration()) return;
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

    if (response.success && response.data?.token && response.data?.user) {
      if(response.data.token!==getAuthToken())throw Error('Sign-in changed while the request was running.');
      setUser(response.data.user);
      setIsAuthenticated(true);
    }

    return response;
  };

  const register = async (userData) => {
    const response = await authService.register(userData);

    if (response.success && response.data?.token && response.data?.user) {
      if(response.data.token!==getAuthToken())throw Error('Sign-in changed while the request was running.');
      setUser(response.data.user);
      setIsAuthenticated(true);
    }

    return response;
  };

  const logout = () => {
    const ending = authService.logout();
    setUser(null);
    setIsAuthenticated(false);
    return ending;
  };

  const updateUser = useCallback((userData) => {
    setUser(userData);
    setAuthUser(userData);
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let active = true, running = false;
    const refresh = async () => {
      if (document.visibilityState !== 'visible' || running) return;
      running = true;
      try {const latest = await authService.getCurrentUser(); if (active && latest?.success && latest.data) updateUser(latest.data);} catch {}
      finally {running = false;}
    };
    window.addEventListener('focus',refresh); document.addEventListener('visibilitychange',refresh);
    return () => {active=false;window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  }, [user?.id, updateUser]);

  const establishSession = useCallback(async (data) => {
    if(!data?.token || data.token!==getAuthToken())throw Error('Sign-in changed while the request was running.');
    const generation=authGeneration();
    const current=await authService.getCurrentUser();
    if(generation!==authGeneration())throw Error('Sign-in changed while the request was running.');
    setAuthSession(getAuthToken(),current.data);
    setUser(current.data);setIsAuthenticated(true);
  }, []);

  useEffect(() => {
    const resume=event=>{if(event.persisted){authService.clearLocalSession();setUser(null);setIsAuthenticated(false);setSessionAttempt(value=>value+1);}};
    window.addEventListener('pageshow',resume);
    return()=>window.removeEventListener('pageshow',resume);
  },[]);

  const googleLogin = async (credential) => {
    const response = await authService.googleAuth(credential);

    if (response.success && response.data?.token && response.data?.user) {
      if(response.data.token!==getAuthToken())throw Error('Sign-in changed while the request was running.');
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