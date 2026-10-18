export interface CredentialLink { kind: 'share' | 'team'; credential: string }

/** Fragment credentials never enter HTTP requests, query strings or persistent browser storage. */
export function parseCredentialFragment(hash: string): CredentialLink | null {
  if (hash.length > 4096) return null
  const values = new URLSearchParams(hash.replace(/^#/, ''))
  for (const kind of ['share', 'team'] as const) {
    const credential = values.get(kind)
    if (credential && credential.startsWith(`seal-${kind}-v1:`) && !/[\s\u0000-\u001f]/u.test(credential)) return { kind, credential }
  }
  return null
}

export function credentialLink(credential: string, origin = /^https?:$/.test(window.location.protocol) ? window.location.origin : 'https://seal.xingmasoft.com'): string {
  const kind = credential.startsWith('seal-share-v1:') ? 'share' : credential.startsWith('seal-team-v1:') ? 'team' : ''
  if (!kind || !/^https?:\/\//i.test(origin)) return ''
  return `${origin}/office/#${kind}=${encodeURIComponent(credential)}`
}

export function readCredential(value: string, kind: CredentialLink['kind']): string {
  const text = value.trim()
  if (text.startsWith(`seal-${kind}-v1:`)) return text
  try { const link = new URL(text), entry = parseCredentialFragment(link.hash); if (/^https?:$/.test(link.protocol) && entry?.kind === kind) return entry.credential } catch { /* Plain invalid input is rejected by the service with its normal error feedback. */ }
  return text
}
