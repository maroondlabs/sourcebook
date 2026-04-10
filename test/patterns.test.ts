import { describe, it, expect } from "vitest";
import { detectPatterns } from "../src/scanner/patterns.js";
import type { Finding } from "../src/types.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Helper: create a temporary directory with source files,
 * run detectPatterns, then clean up.
 */
async function detectWithFiles(
  files: Record<string, string>,
  opts?: { frameworks?: string[]; repoMode?: "app" | "library" | "monorepo" }
): Promise<Finding[]> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-test-"));
  const fileNames: string[] = [];

  try {
    for (const [name, content] of Object.entries(files)) {
      const fullPath = path.join(dir, name);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content);
      fileNames.push(name);
    }

    return await detectPatterns(
      dir,
      fileNames,
      opts?.frameworks ?? [],
      opts?.repoMode ?? "app",
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function findByDescription(findings: Finding[], substr: string): Finding | undefined {
  return findings.find((f) => f.description.includes(substr));
}

// ========================================
// ROUTING PATTERN DETECTION
// ========================================
describe("routing patterns", () => {
  it("detects Express routers", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 3; i++) {
      files[`src/routes/r${i}.ts`] = `
        import { Router } from "express";
        const router = express.Router();
        router.get("/api/${i}", handler);
      `;
    }
    const findings = await detectWithFiles(files);
    const routing = findByDescription(findings, "Express routers");
    expect(routing).toBeDefined();
  });

  it("detects tRPC routers", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 3; i++) {
      files[`src/api/router${i}.ts`] = `
        import { createTRPCRouter } from "@trpc/server";
        export const appRouter = createTRPCRouter({});
      `;
    }
    const findings = await detectWithFiles(files);
    const routing = findByDescription(findings, "tRPC");
    expect(routing).toBeDefined();
  });

  it("detects Flask routes", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 3; i++) {
      files[`app/views${i}.py`] = `
        from flask import Flask
        @app.route("/page/${i}")
        def page():
            return "ok"
      `;
    }
    const findings = await detectWithFiles(files);
    const routing = findByDescription(findings, "Flask");
    expect(routing).toBeDefined();
  });

  it("detects FastAPI endpoints", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 3; i++) {
      files[`app/api${i}.py`] = `
        from fastapi import FastAPI
        @app.get("/items/${i}")
        async def read_item():
            return {"id": ${i}}
      `;
    }
    const findings = await detectWithFiles(files);
    const routing = findByDescription(findings, "FastAPI");
    expect(routing).toBeDefined();
  });

  it("does NOT detect FastAPI from docs_src/ files", async () => {
    // pydantic regression: docs_src/ uses FastAPI in examples but it's not the project's pattern
    const files: Record<string, string> = {};
    for (let i = 0; i < 5; i++) {
      files[`docs_src/tutorial/api${i}.py`] = `
        from fastapi import FastAPI
        app = FastAPI()
        @app.get("/items/${i}")
        async def read_item():
            return {"id": ${i}}
      `;
    }
    const findings = await detectWithFiles(files, { repoMode: "library" });
    const routing = findByDescription(findings, "FastAPI");
    expect(routing).toBeUndefined();
  });
});

// ========================================
// VALIDATION / SCHEMA PATTERNS
// ========================================
describe("validation patterns", () => {
  it("detects Zod schemas", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 4; i++) {
      files[`src/schemas/s${i}.ts`] = `
        import { z } from "zod";
        export const schema = z.object({ name: z.string() });
      `;
    }
    const findings = await detectWithFiles(files);
    const validation = findByDescription(findings, "Zod");
    expect(validation).toBeDefined();
  });

  it("detects Pydantic models", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 4; i++) {
      files[`app/models/m${i}.py`] = `
        from pydantic import BaseModel
        class Item(BaseModel):
            name: str
      `;
    }
    const findings = await detectWithFiles(files);
    const validation = findByDescription(findings, "Pydantic");
    expect(validation).toBeDefined();
  });
});

// ========================================
// AUTH PATTERNS
// ========================================
describe("auth patterns", () => {
  it("detects NextAuth", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 3; i++) {
      files[`src/auth/a${i}.ts`] = `
        import NextAuth from "next-auth";
        export const authOptions = { providers: [] };
      `;
    }
    const findings = await detectWithFiles(files);
    const auth = findByDescription(findings, "NextAuth");
    expect(auth).toBeDefined();
  });

  it("detects Supabase Auth", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 3; i++) {
      files[`src/lib/auth${i}.ts`] = `
        const { data } = await supabase.auth.getUser();
      `;
    }
    const findings = await detectWithFiles(files);
    const auth = findByDescription(findings, "Supabase Auth");
    expect(auth).toBeDefined();
  });

  it("detects FastAPI security", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 3; i++) {
      files[`fastapi/routers/secure${i}.py`] = `
        from fastapi.security import OAuth2PasswordBearer
        oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")
      `;
    }
    const findings = await detectWithFiles(files, { repoMode: "library" });
    const auth = findByDescription(findings, "FastAPI security");
    expect(auth).toBeDefined();
  });
});

// ========================================
// DATABASE / ORM PATTERNS
// ========================================
describe("database patterns", () => {
  it("detects Prisma", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 3; i++) {
      files[`src/db/query${i}.ts`] = `
        import { PrismaClient } from "@prisma/client";
        const prisma = new PrismaClient();
        const users = await prisma.user.findMany();
      `;
    }
    const findings = await detectWithFiles(files);
    const db = findByDescription(findings, "Prisma");
    expect(db).toBeDefined();
  });

  it("detects Django ORM", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 3; i++) {
      files[`app/models${i}.py`] = `
        from django.db import models
        class Post(models.Model):
            title = models.CharField(max_length=200)
      `;
    }
    const findings = await detectWithFiles(files);
    const db = findByDescription(findings, "Django ORM");
    expect(db).toBeDefined();
  });

  it("detects SQLAlchemy", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 3; i++) {
      files[`app/db${i}.py`] = `
        from sqlalchemy import Column, Integer, String
        from sqlalchemy.orm import declarative_base
        Base = declarative_base()
      `;
    }
    const findings = await detectWithFiles(files);
    const db = findByDescription(findings, "SQLAlchemy");
    expect(db).toBeDefined();
  });
});

// ========================================
// TESTING PATTERNS
// ========================================
describe("testing patterns", () => {
  it("detects pytest", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 3; i++) {
      files[`tests/test_module${i}.py`] = `
        import pytest
        def test_something():
            assert True
      `;
    }
    // Need enough Python source files to pass the pytest guard (min 5)
    for (let i = 0; i < 6; i++) {
      files[`src/module${i}.py`] = `
        def handler():
            return "ok"
      `;
    }
    const findings = await detectWithFiles(files);
    const testing = findByDescription(findings, "pytest");
    expect(testing).toBeDefined();
  });
});

// ========================================
// STYLING PATTERNS
// ========================================
describe("styling patterns", () => {
  it("detects Tailwind CSS", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 4; i++) {
      files[`src/components/c${i}.tsx`] = `
        export function Card() {
          return <div className="flex p-4 bg-white rounded-lg shadow-md">content</div>;
        }
      `;
    }
    const findings = await detectWithFiles(files);
    const styling = findByDescription(findings, "Tailwind");
    expect(styling).toBeDefined();
  });

  it("detects CSS Modules", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 4; i++) {
      files[`src/components/c${i}.tsx`] = `
        import styles from "./component.module.css";
        export function Card() {
          return <div className={styles.card}>content</div>;
        }
      `;
    }
    const findings = await detectWithFiles(files);
    const styling = findByDescription(findings, "CSS Modules");
    expect(styling).toBeDefined();
  });
});

// ========================================
// STATE MANAGEMENT PATTERNS
// ========================================
describe("state management patterns", () => {
  it("detects React Query", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 4; i++) {
      files[`src/hooks/use${i}.ts`] = `
        import { useQuery } from "@tanstack/react-query";
        export function useData() {
          return useQuery({ queryKey: ["data"], queryFn: fetchData });
        }
      `;
    }
    const findings = await detectWithFiles(files);
    const state = findByDescription(findings, "React Query");
    expect(state).toBeDefined();
  });
});

// ========================================
// GENERATED FILES DETECTION
// ========================================
describe("generated files", () => {
  it("detects generated file naming patterns", async () => {
    // Comment-based markers (// @generated, /* DO NOT EDIT */) get stripped
    // by the comment stripper, so detection relies on filename patterns
    const files: Record<string, string> = {};
    for (let i = 0; i < 3; i++) {
      files[`src/types${i}.generated.ts`] = `export type Foo = { id: number };`;
    }
    const findings = await detectWithFiles(files);
    const gen = findByDescription(findings, "Generated files");
    expect(gen).toBeDefined();
  });
});

// ========================================
// FALSE POSITIVE RESISTANCE
// ========================================
describe("false positive resistance", () => {
  it("does not detect patterns from comments", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 5; i++) {
      files[`src/file${i}.ts`] = `
        // import { PrismaClient } from "@prisma/client";
        // const prisma = new PrismaClient();
        /* prisma.user.findMany() */
        const x = ${i};
      `;
    }
    const findings = await detectWithFiles(files);
    const db = findByDescription(findings, "Prisma");
    expect(db).toBeUndefined();
  });

  it("does not detect Express in Python files", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 5; i++) {
      files[`app/views${i}.py`] = `
        app.get("/items")
        app.post("/items")
      `;
    }
    const findings = await detectWithFiles(files);
    const express = findByDescription(findings, "Express");
    expect(express).toBeUndefined();
  });
});
