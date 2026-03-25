import fs from "node:fs";
import path from "node:path";
import type { FrameworkDetection, Finding } from "../types.js";

export async function detectFrameworks(
  dir: string,
  files: string[]
): Promise<FrameworkDetection[]> {
  const detected: FrameworkDetection[] = [];

  // Read all package.json files (root + workspaces/sub-packages)
  const pkgFiles = files.filter(
    (f) => f.endsWith("package.json") && !f.includes("node_modules")
  );
  if (pkgFiles.length === 0) pkgFiles.push("package.json");

  const allDeps: Record<string, string> = {};
  for (const pkgFile of pkgFiles) {
    const pkgPath = path.join(dir, pkgFile);
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
      try {
        const configContent = fs.readFileSync(
          path.join(dir, nextConfig),
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
        const content = fs.readFileSync(path.join(dir, configPath), "utf-8");

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
          const aliases = Object.keys(paths)
            .map((k) => k.replace("/*", ""))
            .join(", ");
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

  return detected;
}
