import fs from "node:fs";
import path from "node:path";
import type { FrameworkDetection, Finding } from "../types.js";

function safePath(dir: string, file: string): string | null {
  const resolved = path.resolve(path.join(dir, file));
  if (!resolved.startsWith(path.resolve(dir) + path.sep) && resolved !== path.resolve(dir)) {
    return null;
  }
  return resolved;
}

export async function detectFrameworks(
  dir: string,
  files: string[]
): Promise<FrameworkDetection[]> {
  const detected: FrameworkDetection[] = [];

  // Read all package.json files (root + workspaces/sub-packages)
  const pkgFiles = files.filter(
    (f) =>
      f.endsWith("package.json") &&
      !f.includes("node_modules") &&
      // Exclude sub-directory package.json files from example/benchmark/doc dirs —
      // they pull in unrelated deps (e.g. hono benchmarks have express, react)
      !/(?:^|\/)(?:examples?|demos?|benchmarks?|docs?(?:[_-][^/]+)?|fixtures?)\//i.test(f)
  );
  if (pkgFiles.length === 0) pkgFiles.push("package.json");

  const allDeps: Record<string, string> = {};
  for (const pkgFile of pkgFiles) {
    const pkgPath = safePath(dir, pkgFile);
    if (!pkgPath) continue;
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        Object.assign(allDeps, pkg.dependencies || {}, pkg.devDependencies || {});
      } catch {
        // malformed package.json
      }
    }
  }

  // --- Next.js ---
  if (allDeps["next"]) {
    const findings: Finding[] = [];
    const hasAppDir = files.some(
      (f) => f.startsWith("app/") || f.startsWith("src/app/")
    );
    const hasPagesDir = files.some(
      (f) => f.startsWith("pages/") || f.startsWith("src/pages/")
    );

    if (hasAppDir && hasPagesDir) {
      findings.push({
        category: "Next.js routing",
        description:
          "Project uses BOTH App Router and Pages Router. New routes should go in the app/ directory unless there's a specific reason for pages/.",
        rationale:
          "Mixed routing is a common migration state. Agents default to pages/ because training data has more examples of it.",
        confidence: "high",
        discoverable: false,
      });
    } else if (hasAppDir) {
      findings.push({
        category: "Next.js routing",
        description: "Project uses App Router (app/ directory). Use server components by default.",
        confidence: "high",
        discoverable: true,
      });
    }

    // Check for next.config
    const nextConfig = files.find((f) =>
      /^next\.config\.(js|mjs|ts)$/.test(f)
    );
    if (nextConfig) {
      const safeNextConfig = safePath(dir, nextConfig);
      if (safeNextConfig) try {
        const configContent = fs.readFileSync(
          safeNextConfig,
          "utf-8"
        );
        if (configContent.includes("output:") && configContent.includes("standalone")) {
          findings.push({
            category: "Next.js deployment",
            description:
              "Standalone output mode is enabled. Build produces a self-contained server in .next/standalone.",
            confidence: "high",
            discoverable: false,
          });
        }
        if (configContent.includes("images") && configContent.includes("remotePatterns")) {
          findings.push({
            category: "Next.js images",
            description:
              "Remote image patterns are configured. New image domains must be added to next.config before use.",
            rationale:
              "Agents will try to use next/image with arbitrary URLs and get 400 errors without this config.",
            confidence: "high",
            discoverable: false,
          });
        }
      } catch {
        // can't read config
      }
    }

    detected.push({
      name: "Next.js",
      version: allDeps["next"],
      findings: findings.filter((f) => !f.discoverable),
    });
  }

  // --- Expo / React Native ---
  if (allDeps["expo"]) {
    const findings: Finding[] = [];
    const hasExpoRouter = !!allDeps["expo-router"];

    if (hasExpoRouter) {
      findings.push({
        category: "Expo routing",
        description:
          "Uses Expo Router (file-based routing in app/ directory). Follows Next.js-like conventions.",
        confidence: "high",
        discoverable: true,
      });
    }

    // Check for EAS config
    if (files.includes("eas.json")) {
      findings.push({
        category: "Expo builds",
        description:
          "EAS Build is configured. Use `eas build` for device builds, not `expo build`.",
        rationale:
          "expo build is deprecated. Agents trained on older docs will suggest it.",
        confidence: "high",
        discoverable: false,
      });
    }

    // Check app.json for scheme
    const appJsonPath = path.join(dir, "app.json");
    if (fs.existsSync(appJsonPath)) {
      try {
        const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf-8"));
        if (appJson?.expo?.scheme) {
          findings.push({
            category: "Expo deep linking",
            description: `Deep link scheme is "${appJson.expo.scheme}://". Use this for universal links and navigation.`,
            confidence: "high",
            discoverable: false,
          });
        }
      } catch {
        // malformed app.json
      }
    }

    detected.push({
      name: "Expo",
      version: allDeps["expo"],
      findings: findings.filter((f) => !f.discoverable),
    });
  }

  // --- React (standalone, not Next/Expo) ---
  if (allDeps["react"] && !allDeps["next"] && !allDeps["expo"]) {
    const findings: Finding[] = [];
    const hasVite = !!allDeps["vite"];

    if (hasVite) {
      detected.push({ name: "Vite + React", version: allDeps["vite"], findings });
    } else {
      detected.push({ name: "React", version: allDeps["react"], findings });
    }
  }

  // --- Supabase ---
  if (allDeps["@supabase/supabase-js"]) {
    const findings: Finding[] = [];

    // Check for RLS awareness
    const hasSupabaseDir = files.some((f) => f.startsWith("supabase/"));
    if (hasSupabaseDir) {
      findings.push({
        category: "Supabase",
        description:
          "Local Supabase setup detected (supabase/ directory). Use `supabase db push` for migrations, not the dashboard.",
        confidence: "high",
        discoverable: false,
      });
    }

    detected.push({
      name: "Supabase",
      version: allDeps["@supabase/supabase-js"],
      findings,
    });
  }

  // --- Tailwind CSS ---
  if (allDeps["tailwindcss"]) {
    const findings: Finding[] = [];
    const hasTwConfig = files.some((f) =>
      /^tailwind\.config\.(js|ts|mjs|cjs)$/.test(f)
    );

    if (hasTwConfig) {
      try {
        const configPath = files.find((f) =>
          /^tailwind\.config\.(js|ts|mjs|cjs)$/.test(f)
        )!;
        const safeConfigPath = safePath(dir, configPath);
        if (!safeConfigPath) throw new Error("path escape");
        const content = fs.readFileSync(safeConfigPath, "utf-8");

        if (content.includes("extend") && content.includes("colors")) {
          findings.push({
            category: "Tailwind",
            description:
              "Custom color tokens are defined in tailwind.config. Use these instead of arbitrary color values.",
            rationale:
              "Agents default to Tailwind's built-in palette. Using custom tokens keeps the design system consistent.",
            confidence: "medium",
            discoverable: false,
          });
        }
      } catch {
        // can't read config
      }
    }

    detected.push({
      name: "Tailwind CSS",
      version: allDeps["tailwindcss"],
      findings,
    });
  }

  // --- Express ---
  if (allDeps["express"]) {
    detected.push({
      name: "Express",
      version: allDeps["express"],
      findings: [],
    });
  }

  // --- Fastify ---
  if (allDeps["fastify"]) {
    detected.push({
      name: "Fastify",
      version: allDeps["fastify"],
      findings: [],
    });
  }

  // --- TypeScript ---
  if (allDeps["typescript"]) {
    const findings: Finding[] = [];
    const tsconfigPath = path.join(dir, "tsconfig.json");

    if (fs.existsSync(tsconfigPath)) {
      try {
        const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf-8"));
        const strict = tsconfig?.compilerOptions?.strict;
        if (strict === false) {
          findings.push({
            category: "TypeScript",
            description:
              "Strict mode is OFF. Don't add strict type annotations that would break existing patterns.",
            confidence: "high",
            discoverable: false,
          });
        }

        const paths = tsconfig?.compilerOptions?.paths;
        if (paths) {
          const aliases = [...new Set(
            Object.keys(paths).map((k) => k.replace("/*", ""))
          )].join(", ");
          findings.push({
            category: "TypeScript imports",
            description: `Path aliases configured: ${aliases}. Use these instead of relative imports.`,
            rationale: "Agents default to relative imports. Path aliases keep imports clean.",
            confidence: "high",
            discoverable: false,
          });
        }
      } catch {
        // malformed tsconfig
      }
    }

    detected.push({
      name: "TypeScript",
      version: allDeps["typescript"],
      findings,
    });
  }

  // --- Python ---
  const hasPyproject = fs.existsSync(path.join(dir, "pyproject.toml"));
  const hasRequirements = fs.existsSync(path.join(dir, "requirements.txt"));
  const hasSetupPy = fs.existsSync(path.join(dir, "setup.py"));

  // Only enter Python detection if Python is a significant part of the project,
  // not just benchmarks/scripts (e.g., Rust projects with Python bench/ dirs)
  const primaryPySourceFiles = files.filter(
    (f) =>
      f.endsWith(".py") &&
      !/(test[s_]?\/|bench\/|scripts?\/|docs[_\/]|examples?\/|fixtures?\/)/.test(f) &&
      !f.startsWith(".")
  );
  const isPrimaryPython = primaryPySourceFiles.length >= 5;

  if ((hasPyproject || hasRequirements || hasSetupPy) && isPrimaryPython) {
    const findings: Finding[] = [];
    let pyDeps = "";

    if (hasPyproject) {
      try {
        pyDeps = fs.readFileSync(path.join(dir, "pyproject.toml"), "utf-8");
      } catch {}
    } else if (hasRequirements) {
      try {
        pyDeps = fs.readFileSync(path.join(dir, "requirements.txt"), "utf-8");
      } catch {}
    }

    const pyDepsLower = pyDeps.toLowerCase();

    // Django
    if (pyDepsLower.includes("django")) {
      const hasManagePy = files.includes("manage.py");
      const settingsFile = files.find((f) => f.endsWith("settings.py") || f.includes("settings/"));
      findings.push({
        category: "Django",
        description: `Django project${settingsFile ? ` (settings: ${settingsFile})` : ""}. Use \`python manage.py\` for management commands.`,
        confidence: "high",
        discoverable: false,
      });
      if (files.some((f) => f.endsWith("models.py"))) {
        findings.push({
          category: "Django",
          description: "After modifying models, run `python manage.py makemigrations && python manage.py migrate`.",
          rationale: "Agents forget to create migrations after model changes, causing runtime errors.",
          confidence: "high",
          discoverable: false,
        });
      }
      detected.push({ name: "Django", findings });
    }

    // FastAPI — only label as "FastAPI project" if it's the primary app framework,
    // not just a dependency used in tests/docs/internal plumbing
    else if (pyDepsLower.includes("fastapi")) {
      // Check if FastAPI() is used in primary source files (not test/docs/example dirs)
      const primaryPyFiles = files.filter(
        (f) =>
          f.endsWith(".py") &&
          !/(test[s_]?\/|docs[_\/]|examples?\/|bench\/|fixture)/.test(f)
      );
      // Count files that actually import and use FastAPI — need at least 3 to be a real FastAPI project
      // (prevents false positives from docstring examples, test fixtures, or incidental imports)
      let fastapiFileCount = 0;
      for (const f of primaryPyFiles) {
        try {
          const content = fs.readFileSync(path.join(dir, f), "utf-8");
          // Only count actual imports, not docstring examples
          if (/^from fastapi import|^import fastapi/m.test(content)) {
            fastapiFileCount++;
          }
        } catch {
          // skip
        }
      }
      const hasFastAPIApp = fastapiFileCount >= 3;

      if (hasFastAPIApp) {
        findings.push({
          category: "FastAPI",
          description: "FastAPI project. Use Pydantic models for request/response schemas, not raw dicts.",
          confidence: "high",
          discoverable: false,
        });
        if (pyDepsLower.includes("sqlalchemy") || pyDepsLower.includes("sqlmodel")) {
          findings.push({
            category: "FastAPI",
            description: "Uses SQLAlchemy/SQLModel for ORM. Database sessions must be properly closed (use dependency injection).",
            confidence: "high",
            discoverable: false,
          });
        }
        detected.push({ name: "FastAPI", findings });
      } else {
        // FastAPI is a dependency but not the primary framework — treat as generic Python
        detected.push({ name: "Python", findings: [] });
      }
    }

    // Flask
    else if (pyDepsLower.includes("flask")) {
      detected.push({ name: "Flask", findings: [] });
    }

    // Generic Python
    else {
      detected.push({ name: "Python", findings: [] });
    }

    // pytest detection
    if (pyDepsLower.includes("pytest")) {
      findings.push({
        category: "Testing",
        description: "Uses pytest. Test files should be named `test_*.py` or `*_test.py`.",
        confidence: "high",
        discoverable: false,
      });
    }

    // Virtual environment detection
    const hasVenv = files.some((f) => f.startsWith(".venv/") || f.startsWith("venv/"));
    if (hasVenv) {
      findings.push({
        category: "Python environment",
        description: "Virtual environment detected. Activate with `source .venv/bin/activate` before running commands.",
        confidence: "medium",
        discoverable: false,
      });
    }
  }

  // --- Go ---
  const hasGoMod = fs.existsSync(path.join(dir, "go.mod"));
  if (hasGoMod) {
    const findings: Finding[] = [];

    try {
      const goMod = fs.readFileSync(path.join(dir, "go.mod"), "utf-8");
      const moduleMatch = goMod.match(/^module\s+(.+)$/m);
      if (moduleMatch) {
        findings.push({
          category: "Go module",
          description: `Module path: ${moduleMatch[1]}. Use this as the import prefix for all internal packages.`,
          confidence: "high",
          discoverable: false,
        });
      }

      // Detect web frameworks
      if (goMod.includes("github.com/gin-gonic/gin")) {
        detected.push({ name: "Go + Gin", findings });
      } else if (goMod.includes("github.com/labstack/echo")) {
        detected.push({ name: "Go + Echo", findings });
      } else if (goMod.includes("github.com/gofiber/fiber")) {
        detected.push({ name: "Go + Fiber", findings });
      } else {
        detected.push({ name: "Go", findings });
      }
    } catch {
      detected.push({ name: "Go", findings: [] });
    }

    // cmd/ vs pkg/ layout
    const hasCmdDir = files.some((f) => f.startsWith("cmd/"));
    const hasPkgDir = files.some((f) => f.startsWith("pkg/"));
    const hasInternalDir = files.some((f) => f.startsWith("internal/"));

    if (hasCmdDir) {
      findings.push({
        category: "Go layout",
        description: `Standard Go project layout: ${hasCmdDir ? "cmd/" : ""}${hasPkgDir ? " pkg/" : ""}${hasInternalDir ? " internal/" : ""}. Entry points are in cmd/ subdirectories.`,
        confidence: "high",
        discoverable: false,
      });
    }

    if (hasInternalDir) {
      findings.push({
        category: "Go visibility",
        description: "internal/ packages cannot be imported by external modules. Keep private code here.",
        rationale: "Go enforces this at the compiler level. Agents may try to import internal packages from external code.",
        confidence: "high",
        discoverable: false,
      });
    }
  }

  return detected;
}
