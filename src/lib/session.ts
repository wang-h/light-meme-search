import { createHmac, timingSafeEqual } from 'node:crypto'

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function createSessionToken(secret: string): string {
  const exp = Date.now() + 7 * 864e5
  const payload = String(exp)
  return `${payload}.${signPayload(payload, secret)}`
}

export function verifySessionToken(token: string | undefined, secret: string): boolean {
  if (!token) return false
  const i = token.indexOf('.')
  if (i <= 0) return false
  const payload = token.slice(0, i)
  const sig = token.slice(i + 1)
  if (!/^\d+$/.test(payload)) return false
  const good = signPayload(payload, secret)
  if (sig.length !== good.length) return false
  try {
    if (!timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(good, 'utf8'))) return false
  } catch {
    return false
  }
  if (Number(payload) < Date.now()) return false
  return true
}
