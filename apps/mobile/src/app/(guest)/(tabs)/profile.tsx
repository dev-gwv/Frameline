import { View } from 'react-native'
import { router } from 'expo-router'
import { fmt } from '@frameline/shared'
import { Avatar, Button, Card, DarkCard, Screen, SectionHeader, SettingRow, Txt } from '@/components'
import { API_MODE, resetDemoData } from '@/lib/api'
import { actions, lastRegistration, local, useLocal } from '@/lib/local'
import { useMyOrders } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { useTheme } from '@/theme'

export default function Profile() {
  const { c } = useTheme()
  const reg = useLocal(lastRegistration)
  const counts = useLocal((s) => ({ events: s.joined.length, favs: s.favourites.length, orders: s.orders.length, enquiries: s.enquiries.length, selfies: Object.keys(s.selfie).length }))
  const session = useLocal((s) => s.studioSession)
  const galleries = useLocal((s) => s.joined)

  return (
    <Screen>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar name={reg?.name ?? 'Guest'} size={52} />
        <View style={{ flex: 1 }}>
          <Txt v="h3">{reg?.name ?? 'Guest'}</Txt>
          <Txt v="small">{reg ? [reg.email, reg.phone].filter(Boolean).join(' · ') : 'You’ll add your details when a gallery asks for them.'}</Txt>
        </View>
      </Card>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[['Events', counts.events], ['Favourites', counts.favs], ['Orders', counts.orders]].map(([l, n]) => (
          <Card key={l} style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
            <Txt v="h2">{String(n)}</Txt>
            <Txt v="small">{l}</Txt>
          </Card>
        ))}
      </View>

      {galleries.length ? (
        <>
          <SectionHeader title="Your orders" />
          <Txt v="small" style={{ marginTop: -8 }}>Prints and full-resolution photos you bought in your galleries.</Txt>
          <Card padded={false} style={{ paddingHorizontal: 16 }}>
            {galleries.map((g, i) => <GalleryOrders key={g.eventId} shortId={g.shortId} first={i === 0} />)}
          </Card>
        </>
      ) : null}

      <Card padded={false} style={{ paddingHorizontal: 16 }}>
        <SettingRow first icon="smile" title="Selfie data" detail={counts.selfies ? `Used for ${counts.selfies} event${counts.selfies > 1 ? 's' : ''}. Deleted automatically after 30 days.` : 'No selfie stored.'}
          right={counts.selfies ? undefined : null}
          onPress={counts.selfies ? () => { local.set({ selfie: {} }); toast.success('Selfie deleted', 'Take a new one any time to find your photos') } : undefined} />
        <SettingRow icon="message-circle" title="Enquiries sent" detail={counts.enquiries ? `${counts.enquiries} sent` : 'None yet'} />
        <SettingRow icon="refresh-cw" title="Clear this phone’s gallery history" detail="Removes joined events, favourites, registrations and gallery sessions on this phone."
          onPress={() => { local.reset(); toast.success('History cleared') }} />
      </Card>

      <DarkCard style={{ gap: 10 }}>
        <Txt weight="bold" color={c.sideInk}>Are you a photographer?</Txt>
        <Txt v="small" color={c.sideInk2}>Switch this phone to studio mode to manage events and upload photos.</Txt>
        <Button label="Switch to photographer mode" icon="camera" onPress={() => { actions.setMode('studio'); router.replace(session ? '/home' : '/sign-in') }} />
      </DarkCard>

      {API_MODE === 'mock' ? <SettingRow title="Reset demo data" detail="Restores the sample events and photos on next launch." onPress={() => { resetDemoData(); local.reset(); toast.info('Demo data reset', 'Close and reopen the app to reload the sample data') }} /> : null}
      <Txt v="small" center color={c.ink3}>Frameline · Photos from every event, found with a selfie.</Txt>
    </Screen>
  )
}

const ORDER_STATUS: Record<string, string> = { paid: 'Paid', printing: 'Printing', refunded: 'Refunded', pending: 'Payment pending', 'paid-direct': 'Paid to studio' }

/** listMyOrders for one gallery; renders nothing when there are none. */
function GalleryOrders({ shortId, first }: { shortId: string; first: boolean }) {
  const { data } = useMyOrders(shortId)
  if (!data?.length) return null
  return (
    <>
      {data.map((o, i) => (
        <SettingRow key={o.id} first={first && i === 0} icon="shopping-bag" title={`#${o.number} · ${o.items}`}
          detail={`${o.eventName} · ${fmt.money(o.paid, o.currency)} · ${ORDER_STATUS[o.status] ?? o.status}${o.shipping ? ` · to ${o.shipping.city}` : ''}`} />
      ))}
    </>
  )
}
