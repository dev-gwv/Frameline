import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { TONES } from '@frameline/shared'
import { GoldText, Icon, LogoMark, ToneView, Txt, type IconName } from '@/components'
import { actions, useLocal } from '@/lib/local'
import { font, goldGradient, radius, shadow, useTheme } from '@/theme'

/** First launch: pick an audience. Persisted; switchable later in Profile / More. */
export default function Onboarding() {
  const { c } = useTheme()
  const insets = useSafeAreaInsets()
  const session = useLocal((s) => s.studioSession)
  const mosaic = [0, 2, 3, 6, 8, 10, 12, 1, 4]

  const pickGuest = () => { actions.setMode('guest'); router.replace('/events') }
  const pickStudio = () => { actions.setMode('studio'); router.replace(session ? '/home' : '/sign-in') }

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <View style={[styles.mosaic, { paddingTop: insets.top + 12 }]}>
        {mosaic.map((i, k) => <ToneView key={k} tone={TONES[i]!} style={[styles.tile, k === 4 && { borderWidth: 2, borderColor: c.accent }]} />)}
        <LinearGradient colors={['transparent', c.paper]} style={StyleSheet.absoluteFill} start={{ x: 0.5, y: 0.35 }} end={{ x: 0.5, y: 1 }} />
      </View>
      <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: insets.bottom + 20, justifyContent: 'flex-end', gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <LogoMark size={32} />
          <Txt weight="heavy" style={{ fontSize: 19 }}>Frameline</Txt>
        </View>
        <Txt style={{ fontFamily: font.display, fontSize: 30, lineHeight: 35, color: c.ink }}>
          Every guest, their photos, <GoldText size={30}>by tonight.</GoldText>
        </Txt>
        <Txt v="small" style={{ marginBottom: 8 }}>How will you use Frameline on this phone? You can switch any time.</Txt>
        <Choice icon="smile" title="I’m a guest" body="Open an event, find yourself with a selfie, save your photos." onPress={pickGuest} primary />
        <Choice icon="camera" title="I’m a photographer" body="Manage events, upload from your phone, share galleries." onPress={pickStudio} />
      </View>
    </View>
  )
}

function Choice({ icon, title, body, onPress, primary }: { icon: IconName; title: string; body: string; onPress: () => void; primary?: boolean }) {
  const { c } = useTheme()
  const content = (
    <View style={styles.choice}>
      <View style={[styles.choiceIcon, { backgroundColor: primary ? 'rgba(30,21,8,0.12)' : c.sunk }]}>
        <Icon name={icon} size={22} color={primary ? c.accentInk : c.ink2} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt weight="heavy" color={primary ? c.accentInk : c.ink} style={{ fontSize: 17 }}>{title}</Txt>
        <Txt v="small" color={primary ? 'rgba(30,21,8,0.78)' : c.ink2}>{body}</Txt>
      </View>
      <Icon name="arrow-right" size={20} color={primary ? c.accentInk : c.ink3} />
    </View>
  )
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [{ borderRadius: radius.card + 2, overflow: 'hidden', opacity: pressed ? 0.88 : 1 }, primary ? shadow.float : [{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }, shadow.card]]}>
      {primary ? <LinearGradient {...goldGradient}>{content}</LinearGradient> : content}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  mosaic: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, height: '46%', overflow: 'hidden' },
  tile: { width: '31%', aspectRatio: 1, borderRadius: 8 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, minHeight: 76 },
  choiceIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
})
