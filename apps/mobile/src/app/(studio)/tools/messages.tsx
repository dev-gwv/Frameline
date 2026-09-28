import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { DEMO_NOW, fmt } from '@frameline/shared'
import { Button, Card, Chip, EmptyState, ErrorState, Field, Input, LoadingList, Screen, Sheet, Txt } from '@/components'
import { useApi } from '@/lib/api'
import { useAction, useBroadcasts, useEvents, useStudio } from '@/lib/queries'
import { useTheme } from '@/theme'

/** Messages to guests: past and scheduled messages, and a short compose form. Sending asks first. */
export default function Messages() {
  const { c } = useTheme()
  const api = useApi()
  const { data: list, isLoading, error, refetch } = useBroadcasts()
  const { data: events } = useEvents()
  const { data: studio } = useStudio()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'write' | 'confirm'>('write')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<string>('all')
  const send = useAction(() => api.sendBroadcast({ title: title.trim(), body: body.trim(), audience, scheduledAt: undefined }), {
    success: 'Message sent',
    onSuccess: () => { setOpen(false); setStep('write'); setTitle(''); setBody('') },
  })
  const audienceName = audience === 'all' ? `everyone who follows ${studio?.name ?? 'you'}` : `guests of ${events?.find((e) => e.id === audience)?.name ?? 'this event'}`
  if (isLoading) return <LoadingList />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  const sorted = [...(list ?? [])].sort((a, b) => (b.sentAt ?? b.scheduledAt ?? '').localeCompare(a.sentAt ?? a.scheduledAt ?? ''))

  return (
    <Screen>
      <Txt v="small">A notification in the Frameline app for people who follow you or opened an event.</Txt>
      <Button label="New message" icon="edit-3" variant="primary" onPress={() => setOpen(true)} />
      {sorted.length ? sorted.map((b) => (
        <Card key={b.id} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Txt weight="heavy" style={{ flex: 1 }} numberOfLines={1}>{b.title}</Txt>
            {b.cancelledAt ? <Chip label="Cancelled" tone="neutral" /> : b.sentAt ? <Chip label="Sent" tone="ok" /> : <Chip label="Scheduled" tone="accent" />}
          </View>
          <Txt v="small" numberOfLines={2}>{b.body}</Txt>
          <Txt v="small" color={c.ink3}>
            {b.audience === 'all' ? 'All followers' : events?.find((e) => e.id === b.audience)?.name ?? 'One event'}
            {b.sentAt ? ` · ${fmt.ago(b.sentAt, DEMO_NOW)}` : b.scheduledAt ? ` · ${fmt.dateTime(b.scheduledAt)}` : ''}
            {b.openRate !== undefined ? ` · ${Math.round(b.openRate * 100)}% opened` : ''}
          </Txt>
        </Card>
      )) : <EmptyState icon="send" title="No messages yet" body="Tell your followers when a new gallery is ready, or share an offer." />}

      <Sheet open={open} onClose={() => { setOpen(false); setStep('write') }} title={step === 'confirm' ? 'Send this message?' : 'New message'}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
          {step === 'write' ? (
            <>
              <Field label="Title"><Input value={title} onChangeText={setTitle} placeholder="Your wedding photos are ready" maxLength={60} /></Field>
              <Field label="Message"><Input value={body} onChangeText={setBody} placeholder="Open the app and tap Find my photos." multiline maxLength={240} style={{ minHeight: 90, paddingVertical: 12, textAlignVertical: 'top' }} /></Field>
              <View style={{ gap: 6 }}>
                <Txt v="label">Send to</Txt>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  <Chip label="All followers" selected={audience === 'all'} onPress={() => setAudience('all')} />
                  {(events ?? []).filter((e) => e.status !== 'archived' && e.status !== 'draft').slice(0, 6).map((e) => <Chip key={e.id} label={e.name} selected={audience === e.id} onPress={() => setAudience(e.id)} />)}
                </View>
              </View>
              <Button label="Review and send" variant="primary" size="lg" disabled={!title.trim() || !body.trim()} onPress={() => setStep('confirm')} />
            </>
          ) : (
            <>
              <Card style={{ gap: 4 }}><Txt weight="heavy">{title}</Txt><Txt v="small">{body}</Txt></Card>
              <Txt v="small">This goes to {audienceName} straight away. You can’t take it back.</Txt>
              <Button label="Send now" variant="primary" size="lg" loading={send.isPending} onPress={() => send.mutate(undefined)} />
              <Button label="Edit message" variant="ghost" onPress={() => setStep('write')} />
            </>
          )}
        </ScrollView>
      </Sheet>
    </Screen>
  )
}
