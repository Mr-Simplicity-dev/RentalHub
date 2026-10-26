import React, { createContext, useEffect, useState, useCallback } from 'react';
import { authService } from '../services/authService';
import api from '../services/api';
import { setAuthSession, setAuthUser } from '../services/authStorage';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      try {
        // Server-first check supports HttpOnly cookie auth after page refresh.
        const response = await authService.getCurrentUser();

        if (response.success) {
          setUser(response.data);
          setIsAuthenticated(true);
        } else {
          throw new Error('Invalid session');
        }
      } catch (error) {
        authService.clearLocalSession();
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

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
  const value = {
    establishSession,
    user,
    isAuthenticated,
    loading,
    login,
    register,
    logout,
    updateUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};