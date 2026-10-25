# Personas and user stories

## Developer with two agent sessions
**When** Claude is modifying a component and Codex is implementing server logic, **I want** a single glanceable status panel, **so that** I don't repeatedly switch editor windows.
Acceptance: show 2 named sessions + state + workspace, separate unavailable metrics, updated timestamps.

## Reviewer of agent work
**When** an agent says it finished, **I want** verified tests and changed files to be distinguished from its self-reported completion, **so that** I know if I should merge or rerun checks.
Acceptance (future): never display 'Verified' when tests were not run or evidence is missing; show date, tool and scope.

## Resource-constrained laptop owner
**When** multiple agents are compiling at once, **I want** CPU and RAM pressure without leaving my code editor, **so that** I can choose to postpone another job.
Acceptance: update 2–5 seconds; no persistent elevated privileges; no invented process attribution.

## Privacy-conscious engineer
**When** I connect Claude Code, **I want** to see exactly what is read and how to undo it, **so that** I do not expose my company's code.
Acceptance: explicit hook preview, local minimal event schema, reversible setup, privacy information accessible from Settings.

## Gaming mode user (future)
**When** I play a game in windowed or borderless mode, **I want** an optional unobtrusive FPS display, **so that** I can see hardware health without stealing focus.
Acceptance: no unrequested DLL injection; strict opt-in; gracefully disabled on unsupported games; no promises about exclusive fullscreen.
