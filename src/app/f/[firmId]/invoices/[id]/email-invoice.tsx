'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SOMETHING_WENT_WRONG } from '@/components/use-run'
import type { FormResult } from '@/lib/form'
import { sendInvoiceEmailAction } from '@/modules/invoice-emails/actions'

type Props = {
  firmId: string
  invoiceId: string
  /** Why the button is disabled (email not set up, no PDF); null when sending is possible. */
  blockedReason: string | null
  defaults: { to: string; subject: string; body: string; from: string | null; replyTo: string | null }
  attachmentName: string
  missingBillingEmail: boolean
}

type SendResult = FormResult<{ to: string[]; number: string }>

const field = 'flex flex-col gap-1.5'
const area = 'rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm'

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  )
}

export function EmailInvoice({ firmId, invoiceId, blockedReason, defaults, attachmentName, missingBillingEmail }: Props) {
  const [open, setOpen] = useState(false)
  // Controlled fields: React resets uncontrolled ones after every form action, which would
  // throw away what the user typed whenever a send is refused. Reset only after a success.
  const initial = { to: defaults.to, cc: '', copyMe: false, subject: defaults.subject, body: defaults.body }
  const [values, setValues] = useState(initial)
  const set = (k: 'to' | 'cc' | 'subject' | 'body') => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [k]: e.target.value }))
  const [sent, setSent] = useState<string | null>(null)
  const [state, action, pending] = useActionState<SendResult | null, FormData>(async (_prev, fd) => {
    let r: SendResult
    try {
      r = await sendInvoiceEmailAction(firmId, invoiceId, fd)
    } catch (e) {
      console.error('send invoice email failed', e)
      return { ok: false, error: SOMETHING_WENT_WRONG }
    }
    if (r.ok) {
      setSent(`Invoice ${r.data.number} sent to ${r.data.to.join(', ')}.`)
      setOpen(false)
      setValues(initial)
    }
    return r
  }, null)
  const fe = (state && !state.ok ? state.fieldErrors : undefined) ?? {}

  return (
    <section aria-labelledby="email-invoice-h" className="mt-8">
      <h2 id="email-invoice-h" className="sr-only">
        Email invoice
      </h2>
      {sent && (
        <p role="status" className="mb-3 text-sm">
          {sent}
        </p>
      )}
      {!open && (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            className="self-start"
            disabled={blockedReason !== null}
            onClick={() => {
              setSent(null)
              setOpen(true)
            }}
          >
            Email invoice
          </Button>
          {blockedReason && <p className="text-sm text-muted-foreground">{blockedReason}</p>}
        </div>
      )}
      {open && (
        <form action={action} className="flex max-w-2xl flex-col gap-4 rounded-lg border p-4">
          <h3 className="font-medium">Email invoice</h3>
          <div className={field}>
            <Label htmlFor="email-to">To</Label>
            <Input
              id="email-to"
              name="to"
              value={values.to}
              onChange={set('to')}
              aria-invalid={!!fe.to}
              aria-describedby={fe.to ? 'email-to-error' : 'email-to-hint'}
            />
            <p id="email-to-hint" className="text-xs text-muted-foreground">
              Separate addresses with commas. Up to 5.
              {missingBillingEmail && ' Add a billing email to this client to fill this in next time.'}
            </p>
            <FieldError id="email-to-error" message={fe.to} />
          </div>
          <div className={field}>
            <Label htmlFor="email-cc">CC</Label>
            <Input id="email-cc" name="cc" value={values.cc} onChange={set('cc')} aria-invalid={!!fe.cc} aria-describedby={fe.cc ? 'email-cc-error' : undefined} />
            <FieldError id="email-cc-error" message={fe.cc} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="copyMe"
              checked={values.copyMe}
              onChange={(e) => setValues((v) => ({ ...v, copyMe: e.target.checked }))}
            />
            Send me a copy
          </label>
          <div className={field}>
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              name="subject"
              value={values.subject}
              onChange={set('subject')}
              maxLength={200}
              aria-invalid={!!fe.subject}
              aria-describedby={fe.subject ? 'email-subject-error' : undefined}
            />
            <FieldError id="email-subject-error" message={fe.subject} />
          </div>
          <div className={field}>
            <Label htmlFor="email-body">Message</Label>
            <textarea
              id="email-body"
              name="body"
              rows={10}
              maxLength={5000}
              value={values.body}
              onChange={set('body')}
              aria-invalid={!!fe.body}
              aria-describedby={fe.body ? 'email-body-error' : undefined}
              className={area}
            />
            <FieldError id="email-body-error" message={fe.body} />
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <dt>From</dt>
            <dd data-testid="email-from">{defaults.from}</dd>
            <dt>Replies go to</dt>
            <dd data-testid="email-reply-to">{defaults.replyTo ?? 'Nobody (add a contact email in Settings)'}</dd>
            <dt>Attached</dt>
            <dd>{attachmentName}</dd>
          </dl>
          {state && !state.ok && !state.fieldErrors && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          <div className="flex gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? 'Sending…' : 'Send'}
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
