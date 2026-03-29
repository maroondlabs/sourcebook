# X Thread — @maroond_

## Tweet 1 (hook)

AI can read your code. It still doesn't know how your project works.

sourcebook gives coding agents the project knowledge your team carries in its head — not just the code.

one command. no API keys. runs locally.

npx sourcebook init

sourcebook.run

## Tweet 2 (what it finds)

what sourcebook actually finds on cal.com (10,453 files):

• types.ts imported by 183 files (touch with care)
• bookingScenario.ts ↔ getMockRequestData.ts (circular dep)
• auth/provider.ts ↔ middleware/session.ts (always co-change)
• 14 generated files — do NOT edit directly
• user-facing strings use t("key")

858 tokens. not 15.7 million.

## Tweet 3 (benchmark)

we benchmarked sourcebook against handwritten repo briefs on real github issues.

handwritten won at first. because humans encode workflow conventions. "use this hook. put keys here."

so we added dominant pattern detection. now sourcebook v0.5 is within 6% of handwritten speed — automatically.

## Tweet 4 (close)

don't take our word for it. ask your agent.

paste sourcebook.run into claude, chatgpt, or grok. see what they say.

sourcebook — project knowledge for coding agents.

github.com/maroondlabs/sourcebook
