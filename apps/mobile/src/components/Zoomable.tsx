import { type ReactNode } from 'react'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

/**
 * Pinch-to-zoom + double-tap zoom + pan-while-zoomed. Reports zoom state so the pager can lock paging.
 */
export function Zoomable({ children, width, height, zoomed, onZoomChange, onTap }: {
  children: ReactNode; width: number; height: number; zoomed: boolean; onZoomChange: (z: boolean) => void; onTap?: () => void
}) {
  const scale = useSharedValue(1)
  const saved = useSharedValue(1)
  const tx = useSharedValue(0)
  const ty = useSharedValue(0)
  const sx = useSharedValue(0)
  const sy = useSharedValue(0)

  const clamp = (v: number, max: number) => { 'worklet'; return Math.min(max, Math.max(-max, v)) }
  const reset = () => {
    'worklet'
    scale.value = withTiming(1); saved.value = 1
    tx.value = withTiming(0); ty.value = withTiming(0); sx.value = 0; sy.value = 0
    scheduleOnRN(onZoomChange, false)
  }

  const pinch = Gesture.Pinch()
    .onUpdate((e) => { scale.value = Math.max(0.8, Math.min(5, saved.value * e.scale)) })
    .onEnd(() => {
      if (scale.value <= 1.02) { reset(); return }
      saved.value = scale.value
      scheduleOnRN(onZoomChange, true)
    })

  const pan = Gesture.Pan()
    .enabled(zoomed)
    .onUpdate((e) => {
      const maxX = (width * (scale.value - 1)) / 2
      const maxY = (height * (scale.value - 1)) / 2
      tx.value = clamp(sx.value + e.translationX, maxX)
      ty.value = clamp(sy.value + e.translationY, maxY)
    })
    .onEnd(() => { sx.value = tx.value; sy.value = ty.value })

  const doubleTap = Gesture.Tap().numberOfTaps(2).onEnd(() => {
    if (scale.value > 1) reset()
    else { scale.value = withTiming(2.5); saved.value = 2.5; scheduleOnRN(onZoomChange, true) }
  })
  const singleTap = Gesture.Tap().requireExternalGestureToFail(doubleTap).onEnd(() => { if (onTap) scheduleOnRN(onTap) })

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }] }))

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, singleTap))}>
      <Animated.View collapsable={false} style={[{ width, height, alignItems: 'center', justifyContent: 'center' }, style]}>{children}</Animated.View>
    </GestureDetector>
  )
}
