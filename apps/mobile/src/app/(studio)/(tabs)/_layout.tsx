import { Tabs } from 'expo-router/tabs'
import { Icon } from '@/components'
import { useTabOptions } from '@/lib/nav'
import { useUploads } from '@/lib/uploads'

export default function StudioTabs() {
  const tabs = useTabOptions()
  const { items } = useUploads()
  const active = items.filter((i) => i.status !== 'done' && i.status !== 'error').length
  return (
    <Tabs screenOptions={tabs}>
      <Tabs.Screen name="home" options={{ title: 'Home', headerShown: false, tabBarIcon: ({ color, size }) => <Icon name="home" color={color} size={size - 2} /> }} />
      <Tabs.Screen name="studio-events" options={{ title: 'Events', tabBarIcon: ({ color, size }) => <Icon name="calendar" color={color} size={size - 2} /> }} />
      <Tabs.Screen name="upload" options={{ title: 'Upload', tabBarBadge: active || undefined, tabBarIcon: ({ color, size }) => <Icon name="upload-cloud" color={color} size={size - 2} /> }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity', tabBarIcon: ({ color, size }) => <Icon name="activity" color={color} size={size - 2} /> }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: ({ color, size }) => <Icon name="menu" color={color} size={size - 2} /> }} />
    </Tabs>
  )
}
