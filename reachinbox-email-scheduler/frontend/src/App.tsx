import { LoaderCircle } from 'lucide-react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { LoginPage } from './features/auth/login-page'
import { useAuth } from './features/auth/use-auth'
import { DashboardPage } from './features/dashboard/dashboard-page'

function App() {
  const { session, loading, error, logout, retry } = useAuth()

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50">
        <LoaderCircle aria-label="Loading session" className="animate-spin text-indigo-600" size={28} />
      </main>
    )
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5">
        <section className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Can’t connect to ReachInbox</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{error}</p>
          <button
            className="mt-6 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
            onClick={retry}
            type="button"
          >
            Retry
          </button>
        </section>
      </main>
    )
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={session ? <Navigate replace to="/" /> : <LoginPage />}
      />
      <Route
        path="*"
        element={
          session ? (
            <DashboardPage onLogout={logout} session={session} />
          ) : (
            <Navigate replace to="/login" />
          )
        }
      />
    </Routes>
  )
}

export default App
