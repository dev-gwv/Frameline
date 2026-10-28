import { Navigate, useParams } from 'react-router-dom'
import { Page } from '@frameline/ui'
import { useServerFeatures } from '../../lib/api'
import { BillingTab } from './BillingTab'
import { DriveTab } from './DriveTab'
import { InvoicesTab } from './InvoicesTab'
import { NotificationsTab } from './NotificationsTab'
import { ProfileTab } from './ProfileTab'
import { SecurityTab } from './SecurityTab'
import { SideList } from './SideList'
import { TeamTab } from './TeamTab'

type Tab = 'profile' | 'team' | 'drive' | 'notifications' | 'billing' | 'invoices' | 'security'
const TABS: { id: Tab; label: string }[] = [
  { id: 'profile', label: 'Studio profile' },
  { id: 'team', label: 'Team' },
  { id: 'drive', label: 'Google Drive' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'billing', label: 'Billing and GST' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'security', label: 'Security' },
]

/** /settings/:tab — account settings as a left-list page (same pattern as Selling settings). */
export default function Settings() {
  const { tab: param } = useParams()
  // Google Drive shows only when the server has it set up.
  const { drive } = useServerFeatures()
  const tabs = TABS.filter((t) => t.id !== 'drive' || drive)
  if (param && !TABS.some((t) => t.id === param)) return <Navigate to="/settings/profile" replace />
  const tab = (param ?? 'profile') as Tab
  return (
    <Page title="Settings">
      <SideList label="Settings" value={tab} items={tabs.map((t) => ({ id: t.id, label: t.label, to: `/settings/${t.id}` }))}>
        {tab === 'profile' && <ProfileTab />}
        {tab === 'team' && <TeamTab />}
        {tab === 'drive' && <DriveTab />}
        {tab === 'notifications' && <NotificationsTab />}
        {tab === 'billing' && <BillingTab />}
        {tab === 'invoices' && <InvoicesTab />}
        {tab === 'security' && <SecurityTab />}
      </SideList>
    </Page>
  )
}
