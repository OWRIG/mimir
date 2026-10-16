import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, unwrap } from '../lib/api.ts'
import { authClient, signInWithProvider } from '../lib/auth-client.ts'

export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)
  const { data: config } = useQuery({
    queryKey: ['public-config'],
    queryFn: () => unwrap(api.public.config.$get()),
  })
  const providers = config?.authProviders ?? []

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email'))
    const password = String(form.get('password'))
    setPending(true)
    setError(undefined)
    const result =
      mode === 'signIn'
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({
            email,
            password,
            name: String(form.get('name') || email),
          })
    setPending(false)
    if (result.error) {
      return setError(
        t('auth.failed', { message: result.error.message ?? result.error.statusText }),
      )
    }
    await navigate({ to: '/' })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">{t('auth.title')}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t('auth.subtitle')}</p>

        {providers.includes('feishu') && (
          <button
            type="button"
            onClick={() => signInWithProvider('feishu')}
            className="mt-6 w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {t('auth.withFeishu')}
          </button>
        )}

        {providers.includes('feishu') && providers.includes('password') && (
          <div className="my-5 flex items-center gap-3 text-xs text-zinc-400">
            <span className="h-px flex-1 bg-zinc-200" />
            {t('auth.or')}
            <span className="h-px flex-1 bg-zinc-200" />
          </div>
        )}

        {providers.includes('password') && (
          <form onSubmit={submit} className="mt-6 space-y-3">
            {mode === 'signUp' && <Field label={t('auth.name')} name="name" autoComplete="name" />}
            <Field
              label={t('auth.email')}
              name="email"
              type="email"
              autoComplete="email"
              required
            />
            <Field
              label={t('auth.password')}
              name="password"
              type="password"
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              minLength={8}
              required
            />
            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              {t(mode === 'signIn' ? 'auth.signIn' : 'auth.signUp')}
            </button>
            <button
              type="button"
              onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
              className="w-full text-center text-sm text-zinc-500 hover:text-zinc-800"
            >
              {t(mode === 'signIn' ? 'auth.switchToSignUp' : 'auth.switchToSignIn')}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}

function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm">
      <span className="text-zinc-700">{label}</span>
      <input
        {...props}
        className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500"
      />
    </label>
  )
}
