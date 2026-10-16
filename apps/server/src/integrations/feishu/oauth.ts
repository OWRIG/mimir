import type { GenericOAuthConfig } from 'better-auth/plugins/generic-oauth'

/**
 * 飞书 / Lark 网页应用 OAuth 登录（genericOAuth 配置）。
 *
 * - 授权：accounts.<domain>/open-apis/authen/v1/authorize（client_id + response_type=code，支持 PKCE）
 * - 换 token：open.<domain>/open-apis/authen/v2/oauth/token，POST JSON，响应不包 data 但带 code
 * - 用户信息：open.<domain>/open-apis/authen/v1/user_info，响应包在 { code, msg, data } 里
 *
 * token 与用户信息的响应形态都不是标准 OAuth/OIDC，所以自定义 getToken / getUserInfo。
 */
export type FeishuOAuthOptions = {
  appId: string
  appSecret: string
  domain: 'feishu' | 'lark'
}

const HOSTS = {
  feishu: { accounts: 'https://accounts.feishu.cn', open: 'https://open.feishu.cn' },
  lark: { accounts: 'https://accounts.larksuite.com', open: 'https://open.larksuite.com' },
} as const

type TokenResponse = {
  code: number
  error?: string
  error_description?: string
  access_token?: string
  expires_in?: number
  refresh_token?: string
  refresh_token_expires_in?: number
  scope?: string
  token_type?: string
}

type UserInfoResponse = {
  code: number
  msg?: string
  data?: {
    name?: string
    en_name?: string
    avatar_url?: string
    open_id?: string
    union_id?: string
    user_id?: string
    email?: string
    enterprise_email?: string
    tenant_key?: string
  }
}

export function feishuOAuth(options: FeishuOAuthOptions): GenericOAuthConfig {
  const hosts = HOSTS[options.domain]
  return {
    providerId: 'feishu',
    authorizationUrl: `${hosts.accounts}/open-apis/authen/v1/authorize`,
    tokenUrl: `${hosts.open}/open-apis/authen/v2/oauth/token`,
    userInfoUrl: `${hosts.open}/open-apis/authen/v1/user_info`,
    clientId: options.appId,
    clientSecret: options.appSecret,
    // 基础登录不需要额外权限；通讯录等能力由应用身份（tenant_access_token）调用
    scopes: [],
    pkce: true,
    // union_id 在同一开发者的多个应用间稳定，换应用不会导致账号断开
    accountSubject: ({ profile }) => String(profile.union_id ?? profile.sub ?? ''),
    async getToken({ code, redirectURI, codeVerifier }) {
      const res = await fetch(`${hosts.open}/open-apis/authen/v2/oauth/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: options.appId,
          client_secret: options.appSecret,
          code,
          redirect_uri: redirectURI,
          ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
        }),
      })
      const body = (await res.json()) as TokenResponse
      if (body.code !== 0 || !body.access_token) {
        throw new Error(
          `Feishu token exchange failed: ${body.code} ${body.error_description ?? body.error ?? ''}`,
        )
      }
      const now = Date.now()
      return {
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
        accessTokenExpiresAt: body.expires_in ? new Date(now + body.expires_in * 1000) : undefined,
        refreshTokenExpiresAt: body.refresh_token_expires_in
          ? new Date(now + body.refresh_token_expires_in * 1000)
          : undefined,
        scopes: body.scope ? body.scope.split(' ') : [],
        tokenType: body.token_type,
      }
    },
    async getUserInfo(tokens) {
      const res = await fetch(`${hosts.open}/open-apis/authen/v1/user_info`, {
        headers: { authorization: `Bearer ${tokens.accessToken}` },
      })
      const body = (await res.json()) as UserInfoResponse
      const user = body.data
      if (body.code !== 0 || !user?.union_id) return null
      // better-auth 要求 email；飞书账号未必有邮箱，此时用不可投递的占位地址（.invalid 保留域名）
      const email = user.enterprise_email || user.email || `${user.union_id}@users.feishu.invalid`
      return {
        sub: user.union_id,
        name: user.name || user.en_name || email,
        email,
        emailVerified: Boolean(user.enterprise_email || user.email),
        image: user.avatar_url,
        open_id: user.open_id,
        union_id: user.union_id,
        tenant_key: user.tenant_key,
      }
    },
  }
}
