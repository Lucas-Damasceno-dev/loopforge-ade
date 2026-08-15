import { create } from 'zustand'
import { getAuthMe, setApiKey, rejectPendingUnauthorized, retryUnauthorizedRequests } from '../shared/lib/api'
import type { AuthMe } from '../shared/lib/types'

// ─── Auth store (RBAC) ──────────────────────────────────────────────────────
// Principal autenticado (GET /auth/me) + key em localStorage 'lf_api_key'
// (já usada pelo api.ts). can(role) espelha Principal.has_role do backend
// (nível máximo ≥ exigido). Sem principal → true (BC: auth off/demo assume
// admin). Principal persistido em 'lf_auth_principal' (login não refaz
// /auth/me a cada reload).

const PRINCIPAL_STORAGE = 'lf_auth_principal'
const ROLE_LEVEL: Record<string, number> = { viewer: 0, runner: 1, admin: 2 }

function loadPrincipal(): AuthMe | null {
  try {
    const raw = localStorage.getItem(PRINCIPAL_STORAGE)
    return raw ? (JSON.parse(raw) as AuthMe) : null
  } catch {
    return null
  }
}

interface AuthState {
  principal: AuthMe | null
  login: (key: string) => Promise<void>
  logout: () => void
  setPrincipal: (p: AuthMe | null) => void
  can: (required: string) => boolean
}

export const useAuthStore = create<AuthState>((set, get) => ({
  principal: loadPrincipal(),

  login: async (key: string) => {
    setApiKey(key)
    const principal = await getAuthMe()
    try {
      localStorage.setItem(PRINCIPAL_STORAGE, JSON.stringify(principal))
    } catch {
      /* storage indisponível (teste/privacy) */
    }
    set({ principal })
    retryUnauthorizedRequests() // reexecuta pendentes com a nova key
  },

  logout: () => {
    try {
      localStorage.removeItem(PRINCIPAL_STORAGE)
      localStorage.removeItem('lf_api_key')
    } catch {
      /* storage indisponível */
    }
    set({ principal: null })
    rejectPendingUnauthorized()
  },

  setPrincipal: (p) => set({ principal: p }),

  can: (required: string) => {
    const p = get().principal
    if (!p) return true // auth off / demo → BC admin
    const maxLevel = Math.max(...p.roles.map((r) => ROLE_LEVEL[r] ?? 0))
    return maxLevel >= (ROLE_LEVEL[required] ?? 0)
  },
}))
