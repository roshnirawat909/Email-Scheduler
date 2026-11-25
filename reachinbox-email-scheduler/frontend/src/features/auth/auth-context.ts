import { createContext } from 'react'

export interface AuthSession {
  user: {
    id: string
    email: string
    name: string
    avatarUrl: string | null
  }
  workspace: {
    id: string
    name: string
    slug: string
  }
  role: 'ADMIN' | 'MEMBER'
}

export interface AuthContextValue {
  session: AuthSession | null
  loading: boolean
  error: string | null
  logout: () => Promise<void>
  retry: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
