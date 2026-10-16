import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({ basePath: '/api/auth' })

/** genericOAuth 注册的 provider 走标准 social 登录端点，回调为 /api/auth/callback/<providerId> */
export function signInWithProvider(provider: 'feishu') {
  return authClient.signIn.social({ provider, callbackURL: `${location.origin}/` })
}
