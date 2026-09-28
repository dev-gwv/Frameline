import { Tabs } from 'expo-router/tabs'
import { Icon } from '@/components'
import { useTabOptions } from '@/lib/nav'
import { useUploads } from '@/lib/uploads'

/** Photographer tabs: Home · Events · Upload · More (Sell lives in More on phones; activity folds into Home's Needs you). */
export default function StudioTabs() {
  const tabs = useTabOptions()
  const { items } = useUploads()
  const active = items.filter((i) => i.status !== 'done' && i.status !== 'error').length
  return (
    <Tabs screenOptions={tabs}>
      <Tabs.Screen name="home" options={{ title: 'Home', headerShown: false, tabBarIcon: ({ color, size }) => <Icon name="home" color={color} size={size - 2} /> }} />
      <Tabs.Screen name="studio-events" options={{ title: 'Events', headerShown: false, tabBarIcon: ({ color, size }) => <Icon name="calendar" color={color} size={size - 2} /> }} />
      <Tabs.Screen name="upload" options={{ title: 'Upload', headerShown: false, tabBarBadge: active || undefined, tabBarIcon: ({ color, size }) => <Icon name="upload-cloud" color={color} size={size - 2} /> }} />
      <Tabs.Screen name="more" options={{ title: 'More', headerShown: false, tabBarIcon: ({ color, size }) => <Icon name="grid" color={color} size={size - 2} /> }} />
    </Tabs>
  )
}
