import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Copy, Eye, EyeOff } from 'lucide-react'
import type { Camera } from '@frameline/shared'
import { Button, Card, CardHeader, Tip, useToast } from '@frameline/ui'
import { cameraPassword, copyText, credentialsText, FTP_HOST, FTP_PORT } from './utils'

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

export function CredentialFields({ cam }: { cam: Camera }) {
  return (
    <div className="flex flex-col gap-2.5">
      <CredRow label="Server" value={FTP_HOST} />
      <CredRow label="Port" value={FTP_PORT} copyValue="21" />
      <CredRow label="Username" value={cam.ftpUser} />
      <CredRow label="Password" value={cameraPassword(cam.id)} secret />
    </div>
  )
}

export function CredentialsCard({ cam, lastLine, onGuide }: { cam: Camera; lastLine: string; onGuide: () => void }) {
  const toast = useToast()
  return (
    <Card className="self-start">
      <CardHeader title={cam.label} action={
        <Button size="sm" icon={<Copy size={12} />} onClick={async () => {
          if (await copyText(credentialsText(cam))) toast.success('All details copied', 'Paste them into your camera’s FTP settings.')
          else toast.error('Couldn’t copy', 'Copy each field with its copy button instead.')
        }}>Copy all</Button>
      } />
      <CredentialFields cam={cam} />
      <div className="mt-3 rounded-control bg-sunk p-3 text-[12px] text-ink-2">
        {lastLine} Set the camera to send JPEG only.{' '}
        <button type="button" onClick={onGuide} className="inline-flex items-center gap-1 font-bold text-accent-text underline underline-offset-2">
          <BookOpen size={12} />Setup guide
        </button>
      </div>
      <p className="mt-2 text-[11.5px] text-ink-3">
        Sending to the wrong album? Photos can be moved later from the <Link className="font-bold text-accent-text" to={`/events/${cam.eventId}`}>event</Link>.
      </p>
    </Card>
  )
}
