import { create } from "zustand";

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthState {
  data: User | null;
  isLoading: boolean;
  error: Error | null;
}

const useAuthStore = create<AuthState>(() => ({
  data: null,
  isLoading: false,
  error: null,
}));

export function useAuthenticatedUser() {
  return useAuthStore();
}
