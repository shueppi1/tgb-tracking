import { create } from 'zustand';
import { api, getToken, onUnauthorized, setToken } from '../api/client';

interface AuthState {
  token: string | null;
  login(password: string): Promise<void>;
  logout(): void;
}

export const useAuth = create<AuthState>((set) => ({
  token: getToken(),
  async login(password) {
    const res = await api<{ token: string }>('/auth/login', {
      method: 'POST',
      body: { password },
    });
    setToken(res.token);
    set({ token: res.token });
  },
  logout() {
    setToken(null);
    set({ token: null });
  },
}));

onUnauthorized(() => useAuth.setState({ token: null }));
