import fs from "node:fs";
import path from "node:path";
import type { BuildCommands } from "../types.js";

export async function detectBuildCommands(dir: string): Promise<BuildCommands> {
  const commands: BuildCommands = {};

  // Check package.json scripts
  const pkgPath = path.join(dir, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const scripts = pkg.scripts || {};

      commands.dev = scripts.dev;
      commands.build = scripts.build;
      commands.test = scripts.test;
      commands.lint = scripts.lint;
      commands.start = scripts.start;

      // Detect non-standard but important scripts
      for (const [name, script] of Object.entries(scripts)) {
        if (
          typeof script === "string" &&
          !commands[name] &&
          (name.includes("migrate") ||
            name.includes("seed") ||
            name.includes("deploy") ||
            name.includes("typecheck") ||
            name.includes("generate"))
        ) {
          commands[name] = script;
        }
      }
    } catch {
      // malformed package.json
    }
  }

  // Check for Makefile
  const makefilePath = path.join(dir, "Makefile");
  if (fs.existsSync(makefilePath) && !commands.build) {
    commands.build = "make";
  }

  // Check for pyproject.toml
  const pyprojectPath = path.join(dir, "pyproject.toml");
  if (fs.existsSync(pyprojectPath)) {
    try {
      const content = fs.readFileSync(pyprojectPath, "utf-8");
      if (content.includes("[tool.poetry.scripts]")) {
        // Poetry project
        if (!commands.dev) commands.dev = "poetry run dev";
        if (!commands.test) commands.test = "poetry run pytest";
      }
    } catch {
      // can't read
    }
  }

  return commands;
}
