'use client'

import { useState } from 'react'
import { askConfirm } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { useRun } from '@/components/use-run'
import {
  disableInboxAction,
  enableInboxAction,
  replaceInboxAction,
  setUnknownSenderAction,
} from '@/modules/bill-inbox/actions'
import type { InboxSettings } from '@/modules/bill-inbox/data'

/** Settings › Bill inbox. Admins manage the address; managers see it to pass on. */
export function InboxSettingsSection({ firmId, settings, isAdmin }: { firmId: string; settings: InboxSettings; isAdmin: boolean }) {
  const { pending, run, error } = useRun()
  const [copied, setCopied] = useState(false)
  const s = settings

  return (
    <section aria-labelledby="inbox-h" className="mt-10" role="region">
      <h2 id="inbox-h" className="text-lg font-medium">
        Bill inbox
      </h2>
      {!s.configured ? (
        <p className="mt-2 text-sm text-muted-foreground">Bill inbox isn&apos;t set up on this server yet.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Bills emailed or forwarded to this address appear in Billing › Bill inbox, ready to turn into bills.
          </p>
          {s.address && s.enabled ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <code className="rounded border bg-card px-2 py-1" data-testid="inbox-address">
                {s.address}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(s.address ?? '')
                    setCopied(true)
                  } catch {
                    setCopied(false)
                  }
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-sm">The bill inbox is off.</p>
          )}

          {isAdmin && (
            <div className="mt-4 flex flex-col gap-3 text-sm">
              <div className="flex flex-wrap gap-2">
                {s.enabled ? (
                  <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => disableInboxAction(firmId))}>
                    Turn off
                  </Button>
                ) : (
                  <Button type="button" disabled={pending} onClick={() => run(() => enableInboxAction(firmId))}>
                    Turn on
                  </Button>
                )}
                {s.address && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={async () => {
                      const ok = await askConfirm(
                        'Replace the bill address? The old address stops working immediately, so tell your vendors the new one.',
                        { confirmLabel: 'Replace address' },
                      )
                      if (ok) run(() => replaceInboxAction(firmId))
                    }}
                  >
                    Replace address
                  </Button>
                )}
              </div>
              {s.address && (
                <fieldset className="flex flex-col gap-1.5">
                  <legend className="font-medium">Mail from unknown senders</legend>
                  <p className="text-muted-foreground">
                    Known senders are your vendors&apos; email addresses and the people in this firm.
                  </p>
                  {(
                    [
                      ['hold', 'Hold in the inbox, marked "Unknown sender"'],
                      ['drop', 'Drop it'],
                    ] as const
                  ).map(([mode, label]) => (
                    <label key={mode} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="unknown-sender"
                        checked={s.unknownSender === mode}
                        disabled={pending}
                        onChange={() => run(() => setUnknownSenderAction(firmId, mode))}
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  )
}
