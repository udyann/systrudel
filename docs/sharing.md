# Sharing systrudel

Share the [GitHub repository](https://github.com/udyann/systrudel) and a short
demo recording. Judges can inspect the code and run the full app locally;
the recording shows the experience before installation.

[GitHub Pages serves static files](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).
It cannot run the Node companion or collect visitors' system workload. Keep
the app ready on your laptop for the demo. No installer or hosted full version
is included yet.

## Review before uploading

From the project folder:

```powershell
npm test
npm run build
git status --short
git check-ignore .env .local/telemetry.json .codex/hooks.json node_modules dist
```

The last command should list all five paths as ignored. Share `.env.example`,
the lockfile and `integrations/codex/hooks.example.json`. Local `.env`, `.local/`,
`.codex/`, IDE settings, caches, builds and activity exports should stay private.
Ignore rules do not remove files that were already committed.

Add a real screenshot or recording link near the README's top when available.
Avoid showing private code, prompts, notifications or browser tabs in the demo.

## Upload when ready

These are manual instructions; preparation does not commit or push anything.
If your local folder has not been initialized as a Git repository:

```powershell
git init -b main
git remote add origin https://github.com/udyann/systrudel.git
```

Skip initialization if Git is already configured; inspect `git remote -v` before
adding a remote. Stage the intended files and inspect the list:

```powershell
git add .
git diff --cached --stat
git diff --cached --name-only
```

Verify that `.env`, `.local/`, `.codex/`, `node_modules/` and `dist/` are absent.
When you choose to publish:

```powershell
git commit -m "Prepare systrudel hackathon prototype"
git push -u origin HEAD
```

Complete GitHub sign-in if prompted. Never put passwords or tokens in the remote
URL. If Git asks for an author identity, set `git config user.name "YOUR NAME"`
and `git config user.email "YOUR COMMIT EMAIL"`; a GitHub no-reply email is an
option. Confirm the files and README appear on GitHub afterward. If the remote
gains new commits before upload, fetch and reconcile them instead of force-pushing.
See [GitHub's walkthrough](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github).

The project currently has no license for original code, as requested. Check
the hackathon's own submission requirements before choosing a license.

## Test a fresh setup

Clone into another folder or computer and follow the README: `npm ci`, copy
`.env.example` to `.env`, then `npm run dev`. Stop the original app first when
using the same computer, so default ports are free. Confirm music works before
adding optional camera, weather and Codex inputs.

Each clone creates and reviews its own Codex hooks with `npm run agent:setup`.
Judges can try music and other inputs without Codex.

## A short demo

1. Explain the pipeline: ongoing work becomes six smoothed controls, then music.
2. Show typing and pausing with Windows activity enabled. Point out gradual
   changes in energy, density and human melody gain.
3. Start an ordinary Codex IDE turn. Show Working, the open-turn bonus, and
   balance shifting toward the agent trombone.
4. Show a normal build or download, allowing about 30 seconds for classification.
   A change in light or context can demonstrate environmental inputs too.
5. Explain that playback is live and uses aggregate local activity.

Capture system audio and listen to the recording before submission. Preload
instruments before presenting and keep a recording as a fallback. The Original
image demo uses synths without remote instrument downloads if Base song's
asset hosts are unreachable.

Submit the repository URL, recording URL, one-sentence description, and
**Windows recommended; runs locally with Node.js**.
