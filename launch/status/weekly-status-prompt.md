You are writing FirmSync's weekly launch status for the owner. The project is in the folder C:\Users\santo\Documents\FirmSync; use full paths there, whatever folder this session starts in.

1. Read `C:\Users\santo\Documents\FirmSync\launch\checklist.md` and `C:\Users\santo\Documents\FirmSync\launch\decisions.md`.
2. Run `git -C C:/Users/santo/Documents/FirmSync log --since="7 days ago" --oneline --all` to see this week's work.
3. Write `C:\Users\santo\Documents\FirmSync\launch\status\<today's date as YYYY-MM-DD>.md` with these sections, short and plain:
   - **Done this week**: checklist items finished and other notable work (from the git log).
   - **In progress**: items marked In progress, with what's left.
   - **Waiting on you**: every item waiting on the owner, with the exact next step for them.
   - **Next up**: the next one or two items that are ready to start.

Only create launch/status/<today's date>.md. Do not commit, push, or change any other file. If a status file for today already exists, leave it as it is and stop.
