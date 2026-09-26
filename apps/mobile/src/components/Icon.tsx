import Feather from '@expo/vector-icons/Feather'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import type { ComponentProps } from 'react'
import type { ColorValue, StyleProp, TextStyle } from 'react-native'

type FeatherName = ComponentProps<typeof Feather>['name']
const MCI = { qr: 'qrcode', scan: 'qrcode-scan', face: 'face-recognition' } as const
export type IconName = FeatherName | keyof typeof MCI

/** Line icons (Feather, close to the design's icon set) plus a few MaterialCommunity glyphs (QR, face). */
export function Icon({ name, size = 20, color, style }: { name: IconName; size?: number; color: ColorValue; style?: StyleProp<TextStyle> }) {
  if (name in MCI) return <MaterialCommunityIcons name={MCI[name as keyof typeof MCI]} size={size + 1} color={color} style={style} />
  return <Feather name={name as FeatherName} size={size} color={color} style={style} />
}

export const iconFonts = { ...Feather.font, ...MaterialCommunityIcons.font }
