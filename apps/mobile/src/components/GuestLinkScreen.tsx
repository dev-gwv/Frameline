import { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { decodeGuestLink, type GuestLinkKind, type GuestLinkPayload, type GuestSession } from '@frameline/shared'
import { useApi } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { actions, local } from '@/lib/local'
import { useTheme } from '@/theme'
import { EmptyState, Txt } from './primitives'

/**
 * Personal links /s/<code> and /v/<code>. The API resolves signed codes (and hands back a guest session for VIP
 * links with PIN / "see all"); if that fails, an unsigned token in the gallery README format is decoded locally
 * with decodeGuestLink (its VIP flags are ignored, as on the server).
 */
export function GuestLinkScreen({ kind, code }: { kind: GuestLinkKind; code: string }) {
  const { c } = useTheme()
  const api = useApi()
  const qc = useQueryClient()
  const [error, setError] = useState<{ title: string; detail: string }>()

  useEffect(() => {
    if (!code) return
    let alive = true
    ;(async () => {
      let payload: GuestLinkPayload | null = null
      let session: GuestSession | undefined
      let resolveError: unknown
      try {
        const r = await api.resolveGuestLink(code)
        payload = r.payload
        session = r.session
      } catch (e) {
        resolveError = e
        const decoded = decodeGuestLink(code)
        payload = decoded ? { ...decoded, vip: undefined } : null
      }
      if (!alive) return
      if (!payload) {
        setError(resolveError ? friendlyError(resolveError) : { title: 'This link doesn’t open a gallery', detail: 'Ask the photographer for a new one.' })
        return
      }
      try {
        const event = await qc.fetchQuery({ queryKey: ['public-event', payload.e.toUpperCase()], queryFn: () => api.getPublicEvent(payload.e) })
        if (!alive) return
        if (!local.get().mode) actions.setMode('guest')
        actions.join(event, payload.n)
        if (session) actions.unlock(event.id, session.seeAll)
        const id = event.shortId
        router.replace({ pathname: '/event/[id]', params: { id } })
        if (payload.me && event.settings.faceSearch) {
          if (payload.p) {
            actions.saveSelfie(event.id, { personId: payload.p })
            router.push({ pathname: '/event/[id]/photos', params: { id, scope: 'mine' } })
          } else {
            router.push({ pathname: '/event/[id]/selfie', params: { id } })
          }
        } else if (payload.album) {
          router.push({ pathname: '/event/[id]/photos', params: { id, scope: 'album', albumId: payload.album } })
        }
      } catch (e) {
        if (alive) setError(friendlyError(e))
      }
    })()
    return () => { alive = false }
  }, [api, qc, code, kind])

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: c.paper, justifyContent: 'center' }}>
        <EmptyState icon="link" title={error.title} body={error.detail}
          action="Enter a code instead" onAction={() => router.replace('/join')} secondary="Go to my events" onSecondary={() => router.replace('/events')} />
      </View>
    )
  }
  return (
    <View style={{ flex: 1, backgroundColor: c.paper, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <ActivityIndicator color={c.accent} />
      <Txt v="small">Opening your link…</Txt>
    </View>
  )
}
