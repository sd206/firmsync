# Launch Team Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up FirmSync's AI launch team in the repo: a team charter, four specialist role files, approval prompts, the go-live checklist and a Monday status task.

**Architecture:** Plain files in the FirmSync repo (CLAUDE.md, `.claude/agents/*.md`, `.claude/settings.json`, `launch/checklist.md`) plus one local scheduled task. A small Node check script (`scripts/check-team-setup.mjs`) is the test: it fails until every required piece exists with the required content, and it guards the setup against later drift.

**Tech Stack:** Markdown, Claude Code agent and settings files, Node 22 (check script), the desktop app's local scheduled tasks.

**Spec:** `docs/superpowers/specs/2026-11-17-launch-team-design.md` (read with `launch/decisions.md`).

## Global Constraints

- Launch manager = the owner's main session in the FirmSync folder, defined by CLAUDE.md (no agent file).
- Role files (exact names): `.claude/agents/developer.md`, `reviewer.md`, `copy-writer.md` (Website & copy writer), `support-writer.md`.
- The owner approves: merges and pushes, production changes, anything published or sent, purchases, accounts, legal text, prices and offers.
- Standing rules: commit/push/merge only when asked, on branches; production migrations only after `--dry-run` and a yes; no secrets typed into production sites; public material only uses the fictional demo firm; don't kill all node processes.
- Roles read `launch/decisions.md` before work touching pricing, offers or positioning.
- Website is in Framer; the writer never edits the live Framer site; copy goes to `marketing/website/`.
- Weekly status writes only `launch/status/YYYY-MM-DD.md`, never commits; Monday morning.
- Reviewer pass required for code touching money, sign-in, permissions, data deletion or production setup.

## Review Focus

1. A role file whose frontmatter is malformed is silently ignored by Claude Code — the check script parses every role's frontmatter (Task 1/3).
2. The Reviewer can still edit if its `tools` list is omitted (omitted = all tools) — the check requires an explicit list with no Edit/Write/NotebookEdit (Task 3).
3. Ask rules that don't match how commands are actually typed (`npx supabase db push`, PowerShell) don't prompt — the check requires each variant (Task 4).
4. A checklist item missing its owner or status makes "what's waiting on me" wrong — the check validates every item (Task 5).
5. The status task committing or editing other files would break the approval rules — its prompt says write-only and the check verifies the prompt says so (Task 6).

---

### Task 1: The setup check (red first)

**Files:**
- Create: `scripts/check-team-setup.mjs`
- Modify: `package.json` (script `"check:team": "node scripts/check-team-setup.mjs"`)

**Interfaces:**
- Produces: `npm run check:team` — prints one line per failed check and exits 1, or prints `team setup OK` and exits 0. No dependencies beyond Node built-ins.

Checks (all must pass):
- `CLAUDE.md` exists and has headings `## What FirmSync is`, `## Where things are`, `## Standing rules`, `## Always ask the owner`, `## How the team works`, `## Launch manager`.
- Each of the four role files exists, has YAML frontmatter with `name` equal to its file name (without `.md`), a non-empty `description`, and an explicit `tools` line; `reviewer` has no `Edit`, `Write` or `NotebookEdit`; each body contains `launch/decisions.md` and `CLAUDE.md`.
- `.claude/settings.json` parses and `permissions.ask` contains every entry in the Task 4 list.
- `launch/checklist.md` has exactly 19 numbered items; each item line contains `Owner:`, `Status:` and `Depends:`.
- `launch/status/weekly-status-prompt.md` exists and contains `Do not commit` and `Only create launch/status/`.

- [ ] **Step 1: Write the script and the npm script.**
- [ ] **Step 2: Run** `npm run check:team` — Expected: exit 1, failures listing CLAUDE.md, the four roles, settings, checklist and the status prompt.
- [ ] **Step 3: Commit** — `chore: add launch team setup check`

---

### Task 2: Team charter (CLAUDE.md)

**Files:** Create: `CLAUDE.md` (repo root)

Content, under the six headings from Task 1, short and plain:
- **What FirmSync is:** one paragraph (multi-tenant time-to-cash app for consulting firms under 50 people; Next.js + Supabase; live at firmsync.vercel.app, which becomes test once the custom domain launches), pointers to `README.md`, `docs/ARCHITECTURE.md`, `launch/decisions.md`.
- **Where things are:** the folder map from spec §4.
- **Standing rules:** Global Constraints' standing rules, verbatim.
- **Always ask the owner:** the approvals list.
- **How the team works:** spec §6 steps 1–6; roles table (name, file, does); Reviewer-pass rule; specialists start as new desktop sessions from a brief naming the role file, checklist item number, files, and done-definition; code on its own branch/worktree; writing in `marketing/` or `launch/` on a branch.
- **Launch manager:** what the main session does when the owner opens FirmSync: read `launch/checklist.md` and the latest `launch/status/`, say what's waiting on the owner, propose the next ready item; brief template (role, item, context files, scope, done, what to ask about).

- [ ] **Step 1: Write CLAUDE.md.**
- [ ] **Step 2: Run** `npm run check:team` — Expected: CLAUDE.md checks pass; others still fail.
- [ ] **Step 3: Commit** — `docs: team charter for the AI launch team`

---

### Task 3: Role files

**Files:** Create: `.claude/agents/developer.md`, `reviewer.md`, `copy-writer.md`, `support-writer.md`

Each: frontmatter (`name`, `description` starting with when to use it, `tools`); body sections **Read first** (CLAUDE.md, `launch/decisions.md`, plus role-specific), **Your job**, **Never without the owner**, **Done means**.
- `developer` — tools: all the usual (Read, Edit, Write, Bash, PowerShell, Glob, Grep, Skill); reads `docs/ARCHITECTURE.md` and the relevant spec; follows design → plan → build (test-first) → final review using the superpowers skills; done = branch with green lint/typecheck/unit/integration/e2e and a report.
- `reviewer` — tools: Read, Glob, Grep, Bash (read-only commands only, stated in the body); reviews a branch against its spec/plan; reports Critical/Important/Minor with file:line and failure scenario; never edits.
- `copy-writer` — tools: Read, Edit, Write, Glob, Grep, WebSearch, WebFetch; writes only in `marketing/` and `launch/` (stated; tools can't scope paths); voice: plain, confident, for owners of small consulting firms; prices and claims only from the decisions log; website copy one file per page in `marketing/website/` with sections, headlines, body, buttons with exact links (`app.<domain>/signup?plan=…`), image/screenshot requests; never edits the live Framer site.
- `support-writer` — tools: Read, Edit, Write, Glob, Grep; reads README and the app's pages for real behaviour; writes help articles as a Framer CMS import file (CSV: Title, Slug, Category, Summary, Body) in `marketing/website/help/`; drafts replies to pasted support emails; never replies to customers.

- [ ] **Step 1: Write the four files.**
- [ ] **Step 2: Run** `npm run check:team` — Expected: role checks pass.
- [ ] **Step 3: Commit** — `chore: role files for the launch team`

---

### Task 4: Approval prompts

**Files:** Create: `.claude/settings.json` (project, shared; `settings.local.json` stays personal and ignored). Use the `update-config` skill for the exact format.

`permissions.ask` must contain:
`Bash(git push:*)`, `PowerShell(git push:*)`, `Bash(git merge:*)`, `PowerShell(git merge:*)`, `Bash(npx supabase db push:*)`, `Bash(supabase db push:*)`, `PowerShell(npx supabase db push:*)`, `Bash(npx vercel:*)`, `Bash(vercel:*)`.

- [ ] **Step 1: Write settings.json** (only `permissions.ask`; nothing else).
- [ ] **Step 2: Run** `npm run check:team` — Expected: settings check passes.
- [ ] **Step 3: Commit** — `chore: ask before pushes, merges and production changes`

---

### Task 5: Go-live checklist

**Files:** Create: `launch/checklist.md`

The 19 items of spec §7, in its groups, numbered 1–19, one line each in the form `N. <item> — Owner: <role or You> · Depends: <items or —> · Status: <Not started | Waiting on you | In progress | Done>`, followed by an indented note line where the spec has detail. Starting status: all `Not started`, except 1 (`Waiting on you` — Stripe account), 6 (`Waiting on you` — Framer), 10 (`Waiting on you` — domain), 11, 12, 14 (`Waiting on you`). A header explains the statuses and that the launch manager updates it.

- [ ] **Step 1: Write the checklist.**
- [ ] **Step 2: Run** `npm run check:team` — Expected: checklist check passes.
- [ ] **Step 3: Commit** — `docs: go-live checklist`

---

### Task 6: Monday status

**Files:** Create: `launch/status/weekly-status-prompt.md`, `launch/status/README.md`

- Prompt: read `launch/checklist.md`, `launch/decisions.md` and `git log --since="7 days ago"`; write `launch/status/<today>.md` with sections Done this week, In progress, Waiting on you, Next up. It contains these exact sentences: `Only create launch/status/<today's date>.md.` and `Do not commit, push, or change any other file.`
- Create the scheduled task with the desktop app's local scheduled-tasks tool: name `firmsync-weekly-status`, every Monday 08:00 local, working folder `C:\Users\santo\Documents\FirmSync`, prompt = the file's content. If the tool can't set a working folder, the prompt starts with `cd` to it.

- [ ] **Step 1: Write the two files.**
- [ ] **Step 2: Run** `npm run check:team` — Expected: `team setup OK`, exit 0.
- [ ] **Step 3: Create the scheduled task**; list scheduled tasks — Expected: `firmsync-weekly-status` listed with the Monday schedule.
- [ ] **Step 4: Run it once now** (run-now) — Expected: `launch/status/2026-11-17.md` (or today's date) exists; `git status` shows only that new file.
- [ ] **Step 5: Commit** the prompt, README and first status — `chore: Monday status for the launch team`

---

### Task 7: Pointers and final check

**Files:** Modify: `README.md` (short "Working with the AI launch team" section pointing to CLAUDE.md, `launch/checklist.md`, `launch/decisions.md`)

- [ ] **Step 1: Add the README section.**
- [ ] **Step 2: Run** `npm run check:team && npm run lint` — Expected: `team setup OK`; lint clean.
- [ ] **Step 3: Commit** — `docs: point to the launch team`
