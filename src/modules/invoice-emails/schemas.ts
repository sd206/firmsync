import { z } from 'zod'
import { DEFAULT_BODY, DEFAULT_SUBJECT } from './template'

/** Blank, or the same as the built-in default, is stored as null so later default changes apply. */
const orDefault = (value: string, fallback: string): string | null => (value === '' || value === fallback ? null : value)

export const emailTemplateSchema = z.object({
  subject: z
    .string()
    .trim()
    .max(200, 'Keep the subject to 200 characters or fewer.')
    .refine((v) => !/[\r\n]/.test(v), 'Keep the subject to one line.')
    .transform((v) => orDefault(v, DEFAULT_SUBJECT)),
  body: z
    .string()
    .transform((v) => v.replace(/\r\n/g, '\n').trim())
    .pipe(z.string().max(5000, 'Keep the message to 5,000 characters or fewer.'))
    .transform((v) => orDefault(v, DEFAULT_BODY)),
})

export type EmailTemplateInput = z.infer<typeof emailTemplateSchema>
