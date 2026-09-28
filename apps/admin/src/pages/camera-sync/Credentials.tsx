import { BookOpen, CheckCircle2, Copy, KeyRound } from 'lucide-react'
import type { Camera } from '@frameline/shared'
import { Button, Modal, useToast } from '@frameline/ui'
import { BRAND_LABEL, brandOf, copyText, credentialsText, FTP_HOST, FTP_PORT, type Brand } from './utils'

/** One "Server  ftp.frameline.in  [Copy]" row. */
export function CredRow({ label, value, copyValue }: { label: string; value: string; copyValue?: string }) {
  const toast = useToast()
  return (
    <div className="flex min-h-[44px] items-center gap-3 border-b border-line py-1.5 last:border-b-0">
      <span className="w-[76px] shrink-0 text-[13px] text-ink-2">{label}</span>
      <b className="min-w-0 flex-1 select-all break-all text-[14px] tnum">{value}</b>
      <Button size="sm" variant="ghost" icon={<Copy size={13} />} aria-label={`Copy ${label.toLowerCase()}`}
        onClick={async () => { if (await copyText(copyValue ?? value)) toast.success(`${label} copied`); else toast.error('Couldn’t copy', 'Select the text and copy it by hand.') }}>
        Copy
      </Button>
    </div>
  )
}

/**
 * Server, port, user and (only right after adding or a new password) the password.
 * The API returns the password once; after that it can only be replaced.
 */
export function CredentialRows({ cam, password, onReset }: { cam: Camera; password?: string; onReset?: () => void }) {
  return (
    <div className="flex flex-col">
      <CredRow label="Server" value={FTP_HOST} />
      <CredRow label="Port" value={FTP_PORT} />
      <CredRow label="User" value={cam.ftpUser} />
      {password ? <CredRow label="Password" value={password} /> : (
        <div className="flex min-h-[44px] flex-wrap items-center gap-3 py-1.5">
          <span className="w-[76px] shrink-0 text-[13px] text-ink-2">Password</span>
          <span className="min-w-0 flex-1 text-[12.5px] text-ink-3">Shown only once, when you add the camera or make a new one.</span>
          {onReset && <Button size="sm" icon={<KeyRound size={13} />} onClick={onReset}>New password</Button>}
        </div>
      )}
    </div>
  )
}

/**
 * "Camera added" / "New password" / "Login for …": the four values to type into the camera,
 * each copyable, plus the brand's setup guide.
 */
export function CredentialsModal({ cam, password, kind, eventName, albumName, onClose, onGuide, onReset }: {
  cam: Camera | null
  password?: string
  kind: 'added' | 'reset' | 'view'
  eventName?: string
  albumName?: string
  onClose: () => void
  onGuide: (b?: Brand) => void
  onReset?: () => void
}) {
  const toast = useToast()
  const brand = cam ? brandOf(cam.label) : undefined
  const title = kind === 'added' ? 'Camera added' : kind === 'reset' ? 'New password made' : `Login for ${cam?.label ?? 'camera'}`
  const description = kind === 'view' ? 'Type these into your camera’s FTP settings.'
    : 'Type these into your camera’s FTP settings. The password is shown only now, so copy it before you close this.'
  return (
    <Modal open={!!cam} onOpenChange={(v) => { if (!v) onClose() }} title={title} description={description} width={520}
      footer={<>
        {cam && (
          <Button variant="ghost" icon={<Copy size={14} />} className="mr-auto max-sm:hidden" onClick={async () => {
            if (await copyText(credentialsText(cam, password))) toast.success('All details copied')
            else toast.error('Couldn’t copy', 'Copy each value with its Copy button instead.')
          }}>Copy all</Button>
        )}
        <Button icon={<BookOpen size={14} />} onClick={() => onGuide(brand)}>{brand ? `${BRAND_LABEL[brand]} guide` : 'Setup guide'}</Button>
        <Button variant="primary" onClick={onClose}>Done</Button>
      </>}>
      {cam && <>
        {kind === 'added' && (
          <div className="flex items-center gap-2 rounded-control bg-ok-soft px-3 py-2 text-[13px] font-bold text-ok">
            <CheckCircle2 size={15} className="shrink-0" /> {cam.label} is ready. It shows a Live dot once the camera connects.
          </div>
        )}
        {kind === 'reset' && (
          <div className="rounded-control bg-warn-soft px-3 py-2 text-[13px] font-bold text-warn">The old password no longer works. Enter this one on the camera to reconnect.</div>
        )}
        <CredentialRows cam={cam} password={password} onReset={kind === 'view' ? onReset : undefined} />
        <p className="text-[12.5px] text-ink-3">
          Photos go to <b className="text-ink-2">{eventName ?? 'your event'}{albumName ? ` → ${albumName}` : ''}</b>. Change this any time with Edit.
          Use passive mode (PASV) and send JPEG only.
        </p>
      </>}
    </Modal>
  )
}
