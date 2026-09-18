# Codex IDE integration

PhotoSynthRudel targets your normal Codex IDE sidebar workflow. Start the music
app with `npm run dev`, then work in Codex as usual. No `codex exec` task or
account API connection is required for this integration.

## One-time setup for this workspace

The project hook configuration is `.codex/hooks.json`. It calls
`scripts/codex-hook.js`, which writes aggregate lifecycle events to a local inbox
read by the PhotoSynthRudel companion. The definition is also kept in
`hooks.example.json`. It requires no HTTP token or network connection.

1. Open `C:\photosynthrudel` in your IDE and reload the Codex extension/session
   so it discovers the project configuration.
2. Review and trust the PhotoSynthRudel hooks in Codex's hook controls if your
   installed extension exposes them. New hook definitions are skipped until
   trusted; PhotoSynthRudel does not grant that trust on your behalf.
3. Keep `npm run dev` running. Send an ordinary request in the Codex sidebar
   and check the dashboard's agent panel while it runs.

OpenAI documents `/hooks` in the interactive CLI as the hook-review interface.
If your extension does not expose review controls, that is a one-time setup
option: open `codex` in this workspace, use `/hooks`, and exit after reviewing
the definitions. Your subsequent work stays in the IDE; do not run tasks through
`codex exec` for this integration.

Project-local hooks apply only when the project configuration layer is trusted.
This installation covers Codex sessions rooted in this workspace. For another
workspace, install the same hook definitions there with the script path pointing
back to this PhotoSynthRudel checkout. Do not enable both a second event bridge
and these hooks for the same session.

## Check IDE hooks

Run `npm run agent:check` in this project. This asks the installed local Codex
backend to list hooks, without launching an AI task or changing configuration.
On Windows it checks both drive-letter spellings. A Codex path-casing issue was
observed here: `c:\photosynthrudel` was trusted while `C:\photosynthrudel` was
untrusted despite identical hook hashes. Both variants have now been repaired
using only the user's existing approvals for these unchanged definitions.

The read-only check writes `.local/codex-hook-check.json`. If the mismatch occurs
again, `python scripts/repair-hook-path-case.py` previews a narrowly scoped
repair based on that fresh report; `--apply` adds only missing path aliases that
match an already-trusted hash and the same physical hook file. It refuses changed
definitions or existing alias decisions. It does not approve new hooks.

If all hooks are trusted but activity has never arrived, reload the IDE extension
and start a normal turn in this workspace. An already-open IDE backend can retain
old configuration. The companion must be running to display updates; hooks fired
while it is offline are queued briefly. A successful hook command alone does not
prove a real IDE session has loaded the hooks.

## Available activity

- User turn starts, completion, and interruption.
- Tool-call starts and completions.
- Observed subagent starts and stops.
- Session lifecycle.

The panel shows Working, Idle, Waiting for IDE activity, or Status unknown, plus
the last event, open turns, running tools, recent tool calls and observed subagents.
Unsupported output/token/reasoning metrics have been removed from this panel.

Working means an observed turn remains open; this can include waiting for approval
or another tool. A quiet turn stays open until Stop, Interrupt or SessionEnd,
with a 15-minute quiet timeout to Unknown when no completion is observed. It is a
lifecycle indicator, not proof the model is generating at that instant. An idle
session does not become disconnected merely because it sends no heartbeats.

The handler stores counts, timestamps and opaque IDs only in
`.local/codex-inbox/`. It does not read transcripts, retain prompts, or store tool
arguments/results. Writes are atomic. The companion checks every 250 ms and
deletes consumed entries. The queue is bounded to roughly 512 entries and entries
older than 15 minutes are discarded. If the companion is offline, hooks still
exit successfully; if the local write itself fails, the hook remains advisory.
`GET /api/snapshot` includes counter-only `hookDiagnostics` for delivery checks.

The installed IDE extension and its bundled Codex backend were inspected for
hook support. Receiving events from your actual IDE session still requires the
trust/reload steps above and an ordinary request from you.

Sources: [shared IDE configuration](https://learn.chatgpt.com/docs/developer-settings?surface=ide),
[Codex lifecycle hooks and trust](https://learn.chatgpt.com/docs/hooks).
