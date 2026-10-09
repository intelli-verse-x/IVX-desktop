import { useStore } from '@nanostores/react'
import { type RefObject, useLayoutEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Lock } from '@/lib/icons'
import { $brandSession } from '@/store/brand-session'

/** Soft top → heavy bottom wash that sits on the real list, not a separate pane. */
export function LockFog({ label }: { label?: string }) {
  const brand = useStore($brandSession)
  const [payOpen, setPayOpen] = useState(false)
  const [paying, setPaying] = useState(false)
  const unlockHint = label || 'Unlock all skills, tools, connectors, and plugins after payment.'

  return (
    <div className="absolute inset-0 z-10" data-catalog-lock-fog>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 backdrop-blur-[2px]"
        style={{
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 28%, black 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 28%, black 100%)'
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 backdrop-blur-md"
        style={{
          maskImage: 'linear-gradient(to bottom, transparent 22%, black 62%, black 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 22%, black 62%, black 100%)'
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 backdrop-blur-2xl"
        style={{
          maskImage: 'linear-gradient(to bottom, transparent 48%, black 88%, black 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 48%, black 88%, black 100%)'
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to bottom, transparent 0%, color-mix(in srgb, var(--background) 8%, transparent) 18%, color-mix(in srgb, var(--background) 42%, transparent) 52%, var(--background) 100%)'
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-[18%] flex flex-col items-center gap-3">
        <span className="flex size-12 items-center justify-center text-foreground/90">
          <Lock className="size-6" />
        </span>
        <Button
          className="pointer-events-auto shadow-lg"
          disabled={paying}
          onClick={() => setPayOpen(true)}
          size="sm"
          type="button"
          variant="secondary"
        >
          Unlock
        </Button>
      </div>
      <ConfirmDialog
        busyLabel="Opening payment…"
        confirmLabel="Continue to payment"
        description={unlockHint}
        onClose={() => {
          if (!paying) {
            setPayOpen(false)
          }
        }}
        onConfirm={async () => {
          const openPayment = window.hermesDesktop?.brand?.openPayment

          if (!openPayment) {
            throw new Error('Payment is only available in the desktop app.')
          }

          setPaying(true)

          try {
            const next = await openPayment(brand.activeAppId)
            $brandSession.set(next)
          } finally {
            setPaying(false)
            setPayOpen(false)
          }
        }}
        open={payOpen}
        title="Complete payment to unlock"
      />
    </div>
  )
}

/** Measures where the clear free block ends so the fog can start just above it. */
export function useLockFogTop(active: boolean, measureKey: string | number): {
  freeAnchor: RefObject<HTMLDivElement | null>
  fogTop: number
} {
  const freeAnchor = useRef<HTMLDivElement>(null)
  const [fogTop, setFogTop] = useState(0)

  useLayoutEffect(() => {
    if (!active) {
      setFogTop(0)
      return
    }

    const node = freeAnchor.current

    if (!node) {
      return
    }

    const update = () => {
      setFogTop(Math.max(0, node.offsetHeight - 56))
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)

    return () => observer.disconnect()
  }, [active, measureKey])

  return { freeAnchor, fogTop }
}
