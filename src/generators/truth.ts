import path from "node:path";
import type { ProjectScan } from "../types.js";

interface TruthNode {
  id: string;
  label: string;
  importers: number;
  score: number;
  isFragile: boolean;
  fragileDetail?: string;
  blastRadius: number;
  x: number;
  y: number;
  radius: number;
  /** 0 = foreground (closest), higher = further back. Drives 2.5D depth. */
  depth: number;
}

interface TruthEdge {
  from: string;
  to: string;
  type: "import" | "cochange";
  label?: string;
}

/**
 * Generate a self-contained HTML file with the Repo Truth Map.
 * Shows only signal: hub files, co-change paths, fragile files, blast radius.
 * Uses 2.5D depth to create cinematic hierarchy — important nodes feel closer.
 */
export function generateTruthMap(scan: ProjectScan): string {
  const repoName = path.basename(scan.dir);
  const edges = scan.edges ?? [];
  const rankedFiles = scan.rankedFiles ?? [];
  const coChangeClusters = scan.coChangeClusters ?? [];

  // 1. Compute fan-in (importers) per file
  const fanIn = new Map<string, number>();
  for (const edge of edges) {
    fanIn.set(edge.to, (fanIn.get(edge.to) ?? 0) + 1);
  }

  // 2. Get top hub files (sorted by fan-in, take top 10)
  const hubs = [...fanIn.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .filter(([, count]) => count >= 2);

  // 3. Get fragile files from findings
  const fragileFiles = new Map<string, string>();
  for (const finding of scan.findings) {
    if (finding.category === "Fragile code") {
      const matches = finding.description.matchAll(/([^\s;,]+\.[a-z]+)\s*\((\d+ edits[^)]*)\)/g);
      for (const match of matches) {
        fragileFiles.set(match[1], match[2]);
      }
    }
  }

  // 4. Compute blast radius (direct dependents) for each hub
  const dependents = new Map<string, number>();
  for (const edge of edges) {
    dependents.set(edge.to, (dependents.get(edge.to) ?? 0) + 1);
  }

  // 5. Build node set — hub files + fragile files + co-change partners
  const nodeSet = new Set<string>();
  for (const [file] of hubs) nodeSet.add(file);
  for (const [file] of fragileFiles) nodeSet.add(file);
  for (const [a, b] of coChangeClusters) {
    nodeSet.add(a);
    nodeSet.add(b);
  }

  // 6. Build PageRank lookup
  const scoreMap = new Map<string, number>();
  for (const { file, score } of rankedFiles) {
    scoreMap.set(file, score);
  }

  // 7. Layout nodes — deterministic, sorted by importance
  const allNodes = [...nodeSet];
  allNodes.sort((a, b) => (scoreMap.get(b) ?? 0) - (scoreMap.get(a) ?? 0));

  const WIDTH = 1200;
  const HEIGHT = 660;

  // Find max fan-in for scaling
  const maxFanIn = Math.max(...allNodes.map((f) => fanIn.get(f) ?? 0), 1);

  // Layout: concentric ellipses with isometric perspective
  const NODES_PER_RING = [1, 3, 4, 6, 8];
  const RING_RADII = [0, 195, 300, 390, 480];
  const Y_SQUISH = 0.6;

  // Place nodes in rings first, then center-of-mass shift
  const rawPositions: { x: number; y: number }[] = [];
  const tempCX = WIDTH / 2;
  const tempCY = HEIGHT / 2;

  for (let i = 0; i < allNodes.length; i++) {
    let ring = 0;
    let cumulative = 0;
    for (let r = 0; r < NODES_PER_RING.length; r++) {
      if (i < cumulative + NODES_PER_RING[r]) { ring = r; break; }
      cumulative += NODES_PER_RING[r];
      if (r === NODES_PER_RING.length - 1) ring = r + 1;
    }
    const posInRing = i - cumulative;
    const nodesInThisRing = ring < NODES_PER_RING.length ? NODES_PER_RING[ring] : 6;
    const ringRadius = ring < RING_RADII.length ? RING_RADII[ring] : RING_RADII[RING_RADII.length - 1] + (ring - RING_RADII.length + 1) * 110;
    const ringOffset = ring * 0.35;
    const angle = (posInRing / nodesInThisRing) * Math.PI * 2 - Math.PI / 2 + ringOffset;
    rawPositions.push({
      x: tempCX + Math.cos(angle) * ringRadius,
      y: tempCY + Math.sin(angle) * ringRadius * Y_SQUISH,
    });
  }

  // FIX #1: Center-of-mass correction — shift all nodes so visual center aligns with canvas center
  const avgX = rawPositions.reduce((s, p) => s + p.x, 0) / rawPositions.length;
  const avgY = rawPositions.reduce((s, p) => s + p.y, 0) / rawPositions.length;
  const shiftX = tempCX - avgX;
  const shiftY = (tempCY - 40) - avgY; // FIX #2: push graph up ~40px to reduce dead space

  const DEPTH_LEVELS = 4;

  const nodes: TruthNode[] = allNodes.map((file, i) => {
    const fi = fanIn.get(file) ?? 0;
    const isFragile = fragileFiles.has(file);
    const blast = dependents.get(file) ?? 0;
    const score = scoreMap.get(file) ?? 0;

    // Determine ring for depth
    let ring = 0;
    let cumulative = 0;
    for (let r = 0; r < NODES_PER_RING.length; r++) {
      if (i < cumulative + NODES_PER_RING[r]) { ring = r; break; }
      cumulative += NODES_PER_RING[r];
      if (r === NODES_PER_RING.length - 1) ring = r + 1;
    }

    const depth = Math.min(ring, DEPTH_LEVELS - 1);
    const depthScale = 1 - depth * 0.15;
    const t = maxFanIn > 1 ? fi / maxFanIn : 0;
    const baseRadius = 10 + t * 28;
    const radius = Math.max(7, baseRadius * depthScale);

    return {
      id: file,
      label: shortenPath(file),
      importers: fi,
      score,
      isFragile,
      fragileDetail: fragileFiles.get(file),
      blastRadius: blast,
      x: rawPositions[i].x + shiftX,
      y: rawPositions[i].y + shiftY,
      radius,
      depth,
    };
  });

  // 8. Build edge list
  const truthEdges: TruthEdge[] = [];
  for (const edge of edges) {
    if (nodeSet.has(edge.from) && nodeSet.has(edge.to)) {
      truthEdges.push({ from: edge.from, to: edge.to, type: "import" });
    }
  }
  for (const [a, b, count] of coChangeClusters) {
    truthEdges.push({ from: a, to: b, type: "cochange", label: `${count} co-commits` });
  }

  // 9. Stats line — FIX #6: "hidden dependency" not "hidden paths"
  const hubCount = hubs.length;
  const cowPathCount = coChangeClusters.length;
  const fragileCount = fragileFiles.size;
  const depWord = cowPathCount === 1 ? "hidden dependency" : "hidden dependencies";
  const statsLine = `${hubCount} hub files · ${cowPathCount} ${depWord} · ${fragileCount} fragile areas`;

  return generateHTML(repoName, nodes, truthEdges, statsLine);
}

function shortenPath(file: string): string {
  const parts = file.split("/");
  if (parts.length <= 2) return file;
  return `${parts[0]}/…/${parts[parts.length - 1]}`;
}

function generateHTML(
  repoName: string,
  nodes: TruthNode[],
  edges: TruthEdge[],
  statsLine: string
): string {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Render back-to-front for proper layering
  const sortedNodes = [...nodes].sort((a, b) => b.depth - a.depth);

  // Import edges — deepest layer, very subtle
  const importEdgesSVG = edges
    .filter((e) => e.type === "import")
    .map((edge) => {
      const from = nodeMap.get(edge.from);
      const to = nodeMap.get(edge.to);
      if (!from || !to) return "";
      const depth = Math.max(from.depth, to.depth);
      const opacity = 0.35 - depth * 0.08;
      return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"
        stroke="#555" stroke-width="1" opacity="${Math.max(0.1, opacity)}"/>`;
    })
    .join("\n");

  // FIX #3: Co-change edges — LOUDER. Thicker, brighter, stronger glow. No label (annotation covers it).
  const cochangeEdgesSVG = edges
    .filter((e) => e.type === "cochange")
    .map((edge) => {
      const from = nodeMap.get(edge.from);
      const to = nodeMap.get(edge.to);
      if (!from || !to) return "";
      // Arc control point: halfway horizontally, arcs wide above both nodes
      const midX = (from.x + to.x) / 2;
      const midY = Math.min(from.y, to.y) - 130;
      return `
        <path d="M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}"
          fill="none" stroke="#FFCC00" stroke-width="3" stroke-dasharray="10 5"
          opacity="0.9" filter="url(#glow-gold)"/>`;
    })
    .join("\n");

  // FIX #4: Depth layering with blur on back nodes
  const nodesSVG = sortedNodes
    .map((node) => {
      const depthOpacity = 1 - node.depth * 0.2;
      const labelOpacity = Math.max(0.35, 1 - node.depth * 0.25);

      let fill = "#3D6B99"; // deep background blue
      if (node.isFragile) {
        fill = "#FF4444";
      } else if (node.importers >= 5) {
        fill = "#00FF41";
      } else if (node.importers >= 2) {
        fill = "#E8920D";
      }

      // FIX #4: Stronger shadow for foreground, blur filter for back nodes
      let nodeFilter = "";
      if (node.depth === 0) {
        if (node.isFragile) nodeFilter = 'filter="url(#glow-red)"';
        else if (node.importers >= 5) nodeFilter = 'filter="url(#glow-green)"';
      } else if (node.depth >= 3) {
        nodeFilter = 'filter="url(#depth-blur)"';
      }

      // Drop shadow — stronger for foreground
      const shadow = node.depth <= 1
        ? `<circle cx="${node.x}" cy="${node.y + 5}" r="${node.radius + 2}" fill="rgba(0,0,0,${0.5 - node.depth * 0.15})" filter="url(#shadow)"/>`
        : "";

      // FIX #7: Subtle blast radius ring for main hub
      const blastRing = node.depth === 0 && node.blastRadius >= 5
        ? `<circle cx="${node.x}" cy="${node.y}" r="${node.radius + 16}" fill="none" stroke="${fill}" stroke-width="0.6" opacity="0.25"/>
           <circle cx="${node.x}" cy="${node.y}" r="${node.radius + 28}" fill="none" stroke="${fill}" stroke-width="0.3" opacity="0.12"/>`
        : "";

      // Fragile outer ring
      const fragileRing = node.isFragile
        ? `<circle cx="${node.x}" cy="${node.y}" r="${node.radius + 7}" fill="none" stroke="#FF4444" stroke-width="1.2" opacity="${depthOpacity * 0.45}" stroke-dasharray="4 2"/>`
        : "";

      const importerLabel = node.importers >= 2
        ? `<text x="${node.x}" y="${node.y + 4}" fill="${node.isFragile || node.importers < 5 ? '#fff' : '#000'}" font-size="${Math.max(8, 10 * (1 - node.depth * 0.1))}" text-anchor="middle" font-family="'SF Mono',monospace" font-weight="bold" opacity="${depthOpacity}">${node.importers}</text>`
        : "";

      // FIX #5: Name first, then fragile detail below
      const nameLabel = `<text x="${node.x}" y="${node.y + node.radius + 15}" fill="#ccc" font-size="${Math.max(9, 11 - node.depth)}" text-anchor="middle" font-family="'SF Mono',monospace" opacity="${labelOpacity}">${node.label}</text>`;

      const fragileLabel = node.isFragile && node.fragileDetail
        ? `<text x="${node.x + 8}" y="${node.y + node.radius + 28}" fill="#FF4444" font-size="9" text-anchor="middle" font-family="'SF Mono',monospace" opacity="${labelOpacity * 0.9}">⚠ ${node.fragileDetail}</text>`
        : "";

      // Blast label: below name for center, above-right for others
      let blastLabel = "";
      if (node.blastRadius >= 3) {
        if (node.depth === 0) {
          const yOffset = node.isFragile ? 40 : 28;
          blastLabel = `<text x="${node.x}" y="${node.y + node.radius + yOffset}" fill="#555" font-size="9" text-anchor="middle" font-family="'SF Mono',monospace" opacity="${labelOpacity}">affects ${node.blastRadius} files</text>`;
        } else {
          blastLabel = `<text x="${node.x + node.radius + 8}" y="${node.y - node.radius - 6}" fill="#555" font-size="9" font-family="'SF Mono',monospace" opacity="${labelOpacity}">affects ${node.blastRadius} files</text>`;
        }
      }

      return `
        <g class="node" data-depth="${node.depth}">
          ${blastRing}
          ${shadow}
          ${fragileRing}
          <circle cx="${node.x}" cy="${node.y}" r="${node.radius}"
            fill="${fill}" opacity="${depthOpacity * 0.9}"
            ${nodeFilter}/>
          ${importerLabel}
          ${nameLabel}
          ${fragileLabel}
          ${blastLabel}
        </g>`;
    })
    .join("\n");

  // FIX #3: "Oh shit" annotation — two lines, louder
  let ohShitAnnotation = "";
  const cochangeEdge = edges.find((e) => e.type === "cochange");
  if (cochangeEdge) {
    const from = nodeMap.get(cochangeEdge.from);
    const to = nodeMap.get(cochangeEdge.to);
    if (from && to) {
      const midX = (from.x + to.x) / 2;
      const midY = Math.min(from.y, to.y) - 105;
      ohShitAnnotation = `
        <text x="${midX}" y="${midY}" text-anchor="middle" font-family="'SF Mono',monospace">
          <tspan fill="#FFCC00" font-size="12" font-weight="bold">⚠ hidden dependency</tspan>
          <tspan x="${midX}" dy="15" fill="#FFCC00" font-size="10" opacity="0.7">not in code — but always moves together</tspan>
        </text>`;
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Repo Truth Map — ${repoName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0d1117;
    color: #c9d1d9;
    font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
  }
  .container { max-width: 1280px; margin: 0 auto; padding: 20px 20px 12px; }
  .header { text-align: center; margin-bottom: 6px; }
  .header h1 {
    font-size: 11px; letter-spacing: 0.4em; text-transform: uppercase;
    color: #00FF41; font-weight: 400; margin-bottom: 4px;
  }
  .header h2 { font-size: 30px; font-weight: 700; color: #fff; margin-bottom: 2px; }
  .header .subtitle { font-size: 12px; color: #555; font-style: italic; }
  .stats {
    text-align: center; font-size: 11px; color: #444;
    margin: 8px 0 10px; letter-spacing: 0.15em;
  }
  .legend {
    display: flex; justify-content: center; gap: 20px;
    margin-bottom: 4px; font-size: 10px; color: #555;
    letter-spacing: 0.1em;
  }
  .legend-item { display: flex; align-items: center; gap: 5px; }
  .legend-dot { width: 8px; height: 8px; border-radius: 50%; }
  svg { display: block; margin: 0 auto; }
  .footer {
    text-align: center; margin-top: 12px;
    font-size: 10px; color: #2a2a2a; letter-spacing: 0.1em;
  }
  .footer a { color: #00FF41; text-decoration: none; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>REPO TRUTH MAP</h1>
    <h2>${repoName}</h2>
    <div class="subtitle">where your codebase actually lives</div>
  </div>
  <div class="stats">${statsLine}</div>
  <div class="legend">
    <div class="legend-item"><div class="legend-dot" style="background:#00FF41"></div> HUB FILES</div>
    <div class="legend-item"><div class="legend-dot" style="background:#E8920D"></div> MODERATE HUBS</div>
    <div class="legend-item"><div class="legend-dot" style="background:#FF4444"></div> FRAGILE FILES</div>
    <div class="legend-item"><div class="legend-dot" style="background:transparent; border: 1.5px dashed #FFCC00; width:7px; height:7px;"></div> HIDDEN DEPENDENCIES</div>
  </div>
  <div style="text-align:center; font-size:9px; color:#333; letter-spacing:0.1em; margin-bottom:4px;">node size + number = how many files import it</div>
  <svg width="1200" height="660" viewBox="0 0 1200 660" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="8"/>
      </filter>
      <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="8" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="10" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="glow-gold" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="6" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="depth-blur" x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation="1.5"/>
      </filter>
    </defs>
    <!-- Layer 0: Import edges (deepest) -->
    ${importEdgesSVG}
    <!-- Layer 1: Nodes (back to front by depth) -->
    ${nodesSVG}
    <!-- Layer 2: Co-change paths (float above) -->
    ${cochangeEdgesSVG}
    <!-- Layer 3: Annotations (topmost) -->
    ${ohShitAnnotation}
  </svg>
  <div class="footer">generated by <a href="https://sourcebook.run">sourcebook</a> · see where your code actually lives</div>
</div>
</body>
</html>`;
}
