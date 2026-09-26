import { useState } from 'react'
import { Button, Modal, Segmented, StepBadge } from '@frameline/ui'
import { FTP_HOST } from './utils'

type Brand = 'canon' | 'nikon' | 'sony' | 'fuji'

const GUIDES: Record<Brand, { models: string; steps: string[] }> = {
  canon: {
    models: 'EOS R5, R6, R6 II, R3, R7, 5D IV (with Wi-Fi), 1D X III',
    steps: [
      'Menu → Network settings → Connection settings → FTP transfer.',
      `Server: ${FTP_HOST}, port 21. Turn Passive mode ON.`,
      'Enter the username and password from this page. Proxy server: off.',
      'FTP transfer settings → Auto transfer: Enable. Type/size to transfer: JPEG only.',
    ],
  },
  nikon: {
    models: 'Z8, Z9, Z6 II/III, Z7 II, D6, D850 (with WT-7)',
    steps: [
      'Network menu → Connect to FTP server → Network settings → Create profile.',
      `Server type FTP, address ${FTP_HOST}, port 21. PASV mode: ON.`,
      'Log in with the username and password from this page.',
      'Options → Auto send: ON. File type: JPEG.',
    ],
  },
  sony: {
    models: 'A7 IV, A7R V, A1, A9 II/III, A7S III',
    steps: [
      'Menu → Network → FTP transfer function → Server setting → Server 1.',
      `Host name ${FTP_HOST}, port 21, Secure protocol: Off, Passive mode: On.`,
      'User and password from this page. Directory: leave blank.',
      'FTP power save: Off. Auto FTP transfer: On. Target file: JPEG.',
    ],
  },
  fuji: {
    models: 'X-H2, X-H2S (with FT-XH), GFX100 II, X-T5 (via app)',
    steps: [
      'Network/USB setting → FTP settings → Create a new profile.',
      `Server ${FTP_HOST}, port 21, Passive mode: On.`,
      'Use the username and password from this page.',
      'Auto image transfer order: On. File type: JPEG.',
    ],
  },
}

export function SetupGuide({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [brand, setBrand] = useState<Brand>('canon')
  const g = GUIDES[brand]
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Camera setup guide" description="Four settings on the camera. You only do this once per event." width={560}
      footer={<Button variant="primary" onClick={() => onOpenChange(false)}>Got it</Button>}>
      <div className="flex flex-col gap-4 px-5 py-4 sm:px-6">
        <Segmented value={brand} onChange={setBrand} stretch options={[
          { value: 'canon', label: 'Canon' }, { value: 'nikon', label: 'Nikon' }, { value: 'sony', label: 'Sony' }, { value: 'fuji', label: 'Fujifilm' },
        ]} />
        <div className="text-[12px] text-ink-2">Works with: <b className="text-ink">{g.models}</b></div>
        <ol className="flex flex-col gap-3">
          {g.steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-[13px]"><StepBadge n={i + 1} /><span>{s}</span></li>
          ))}
        </ol>
        <div className="rounded-control bg-sunk p-3 text-[12px] text-ink-2">
          <b className="text-ink">If nothing arrives:</b> check the camera is on the same Wi-Fi or phone hotspot, passive mode is on, and the
          status here says “Receiving”. Photos appear about 10 seconds after each shot.
        </div>
      </div>
    </Modal>
  )
}
