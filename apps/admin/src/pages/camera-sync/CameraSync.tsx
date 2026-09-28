import { useEffect, useState } from 'react'
import { BookOpen, Camera as CameraIcon, Play, Plus } from 'lucide-react'
import type { Camera, ID } from '@frameline/shared'
import { Button, Card, ConfirmDialog, EmptyState, IconTile, Page, Skeleton } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useCameras, useEvents } from '../../lib/queries'
import { QueryError } from '../system'
import { AddCameraModal } from './AddCameraModal'
import { CamerasTable, LIVE_MS, useAlbumName } from './CamerasTable'
import { CredentialsModal } from './Credentials'
import { SetupGuide } from './SetupGuide'
import { UploadHistoryModal } from './UploadHistory'
import { MAX_CAMERAS, type Brand } from './utils'

/*
 * Camera sync. The FTP bridge that actually receives files will run on a VPS later; until then the
 * credentials flow is real (createCamera / resetCameraPassword) and the live feed comes from the API's uploads list.
 */
export default function CameraSync() {
  const api = useApi()
  const cams = useCameras()
  const events = useEvents().data ?? []
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Camera | null>(null)
  const [removing, setRemoving] = useState<Camera | null>(null)
  const [resetting, setResetting] = useState<Camera | null>(null)
  const [history, setHistory] = useState<Camera | null>(null)
  const [clearing, setClearing] = useState(false)
  const [login, setLogin] = useState<{ cam: Camera; kind: 'added' | 'reset' | 'view' } | null>(null)
  const [guide, setGuide] = useState<{ brand?: Brand } | null>(null)
  const [now, setNow] = useState(() => Date.now())
  // FTP passwords are returned once (create / reset); keep them for this visit only.
  const [passwords, setPasswords] = useState<Record<ID, string>>({})

  const list = cams.data ?? []
  const anyReceiving = list.some((c) => c.status === 'receiving')
  const { refetch } = cams
  useEffect(() => {
    if (!anyReceiving) return
    const i = setInterval(() => { void refetch() }, LIVE_MS)
    return () => clearInterval(i)
  }, [anyReceiving, refetch])
  // Clock for "12 s ago".
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i) }, [])

  const reset = useAction((c: Camera) => api.resetCameraPassword(c.id), {
    onSuccess: (c) => {
      if (c.password) setPasswords((p) => ({ ...p, [c.id]: c.password! }))
      setLogin({ cam: c, kind: 'reset' })
    },
  })
  const remove = useAction((c: Camera) => api.deleteCamera(c.id), {
    success: (_d, c) => `${c.label} removed. Photos it sent stay in the album.`,
  })
  const clear = useAction((c: Camera) => api.clearCameraUploads(c.id), { success: 'History cleared. Photos stay in the album.' })

  const loginEvent = login ? events.find((e) => e.id === login.cam.eventId)?.name : undefined
  const loginAlbum = useAlbumName(login?.cam.eventId, login?.cam.albumId)
  const add = () => setAdding(true)

  let body
  if (cams.isLoading) body = <Skeleton className="h-48" />
  else if (cams.error) body = <Card><QueryError error={cams.error} retry={() => cams.refetch()} /></Card>
  else if (!list.length) body = (
    <Card>
      <EmptyState icon={<CameraIcon size={22} />} title="No cameras yet"
        body="Add your camera to get its login. Type it into the camera’s FTP settings and photos land in an album while you shoot."
        action={<Button icon={<Plus size={15} />} onClick={add}>Add a camera</Button>} />
    </Card>
  )
  else body = (
    <CamerasTable cameras={list} events={events} now={now}
      onEdit={setEditing} onReset={setResetting} onHistory={setHistory} onRemove={setRemoving}
      onLogin={(c) => setLogin({ cam: c, kind: 'view' })} />
  )

  return (
    <Page title="Camera sync"
      subtitle="Photos go from your camera to an album while you shoot. Works with Canon, Nikon, Sony and Fujifilm over Wi-Fi."
      actions={<Button variant="primary" icon={<Plus size={15} />} onClick={add} disabled={cams.isLoading}>Add a camera</Button>}>
      <div className="flex flex-col gap-3.5">
        <Card className="flex flex-wrap items-center gap-3">
          <IconTile><Play size={15} /></IconTile>
          <div className="min-w-0 flex-1">
            <b className="block text-[14px]">How it works in 3 steps</b>
            <span className="block text-[13px] text-ink-2">Add a camera here → type the login into your camera → shoot.</span>
          </div>
          <Button size="sm" icon={<BookOpen size={14} />} onClick={() => setGuide({})}>Setup guide</Button>
        </Card>
        {body}
      </div>

      <AddCameraModal open={adding} onOpenChange={setAdding} full={list.length >= MAX_CAMERAS}
        onCreated={(c) => { if (c.password) setPasswords((p) => ({ ...p, [c.id]: c.password! })); setLogin({ cam: c, kind: 'added' }) }} />
      <AddCameraModal open={!!editing} camera={editing} onOpenChange={(v) => { if (!v) setEditing(null) }} />
      <CredentialsModal cam={login?.cam ?? null} kind={login?.kind ?? 'view'} password={login ? passwords[login.cam.id] : undefined}
        eventName={loginEvent} albumName={loginAlbum}
        onClose={() => setLogin(null)} onGuide={(brand) => setGuide({ brand })}
        onReset={() => { if (login) { setResetting(login.cam); setLogin(null) } }} />
      <UploadHistoryModal cam={history} onClose={() => setHistory(null)} onClear={() => setClearing(true)} clearing={clear.isPending} />
      <SetupGuide open={!!guide} brand={guide?.brand} onOpenChange={(v) => { if (!v) setGuide(null) }} />

      <ConfirmDialog open={!!removing} onOpenChange={(v) => { if (!v) setRemoving(null) }}
        title={`Remove ${removing?.label ?? 'camera'}?`} confirmLabel="Remove camera"
        body="Its login stops working straight away, so a running shoot stops sending. Photos it already sent stay in the album."
        onConfirm={() => removing && remove.mutateAsync(removing)} />
      <ConfirmDialog open={clearing} onOpenChange={setClearing}
        title="Clear upload history?" confirmLabel="Clear history" danger
        body="The list of files is deleted. Photos stay in the album."
        onConfirm={() => history && clear.mutateAsync(history)} />
      <ConfirmDialog open={!!resetting} onOpenChange={(v) => { if (!v) setResetting(null) }}
        title={`New password for ${resetting?.label ?? 'this camera'}?`} confirmLabel="Make new password"
        body="The old password stops working, so a camera that’s shooting now disconnects until you type the new one into its FTP settings."
        onConfirm={() => resetting && reset.mutateAsync(resetting)} />
    </Page>
  )
}
