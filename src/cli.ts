#!/usr/bin/env node

import { Command } from "commander";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { init } from "./commands/init.js";
import { update } from "./commands/update.js";
import { diff } from "./commands/diff.js";
import { watch } from "./commands/watch.js";
import { ask } from "./commands/ask.js";
import { activate } from "./commands/activate.js";
import { truth } from "./commands/truth.js";
import { check } from "./commands/check.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgVersion = (
  JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf-8")) as { version: string }
).version;

const program = new Command();

program
  .name("sourcebook")
  .description(
    "Extract the conventions, constraints, and architectural truths your AI coding agents keep missing."
  )
  .version(pkgVersion);

program
  .command("init")
  .description("Analyze a codebase and generate agent context files")
  .argument("[path]", "Target directory to analyze (same as --dir)")
  .option("-d, --dir <path>", "Target directory to analyze", ".")
  .option(
    "-f, --format <formats>",
    "Output formats (claude,cursor,copilot,agents,all)",
    "claude,agents"
  )
  .option(
    "--budget <tokens>",
    "Max token budget for generated context",
    "4000"
  )
  .option("--dry-run", "Preview findings without writing files")
  .option("--verbose", "Include discoverable context (stack, standard commands, obvious patterns)")
  .action((pathArg, options) => {
    if (pathArg) options.dir = pathArg;
    return init(options);
  });

program
  .command("update")
  .description("Re-analyze and update context files while preserving manual edits")
  .argument("[path]", "Target directory to analyze (same as --dir)")
  .option("-d, --dir <path>", "Target directory to analyze", ".")
  .option(
    "-f, --format <formats>",
    "Output formats (claude,cursor,copilot,agents,all)",
    "claude,agents"
  )
  .option(
    "--budget <tokens>",
    "Max token budget for generated context",
    "4000"
  )
  .action((pathArg, options) => {
    if (pathArg) options.dir = pathArg;
    return update(options);
  });

program
  .command("diff")
  .description("Show what would change if context files were regenerated")
  .argument("[path]", "Target directory to analyze (same as --dir)")
  .option("-d, --dir <path>", "Target directory to analyze", ".")
  .option(
    "-f, --format <formats>",
    "Output format to diff (claude,cursor,copilot)",
    "claude"
  )
  .option(
    "--budget <tokens>",
    "Max token budget for generated context",
    "4000"
  )
  .action((pathArg, options) => {
    if (pathArg) options.dir = pathArg;
    return diff(options);
  });

program
  .command("watch")
  .description("Watch for source file changes and auto-update context files")
  .argument("[path]", "Target directory to watch (same as --dir)")
  .option("-d, --dir <path>", "Target directory to watch", ".")
  .option(
    "-f, --format <formats>",
    "Output formats (claude,cursor,copilot,agents,all)",
    "claude"
  )
  .option(
    "--budget <tokens>",
    "Max token budget for generated context",
    "4000"
  )
  .action((pathArg, options) => {
    if (pathArg) options.dir = pathArg;
    return watch(options);
  });

program
  .command("ask")
  .description("Query your codebase knowledge in natural language")
  .argument("<question>", "Natural language question about your codebase")
  .option("-d, --dir <path>", "Target directory to analyze", ".")
  .option("--json", "Output as JSON")
  .action((question, options) => ask(question, options));

program
  .command("truth")
  .description("Generate a Repo Truth Map — see where your codebase actually lives")
  .argument("[path]", "Target directory to analyze (same as --dir)")
  .option("-d, --dir <path>", "Target directory to analyze", ".")
  .action((pathArg, options) => {
    if (pathArg) options.dir = pathArg;
    return truth(options);
  });

program
  .command("check")
  .description("Check a git diff for potentially missing file updates")
  .argument("[path]", "Target directory to analyze (same as --dir)")
  .option("-d, --dir <path>", "Target directory to analyze", ".")
  .option("--ai", "Run AI-powered analysis on top of rules-based checks")
  .option("--json", "Output as JSON")
  .action((pathArg, options) => {
    if (pathArg) options.dir = pathArg;
    return check(options);
  });

program
  .command("activate <key>")
  .description("Activate a Pro or Team license key")
  .action(activate);

program
  .command("serve")
  .description("Start an MCP server over STDIO for AI tool integration")
  .argument("[path]", "Target directory to analyze (same as --dir)")
  .option("-d, --dir <path>", "Target directory to analyze", ".")
  .action(async (pathArg, options) => {
    if (pathArg) options.dir = pathArg;
    // Lazy-load to avoid Node v25 crashing on MCP SDK subpath imports at startup
    const { serve } = await import("./commands/serve.js");
    return serve(options);
  });

// Friendly error when user passes a bare path without a subcommand
program.on("command:*", (operands) => {
  const arg = operands[0] ?? "";
  if (arg.startsWith("/") || arg.startsWith("./") || arg.startsWith("../")) {
    console.error(
      `Error: '${arg}' looks like a path. Did you mean:\n  sourcebook init ${arg}`
    );
  } else {
    console.error(`Error: unknown command '${arg}'. Run 'sourcebook --help' for usage.`);
  }
  process.exit(1);
});

program.parse();
