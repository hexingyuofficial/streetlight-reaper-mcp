#!/usr/bin/env node
// Beginner-friendly installer wrapper.
//
// This intentionally delegates to existing commands instead of duplicating
// setup/build logic:
//   npm install -> npm run build -> npm run setup
//
// macOS is verified. Windows is generated as experimental until a live
// REAPER smoke proves the path end-to-end.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultReaperResourcePath,
  launcherInstallPath,
} from "./setup.mjs";

export function supportedInstallPlatform(platform) {
  if (platform === "darwin") return "macOS";
  if (platform === "win32") return "Windows (experimental)";
  return null;
}

export function buildInstallPlan({
  platform,
  repoAbsPath,
  homeDir,
  env = process.env,
}) {
  const label = supportedInstallPlatform(platform);
  if (!label) {
    throw new Error(
      `Streetlight beginner install supports macOS and experimental Windows only, got ${platform}.`,
    );
  }
  const reaperResourcePath = defaultReaperResourcePath(platform, homeDir, env);
  return {
    platformLabel: label,
    repoAbsPath,
    reaperResourcePath,
    launcherPath: launcherInstallPath(reaperResourcePath),
    setupOutDir: path.join(repoAbsPath, "setup-out"),
    commands: [
      ["npm", ["install"]],
      ["npm", ["run", "build"]],
      ["npm", ["run", "setup"]],
    ],
  };
}

function commandName(cmd) {
  if (process.platform === "win32" && cmd === "npm") return "npm.cmd";
  return cmd;
}

function run(cmd, args, { cwd }) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandName(cmd), args, {
      cwd,
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
      }
    });
  });
}

function openPath(targetPath) {
  if (!existsSync(targetPath)) return Promise.resolve(false);
  if (process.platform === "darwin") {
    return run("open", [targetPath], { cwd: process.cwd() }).then(() => true);
  }
  if (process.platform === "win32") {
    return new Promise((resolve) => {
      const child = spawn("explorer.exe", [targetPath], {
        stdio: "ignore",
        detached: true,
      });
      child.on("error", () => resolve(false));
      child.on("exit", () => resolve(true));
      child.unref();
    });
  }
  return Promise.resolve(false);
}

function printHeader(plan) {
  process.stdout.write(`\nStreetlight beginner install\n`);
  process.stdout.write(`Platform: ${plan.platformLabel}\n`);
  process.stdout.write(`Repo:     ${plan.repoAbsPath}\n\n`);
  if (process.platform === "win32") {
    process.stdout.write(
      `Windows note: this installer is experimental until a live REAPER smoke passes.\n\n`,
    );
  }
}

function printNextSteps(plan) {
  process.stdout.write(`\nStreetlight install finished.\n\n`);
  process.stdout.write(`Generated REAPER launcher:\n  ${plan.launcherPath}\n\n`);
  process.stdout.write(`Generated MCP config snippets:\n  ${plan.setupOutDir}\n\n`);
  process.stdout.write(`Next manual steps:\n`);
  process.stdout.write(`  1. Open REAPER.\n`);
  process.stdout.write(`  2. Actions -> Show action list -> ReaScript: Load... -> pick:\n`);
  process.stdout.write(`     ${plan.launcherPath}\n`);
  process.stdout.write(`  3. Click Run. REAPER console should print "bridge ready".\n`);
  process.stdout.write(`  4. Copy the file for your MCP client from setup-out/ into that client's config.\n`);
  process.stdout.write(`  5. Restart the MCP client, then ask it to call Streetlight ping.\n\n`);
  process.stdout.write(`Detailed guide: docs/INSTALL.md\n`);
}

async function main() {
  const repoAbsPath = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const plan = buildInstallPlan({
    platform: process.platform,
    repoAbsPath,
    homeDir: os.homedir(),
    env: process.env,
  });
  printHeader(plan);

  for (const [cmd, args] of plan.commands) {
    process.stdout.write(`\n==> ${cmd} ${args.join(" ")}\n`);
    await run(cmd, args, { cwd: repoAbsPath });
  }

  await openPath(path.dirname(plan.launcherPath));
  await openPath(plan.setupOutDir);
  printNextSteps(plan);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    process.stderr.write(`\n[streetlight install] ${e?.stack ?? e}\n`);
    process.stderr.write(`\nInstall stopped. Fix the error above and run this installer again.\n`);
    process.exit(1);
  });
}

