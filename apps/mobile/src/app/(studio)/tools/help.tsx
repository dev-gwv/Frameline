import { useState } from 'react'
import { Linking, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import type { Ticket } from '@frameline/shared'
import { Button, Card, CardTitle, Chip, Field, Input, Screen, SettingRow, Sheet, Txt, type ChipTone } from '@/components'
import { useApi } from '@/lib/api'
import { useAction } from '@/lib/queries'
import { useTheme } from '@/theme'

const SUPPORT_PHONE = '+91 80 4718 2200'
const STATUS: Record<Ticket['status'], { label: string; tone: ChipTone }> = {
  open: { label: 'Open', tone: 'accent' }, answered: { label: 'Answered', tone: 'ok' }, waiting: { label: 'Waiting for you', tone: 'warn' }, closed: { label: 'Closed', tone: 'neutral' },
}

/** Help: WhatsApp, call or email a real person; your requests; a short new-request form. */
export default function Help() {
  const { c } = useTheme()
  const api = useApi()
  const tickets = useQuery({ queryKey: ['tickets'], queryFn: () => api.listTickets() })
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const create = useAction(() => api.createTicket({ subject: subject.trim(), body: body.trim(), platform: 'app' }), {
    success: 'Request sent. We usually reply within a few hours.',
    onSuccess: () => { setOpen(false); setSubject(''); setBody('') },
  })

  return (
    <Screen>
      <Card padded={false} style={{ paddingHorizontal: 16 }}>
        <SettingRow first icon="message-circle" title="WhatsApp us" detail="Replies in about 10 minutes, 9am to 9pm" onPress={() => Linking.openURL(`https://wa.me/${SUPPORT_PHONE.replace(/\D/g, '')}`)} />
        <SettingRow icon="phone" title="Call us" detail={SUPPORT_PHONE} onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE.replace(/\s/g, '')}`)} />
        <SettingRow icon="mail" title="Email" detail="help@frameline.in" onPress={() => Linking.openURL('mailto:help@frameline.in')} />
        <SettingRow icon="book-open" title="Help centre" detail="Guides and videos in English and हिन्दी" onPress={() => Linking.openURL('https://frameline.in/help')} />
      </Card>

      <CardTitle title="Your requests" right={<Button label="New request" size="sm" onPress={() => setOpen(true)} />} />
      {(tickets.data ?? []).length ? (
        <Card padded={false} style={{ paddingHorizontal: 14 }}>
          {(tickets.data ?? []).slice(0, 10).map((t, i) => (
            <View key={t.id} style={{ paddingVertical: 12, gap: 4, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Txt weight="bold" style={{ flex: 1 }} numberOfLines={1}>{t.subject}</Txt>
                <Chip label={STATUS[t.status].label} tone={STATUS[t.status].tone} />
              </View>
              <Txt v="small" numberOfLines={2}>{t.messages[t.messages.length - 1]?.body}</Txt>
            </View>
          ))}
        </Card>
      ) : <Txt v="small" color={c.ink3}>{tickets.isLoading ? 'Loading…' : 'No requests yet.'}</Txt>}

      <Sheet open={open} onClose={() => setOpen(false)} title="New request">
        <View style={{ paddingHorizontal: 16, gap: 12, paddingBottom: 8 }}>
          <Field label="What’s it about?"><Input value={subject} onChangeText={setSubject} placeholder="Guests can’t find their photos" maxLength={80} /></Field>
          <Field label="Tell us more"><Input value={body} onChangeText={setBody} multiline placeholder="Which event, what you tried, what you saw" style={{ minHeight: 100, paddingVertical: 12, textAlignVertical: 'top' }} /></Field>
          <Button label="Send request" variant="primary" size="lg" loading={create.isPending} disabled={!subject.trim() || !body.trim()} onPress={() => create.mutate(undefined)} />
        </View>
      </Sheet>
    </Screen>
  )
}
