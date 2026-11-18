import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const AuthContext = createContext(null);

// La session vit dans un cookie HttpOnly : l'interface ne voit jamais le jeton,
// elle demande seulement à l'API qui est connecté et avec quelles permissions.
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, permissions: [] });

  const refresh = useCallback(async () => {
    try {
      const me = await api('/admin/auth/me');
      setState({ status: 'in', user: me.user, permissions: me.permissions });
    } catch (err) {
      if (err.code === 'PASSWORD_CHANGE_REQUIRED') return;
      setState({ status: 'out', user: null, permissions: [] });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email, password) => {
    const me = await api('/admin/auth/login', { method: 'POST', body: { email, password } });
    setState({ status: 'in', user: me.user, permissions: me.permissions });
    return me;
  };
  const logout = async () => {
    await api('/admin/auth/logout', { method: 'POST' }).catch(() => {});
    setState({ status: 'out', user: null, permissions: [] });
  };
  const can = (p) => state.permissions.includes(p);

  return <AuthContext.Provider value={{ ...state, login, logout, refresh, can }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
