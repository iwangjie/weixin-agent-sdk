#!/usr/bin/env node

/**
 * WeChat + ACP (Agent Client Protocol) adapter.
 *
 * Usage:
 *   npx weixin-acp login                                    # QR-code login
 *   npx weixin-acp [--cwd <dir>] claude-code                # Start with Claude Code
 *   npx weixin-acp [--cwd <dir>] codex                      # Start with Codex
 *   npx weixin-acp [--cwd <dir>] start -- <command> [args...] # Start with custom agent
 *
 * Examples:
 *   npx weixin-acp --cwd /my/project claude-code
 *   npx weixin-acp --cwd /my/project start -- node ./my-agent.js
 */

import * as path from "node:path";
import { isLoggedIn, login, logout, start } from "weixin-agent-sdk";

import { AcpAgent } from "./src/acp-agent.js";

/** Built-in agent shortcuts */
const BUILTIN_AGENTS: Record<string, { command: string }> = {
  "claude-code": { command: "claude-agent-acp" },
  codex: { command: "codex-acp" },
};

/**
 * Parse `--cwd <dir>` from the given argv, returning the resolved cwd
 * and the remaining arguments with the flag removed.
 */
function parseCwd(argv: string[]): { cwd: string | undefined; rest: string[] } {
  const rest: string[] = [];
  let cwd: string | undefined;
  let i = 0;
  while (i < argv.length) {
    if (argv[i] === "--cwd" && i + 1 < argv.length) {
      cwd = path.resolve(argv[i + 1]);
      i += 2;
    } else {
      rest.push(argv[i]);
      i += 1;
    }
  }
  return { cwd, rest };
}

// Strip "node" and the script path from process.argv, then parse flags.
const { cwd, rest: args } = parseCwd(process.argv.slice(2));
const command = args[0];

async function ensureLoggedIn() {
  if (!isLoggedIn()) {
    console.log("未检测到登录信息，请先扫码登录微信\n");
    await login();
  }
}

async function startAgent(acpCommand: string, acpArgs: string[] = []) {
  await ensureLoggedIn();

  const agent = new AcpAgent({ command: acpCommand, args: acpArgs, cwd });

  const ac = new AbortController();
  process.on("SIGINT", () => {
    console.log("\n正在停止...");
    agent.dispose();
    ac.abort();
  });
  process.on("SIGTERM", () => {
    agent.dispose();
    ac.abort();
  });

  return start(agent, { abortSignal: ac.signal });
}

async function main() {
  if (command === "login") {
    await login();
    return;
  }

  if (command === "logout") {
    logout();
    return;
  }

  if (command === "start") {
    // Find "--" in the original process.argv (after stripping node + script).
    // We search in process.argv directly so that "--" inside acpArgs is preserved.
    const ddIndex = args.indexOf("--");
    if (ddIndex === -1 || ddIndex + 1 >= args.length) {
      console.error("错误: 请在 -- 后指定 ACP agent 启动命令");
      console.error("示例: npx weixin-acp start -- codex-acp");
      process.exit(1);
    }

    const [acpCommand, ...acpArgs] = args.slice(ddIndex + 1);
    await startAgent(acpCommand, acpArgs);
    return;
  }

  if (command && command in BUILTIN_AGENTS) {
    const { command: acpCommand } = BUILTIN_AGENTS[command];
    await startAgent(acpCommand);
    return;
  }

  console.log(`weixin-acp — 微信 + ACP 适配器

用法:
  npx weixin-acp login                                       扫码登录微信
  npx weixin-acp logout                                      退出登录
  npx weixin-acp [--cwd <工作目录>] claude-code              使用 Claude Code
  npx weixin-acp [--cwd <工作目录>] codex                    使用 Codex
  npx weixin-acp [--cwd <工作目录>] start -- <command> [args...]  使用自定义 agent

示例:
  npx weixin-acp --cwd /my/project claude-code
  npx weixin-acp --cwd /my/project start -- node ./my-agent.js`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
