# sourcebook -- Hacker News Launch Package

---

## HN Title Options

1. **Show HN: sourcebook -- We benchmarked AI context files against handwritten briefs and lost. Then we caught up.**
2. **Show HN: sourcebook -- 858 tokens of project knowledge vs. 16.8M tokens of repo dump**
3. **Show HN: We tested what AI coding agents actually need to know about your codebase**
4. **Show HN: sourcebook -- Extracts only what coding agents can't figure out by reading the code**
5. **Show HN: AI agents can read your code. They still don't know how your project works.**

---

## HN Submission Blurb

We built sourcebook to generate CLAUDE.md / .cursorrules files for AI coding agents. Then we benchmarked it against handwritten briefs on real GitHub issues (cal.com, pydantic, hono) and lost on speed. Handwritten briefs encode workflow knowledge that tools struggle to match. We iterated -- added dominant pattern detection, repo-mode awareness, and a quick-reference handoff -- and closed the gap to within 6% on speed while producing 36% broader patches. Full writeup with benchmark data, honest about limitations.

---

## Alternative HN Discussion Framings

### Framing 1: The Benchmark Story
"We benchmarked four approaches to giving AI agents codebase context -- no context, handwritten brief, full repo dump, and sourcebook -- across real GitHub issues. The results challenged our assumptions about what actually helps. Full data included."

### Framing 2: The Insight
"AI coding agents fail on real codebases not because they lack code access, but because they lack project knowledge -- conventions, workflow rules, dominant patterns, which files are fragile, what was tried and reverted. We built a tool to extract this automatically, then tested whether it actually works."

### Framing 3: The Engineering Story
"We built a CLI that runs PageRank on import graphs, does git forensics for co-change coupling and fragile files, detects dominant code patterns, and filters everything through a discoverability test (if the agent can figure it out from code, drop it). Then we benchmarked it honestly and wrote up the results, including where we lost."

---

## Skeptical FAQ

### "Isn't this just prompt engineering?"

If you mean "writing better instructions for AI agents" -- yes, in the same way that writing a good API is "just typing." The question is what goes into those instructions and how you decide.

sourcebook runs static analysis, builds import graphs, runs PageRank, does git forensics (reverted commits, co-change coupling, fragile file detection), detects dominant code patterns, and filters everything through a discoverability test. The output is a structured context file, not a prompt.

The hard part isn't formatting instructions. It's automatically identifying the non-obvious project knowledge that agents actually need, at scale, across any codebase, and keeping it current as the code changes.

### "Isn't this just Repomix with extra steps?"

They solve different problems entirely. Repomix concatenates your files into a single blob for pasting into a chat window. sourcebook analyzes your codebase and extracts only what agents can't figure out from reading the code.

On cal.com: Repomix produces 16.8 million tokens. sourcebook produces 858 tokens. That's a 19,680x reduction -- not because we're summarizing the code, but because we're extracting a fundamentally different kind of information. Repomix gives agents more code to read. sourcebook gives agents project knowledge they can't discover on their own.

In our benchmarks, Repomix performed worse than a targeted handwritten brief and sometimes worse than no context at all. More is not better when it competes for attention with task-relevant information.

### "Why not just use MCP?"

MCP (Model Context Protocol) is a runtime tool -- it lets agents dynamically fetch information during execution. sourcebook is a static analysis layer that runs before the agent starts.

They're complementary, not competing. MCP is the "ask questions as you go" approach. sourcebook is the "here's what you need to know before you start" approach. A senior developer doesn't just answer questions when asked -- they also leave a brief that preempts the questions the new person doesn't know to ask.

The benchmarks suggest that preloaded project knowledge (conventions, patterns, traps) has a different effect than dynamic file access. Agents with good static context spend less time on orientation and make fewer false starts, even when they also have dynamic tools available.

### "Isn't handwritten always going to be better?"

On pure workflow knowledge, probably yes -- for now. A human who deeply understands a project encodes things automated tools still miss: the unwritten rules, the "we tried this and it failed" stories, the reasons behind conventions.

But handwritten briefs miss structural intelligence that tools catch automatically. Nobody manually tracks co-change coupling percentages across 10,000 files. Nobody remembers all 14 generated files. Nobody counts 1,907 dead code candidates.

The real answer is that machine-generated + human-reviewed beats either one alone. sourcebook generates a starting point with structural analysis, dominant patterns, and git forensics. Humans add the workflow recipes and tribal knowledge. It even includes a "What to Add Manually" section because it knows what it doesn't know.

And handwritten briefs go stale. sourcebook can re-analyze on every commit.

### "How big is the benchmark really?"

Small. Four tasks across three repos. We're upfront about this.

It's enough to see patterns -- the consistent advantage of project knowledge over raw dumps, the different contributions of structural vs. workflow intelligence, the convergence trajectory from v0.3 to v0.5. It's not enough for statistical significance claims.

The issues and PRs are all public GitHub links. The benchmark methodology is documented. We'd genuinely welcome reproductions, expansions, or counterexamples. If someone wants to run this on 50 tasks across 10 repos, we'll link to their results whether or not they're favorable.

We'd rather show a small honest benchmark than a large misleading one.
