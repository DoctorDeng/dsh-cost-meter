/** dsh-chatgpt-sub stores its bound OAuth access token in this DSH credential slot.
 * Reuse the bounded quota reader; never read shared Codex login files or refresh tokens. */
import { createPiAiCodexQuota } from './pi-ai-codex-quota.js'

export function createChatgptSubQuota(ctx, options = {}) {
  return createPiAiCodexQuota({ get: () => ({
    async readRecord() {
      const resolved = await ctx.get?.('credentials')?.resolve?.('OPENAI_CODEX_API_KEY')
      const access = resolved?.value
      if (typeof access !== 'string' || !access || access.length > 32768 || /[\r\n]/.test(access)) return null
      let claims
      try {
        const parts = access.split('.')
        if (parts.length !== 3) return null
        claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
      } catch { return null }
      // Account selection follows the same access token as the plugin's model route.
      const accountId = claims?.['https://api.openai.com/auth']?.chatgpt_account_id
      if (typeof accountId !== 'string' || !accountId || accountId.length > 512 || /[\r\n]/.test(accountId)) return null
      const expires = typeof claims.exp === 'number' && Number.isFinite(claims.exp) ? claims.exp * 1000 : undefined
      return { kind: 'grant', payload: { type: 'oauth', access, accountId, expires } }
    },
  }) }, { ...options, label: 'dsh-chatgpt-sub' })
}
