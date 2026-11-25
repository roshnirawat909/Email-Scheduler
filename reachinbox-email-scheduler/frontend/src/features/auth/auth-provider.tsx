import axios from 'axios'
import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { api } from '../../lib/api'
import { AuthContext, type AuthSession } from './auth-context'

async function fetchSession(): Promise<AuthSession | null> {
  try {
    const response = await api.get<AuthSession | null>('/api/auth/me')
    return response.data
  } catch (requestError) {
    if (
      axios.isAxiosError(requestError) &&
      requestError.response?.status === 401
    ) {
      return null
    }

    throw requestError
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    void fetchSession()
      .then((currentSession) => {
        if (active) setSession(currentSession)
      })
      .catch(() => {
        if (active) {
          setError('Could not reach the API. Check that the backend and Redis are running.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout')
    setSession(null)
    setError(null)
  }, [])

  const retry = useCallback(() => {
    setLoading(true)
    setError(null)
    void fetchSession()
      .then(setSession)
      .catch(() => {
        setError('Could not reach the API. Check that the backend and Redis are running.')
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <AuthContext.Provider
      value={{ session, loading, error, logout, retry }}
    >
      {children}
    </AuthContext.Provider>
  )
}
