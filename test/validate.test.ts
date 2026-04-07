import { describe, it, expect } from "vitest";
import { validateFindings } from "../src/scanner/index.js";
import type { Finding } from "../src/types.js";

function makeFinding(overrides: Partial<Finding> & { evidenceFiles?: string[] }): Finding {
  return {
    category: "Dominant patterns",
    description: "Test finding",
    confidence: "high",
    discoverable: false,
    ...overrides,
  };
}

const topRankedFiles = [
  { file: "src/core.ts", score: 0.35 },
  { file: "src/utils.ts", score: 0.25 },
  { file: "src/types.ts", score: 0.20 },
  { file: "src/api/handler.ts", score: 0.15 },
  { file: "src/db/client.ts", score: 0.10 },
];

const activeAreas = ["src", "lib"];

describe("validateFindings", () => {
  it("passes through findings without evidenceFiles unchanged", () => {
    const finding = makeFinding({ description: "No evidence files" });
    const result = validateFindings([finding], topRankedFiles, activeAreas);
    expect(result[0].confidence).toBe("high");
  });

  it("keeps high confidence when file count is high and PageRank overlaps", () => {
    const finding = makeFinding({
      evidenceFiles: [
        "src/core.ts", "src/utils.ts", "src/types.ts", // 3 in PageRank top
        "src/a.ts", "src/b.ts", "src/c.ts", // 6 total files
      ],
    });
    const result = validateFindings([finding], topRankedFiles, activeAreas);
    expect(result[0].confidence).toBe("high");
  });

  it("demotes to medium when few files and no PageRank overlap", () => {
    const finding = makeFinding({
      evidenceFiles: ["other/x.ts", "other/y.ts"], // 2 files, no PageRank, no active area
    });
    const result = validateFindings([finding], topRankedFiles, []);
    expect(result[0].confidence).toBe("low");
  });

  it("demotes to medium with some files but no PageRank", () => {
    const finding = makeFinding({
      evidenceFiles: ["src/a.ts", "src/b.ts", "src/c.ts"], // 3 files, active area, no PageRank
    });
    const result = validateFindings([finding], topRankedFiles, activeAreas);
    // 3 files = 1pt, active area = 1pt, no PageRank = 0. Total = 2 → medium
    expect(result[0].confidence).toBe("medium");
  });

  it("never downgrades when file count >= 10", () => {
    const finding = makeFinding({
      evidenceFiles: Array.from({ length: 12 }, (_, i) => `other/file${i}.ts`),
    });
    const result = validateFindings([finding], topRankedFiles, []);
    expect(result[0].confidence).toBe("high");
  });

  it("demotes auth finding in single directory without PageRank", () => {
    const finding = makeFinding({
      description: "Auth uses NextAuth.js. Auth logic lives in src/auth/middleware.ts.",
      evidenceFiles: ["src/auth/config.ts", "src/auth/middleware.ts", "src/auth/utils.ts"],
    });
    // 3 files = 1pt, active area = 1pt, no PageRank = 0. Total = 2 → medium
    // But also: auth in single directory (src/auth) → medium override
    const result = validateFindings([finding], topRankedFiles, activeAreas);
    expect(result[0].confidence).toBe("medium");
  });

  it("keeps auth finding high when spanning directories with PageRank", () => {
    const finding = makeFinding({
      description: "Auth uses auth hooks (useAuth/useSession/useUser).",
      evidenceFiles: [
        "src/core.ts",       // in PageRank top
        "src/utils.ts",      // in PageRank top
        "src/auth/config.ts",
        "lib/middleware.ts",
        "pages/login.tsx",
      ],
    });
    const result = validateFindings([finding], topRankedFiles, activeAreas);
    expect(result[0].confidence).toBe("high");
  });

  it("demotes DB/ORM finding with only 2 files and no PageRank", () => {
    const finding = makeFinding({
      description: "Database access uses Prisma.",
      evidenceFiles: ["scripts/migrate.ts", "scripts/seed.ts"],
    });
    const result = validateFindings([finding], topRankedFiles, []);
    expect(result[0].confidence).toBe("medium");
  });

  it("keeps DB finding high when files are in PageRank top", () => {
    const finding = makeFinding({
      description: "Database access uses Prisma.",
      evidenceFiles: ["src/core.ts", "src/db/client.ts", "src/api/handler.ts"],
    });
    const result = validateFindings([finding], topRankedFiles, activeAreas);
    expect(result[0].confidence).toBe("high");
  });

  it("handles empty rankedFiles and activeAreas gracefully", () => {
    const finding = makeFinding({
      evidenceFiles: ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/e.ts"],
    });
    const result = validateFindings([finding], [], []);
    // 5 files = 2pts, no PageRank = 0, no active = 0. Total = 2 → medium
    expect(result[0].confidence).toBe("medium");
  });

  it("processes multiple findings independently", () => {
    const strong = makeFinding({
      description: "Strong pattern",
      evidenceFiles: ["src/core.ts", "src/utils.ts", "src/types.ts", "src/a.ts", "src/b.ts"],
    });
    const weak = makeFinding({
      description: "Weak pattern",
      evidenceFiles: ["other/x.ts"],
    });
    const result = validateFindings([strong, weak], topRankedFiles, activeAreas);
    expect(result[0].confidence).toBe("high");
    expect(result[1].confidence).toBe("low");
  });
});
