import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import axios from 'axios';

interface TenantRole {
  tenantId: string;
  role: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
    iconPath: string | null;
  };
}

interface AuthUser {
  id: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  tenantRoles: TenantRole[];
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<string>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const API_BASE = import.meta.env.VITE_API_URL || '/api';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem('token'),
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetchProfile();
    } else {
      setIsLoading(false);
    }
  }, []);

  async function fetchProfile() {
    try {
      const { data } = await axios.get(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser({
        id: data.id,
        name: data.name,
        email: data.email,
        isSuperAdmin: data.isSuperAdmin,
        tenantRoles: data.tenantRoles?.map((tr: any) => ({
          tenantId: tr.tenantId,
          role: tr.role,
          tenant: {
            id: tr.tenant.id,
            name: tr.tenant.name,
            slug: tr.tenant.slug,
            iconPath: tr.tenant.iconPath,
          },
        })) ?? [],
      });
    } catch {
      localStorage.removeItem('token');
      setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function login(email: string, password: string): Promise<string> {
    const { data } = await axios.post(`${API_BASE}/auth/login`, {
      email,
      password,
    });

    localStorage.setItem('token', data.access_token);
    setToken(data.access_token);
    setUser(data.user);

    return data.redirectTo;
  }

  function logout() {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
