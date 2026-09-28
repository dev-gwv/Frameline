import { useState } from 'react'
import { View } from 'react-native'
import { DEMO_NOW, fmt, type TeamMember } from '@frameline/shared'
import { Avatar, Button, Card, Chip, EmptyState, ErrorState, Field, Input, LoadingList, RadioCards, Screen, Sheet, Txt } from '@/components'
import { useApi } from '@/lib/api'
import { useAction, useTeam } from '@/lib/queries'
import { useTheme } from '@/theme'

const ROLE: Record<TeamMember['role'], string> = { owner: 'Owner', editor: 'Editor', uploader: 'Uploader' }
type Invitable = Exclude<TeamMember['role'], 'owner'>

/** Team: who works with you, and an invite form. Changing roles and removing people is on the web. */
export default function Team() {
  const { c } = useTheme()
  const api = useApi()
  const { data: team, isLoading, error, refetch } = useTeam()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Invitable>('editor')
  const invite = useAction(() => api.inviteMember(email.trim(), role), {
    success: (m) => `Invite sent to ${m.email}`,
    onSuccess: () => { setOpen(false); setEmail('') },
  })
  if (isLoading) return <LoadingList />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  return (
    <Screen>
      <Button label="Invite someone" icon="user-plus" variant="primary" onPress={() => setOpen(true)} />
      {team?.length ? (
        <Card padded={false} style={{ paddingHorizontal: 14 }}>
          {team.map((m, i) => (
            <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
              <Avatar name={m.name || m.email} size={38} />
              <View style={{ flex: 1, gap: 1 }}>
                <Txt weight="bold" numberOfLines={1}>{m.name || m.email} <Txt v="small" weight="bold" color={c.ink3}>{ROLE[m.role]}</Txt></Txt>
                <Txt v="small" numberOfLines={1}>{m.access || m.email}{m.lastActive ? ` · ${fmt.ago(m.lastActive, DEMO_NOW)}` : ''}</Txt>
              </View>
              {m.pending ? <Chip label="Invited" tone="accent" /> : null}
            </View>
          ))}
        </Card>
      ) : <EmptyState icon="users" title="Just you so far" body="Invite a second shooter or an editor to upload and manage events with you." />}
      <Txt v="small" center color={c.ink3}>Change roles or remove people on the web.</Txt>

      <Sheet open={open} onClose={() => setOpen(false)} title="Invite someone">
        <View style={{ paddingHorizontal: 16, gap: 12, paddingBottom: 8 }}>
          <Field label="Email"><Input value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="name@studio.in" autoFocus /></Field>
          <RadioCards<Invitable> value={role} onChange={setRole} options={[
            { value: 'editor', title: 'Editor', description: 'Uploads, shares and changes event settings' },
            { value: 'uploader', title: 'Uploader', description: 'Only uploads photos' },
          ]} />
          <Button label="Send invite" variant="primary" size="lg" loading={invite.isPending} disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())} onPress={() => invite.mutate(undefined)} />
        </View>
      </Sheet>
    </Screen>
  )
}
