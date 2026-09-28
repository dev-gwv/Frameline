import { useState } from 'react'
import { View, useWindowDimensions } from 'react-native'
import type { WatermarkSettings } from '@frameline/shared'
import { Button, Card, CardTitle, Chip, ErrorState, Field, Input, LoadingList, Screen, Segmented, SettingRow, Toggle, ToneView, Txt, WatermarkOverlay } from '@/components'
import { useApi } from '@/lib/api'
import { useAction, useEvents, useWatermark } from '@/lib/queries'
import { radius, useTheme } from '@/theme'

const POSITIONS: { value: WatermarkSettings['position']; label: string }[] = [
  { value: 'tl', label: 'Top left' }, { value: 'tc', label: 'Top middle' }, { value: 'tr', label: 'Top right' },
  { value: 'bl', label: 'Bottom left' }, { value: 'bc', label: 'Bottom middle' }, { value: 'br', label: 'Bottom right' },
]

/** Watermark: preview, on/off for previews and downloads, text, corner and size. Logo and fonts are on the web. */
export default function Watermark() {
  const { c } = useTheme()
  const api = useApi()
  const { width } = useWindowDimensions()
  const { data: wm, isLoading, error, refetch } = useWatermark()
  const { data: events } = useEvents()
  const [text, setText] = useState<string>()
  const save = useAction((patch: Partial<WatermarkSettings>) => api.updateWatermark(patch), { success: 'Saved' })
  if (isLoading) return <LoadingList />
  if (error || !wm) return <ErrorState error={error} onRetry={refetch} />
  const tone = events?.[0]?.coverTones[0]
  const draft = text ?? wm.text
  const pw = width - 32

  return (
    <Screen>
      <Txt v="small">Your name on guest previews, so photos shared online still point back to you.</Txt>
      <View style={{ height: 200, borderRadius: radius.card, overflow: 'hidden', backgroundColor: c.sunk }}>
        {tone ? <ToneView tone={tone} style={{ flex: 1 }} /> : null}
        <WatermarkOverlay wm={{ enabled: true, settings: { ...wm, text: draft, applyTo: { ...wm.applyTo, previews: true } } }} width={pw} height={200} />
      </View>
      <Card padded={false} style={{ paddingHorizontal: 16 }}>
        <SettingRow first icon="droplet" title="Add my watermark to previews" detail={wm.applyTo.previews ? 'Guests see it on every photo' : 'Off'}
          right={<Toggle label="Add my watermark to previews" value={wm.applyTo.previews} onChange={(v) => save.mutate({ applyTo: { ...wm.applyTo, previews: v } })} />} />
        <SettingRow icon="download" title="Also on downloads" detail={wm.applyTo.downloads ? 'Added to downloaded photos' : 'Downloads are clean'}
          right={<Toggle label="Also on downloads" value={wm.applyTo.downloads} onChange={(v) => save.mutate({ applyTo: { ...wm.applyTo, downloads: v } })} />} />
      </Card>
      <Card style={{ gap: 12 }}>
        <CardTitle title="Look" />
        {wm.mode === 'logo' ? <Txt v="small">You use your logo as the watermark. Change it on the web.</Txt> : (
          <Field label="Text"><Input value={draft} onChangeText={setText} placeholder="© Northlight Studio" maxLength={40} /></Field>
        )}
        <View style={{ gap: 6 }}>
          <Txt v="label">Corner</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {POSITIONS.map((p) => <Chip key={p.value} label={p.label} selected={wm.position === p.value} onPress={() => save.mutate({ position: p.value })} />)}
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Txt v="label">Size</Txt>
          <Segmented value={wm.size} onChange={(v) => save.mutate({ size: v })} options={[{ value: 'subtle', label: 'Subtle' }, { value: 'normal', label: 'Normal' }, { value: 'bold', label: 'Bold' }]} />
        </View>
        {text !== undefined && text.trim() !== wm.text ? <Button label="Save text" variant="primary" loading={save.isPending} onPress={() => save.mutate({ text: text.trim() }, { onSuccess: () => setText(undefined) })} /> : null}
      </Card>
    </Screen>
  )
}
