import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ChevronRight, FolderTree, Link2Off } from 'lucide-react'
import { fmt } from '@frameline/shared'
import { Button, Card, Chip, ConfirmDialog, SettingRow, Skeleton, Toggle, useToast } from '@frameline/ui'
import { errorMessage, useApi, useServerFeatures } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { GoogleDriveIcon, startDriveConnect, takeDriveReturn } from '../../lib/drive'
import { useAction, useDrive, useEvents } from '../../lib/queries'
import { SectionTitle } from './SideList'

/** Why Google sent the studio back without connecting (GET /v1/drive/callback → ?drive_error=…). */
const CONNECT_ERRORS: Record<string, string> = {
  cancelled: 'You closed Google’s window before allowing access. Nothing was connected.',
  scope: 'Google Drive access was unticked on Google’s page. Connect again and leave the Google Drive box ticked.',
  expired: 'That took too long. Connect again.',
  google: 'Google didn’t finish connecting. Try again in a minute.',
}

/**
 * /settings/drive — connect the studio's Google Drive (owner), keep new events' originals there, see whether files
 * are missing. Frameline only sees files the studio picks and the folders it makes (scope drive.file).
 */
export function DriveTab() {
  const api = useApi()
  const toast = useToast()
  const { user } = useAuth()
  const owner = !user || user.role === 'owner'
  const server = useServerFeatures()
  const drive = useDrive(server.drive)
  const events = useEvents().data
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [confirmOff, setConfirmOff] = useState(false)
  const [connecting, setConnecting] = useState(false)

  // Back from Google: say what happened once, then tidy the address.
  useEffect(() => {
    const ok = params.get('drive') === 'connected'
    const err = params.get('drive_error')
    if (!ok && !err) return
    if (ok) toast.success('Google Drive connected', 'You can import from it and keep originals in it.')
    else toast.error('Google Drive isn’t connected', CONNECT_ERRORS[err!] ?? CONNECT_ERRORS.google)
    // Connected from an event's import window: straight back to it.
    const back = takeDriveReturn()
    if (ok && back) { navigate(back, { replace: true }); return }
    setParams((p) => { p.delete('drive'); p.delete('drive_error'); return p }, { replace: true })
  }, [params, setParams, toast, navigate])

  const connect = async () => {
    setConnecting(true)
    try {
      // Sample data connects at once.
      if (await startDriveConnect(() => api.connectDrive())) { setConnecting(false); setParams({ drive: 'connected' }, { replace: true }) }
    } catch (e) {
      setConnecting(false)
      toast.error('Couldn’t start connecting', errorMessage(e))
    }
  }
  const setDefault = useAction((v: boolean) => api.updateDrive({ defaultForNewEvents: v }), { error: 'Couldn’t save' })
  const disconnect = useAction(() => api.disconnectDrive(), { success: 'Google Drive disconnected', error: 'Couldn’t disconnect' })

  if (!server.drive) return (
    <div>
      <SectionTitle title="Google Drive" />
      <Card><p className="text-[13.5px] text-ink-2">Google Drive isn’t switched on for Frameline yet.</p></Card>
    </div>
  )

  const d = drive.data
  const revoked = d?.status === 'revoked'
  const inDrive = (events ?? []).filter((e) => e.originalsIn === 'drive' && !e.deletedAt)
  return (
    <div>
      <SectionTitle title="Google Drive" description="Import shoots from your Drive, and keep full-size photos in it instead of in Frameline." />
      {drive.isLoading || !d ? <Skeleton className="h-48" /> : (
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <GoogleDriveIcon size={22} />
              <div className="min-w-0 flex-1">
                <h3 className="font-sans text-[15px] font-extrabold">{d.connected ? d.email : 'Not connected'}</h3>
                <p className="text-[12.5px] text-ink-2">
                  {d.connected
                    ? revoked ? 'Google no longer lets Frameline in (access was removed, or the password changed).' : `Connected ${fmt.ago(d.connectedAt!)}`
                    : 'Frameline will only see the files you pick and the folders it makes. Nothing else in your Drive.'}
                </p>
              </div>
              {d.connected && <Chip tone={revoked ? 'bad' : 'ok'}>{revoked ? 'Reconnect needed' : 'Connected'}</Chip>}
            </div>
            {owner ? (
              <div className="flex flex-wrap gap-2">
                {(!d.connected || revoked) && <Button variant="primary" loading={connecting} onClick={() => void connect()}>{revoked ? 'Reconnect Google Drive' : 'Connect Google Drive'}</Button>}
                {d.connected && !revoked && <Button loading={connecting} onClick={() => void connect()}>Use a different Google account</Button>}
                {d.connected && <Button variant="ghost" icon={<Link2Off size={14} />} onClick={() => setConfirmOff(true)}>Disconnect</Button>}
              </div>
            ) : <p className="text-[12.5px] text-ink-3">Only the studio owner can connect or disconnect Google Drive.</p>}
          </Card>

          {d.connected && !revoked && (
            <Card className="flex flex-col">
              <SettingRow
                icon={<FolderTree size={15} />} title="Keep new events’ originals in Google Drive"
                description="New uploads go to Frameline → event → album in your Drive; Frameline keeps a 2048 px copy for the gallery. You can change it per event in its Settings."
                control={<Toggle label="Keep new events’ originals in Google Drive" checked={d.defaultForNewEvents} disabled={!owner || setDefault.isPending} onCheckedChange={(v) => setDefault.mutate(v)} />}
              />
              {d.missingFiles > 0 ? (
                <SettingRow icon={<AlertTriangle size={15} className="text-warn" />} title={`${fmt.count(d.missingFiles)} original${d.missingFiles === 1 ? ' is' : 's are'} missing from your Drive`}
                  description="Found in the daily check. Guests get the 2048 px copy of those photos instead. Restore them from your Drive’s trash if you didn’t mean to delete them." />
              ) : (
                <SettingRow icon={<CheckCircle2 size={15} className="text-ok" />} title="Originals are where they should be" description="Frameline checks a sample every day." />
              )}
              {server.driveImport && (
                <SettingRow icon={<GoogleDriveIcon size={15} />} title="Import a shoot from Drive" description="Pick folders in your Drive; each one becomes an album in the event you choose."
                  control={<Button size="sm" className="max-sm:h-10" onClick={() => navigate('/?upload=drive')}>Import</Button>} />
              )}
            </Card>
          )}

          {d.connected && inDrive.length > 0 && (
            <Card padded={false}>
              <h3 className="px-4 pb-1 pt-3.5 font-sans text-[14px] font-extrabold">Events keeping originals in Drive</h3>
              <ul className="divide-y divide-line">
                {inDrive.map((e) => (
                  <li key={e.id}>
                    <Link to={`/events/${e.id}/settings#storage`} className="flex min-h-[48px] items-center gap-3 px-4 py-2 hover:bg-sunk">
                      <span className="min-w-0 flex-1"><b className="block truncate text-[13.5px]">{e.name}</b><span className="text-[12px] text-ink-3">{fmt.date(e.date)} · {fmt.count(e.photoCount)} photos</span></span>
                      <ChevronRight size={15} className="shrink-0 text-ink-3" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
      <ConfirmDialog open={confirmOff} onOpenChange={setConfirmOff} danger title="Disconnect Google Drive?" confirmLabel="Disconnect"
        body="Files already in your Drive stay there. Events that kept originals in Drive go back to Frameline for new uploads, and guests get the 2048 px copy of photos whose original is in Drive until you connect again. Running imports stop."
        onConfirm={() => { setConfirmOff(false); disconnect.mutate(undefined) }} />
    </div>
  )
}
