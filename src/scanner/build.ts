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

  // Check for go.mod
  const goModPath = path.join(dir, "go.mod");
  if (fs.existsSync(goModPath)) {
    if (!commands.build) commands.build = "go build ./...";
    if (!commands.test) commands.test = "go test ./...";
    // Check for cmd/ entry points
    const cmdDir = path.join(dir, "cmd");
    if (fs.existsSync(cmdDir)) {
      try {
        const entries = fs.readdirSync(cmdDir);
        if (entries.length === 1) {
          commands.dev = `go run ./cmd/${entries[0]}`;
        }
      } catch {}
    } else {
      if (!commands.dev) commands.dev = "go run .";
    }
  }

  // Check for requirements.txt / pyproject.toml Python commands
  const hasRequirements = fs.existsSync(path.join(dir, "requirements.txt"));
  if (hasRequirements && !commands.test) {
    commands.test = "pytest";
  }

  return commands;
}
