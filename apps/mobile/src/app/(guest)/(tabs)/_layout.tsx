import { Tabs } from 'expo-router/tabs'
import { Icon } from '@/components'
import { useLocal } from '@/lib/local'
import { useTabOptions } from '@/lib/nav'

export default function GuestTabs() {
  const tabs = useTabOptions()
  const favCount = useLocal((s) => s.favourites.length)
  return (
    <Tabs screenOptions={tabs}>
      <Tabs.Screen name="events" options={{ title: 'Events', tabBarIcon: ({ color, size }) => <Icon name="image" color={color} size={size - 2} /> }} />
      <Tabs.Screen name="following" options={{ title: 'Following', tabBarIcon: ({ color, size }) => <Icon name="star" color={color} size={size - 2} /> }} />
      <Tabs.Screen name="favourites" options={{ title: 'Favourites', tabBarBadge: favCount || undefined, tabBarIcon: ({ color, size }) => <Icon name="heart" color={color} size={size - 2} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Icon name="user" color={color} size={size - 2} /> }} />
    </Tabs>
  )
}
