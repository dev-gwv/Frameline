import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Copy, Eye, EyeOff, KeyRound, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import type { Camera } from '@frameline/shared'
import { Button, Card, CardHeader, Menu, Tip, useToast } from '@frameline/ui'
import { copyText, credentialsText, FTP_HOST, FTP_PORT } from './utils'

export function CredRow({ label, value, secret, copyValue }: { label: string; value: string; secret?: boolean; copyValue?: string }) {
  const toast = useToast()
  const [shown, setShown] = useState(false)
  const display = secret && !shown ? '•'.repeat(12) : value
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12px] font-bold text-ink-2">{label}</span>
      <div className="flex h-9 items-center gap-1 rounded-control border border-line-2 bg-surface pl-3 pr-1">
        <span className="min-w-0 flex-1 select-all truncate font-mono text-[12.5px]">{display}</span>
        {secret && (
          <Tip label={shown ? 'Hide password' : 'Show password'}>
            <button type="button" aria-label={shown ? 'Hide password' : 'Show password'} onClick={() => setShown((v) => !v)}
              className="grid size-7 place-items-center rounded-md text-ink-3 hover:bg-sunk hover:text-ink">
              {shown ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </Tip>
        )}
        <Tip label={`Copy ${label.toLowerCase()}`}>
          <button type="button" aria-label={`Copy ${label.toLowerCase()}`}
            onClick={async () => { if (await copyText(copyValue ?? value)) toast.success(`${label} copied`); else toast.error('Couldn’t copy', 'Select the text and copy it by hand.') }}
            className="grid size-7 place-items-center rounded-md text-ink-3 hover:bg-sunk hover:text-ink">
            <Copy size={14} />
          </button>
        </Tip>
      </div>
    </div>
  )
}

/**
 * Server, port, username and — only when we have it — the password. The API returns the password
 * once (createCamera / resetCameraPassword); after that it can only be replaced.
 */
export function CredentialFields({ cam, password, onReset, resetting }: { cam: Camera; password?: string; onReset?: () => void; resetting?: boolean }) {
  return (
    <div className="flex flex-col gap-2.5">
      <CredRow label="Server" value={FTP_HOST} />
      <CredRow label="Port" value={FTP_PORT} copyValue="21" />
      <CredRow label="Username" value={cam.ftpUser} />
      {password ? (
        <CredRow label="Password" value={password} secret />
      ) : (
        <div className="flex flex-col gap-1">
          <span className="text-[12px] font-bold text-ink-2">Password</span>
          <div className="flex flex-wrap items-center gap-2 rounded-control border border-dashed border-line-2 px-3 py-2 text-[12px] text-ink-2">
            <span className="min-w-0 flex-1">Shown only once, when the camera was added. Forgot it? Make a new one.</span>
            {onReset && <Button size="sm" icon={<KeyRound size={12} />} loading={resetting} onClick={onReset}>New password</Button>}
          </div>
        </div>
      )}
    </div>
  )
}

export function CredentialsCard({ cam, password, lastLine, onGuide, onReset, resetting, onEdit, onDelete }: {
  cam: Camera; password?: string; lastLine: string; onGuide: () => void
  onReset: () => void; resetting?: boolean; onEdit: () => void; onDelete: () => void
}) {
  const toast = useToast()
  return (
    <Card className="self-start">
      <CardHeader title={cam.label} action={
        <div className="flex items-center gap-1">
          <Button size="sm" icon={<Copy size={12} />} onClick={async () => {
            if (await copyText(credentialsText(cam, password))) toast.success('All details copied', password ? 'Paste them into your camera’s FTP settings.' : 'The password isn’t included — make a new one if you need it.')
            else toast.error('Couldn’t copy', 'Copy each field with its copy button instead.')
          }}>Copy all</Button>
          <Menu
            trigger={<button type="button" aria-label={`More for ${cam.label}`} className="grid size-8 place-items-center rounded-md text-ink-2 hover:bg-sunk hover:text-ink"><MoreHorizontal size={16} /></button>}
            items={[
              { label: 'Edit camera', icon: <Pencil size={14} />, onSelect: onEdit },
              { label: 'New password', icon: <KeyRound size={14} />, onSelect: onReset },
              'separator',
              { label: 'Remove camera', icon: <Trash2 size={14} />, danger: true, onSelect: onDelete },
            ]}
          />
        </div>
      } />
      <CredentialFields cam={cam} password={password} onReset={onReset} resetting={resetting} />
      <div className="mt-3 rounded-control bg-sunk p-3 text-[12px] text-ink-2">
        {lastLine} Set the camera to send JPEG only.{' '}
        <button type="button" onClick={onGuide} className="inline-flex items-center gap-1 font-bold text-accent-text underline underline-offset-2">
          <BookOpen size={12} />Setup guide
        </button>
      </div>
      <p className="mt-2 text-[11.5px] text-ink-3">
        Sending to the wrong album? Change it with Edit camera; photos already sent can be moved from the <Link className="font-bold text-accent-text" to={`/events/${cam.eventId}`}>event</Link>.
      </p>
    </Card>
  )
}
