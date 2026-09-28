import { useState } from 'react'
import { fmt, PACKS, type PhotoEvent } from '@frameline/shared'
import { Button, Modal, RadioCardGroup } from '@frameline/ui'
import { useApi } from '../../lib/api'
import { useAction, useWalletBalance } from '../../lib/queries'

/**
 * 'add-photos': one-off photo packs for this event, paid from the wallet (the API takes added money first, then sales earnings).
 * Not enough in the wallet → the same button pays by UPI or card (simulated checkout: api.buyPack payWith 'card').
 * Pack sizes and prices come from PACKS in @frameline/shared (the API only accepts those).
 */
export function AddPhotosModal({ open, onOpenChange, event }: { open: boolean; onOpenChange: (v: boolean) => void; event: PhotoEvent }) {
  const api = useApi()
  const wallet = useWalletBalance(open)
  const [photos, setPhotos] = useState<string>(String(PACKS[0].photos))
  const pack = PACKS.find((p) => String(p.photos) === photos) ?? PACKS[0]
  const w = wallet.data
  const enough = !!w && w.balance >= pack.price
  const buy = useAction(() => api.buyPack(event.id, pack.photos, { payWith: enough ? 'credits' : 'card' }), {
    success: (r) => `${fmt.count(pack.photos)} photos added. This event can now hold ${fmt.count(r.event.photoLimit)}.`,
    error: 'Couldn’t add the photos',
    onSuccess: () => onOpenChange(false),
  })
  const label = enough
    ? `Add ${fmt.count(pack.photos)} photos · ${fmt.rupees(pack.price)}`
    : `Pay ${fmt.rupees(pack.price)} by UPI or card`

  return (
    <Modal open={open} onOpenChange={onOpenChange} width={520} title="Add photos to this event"
      description={`${fmt.count(event.photoCount)} of ${fmt.count(event.photoLimit)} photos used`}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={buy.isPending} disabled={wallet.isLoading} onClick={() => buy.mutate(undefined)}>{label}</Button></>}>
      <RadioCardGroup label="How many photos" value={photos} onChange={setPhotos}
        options={PACKS.map((p) => ({ value: String(p.photos), title: `+${fmt.count(p.photos)} photos`, description: `${fmt.rupees(p.price)} from your wallet` }))} />
      {w ? (
        <div className="rounded-card bg-sunk px-3.5 py-3 text-[13.5px]">
          <div className="flex justify-between"><span>Wallet balance</span><b className="tnum">{fmt.rupees(w.balance)}</b></div>
          {enough && <div className="flex justify-between"><span>After this</span><b className="tnum">{fmt.rupees(w.balance - pack.price)}</b></div>}
        </div>
      ) : wallet.isLoading ? <div className="h-[66px] animate-pulse rounded-card bg-sunk" /> : null}
      <p className="text-[12.5px] text-ink-3">
        {!w ? 'You’ll pay by UPI or card on the next step.'
          : enough ? 'Not enough in your wallet? You can pay by UPI or card instead.'
            : `Not enough in your wallet for this. Pay by UPI or card instead, or add money to your wallet in Plan and billing.`}
      </p>
    </Modal>
  )
}
