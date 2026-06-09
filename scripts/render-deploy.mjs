#!/usr/bin/env node
// Trigger a Render deploy of the backend (uganda-dashboard-api) via its
// Deploy Hook. The hook URL is a deploy-only secret — it can ONLY kick a
// deploy of this one service, nothing else — so it's the smallest-blast-radius
// way to let an agent/CI start a deploy without a full Render API key.
//
// Setup (one-time):
//   1. Render dashboard → uganda-dashboard-api → Settings → Deploy Hook → copy URL
//   2. Add to .env.local (gitignored):  RENDER_DEPLOY_HOOK=https://api.render.com/deploy/srv-...?key=...
//
// Run:  npm run deploy:api   (wraps this in `dotenv -e .env.local -- node ...`)
//
// Render's autoDeployTrigger is `off` (CLAUDE.md §1 guardrail), so this is the
// supported way to deploy `main` on demand. It deploys whatever commit is
// currently at the tip of the service's branch (main).

const hook = process.env.RENDER_DEPLOY_HOOK;

if (!hook || !hook.trim()) {
  console.error(
    '✗ RENDER_DEPLOY_HOOK is not set.\n' +
      '  Add it to .env.local: RENDER_DEPLOY_HOOK=https://api.render.com/deploy/srv-...?key=...\n' +
      '  (Render dashboard → uganda-dashboard-api → Settings → Deploy Hook)',
  );
  process.exit(1);
}

if (!/^https:\/\/api\.render\.com\/deploy\/srv-[\w-]+\?key=/.test(hook.trim())) {
  console.error(
    '✗ RENDER_DEPLOY_HOOK does not look like a Render deploy hook URL.\n' +
      '  Expected: https://api.render.com/deploy/srv-<id>?key=<key>',
  );
  process.exit(1);
}

try {
  // A deploy hook accepts POST and returns a small JSON body with the deploy id.
  const res = await fetch(hook.trim(), { method: 'POST' });
  const text = await res.text();
  if (!res.ok) {
    console.error(`✗ Render deploy hook returned HTTP ${res.status}: ${text}`);
    process.exit(1);
  }
  let deployId = '';
  try {
    deployId = JSON.parse(text)?.deploy?.id ?? '';
  } catch {
    /* body may be empty or non-JSON depending on Render's response */
  }
  console.log(
    `✓ Render deploy triggered${deployId ? ` (${deployId})` : ''}.\n` +
      '  Track it: Render dashboard → uganda-dashboard-api → Events,\n' +
      '  or via the Render MCP list_deploys/get_deploy.',
  );
  process.exit(0);
} catch (err) {
  console.error(`✗ Failed to call the Render deploy hook: ${err?.message ?? err}`);
  process.exit(1);
}
