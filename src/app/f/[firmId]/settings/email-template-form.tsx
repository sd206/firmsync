'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRun } from '@/components/use-run'
import type { FormResult } from '@/lib/form'
import { resetEmailTemplateAction, saveEmailTemplateAction } from '@/modules/invoice-emails/actions'
import { DEFAULT_BODY, DEFAULT_SUBJECT, PLACEHOLDERS, unknownPlaceholders } from '@/modules/invoice-emails/template'

type Props = {
  firmId: string
  subject: string | null
  body: string | null
  /** False when this server can't send email yet; the wording can still be prepared. */
  sendingReady: boolean
}

/** Settings › Invoice email: the firm's default subject and message (null = built-in default). */
export function EmailTemplateForm({ firmId, subject, body, sendingReady }: Props) {
  const [subjectText, setSubjectText] = useState(subject ?? DEFAULT_SUBJECT)
  const [bodyText, setBodyText] = useState(body ?? DEFAULT_BODY)
  const [state, action, pending] = useActionState<FormResult | null, FormData>(
    async (_prev, fd) => saveEmailTemplateAction(firmId, fd),
    null,
  )
  const reset = useRun()
  const [resetDone, setResetDone] = useState(false)
  const fe = (state && !state.ok ? state.fieldErrors : undefined) ?? {}
  const unknown = unknownPlaceholders(`${subjectText}\n${bodyText}`)

  return (
    <section aria-labelledby="invoice-email-h" className="mt-10">
      <h2 id="invoice-email-h" className="text-lg font-medium">
        Invoice email
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        The subject and message used when you email an invoice. You can still change them for each email.
      </p>
      {!sendingReady && (
        <p className="mt-2 text-sm text-muted-foreground">Emailing invoices isn&apos;t set up on this server yet.</p>
      )}
      <form action={action} className="mt-3 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invoice-email-subject">Email subject</Label>
          <Input
            id="invoice-email-subject"
            name="subject"
            value={subjectText}
            maxLength={200}
            onChange={(e) => setSubjectText(e.target.value)}
            aria-invalid={!!fe.subject}
          />
          {fe.subject && (
            <p role="alert" className="text-sm text-destructive">
              {fe.subject}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invoice-email-body">Email message</Label>
          <textarea
            id="invoice-email-body"
            name="body"
            rows={10}
            maxLength={5000}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            aria-invalid={!!fe.body}
            className="rounded-lg border border-input bg-card px-2.5 py-1.5 text-sm"
          />
          {fe.body && (
            <p role="alert" className="text-sm text-destructive">
              {fe.body}
            </p>
          )}
        </div>
        {unknown.length > 0 && (
          <p className="text-sm text-destructive" data-testid="unknown-placeholders">
            {unknown.map((u) => `Unknown placeholder ${u}`).join('. ')}. It will be sent exactly as typed.
          </p>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer">Placeholders you can use</summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {PLACEHOLDERS.map((p) => (
              <li key={p.key}>
                <code>{`{${p.key}}`}</code> <span className="text-muted-foreground">{p.label}</span>
              </li>
            ))}
          </ul>
        </details>
        {state && !state.ok && !state.fieldErrors && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        {(state?.ok || resetDone) && !pending && !reset.pending && (
          <p role="status" className="text-sm">
            {resetDone ? 'Email wording reset to the default.' : 'Email wording saved.'}
          </p>
        )}
        {reset.error && (
          <p role="alert" className="text-sm text-destructive">
            {reset.error}
          </p>
        )}
        <div className="flex gap-3">
          <Button type="submit" disabled={pending || reset.pending} onClick={() => setResetDone(false)}>
            {pending ? 'Saving…' : 'Save email'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending || reset.pending}
            onClick={() =>
              reset.run(async () => {
                const r = await resetEmailTemplateAction(firmId)
                if (r.ok) {
                  setSubjectText(DEFAULT_SUBJECT)
                  setBodyText(DEFAULT_BODY)
                  setResetDone(true)
                }
                return r
              })
            }
          >
            Reset to default
          </Button>
        </div>
      </form>
    </section>
  )
}
