/**
 * Start the production Next server, axe-scan the shell, exit non-zero on violations.
 *
 * Usage (from frontend/): pnpm a11y
 * Expects a prior `pnpm build`. Installs Chromium on first run via Playwright.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const PORT = Number(process.env.A11Y_PORT ?? 3010);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const FRONTEND_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

async function portFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function waitForServer(url, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status > 0) {
        return;
      }
    } catch {
      // retry
    }
    await delay(500);
  }
  throw new Error(`Server did not become ready at ${url}`);
}

function stopProcessTree(child) {
  if (!child.pid) {
    return;
  }
  try {
    // Spawned with detached:true so pid is the process-group leader.
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      // already gone
    }
  }
}

async function forceKillProcessTree(child) {
  if (!child.pid) {
    return;
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      // already gone
    }
  }
}

async function main() {
  if (!(await portFree(PORT))) {
    throw new Error(`Port ${PORT} is already in use`);
  }

  const child = spawn(
    'pnpm',
    ['exec', 'next', 'start', '-H', '127.0.0.1', '-p', String(PORT)],
    {
      cwd: FRONTEND_ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        HOSTNAME: '127.0.0.1',
        // Upstream unused for shell chrome a11y; health may show an error state.
        API_URL: process.env.API_URL ?? 'http://127.0.0.1:9',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    },
  );

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  let failed = false;
  try {
    await waitForServer(BASE_URL);

    const routes = ['/', '/login', '/signup', '/account', '/settings'];
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    for (const route of routes) {
      const page = await context.newPage();
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      await page.close();

      if (results.violations.length > 0) {
        failed = true;
        console.error(`Accessibility violations on ${route}:`);
        for (const violation of results.violations) {
          console.error(`\n[${violation.id}] ${violation.help}`);
          console.error(`  impact: ${violation.impact}`);
          console.error(`  ${violation.helpUrl}`);
          for (const node of violation.nodes.slice(0, 5)) {
            console.error(`  - ${node.target.join(' ')}`);
            console.error(`    ${node.failureSummary}`);
          }
        }
        process.exitCode = 1;
      } else {
        console.log(`a11y: no axe violations on ${route}`);
      }
    }

    await context.close();
    await browser.close();
  } catch (err) {
    failed = true;
    process.exitCode = 1;
    throw err;
  } finally {
    stopProcessTree(child);
    await delay(400);
    await forceKillProcessTree(child);
    if (failed && stderr) {
      console.error(stderr);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
