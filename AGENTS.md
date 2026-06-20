# ChamberReserve Agent Guide

Use this file as the first orientation point for implementation work in this repository. ChamberReserve follows TeamPlanner's local-web-app operating style, but its product model is dedicated to environmental chamber reservations.

## Current Status

- The product-level system specification is in `docs/CHAMBER_RESERVE_SYSTEM_SPEC.md`.
- The long-term implementation plan is in `docs/CHAMBER_RESERVE_LONG_TERM_IMPLEMENTATION_PLAN.md`.
- The repository is still in pre-implementation setup. Do not assume application files, scripts, API routes, or tests exist until you verify them.
- The first implementation target is UI/UX foundation for a single temperature-cycle chamber, using local/mock data where needed.
- Server API and SQLite persistence come after the user-facing workflow is validated in the browser.
- The user workflow must already be shaped for future multi-chamber search.

## Goal Execution Policy

- For implementation, configuration, tests, scripts, or operational documents, use the docs-first `/goal` flow unless the user explicitly says otherwise.
- Use a normal turn for questions, review, status reporting, research, or planning-only requests.
- A `/goal` prompt must point to one authoritative start document, define one durable objective, list validation commands, and include a verifiable stop condition.
- Keep the actual `/goal` prompt compact. Put detailed scope and constraints in a Markdown start document.
- Use `docs/GOAL_IMPLEMENTATION_POLICY.md` as the canonical prompt and execution policy.

## Read Order

1. `AGENTS.md`.
2. `docs/CHAMBER_RESERVE_SYSTEM_SPEC.md`.
3. `docs/CHAMBER_RESERVE_LONG_TERM_IMPLEMENTATION_PLAN.md`.
4. `docs/GOAL_IMPLEMENTATION_POLICY.md`.
5. The active phase start document, such as `docs/CHAMBER_RESERVE_PHASE1_FOUNDATION_START.md`.
6. The active phase execution plan, such as `docs/CHAMBER_RESERVE_PHASE1_UI_UX_EXECUTION_PLAN.md`, when it exists.
7. `package.json`, once it exists, for scripts and dependency versions.
8. Application entry points, once they exist.
9. Only then open the specific feature, domain, server, or test file related to the task.

## Do Not Read By Default

- `node_modules/`, `dist/`, `data/*.sqlite`, `*.log`, runtime PID files, and `tmp_validation/`.
- Generated reports or validation artifacts unless the task is about validation results.
- `package-lock.json` unless changing dependencies, auditing lock resolution, or investigating install/build failures.
- Large future UI or server files in full. Search first with `rg`, then read the narrow range that matters.

## Product Rules To Preserve

- The first user action is condition search, not chamber selection.
- Users input test conditions, required blocks, date preference, and size/location intent; the system returns matching chamber candidates.
- The initial chamber model is one temperature-cycle chamber.
- Chamber blocks are a 4 x 3 front projection of the whole chamber.
- Block selection is visual and supports both size-only and exact-location reservation intent.
- Fragmented block allocation is not allowed. If the required shape cannot fit as one contiguous area, do not show the candidate.
- Temperature-cycle reservations can start and end only in 25°C steady access windows.
- Temperature-cycle and fixed-condition chambers do not allow user-defined temperature or humidity.
- Free temperature/humidity chambers allow user-defined values, but simultaneous use requires exact condition equality.
- Reservations use a generated 4-digit PIN for edit/delete. Do not add account management unless explicitly requested.
- No tentative holds. If two users race for the same slot, the first committed reservation wins and the later user must choose again.
- Admin temporary suspension has priority over normal reservations and must show affected reservations before confirmation.
- Reservations may be edited/deleted before use and during use. Completed reservations cannot be deleted.
- Email, Teams, Slack, or other notification integrations are out of scope unless explicitly requested.
- Depth, height, weight, and airflow-clearance constraints are out of scope for the initial system.

## Planned Architecture

Use TeamPlanner's proven local stack as the default unless a later phase document says otherwise:

- React + Vite + TypeScript for the browser UI.
- Tailwind CSS and lucide-react for interface styling and icons.
- Node.js TypeScript server for local API endpoints, starting only in the server/persistence phase.
- SQLite for local persistence, starting only in the server/persistence phase.
- Separate ChamberReserve ports, environment variables, DB paths, logs, and runtime files from TeamPlanner.

Do not copy TeamPlanner domain names, task/Gantt/leave concepts, roles model, or authentication system into ChamberReserve. Reuse architectural patterns, not product concepts.

## Expected Future Module Shape

Exact paths may change during implementation, but keep the boundaries clear:

- App shell: navigation, view selection, top-level state wiring.
- API client: browser-side HTTP calls only.
- Domain logic: chamber suitability, cycle windows, contiguous block fitting, reservation state, and conflict checks.
- Reservation search UI: condition entry, block picker, candidate list, and date shifting.
- Reservation board UI: current and future occupancy by chamber, time, and block.
- Reservation edit UI: common entry point using reservation identifier and 4-digit PIN.
- Admin UI: temporary suspensions and affected-reservation preview.
- Server API: read/write routes, conflict-safe final reservation checks, and admin suspension operations.
- DB layer: schema, seed data, read/write helpers, and migration-safe initialization.

## Editing Guidance

- Keep implementation scoped to the active phase document.
- Preserve the product specification unless the user updates it.
- When the active phase is UI/UX-first, do not add server API, SQLite persistence, live runtime, or production DB behavior unless the phase document explicitly authorizes it.
- Prefer small pure helpers for reservation math and conflict rules before wiring them into React.
- Keep UI behavior and server validation aligned. A client-side candidate must still be rechecked on final reservation commit.
- Do not add external dependencies unless they remove real complexity and are justified in the active phase.
- Treat browser-visible behavior as requiring browser verification before calling it complete.
- The worktree may be dirty. Do not revert existing changes unless explicitly asked.

## Validation Reporting

Report verification as `PASS`, `FAIL`, `BLOCKED`, or `NOT_RUN`.

For implementation phases, expected validation normally includes:

- Focused domain tests for reservation rules.
- Focused API tests for final commit conflict checks.
- `npm run test`, once available.
- `npm run build`, once available.
- Browser proof for UI-impacting changes.

For docs-only preparation, build/test may be `NOT_RUN`, but say so explicitly.

## Search Recipes

- Find product rules: `rg -n "温度サイクル|断片化|PIN|一時利用停止|25°C" docs`
- Find chamber domain logic: `rg -n "cycle|block|reservation|candidate|suspension|pin" src server`
- Find UI labels: `rg -n "予約|チャンバー|ブロック|搬入|搬出|PIN" src`
- Find API routes: `rg -n "/api|reservation|chamber|suspension|request.method" server`
- Find persistence: `rg -n "CREATE TABLE|INSERT|UPDATE|SELECT|reservation|chamber" server`
- Find tests: `rg -n "reservation|candidate|block|cycle|suspension|pin" src server scripts`
