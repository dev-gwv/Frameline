import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { Image } from 'expo-image'
import { Button, Card, EmptyState, Field, Icon, Input, Screen, SectionHeader, Skeleton, Txt } from '@/components'
import { notFoundText, useOpenCode } from '@/components/guest'
import { API_MODE } from '@/lib/api'
import { parseCode } from '@/lib/links'
import { useLocal } from '@/lib/local'
import { useStudioProfile } from '@/lib/queries'
import { font, useTheme } from '@/theme'

/**
 * Studios this phone follows. The follow itself is sent with followStudio (from the profile screen); the list is kept
 * on the phone because the contract has no "studios I follow" endpoint.
 */
export default function Following() {
  const following = useLocal((s) => s.following)
  const openCode = useOpenCode()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const open = async () => {
    const parsed = parseCode(code)
    if (!parsed || parsed.kind !== 'studio') { setError('Follow codes start with FA-, like FA-KCGWHY'); return }
    setBusy(true)
    try {
      await openCode(parsed, 'push')
      setCode('')
    } catch (e) {
      setError(notFoundText(parsed, e))
    } finally { setBusy(false) }
  }

  return (
    <Screen>
      <Card style={{ gap: 12 }}>
        <Txt v="h3">Follow a studio</Txt>
        <Field label="Follow code" error={error} hint="Studios share it on cards, invitations and their website.">
          <Input mono value={code} onChangeText={(t) => { setCode(t.toUpperCase()); setError(undefined) }} placeholder="FA-KCGWHY" autoCapitalize="characters" autoCorrect={false} onSubmitEditing={open} returnKeyType="go" invalid={!!error} />
        </Field>
        <Button label="Open studio" variant="primary" loading={busy} disabled={!code.trim()} onPress={open} />
      </Card>

      {following.length ? (
        <>
          <SectionHeader title="Studios you follow" />
          {following.map((fc) => <StudioRow key={fc} code={fc} />)}
        </>
      ) : (
        <EmptyState icon="star" title="Follow your photographer" body="See their featured galleries, services and new events in one place."
          action={API_MODE === 'mock' ? 'Try Northlight Studio' : undefined} onAction={() => { setCode('FA-KCGWHY') }} />
      )}
    </Screen>
  )
}

function StudioRow({ code }: { code: string }) {
  const { c } = useTheme()
  const { data, isLoading } = useStudioProfile(code)
  if (isLoading) return <Skeleton style={{ height: 72, borderRadius: 14 }} />
  const studio = data?.studio
  return (
    <Card onPress={() => router.push({ pathname: '/studio/[code]', params: { code } })} accessibilityLabel={studio?.name ?? code} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 44, height: 44, borderRadius: 11, backgroundColor: studio?.brandColor ?? c.side, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {studio?.logoUrl ? <Image source={{ uri: studio.logoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Txt style={{ fontFamily: font.display, color: '#fff', fontSize: 20 }}>{(studio?.name ?? code)[0]}</Txt>}
      </View>
      <View style={{ flex: 1 }}>
        <Txt weight="bold">{studio?.name ?? 'Studio'}</Txt>
        <Txt v="small">{studio ? `${studio.city} · ` : ''}<Txt v="mono" color={c.ink3} style={{ fontSize: 12 }}>{code}</Txt></Txt>
      </View>
      <Icon name="chevron-right" size={18} color={c.ink3} />
    </Card>
  )
}
