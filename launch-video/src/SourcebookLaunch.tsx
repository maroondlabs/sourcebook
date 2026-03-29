import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame, interpolate, spring, useVideoConfig, OffthreadVideo, staticFile } from "remotion";

// Set to true once Kling clips are in public/
const USE_AI_BACKGROUNDS = false;

const VideoBackground: React.FC<{ src: string }> = ({ src }) => {
  if (!USE_AI_BACKGROUNDS) return null;
  return (
    <AbsoluteFill style={{ opacity: 0.6 }}>
      <OffthreadVideo src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </AbsoluteFill>
  );
};

const C = {
  bg: "#0D0D0D",
  surface: "#141414",
  text: "#FFFFFF",
  muted: "#5F5E5E",
  accent: "#00FF41",
  gray: "#A0A0A0",
};

const FONT = "'Space Grotesk', monospace";
const FPS = 30;

// ─── Utilities ───────────────────────────────────────────

const FadeText: React.FC<{
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = spring({ frame: frame - delay, fps, config: { damping: 30, stiffness: 80 } });
  const y = interpolate(opacity, [0, 1], [30, 0]);
  return (
    <div style={{ opacity, transform: `translateY(${y}px)`, ...style }}>
      {children}
    </div>
  );
};

const CodeLine: React.FC<{ text: string; color?: string; indent?: number }> = ({
  text, color = C.gray, indent = 0,
}) => (
  <div style={{
    fontFamily: "monospace", fontSize: 22, color, paddingLeft: indent * 20,
    lineHeight: 1.6,
  }}>
    {text}
  </div>
);

// ─── Scene 1: Hook ──────────────────────────────────────

const SceneHook: React.FC = () => {
  const frame = useCurrentFrame();

  // Floating code fragments background
  const codeLines = [
    "import { auth } from './lib'",
    "export default function",
    "const router = createRouter()",
    "useEffect(() => {",
    "  fetchData()",
    "}, [])",
    "type User = {",
    "  id: string",
    "  role: Role",
    "}",
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, justifyContent: "center", alignItems: "center" }}>
      {/* Floating code background */}
      {codeLines.map((line, i) => {
        const y = interpolate(frame, [0, 120], [100 + i * 80, 60 + i * 80], { extrapolateRight: "clamp" });
        const opacity = interpolate(frame, [0, 30], [0, 0.08], { extrapolateRight: "clamp" });
        return (
          <div key={i} style={{
            position: "absolute", fontFamily: "monospace", fontSize: 18,
            color: C.muted, opacity, top: y, left: 100 + (i % 3) * 500,
          }}>
            {line}
          </div>
        );
      })}

      {/* Main text */}
      <div style={{ textAlign: "center", zIndex: 1 }}>
        <FadeText delay={0}>
          <div style={{ fontFamily: FONT, fontSize: 72, fontWeight: 700, color: C.text, letterSpacing: -2 }}>
            AI can read your code.
          </div>
        </FadeText>
        <FadeText delay={45}>
          <div style={{
            fontFamily: FONT, fontSize: 72, fontWeight: 700, color: C.text,
            letterSpacing: -2, marginTop: 20,
          }}>
            It still doesn't know how
          </div>
          <div style={{ fontFamily: FONT, fontSize: 72, fontWeight: 700, color: C.accent, letterSpacing: -2 }}>
            your project works.
          </div>
        </FadeText>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 2: Hidden Rules ──────────────────────────────

const SceneHiddenRules: React.FC = () => {
  const frame = useCurrentFrame();
  const phrases = [
    "use this hook",
    "put keys here",
    "don't edit this file",
    "these files always change together",
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, justifyContent: "center", alignItems: "center" }}>
      <FadeText delay={0}>
        <div style={{ fontFamily: FONT, fontSize: 60, fontWeight: 700, color: C.text, textAlign: "center", marginBottom: 60 }}>
          Every codebase has hidden rules.
        </div>
      </FadeText>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
        {phrases.map((phrase, i) => {
          const startFrame = 20 + i * 25;
          const opacity = interpolate(frame, [startFrame, startFrame + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const scale = interpolate(frame, [startFrame, startFrame + 12], [0.9, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <div key={i} style={{
              opacity, transform: `scale(${scale})`,
              backgroundColor: C.surface, border: `2px solid ${C.accent}`,
              padding: "12px 32px", fontFamily: "monospace", fontSize: 28,
              color: C.accent, letterSpacing: 1,
            }}>
              {phrase}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 3: Human vs Agent ────────────────────────────

const SceneHumanVsAgent: React.FC = () => {
  const frame = useCurrentFrame();

  const leftOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const rightOpacity = interpolate(frame, [15, 35], [0, 1], { extrapolateRight: "clamp" });
  const dividerX = interpolate(frame, [0, 25], [-10, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      {/* Left: Engineer knows */}
      <div style={{
        position: "absolute", left: 0, top: 0, width: "48%", height: "100%",
        display: "flex", flexDirection: "column", justifyContent: "center",
        padding: "0 80px", opacity: leftOpacity,
      }}>
        <div style={{ fontFamily: FONT, fontSize: 14, color: C.muted, letterSpacing: 4, marginBottom: 20 }}>
          SENIOR ENGINEER
        </div>
        <div style={{ fontFamily: FONT, fontSize: 48, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>
          A senior engineer
        </div>
        <div style={{ fontFamily: FONT, fontSize: 48, fontWeight: 700, color: C.accent, lineHeight: 1.3 }}>
          knows them.
        </div>
        <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 12 }}>
          {["✓ conventions", "✓ patterns", "✓ traps", "✓ history"].map((item, i) => (
            <div key={i} style={{ fontFamily: "monospace", fontSize: 20, color: C.accent }}>
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div style={{
        position: "absolute", left: "50%", top: "15%", width: 2, height: "70%",
        backgroundColor: C.muted, opacity: 0.3, transform: `translateX(${dividerX}px)`,
      }} />

      {/* Right: Agent doesn't */}
      <div style={{
        position: "absolute", right: 0, top: 0, width: "48%", height: "100%",
        display: "flex", flexDirection: "column", justifyContent: "center",
        padding: "0 80px", opacity: rightOpacity,
      }}>
        <div style={{ fontFamily: FONT, fontSize: 14, color: C.muted, letterSpacing: 4, marginBottom: 20 }}>
          AI AGENT
        </div>
        <div style={{ fontFamily: FONT, fontSize: 48, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>
          Your AI agent
        </div>
        <div style={{ fontFamily: FONT, fontSize: 48, fontWeight: 700, color: "#FF4444", lineHeight: 1.3 }}>
          usually doesn't.
        </div>
        <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 12 }}>
          {["✗ wrong patterns", "✗ wrong files", "✗ wasted tokens", "✗ broken imports"].map((item, i) => (
            <div key={i} style={{ fontFamily: "monospace", fontSize: 20, color: "#FF4444" }}>
              {item}
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 4: Product Reveal ────────────────────────────

const SceneReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const termLines = [
    { text: "$ npx sourcebook init", color: C.text, delay: 0 },
    { text: "", color: C.text, delay: 10 },
    { text: "sourcebook", color: C.accent, delay: 15 },
    { text: "Extracting repo truths...", color: C.gray, delay: 20 },
    { text: "", color: C.text, delay: 25 },
    { text: "✓ Scanned 10,453 files, 3 frameworks detected", color: C.accent, delay: 35 },
    { text: "✓ Extracted 22 findings", color: C.accent, delay: 50 },
  ];

  const outputs = ["CLAUDE.md", ".cursorrules", "AGENTS.md", "copilot-instructions.md"];

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, justifyContent: "center", alignItems: "center" }}>
      <FadeText delay={0}>
        <div style={{ fontFamily: FONT, fontSize: 48, fontWeight: 700, color: C.text, marginBottom: 40, textAlign: "center" }}>
          Sourcebook gives AI that <span style={{ color: C.accent }}>handoff</span>.
        </div>
      </FadeText>

      {/* Terminal */}
      <div style={{
        backgroundColor: C.surface, border: `1px solid ${C.muted}33`,
        padding: 32, width: 900, fontFamily: "monospace", fontSize: 18,
      }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <div style={{ width: 12, height: 12, backgroundColor: C.muted, borderRadius: 0 }} />
          <div style={{ width: 12, height: 12, backgroundColor: C.muted, borderRadius: 0 }} />
          <div style={{ width: 12, height: 12, backgroundColor: C.muted, borderRadius: 0 }} />
        </div>
        {termLines.map((line, i) => {
          const opacity = interpolate(frame, [line.delay, line.delay + 8], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          return (
            <div key={i} style={{ opacity, color: line.color, lineHeight: 1.8 }}>
              {line.text}
            </div>
          );
        })}

        {/* Output files */}
        <div style={{ display: "flex", gap: 16, marginTop: 20 }}>
          {outputs.map((file, i) => {
            const delay = 65 + i * 8;
            const opacity = interpolate(frame, [delay, delay + 6], [0, 1], {
              extrapolateLeft: "clamp", extrapolateRight: "clamp",
            });
            const s = spring({ frame: frame - delay, fps, config: { damping: 20, stiffness: 120 } });
            return (
              <div key={i} style={{
                opacity, transform: `scale(${interpolate(s, [0, 1], [0.8, 1])})`,
                backgroundColor: C.accent, color: C.bg, padding: "6px 14px",
                fontFamily: FONT, fontSize: 14, fontWeight: 700,
              }}>
                {file}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 5: Findings ──────────────────────────────────

const SceneFindings: React.FC = () => {
  const frame = useCurrentFrame();
  const findings = [
    { label: "i18n", text: "useLocale() + t('key')", sub: "packages/i18n/locales/en/common.json" },
    { label: "hub", text: "types.ts", sub: "imported by 183 files" },
    { label: "fragile", text: "openapi.json", sub: "5 edits in one week" },
    { label: "trap", text: "Generated files", sub: "do NOT edit directly" },
    { label: "cycle", text: "bookingScenario.ts", sub: "↔ getMockRequestData.ts" },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, justifyContent: "center", alignItems: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, width: 1000 }}>
        {findings.map((finding, i) => {
          const startFrame = i * 30;
          const opacity = interpolate(frame, [startFrame, startFrame + 15], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          const x = interpolate(frame, [startFrame, startFrame + 15], [40, 0], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          });
          // Highlight the active one
          const isActive = frame >= startFrame && frame < startFrame + 30;

          return (
            <div key={i} style={{
              opacity, transform: `translateX(${x}px)`,
              display: "flex", alignItems: "center", gap: 20,
              backgroundColor: isActive ? C.surface : "transparent",
              border: isActive ? `2px solid ${C.accent}` : `1px solid ${C.muted}33`,
              padding: "16px 24px", transition: "none",
            }}>
              <div style={{
                fontFamily: FONT, fontSize: 12, fontWeight: 700, color: C.bg,
                backgroundColor: C.accent, padding: "4px 12px", letterSpacing: 2,
                textTransform: "uppercase", minWidth: 70, textAlign: "center",
              }}>
                {finding.label}
              </div>
              <div>
                <div style={{ fontFamily: "monospace", fontSize: 24, color: C.text, fontWeight: 700 }}>
                  {finding.text}
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 16, color: C.gray, marginTop: 4 }}>
                  {finding.sub}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 6: Market Contrast ───────────────────────────

const SceneContrast: React.FC = () => {
  const frame = useCurrentFrame();
  const leftOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const rightOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateRight: "clamp" });

  const codeWall = [
    "import { defineConfig } from 'vite'",
    "import react from '@vitejs/plugin-react'",
    "import tailwindcss from 'tailwindcss'",
    "export default defineConfig({",
    "  plugins: [react()],",
    "  server: { port: 3000 },",
    "  build: { outDir: 'dist' },",
    "  resolve: { alias: { '@': './src' } },",
    "import { useState } from 'react'",
    "import { Button } from './ui/button'",
    "export function App() {",
    "  const [count, setCount] = useState(0)",
    "  return <Button onClick={() => {",
    "import { z } from 'zod'",
    "const schema = z.object({",
    "  name: z.string(),",
    "  email: z.string().email(),",
  ];

  const briefLines = [
    "## Constraints",
    "Hub: types.ts (183 imports)",
    "Generated files — don't edit",
    "",
    "## Conventions",
    "Use t('key') for i18n",
    "Named exports only",
    "Barrel imports from dirs",
    "",
    "## Patterns",
    "Zod for validation",
    "React Query for data",
    "Auth via useAuth()",
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      {/* Header */}
      <div style={{ position: "absolute", top: 80, width: "100%", textAlign: "center" }}>
        <FadeText delay={0}>
          <div style={{ fontFamily: FONT, fontSize: 48, fontWeight: 700, color: C.text }}>
            Some tools give AI your <span style={{ color: C.muted }}>codebase</span>.
          </div>
        </FadeText>
        <FadeText delay={30}>
          <div style={{ fontFamily: FONT, fontSize: 48, fontWeight: 700, color: C.text, marginTop: 12 }}>
            Sourcebook gives it your <span style={{ color: C.accent }}>project knowledge</span>.
          </div>
        </FadeText>
      </div>

      {/* Left: Code dump */}
      <div style={{
        position: "absolute", left: 80, top: 280, width: "42%", opacity: leftOpacity,
        backgroundColor: C.surface, padding: 24, border: `1px solid ${C.muted}33`,
        overflow: "hidden", height: 500,
      }}>
        <div style={{ fontFamily: FONT, fontSize: 11, color: C.muted, letterSpacing: 3, marginBottom: 16 }}>
          REPO DUMP — 15.7M TOKENS
        </div>
        {codeWall.map((line, i) => (
          <div key={i} style={{ fontFamily: "monospace", fontSize: 14, color: C.muted, lineHeight: 1.6, opacity: 0.5 }}>
            {line}
          </div>
        ))}
      </div>

      {/* Right: sourcebook output */}
      <div style={{
        position: "absolute", right: 80, top: 280, width: "42%", opacity: rightOpacity,
        backgroundColor: C.surface, padding: 24, border: `2px solid ${C.accent}`,
        height: 500, boxShadow: `8px 8px 0px 0px ${C.accent}33`,
      }}>
        <div style={{ fontFamily: FONT, fontSize: 11, color: C.accent, letterSpacing: 3, marginBottom: 16 }}>
          SOURCEBOOK — 858 TOKENS
        </div>
        {briefLines.map((line, i) => (
          <div key={i} style={{
            fontFamily: "monospace", fontSize: 16,
            color: line.startsWith("##") ? C.accent : C.text,
            fontWeight: line.startsWith("##") ? 700 : 400,
            lineHeight: 1.8,
          }}>
            {line}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 7: Benchmark ────────────────────────────────

const SceneBenchmark: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const bars = [
    { label: "v0.3", value: 122, color: "#1a5c1a" },
    { label: "v0.4.1", value: 128, color: "#2d8a2d" },
    { label: "v0.5", value: 125, color: C.accent },
    { label: "handwritten", value: 118, color: "#3B82F6" },
  ];

  const maxVal = 140;

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, justifyContent: "center", alignItems: "center" }}>
      <FadeText delay={0}>
        <div style={{ fontFamily: FONT, fontSize: 48, fontWeight: 700, color: C.text, textAlign: "center", marginBottom: 12 }}>
          We benchmarked it.
        </div>
      </FadeText>
      <FadeText delay={20}>
        <div style={{ fontFamily: FONT, fontSize: 36, color: C.gray, textAlign: "center", marginBottom: 60 }}>
          Then used the results to make it better.
        </div>
      </FadeText>

      {/* Bar chart */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 40, height: 300 }}>
        {bars.map((bar, i) => {
          const delay = 40 + i * 15;
          const progress = spring({ frame: frame - delay, fps, config: { damping: 25, stiffness: 60 } });
          const barHeight = interpolate(progress, [0, 1], [0, (bar.value / maxVal) * 280]);

          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div style={{ fontFamily: "monospace", fontSize: 18, color: C.text }}>
                {bar.value}s
              </div>
              <div style={{
                width: 80, height: barHeight, backgroundColor: bar.color,
                transition: "none",
              }} />
              <div style={{ fontFamily: FONT, fontSize: 14, color: C.gray, letterSpacing: 1 }}>
                {bar.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Subtitle */}
      <FadeText delay={90}>
        <div style={{
          fontFamily: FONT, fontSize: 20, color: C.accent, marginTop: 40, textAlign: "center",
        }}>
          v0.5 is closing the gap with handwritten briefs
        </div>
      </FadeText>
    </AbsoluteFill>
  );
};

// ─── Scene 8: Close ─────────────────────────────────────

const SceneClose: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 30, stiffness: 60 } });
  const taglineOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const urlOpacity = interpolate(frame, [60, 80], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Subtle glow
  const glowOpacity = interpolate(frame, [0, 60], [0, 0.15], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, justifyContent: "center", alignItems: "center" }}>
      {/* Subtle green glow */}
      <div style={{
        position: "absolute", width: 600, height: 600, borderRadius: "50%",
        background: `radial-gradient(circle, ${C.accent}22 0%, transparent 70%)`,
        opacity: glowOpacity,
      }} />

      <div style={{
        transform: `scale(${interpolate(logoScale, [0, 1], [0.8, 1])})`,
        opacity: logoScale, textAlign: "center", zIndex: 1,
      }}>
        <div style={{
          fontFamily: FONT, fontSize: 96, fontWeight: 700, color: C.text,
          letterSpacing: -4,
        }}>
          sourcebook
        </div>
      </div>

      <div style={{ opacity: taglineOpacity, textAlign: "center", marginTop: 30, zIndex: 1 }}>
        <div style={{ fontFamily: FONT, fontSize: 36, color: C.text, fontWeight: 500 }}>
          Don't take our word for it.
        </div>
        <div style={{ fontFamily: FONT, fontSize: 36, color: C.accent, fontWeight: 700, marginTop: 8 }}>
          Ask your agent.
        </div>
      </div>

      <div style={{ opacity: urlOpacity, textAlign: "center", marginTop: 50, zIndex: 1 }}>
        <div style={{
          fontFamily: FONT, fontSize: 22, color: C.gray, letterSpacing: 6,
        }}>
          sourcebook.run
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Black Beat (transition) ────────────────────────────

const BlackBeat: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#000000" }} />
);

// ─── Main Composition ───────────────────────────────────

export const SourcebookLaunch: React.FC = () => {
  return (
    <AbsoluteFill>
      {/* Scene 1: Hook (0:00-0:04) = frames 0-120 */}
      <Sequence from={0} durationInFrames={120}>
        <SceneHook />
      </Sequence>

      {/* Beat */}
      <Sequence from={118} durationInFrames={8}>
        <BlackBeat />
      </Sequence>

      {/* Scene 2: Hidden Rules (0:04-0:08) = frames 120-240 */}
      <Sequence from={120} durationInFrames={120}>
        <SceneHiddenRules />
      </Sequence>

      {/* Beat */}
      <Sequence from={238} durationInFrames={8}>
        <BlackBeat />
      </Sequence>

      {/* Scene 3: Human vs Agent (0:08-0:12) = frames 240-360 */}
      <Sequence from={240} durationInFrames={120}>
        <SceneHumanVsAgent />
      </Sequence>

      {/* Beat */}
      <Sequence from={358} durationInFrames={8}>
        <BlackBeat />
      </Sequence>

      {/* Scene 4: Reveal (0:12-0:16) = frames 360-480 */}
      <Sequence from={360} durationInFrames={120}>
        <SceneReveal />
      </Sequence>

      {/* Scene 5: Findings (0:16-0:22) = frames 480-660 */}
      <Sequence from={480} durationInFrames={180}>
        <SceneFindings />
      </Sequence>

      {/* Beat */}
      <Sequence from={658} durationInFrames={8}>
        <BlackBeat />
      </Sequence>

      {/* Scene 6: Contrast (0:22-0:26) = frames 660-780 */}
      <Sequence from={660} durationInFrames={120}>
        <SceneContrast />
      </Sequence>

      {/* Beat */}
      <Sequence from={778} durationInFrames={8}>
        <BlackBeat />
      </Sequence>

      {/* Scene 7: Benchmark (0:26-0:31) = frames 780-930 */}
      <Sequence from={780} durationInFrames={150}>
        <SceneBenchmark />
      </Sequence>

      {/* Beat */}
      <Sequence from={928} durationInFrames={8}>
        <BlackBeat />
      </Sequence>

      {/* Scene 8: Close (0:31-0:36) = frames 930-1080 */}
      <Sequence from={930} durationInFrames={150}>
        <SceneClose />
      </Sequence>
    </AbsoluteFill>
  );
};
