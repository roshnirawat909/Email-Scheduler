import { ArrowRight, LoaderCircle, Mail } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, googleAuthUrl } from '../../lib/api'

type ProviderState = 'loading' | 'enabled' | 'disabled' | 'error'

const signInErrors: Record<string, string> = {
  google_unavailable: 'Google sign-in is not configured on the backend.',
  oauth_state_invalid: 'The sign-in request expired or could not be verified. Try again.',
  google_sign_in_canceled: 'Google sign-in was canceled.',
  google_sign_in_failed: 'Google sign-in failed. Please try again.',
}

export function LoginPage() {
  const [searchParams] = useSearchParams()
  const [providerState, setProviderState] = useState<ProviderState>('loading')

  useEffect(() => {
    let active = true
    api
      .get<{ google: boolean }>('/api/auth/providers')
      .then(({ data }) => {
        if (active) setProviderState(data.google ? 'enabled' : 'disabled')
      })
      .catch(() => {
        if (active) setProviderState('error')
      })

    return () => {
      active = false
    }
  }, [])

  const error = searchParams.get('error')
  const isDisabled = providerState !== 'enabled'

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-12">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <div className="flex size-12 items-center justify-center rounded-xl bg-indigo-600 text-white">
          <Mail aria-hidden="true" size={23} />
        </div>
        <p className="mt-8 text-sm font-semibold uppercase tracking-[0.16em] text-indigo-600">
          ReachInbox
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          Welcome back
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Sign in to manage your email campaigns and delivery schedule.
        </p>

        {error && (
          <p
            className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
            role="alert"
          >
            {signInErrors[error] ?? 'Sign-in could not be completed.'}
          </p>
        )}

        {providerState === 'error' && (
          <p
            className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="alert"
          >
            Could not check sign-in availability. Confirm the API and Redis are running.
          </p>
        )}

        <a
          aria-disabled={isDisabled}
          className={`mt-8 flex min-h-12 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition ${
            isDisabled
              ? 'pointer-events-none bg-slate-100 text-slate-400'
              : 'bg-indigo-600 text-white hover:bg-indigo-500'
          }`}
          href={isDisabled ? undefined : googleAuthUrl}
        >
          {providerState === 'loading' ? (
            <>
              <LoaderCircle aria-hidden="true" className="animate-spin" size={18} />
              Checking Google sign-in…
            </>
          ) : (
            <>
              Continue with Google
              <ArrowRight aria-hidden="true" size={17} />
            </>
          )}
        </a>

        {providerState === 'disabled' && (
          <p className="mt-3 text-center text-xs text-slate-500">
            Add your Google OAuth client values to <code>backend/.env</code> to enable sign-in.
          </p>
        )}

        <p className="mt-8 text-center text-xs leading-5 text-slate-500">
          Your account is authenticated by Google. ReachInbox does not ask for or store your Google password.
        </p>
      </section>
    </main>
  )
}
