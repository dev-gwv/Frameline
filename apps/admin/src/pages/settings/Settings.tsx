import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { PageHeader, TabBar } from '@frameline/ui'
import { BillingTab } from './BillingTab'
import { NotificationsTab } from './NotificationsTab'
import { ProfileTab } from './ProfileTab'
import { SecurityTab } from './SecurityTab'
import { TeamTab } from './TeamTab'

type Tab = 'profile' | 'team' | 'notifications' | 'billing' | 'security'
const TABS: { value: Tab; label: string }[] = [
  { value: 'profile', label: 'Studio profile' },
  { value: 'team', label: 'Team' },
  { value: 'notifications', label: 'Notifications' },
  { value: 'billing', label: 'Billing & GST' },
  { value: 'security', label: 'Security' },
]

export default function Settings() {
  const { tab: param } = useParams()
  const navigate = useNavigate()
  if (param && !TABS.some((t) => t.value === param)) return <Navigate to="/settings/team" replace />
  const tab = (param ?? 'team') as Tab
  return (
    <div className="pb-10">
      <PageHeader title="Settings" subtitle="Your studio, team, notifications, billing and sign-in." />
      <div className="flex flex-col gap-4 px-4 sm:px-7">
        <TabBar value={tab} onChange={(t) => navigate(`/settings/${t}`, { replace: true })} tabs={TABS} />
        {tab === 'profile' && <ProfileTab />}
        {tab === 'team' && <TeamTab />}
        {tab === 'notifications' && <NotificationsTab />}
        {tab === 'billing' && <BillingTab />}
        {tab === 'security' && <SecurityTab />}
      </div>
    </div>
  )
}
