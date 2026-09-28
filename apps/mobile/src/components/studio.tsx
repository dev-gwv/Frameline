import { useState, type ReactNode } from 'react'
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BASE_RENEWAL, DEMO_NOW, RENEWAL_CREDIT_DISCOUNT, fmt, type ID, type EventStats, type NeedsYouItem, type PhotoEvent } from '@frameline/shared'
import { useApi } from '@/lib/api'
import { friendlyError } from '@/lib/errors'
import { useLocal } from '@/lib/local'
import { useAction, useStudio, useWallet } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { actWithUndo, useHiddenIds } from '@/lib/undo'
import { radius, shadow, useTheme } from '@/theme'
import { Icon, type IconName } from './Icon'
import { Sheet } from './overlays'
import { ToneView } from './photo'
import { Avatar, Button, Card, CountBadge, EventStatusChip, LogoMark, RadioCards, Txt } from './primitives'

/* ---------------- Top bar (photographer tabs) ---------------- */

/** Compact white top bar: logo + name, avatar (opens More). */
export function StudioTopBar({ right }: { right?: ReactNode }) {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const session = useLocal((s) => s.studioSession)
  const { data: studio } = useStudio()
  return (
    <View style={[styles.topBar, { paddingTop: insets.top + 6, backgroundColor: c.surface, borderBottomColor: c.line }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
        <LogoMark size={24} />
        <Txt weight="heavy" style={{ fontSize: 16.5 }}>Frameline</Txt>
      </View>
      {right}
      <Pressable accessibilityRole="button" accessibilityLabel="Your account and more" onPress={() => router.navigate('/more')} hitSlop={8} style={{ minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }}>
        <Avatar name={session?.name ?? studio?.name ?? 'Studio'} size={32} />
      </Pressable>
    </View>
  )
}

/* ---------------- Event facts & cards ---------------- */

/** One facts line: dates · city · N of M photos · PIN (· face finding progress from getEventStats while it runs). */
export function eventFacts(e: PhotoEvent, stats?: EventStats | null, withPin = true) {
  const photos = stats?.photos ?? e.photoCount
  return [
    fmt.dateRange(e.date, e.endDate),
    e.city,
    e.photoLimit ? `${fmt.count(photos)} of ${fmt.count(e.photoLimit)} photos` : `${fmt.count(photos)} photos`,
    withPin && e.settings.access === 'link-pin' ? `PIN ${e.settings.pin}` : null,
    stats && e.settings.faceSearch && stats.faces.pending > 0 ? `finding faces in ${fmt.count(stats.faces.pending)} new photos` : null,
  ].filter(Boolean).join(' · ')
}

/** Event card: cover with status (dot + word), name, dates · city, photo count. */
export function StudioEventCard({ event, onPress }: { event: PhotoEvent; onPress: () => void }) {
  const { c } = useTheme()
  const empty = event.photoCount === 0
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${event.name}, ${event.status}, ${event.photoCount} photos`} onPress={onPress}
      style={({ pressed }) => [styles.evCard, { backgroundColor: c.surface, borderColor: c.line, opacity: pressed ? 0.9 : 1 }, shadow.card]}>
      {empty
        ? <View style={[styles.evCover, { backgroundColor: c.sunk, alignItems: 'center', justifyContent: 'center' }]}><Icon name="image" size={24} color={c.ink3} /></View>
        : <ToneView tone={event.coverTones[0]} style={styles.evCover} />}
      <View style={{ position: 'absolute', top: 10, left: 10 }}><View style={{ backgroundColor: c.surface, borderRadius: 999 }}><EventStatusChip status={event.status} expiresAt={event.expiresAt} /></View></View>
      <View style={{ padding: 12, paddingHorizontal: 14, gap: 2 }}>
        <Txt weight="heavy" numberOfLines={1} style={{ fontSize: 15 }}>{event.name}</Txt>
        <Txt v="small" numberOfLines={1}>{fmt.dateRange(event.date, event.endDate)} · {event.city}</Txt>
        <Txt v="small" color={c.ink3} style={{ fontVariant: ['tabular-nums'] }}>{empty ? 'No photos yet' : `${fmt.count(event.photoCount)} photos`}</Txt>
      </View>
    </Pressable>
  )
}

/* ---------------- Underline tabs ---------------- */

export function UnderlineTabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string; badge?: number }[]; value: T; onChange: (v: T) => void }) {
  const { c } = useTheme()
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 20 }}>
      {tabs.map((t) => {
        const on = t.value === value
        return (
          <Pressable key={t.value} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${t.label}${t.badge ? `, ${t.badge} need you` : ''}`} onPress={() => onChange(t.value)}
            style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 2.5, borderBottomColor: on ? c.accent : 'transparent' }}>
            <Txt weight={on ? 'heavy' : 'bold'} color={on ? c.ink : c.ink2} style={{ fontSize: 14.5 }}>{t.label}</Txt>
            {t.badge ? <CountBadge n={t.badge} /> : null}
          </Pressable>
        )
      })}
    </View>
  )
}

/* ---------------- Ask-first sheet (rule 8: sending, paying, refunding, new PIN, delete forever, turning off) ---------------- */

export function ConfirmSheet({ open, onClose, title, body, confirmLabel, onConfirm, danger, children }: {
  open: boolean; onClose: () => void; title: string; body?: string; confirmLabel: string; onConfirm: () => Promise<unknown> | void; danger?: boolean; children?: ReactNode
}) {
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try { await onConfirm(); onClose() } catch (e) { const f = friendlyError(e); toast.error(f.title, f.detail) } finally { setBusy(false) }
  }
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <View style={{ paddingHorizontal: 16, gap: 12, paddingBottom: 4 }}>
        {body ? <Txt v="small">{body}</Txt> : null}
        {children}
        <Button label={confirmLabel} variant={danger ? 'danger' : 'primary'} size="lg" loading={busy} onPress={run} />
        <Button label="Cancel" variant="ghost" onPress={onClose} />
      </View>
    </Sheet>
  )
}

/* ---------------- Renew ---------------- */

type RenewWay = 'wallet' | 'card' | 'client'

/** Renew an event for a year: from the wallet (half price), by card, or send the client a renewal link. */
export function RenewSheet({ event, onClose }: { event: Pick<PhotoEvent, 'id' | 'name' | 'expiresAt'> | null; onClose: () => void }) {
  const api = useApi()
  const { data: wallet } = useWallet()
  const walletPrice = BASE_RENEWAL * (1 - RENEWAL_CREDIT_DISCOUNT)
  const enough = (wallet?.prepaid ?? 0) >= walletPrice
  const [picked, setWay] = useState<RenewWay | null>(null)
  const way: RenewWay = picked ?? (enough ? 'wallet' : 'card')
  const [busy, setBusy] = useState(false)
  const renew = useAction((v: { id: ID; payWith: 'credits' | 'card' }) => api.renewEvent(v.id, { payWith: v.payWith }), {
    success: (r) => `Renewed till ${fmt.date(r.event.expiresAt)} · ${fmt.rupees(r.charged)}${r.payWith === 'credits' ? ' from your wallet' : ''}`,
  })
  const close = () => { setWay(null); onClose() }
  if (!event) return null
  const days = fmt.daysUntil(event.expiresAt, DEMO_NOW)

  const go = async () => {
    if (way === 'client') {
      setBusy(true)
      try {
        const link = await api.createRenewalLink(event.id)
        await Share.share({ message: `Your gallery "${event.name}" ${days >= 0 ? `closes in ${days} days` : 'has closed'}. Keep it online for another year (${fmt.rupees(link.price)}): ${link.url}` })
        close()
      } catch (e) { const f = friendlyError(e); toast.error(f.title, f.detail) } finally { setBusy(false) }
      return
    }
    renew.mutate({ id: event.id, payWith: way === 'wallet' ? 'credits' : 'card' }, { onSuccess: close })
  }

  const label = way === 'client' ? 'Send renewal link' : `Pay ${fmt.rupees(way === 'wallet' ? walletPrice : BASE_RENEWAL)}`
  return (
    <Sheet open={!!event} onClose={close} title={`Renew ${event.name}`}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 4 }}>
        <Txt v="small">{days >= 0 ? `Guests lose access on ${fmt.date(event.expiresAt)}. ` : 'Guests can’t open it now. '}Renewing keeps the gallery open for another year.</Txt>
        <RadioCards<RenewWay> value={way} onChange={setWay} options={[
          { value: 'wallet', title: 'Pay from your wallet', description: enough ? `${fmt.rupees(wallet?.prepaid ?? 0)} available` : `Not enough in your wallet (${fmt.rupees(wallet?.prepaid ?? 0)}). Add money on the web.`, right: fmt.rupees(walletPrice), badge: 'Half price' },
          { value: 'card', title: 'Pay by card or UPI', right: fmt.rupees(BASE_RENEWAL) },
          { value: 'client', title: 'Ask the client to pay', description: 'Send them a link to renew it themselves' },
        ]} />
        <Button label={label} variant="primary" size="lg" disabled={way === 'wallet' && !enough} loading={busy || renew.isPending} onPress={go} />
      </ScrollView>
    </Sheet>
  )
}

/* ---------------- Needs you ---------------- */

const NEEDS_ICON: Record<NeedsYouItem['kind'], IconName> = { 'access-request': 'user-plus', 'guest-uploads': 'upload', 'event-expiring': 'alert-circle', 'face-data-expiring': 'smile' }

/** Home "Needs you": only actionable items; each row does its job in place or opens the right screen. */
export function NeedsYouCard({ items, events }: { items: NeedsYouItem[]; events: PhotoEvent[] }) {
  const { c } = useTheme()
  const api = useApi()
  const hidden = useHiddenIds()
  const [renewing, setRenewing] = useState<PhotoEvent | null>(null)
  const list = items.filter((i) => !hidden.has(i.id))

  const resolve = (item: NeedsYouItem, approve: boolean) => {
    const who = item.title.split(' wants')[0] ?? 'They'
    actWithUndo({
      ids: [item.id],
      title: approve ? `${who} can now see the photos` : `Declined ${who}`,
      run: () => api.resolveAccessRequest(item.accessRequestId!, approve),
      undo: () => api.reopenAccessRequest(item.accessRequestId!),
    })
  }
  const open = (item: NeedsYouItem) => {
    if (item.kind === 'access-request') router.push({ pathname: '/manage/[id]', params: { id: item.eventId, tab: 'guests', f: 'requests' } })
    else if (item.kind === 'guest-uploads') router.push({ pathname: '/manage/[id]', params: { id: item.eventId, tab: 'guests', f: 'uploads' } })
    else setRenewing(events.find((e) => e.id === item.eventId) ?? null)
  }

  return (
    <Card style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Txt v="h3" style={{ flex: 1, fontSize: 15.5 }}>Needs you</Txt>
        {list.length ? <Txt v="small" color={c.ink3}>{list.length === 1 ? '1 thing' : `${list.length} things`}</Txt> : null}
      </View>
      {!list.length ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
          <Icon name="check-circle" size={16} color={c.ok} />
          <Txt v="small">Nothing needs you right now.</Txt>
        </View>
      ) : list.slice(0, 6).map((item) => (
        <View key={item.id} style={[styles.needRow, { borderTopColor: c.line }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={item.title} onPress={() => open(item)} style={{ flexDirection: 'row', gap: 10, flex: 1, minHeight: 44 }}>
            <View style={[styles.needIcon, { backgroundColor: item.kind === 'event-expiring' ? c.warnSoft : c.sunk }]}>
              <Icon name={NEEDS_ICON[item.kind]} size={16} color={item.kind === 'event-expiring' ? c.warn : c.ink2} />
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <Txt weight="bold" style={{ fontSize: 14 }}>{item.title}</Txt>
              <Txt v="small" numberOfLines={2}>{item.kind === 'access-request' ? `${item.detail} · ${fmt.ago(item.at, DEMO_NOW)}` : item.detail}</Txt>
            </View>
          </Pressable>
          {item.kind === 'access-request' ? (
            <View style={{ flexDirection: 'row', gap: 6, alignSelf: 'flex-end' }}>
              <Button label="Decline" size="sm" variant="ghost" onPress={() => resolve(item, false)} />
              <Button label="Approve" size="sm" onPress={() => resolve(item, true)} />
            </View>
          ) : (
            <Button label={item.kind === 'guest-uploads' ? 'Review' : 'Renew'} size="sm" style={{ alignSelf: 'flex-end' }} onPress={() => open(item)} />
          )}
        </View>
      ))}
      <RenewSheet event={renewing} onClose={() => setRenewing(null)} />
    </Card>
  )
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 6, borderBottomWidth: 1 },
  evCard: { borderRadius: radius.card, borderWidth: 1, overflow: 'hidden' },
  evCover: { height: 130 },
  needRow: { borderTopWidth: 1, paddingVertical: 10, gap: 6 },
  needIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
})

