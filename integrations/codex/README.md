# Codex IDE activity

Use your normal Codex sidebar while systrudel plays locally. This optional
integration observes turn, tool and subagent lifecycle events. It does not need
an account API key or require tasks through `codex exec`.

## Set up your clone

1. From the systrudel project folder, run:

   ```powershell
   npm run agent:setup
   ```

   This creates an ignored `.codex/hooks.json` with absolute script paths for
   your checkout. Existing files are left unchanged. To merge into an existing
   configuration, use [hooks.example.json](hooks.example.json), replacing
   `__SYSTRUDEL_ROOT__` with your checkout's absolute path.
2. Open this folder in your IDE with a Codex client that supports lifecycle
   hooks. Review [`scripts/codex-hook.js`](../../scripts/codex-hook.js), then
   review/trust its definitions using Codex's controls. The project configuration
   layer must also be trusted.
3. If the IDE lacks hook review controls, OpenAI documents `/hooks` in the
   interactive CLI. Run `codex` in this same folder, use `/hooks` to review the
   definitions, then exit. Subsequent work stays in the IDE. systrudel does not
   grant trust automatically.
4. Reload the IDE's Codex session, keep `npm run dev` running, and send an ordinary
   request in the sidebar. The dashboard should show **Working**, then **Idle**.

Hooks apply to sessions in the configured workspace. For another work project,
merge these hook entries into that project's configuration, keeping script paths
pointed at this systrudel checkout, then review them there. Avoid duplicate feeds
for the same session. If the checkout moves, update absolute hook paths and
review the changed definitions again.

## Check the connection

```powershell
npm run agent:check
```

This asks a local Codex backend to list hooks without starting an AI task or
changing trust. If it cannot start `codex`, set `SYSTRUDEL_CODEX_EXECUTABLE` in
`.env` to the native backend executable used by your installed client. Diagnostics
require a backend supporting `hooks/list`; they cannot prove an already-running
IDE session loaded the configuration.

- **Companion connected, waiting for IDE activity:** telemetry is reachable but
  no IDE event arrived. Check installation, trust, workspace root and IDE reload,
  then start a new turn.
- **No hooks discovered:** run setup; existing configurations may need a merge.
- **Untrusted/disabled hooks:** review them in Codex. Changed commands need review.
- **Different Windows drive-letter casing:** open the project using the same path
  spelling used during hook review. Diagnostics check both spellings and save
  a private report in `.local/codex-hook-check.json`.
- **Unknown after a quiet turn:** an unconfirmed open turn expires after 15 minutes;
  a new lifecycle event can restore activity.

## What the indicator means

The panel shows open turns, running tools, recent tool calls and observed
subagents. **Working** means an observed turn remains open, including waiting
for approval or a tool. It is not a live inference measurement. Token rates,
streamed output and hidden reasoning are unavailable through these hooks.

The handler writes counts, timestamps and opaque IDs to `.local/codex-inbox/`.
It discards prompt/tool payloads and never reads transcripts. The companion
checks every 250 ms and deletes consumed entries. The queue is bounded to
roughly 512 entries; entries expire after 15 minutes. Write failures remain
advisory so they do not block your work.

Reference: [OpenAI hook configuration and review](https://learn.chatgpt.com/docs/hooks).
