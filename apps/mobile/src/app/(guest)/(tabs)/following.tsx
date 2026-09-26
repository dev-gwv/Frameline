import { useState } from 'react'
import { View } from 'react-native'
import { router } from 'expo-router'
import { Button, Card, EmptyState, Field, Icon, Input, Screen, SectionHeader, Txt } from '@/components'
import { useApi } from '@/lib/api'
import { parseCode } from '@/lib/links'
import { actions, useLocal } from '@/lib/local'
import { useStudio } from '@/lib/queries'
import { toast } from '@/lib/toast'
import { font, useTheme } from '@/theme'

export default function Following() {
  const { c } = useTheme()
  const api = useApi()
  const following = useLocal((s) => s.following)
  const { data: studio } = useStudio()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const follow = async () => {
    const parsed = parseCode(code)
    if (!parsed || parsed.kind !== 'studio') { setError('Follow codes start with FA-, like FA-KCGWHY'); return }
    setBusy(true)
    try {
      const s = await api.getStudio()
      if (s.followCode.toUpperCase() !== parsed.code) { setError(`No studio uses the code ${parsed.code}. Ask the studio for their follow code.`); return }
      actions.follow(s.followCode)
      toast.success(`Following ${s.name}`, 'New galleries from this studio will appear here')
      setCode('')
      router.push({ pathname: '/studio/[code]', params: { code: s.followCode } })
    } finally { setBusy(false) }
  }

  return (
    <Screen>
      <Card style={{ gap: 12 }}>
        <Txt v="h3">Follow a studio</Txt>
        <Field label="Follow code" error={error} hint="Studios share it on cards, invitations and their website.">
          <Input mono value={code} onChangeText={(t) => { setCode(t.toUpperCase()); setError(undefined) }} placeholder="FA-KCGWHY" autoCapitalize="characters" autoCorrect={false} onSubmitEditing={follow} returnKeyType="go" invalid={!!error} />
        </Field>
        <Button label="Follow" variant="primary" loading={busy} disabled={!code.trim()} onPress={follow} />
      </Card>

      {following.length && studio ? (
        <>
          <SectionHeader title="Studios you follow" />
          {following.map((fc) => fc === studio.followCode ? (
            <Card key={fc} onPress={() => router.push({ pathname: '/studio/[code]', params: { code: fc } })} accessibilityLabel={studio.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 11, backgroundColor: studio.brandColor, alignItems: 'center', justifyContent: 'center' }}>
                <Txt style={{ fontFamily: font.display, color: '#fff', fontSize: 20 }}>{studio.name[0]}</Txt>
              </View>
              <View style={{ flex: 1 }}>
                <Txt weight="bold">{studio.name}</Txt>
                <Txt v="small">{studio.city} · <Txt v="mono" color={c.ink3} style={{ fontSize: 12 }}>{studio.followCode}</Txt></Txt>
              </View>
              <Icon name="chevron-right" size={18} color={c.ink3} />
            </Card>
          ) : null)}
        </>
      ) : (
        <EmptyState icon="star" title="Follow your photographer" body="See their featured galleries, services and new events in one place." action="Try Northlight Studio" onAction={() => { setCode('FA-KCGWHY') }} />
      )}
    </Screen>
  )
}
