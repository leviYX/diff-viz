import dagre from 'dagre';
import type { EdgeMode, LayoutDirection, ReviewEdge, ReviewNode } from './types';

export const NODE_SIZES = {
  changed: { width: 256, height: 94 },
  impacted: { width: 228, height: 74 },
};

export interface PositionedNode {
  node: ReviewNode;
  x: number;
  y: number;
  width: number;
  height: number;
}

function sizeFor(node: ReviewNode) {
  return node.status === 'impacted_only' ? NODE_SIZES.impacted : NODE_SIZES.changed;
}

export function computeLayout(
  nodes: ReviewNode[],
  edges: ReviewEdge[],
  direction: LayoutDirection,
  edgeMode: EdgeMode,
): PositionedNode[] {
  const graph = new dagre.graphlib.Graph({ multigraph: false, compound: false });
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: direction,
    nodesep: direction === 'LR' ? 30 : 44,
    ranksep: direction === 'LR' ? 104 : 74,
    edgesep: 18,
    marginx: 24,
    marginy: 24,
    acyclicer: 'greedy',
    ranker: 'network-simplex',
  });

  const included = new Set(nodes.map((node) => node.id));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    const size = sizeFor(node);
    graph.setNode(node.id, { ...size });
  }

  const seenEdges = new Set<string>();
  for (const edge of edges) {
    if (!included.has(edge.source) || !included.has(edge.target)) continue;
    const importer = byId.get(edge.source);
    const imported = byId.get(edge.target);
    if (!importer || !imported) continue;
    const impactMode = edgeMode === 'impact';
    const importerChanged = importer.status !== 'impacted_only';
    const importedChanged = imported.status !== 'impacted_only';
    // Keep layout edges identical to the edges the canvas actually draws.
    if (impactMode && importerChanged && !importedChanged) continue;
    const source = impactMode ? edge.target : edge.source;
    const target = impactMode ? edge.source : edge.target;
    if (source === target) continue;
    const key = `${source}→${target}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    graph.setEdge(source, target);
  }

  dagre.layout(graph);

  return nodes.map((node) => {
    const size = sizeFor(node);
    const position = graph.node(node.id);
    return {
      node,
      x: (position?.x ?? 0) - size.width / 2,
      y: (position?.y ?? 0) - size.height / 2,
      width: size.width,
      height: size.height,
    };
  });
}
