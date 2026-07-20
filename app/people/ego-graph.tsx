"use client";

import Link from "next/link";
import { FOCUS_RING } from "@/components/ui";

/**
 * Dependency-free local ego-graph: the center entity in the middle, its
 * directly-linked nodes (meetings, companies) arranged radially around it.
 * Pure SVG + a little layout math — no d3/vis/cytoscape. Purposefully small
 * (≤~24 nodes): this answers "who is this person/company entangled with",
 * not a global hairball.
 */

export interface EgoGraphNode {
  id: string;
  label: string;
  kind: string;
  relation?: string;
}

export interface EgoGraphEdge {
  from: string;
  to: string;
  relation: string;
}

export interface EgoGraphCenter {
  id: string;
  label: string;
  kind: string;
}

const MAX_NODES = 24;
const TWO_RING_THRESHOLD = 14;

const VIEW_SIZE = 600;
const CENTER = VIEW_SIZE / 2;
const SINGLE_RING_RADIUS = 190;
const INNER_RING_RADIUS = 125;
const OUTER_RING_RADIUS = 220;
const CENTER_NODE_RADIUS = 32;
const RING_NODE_RADIUS = 18;

type KindStyle = { fill: string; stroke: string; text: string };

const KIND_STYLES: Record<string, KindStyle> = {
  person: { fill: "#eef2ff", stroke: "#6366f1", text: "#3730a3" }, // indigo
  org: { fill: "#ecfdf5", stroke: "#10b981", text: "#065f46" }, // emerald
  company: { fill: "#ecfdf5", stroke: "#10b981", text: "#065f46" }, // emerald (alias of org)
  meeting: { fill: "#f5f5f5", stroke: "#a3a3a3", text: "#525252" }, // neutral
};

const DEFAULT_STYLE: KindStyle = { fill: "#f5f5f5", stroke: "#a3a3a3", text: "#525252" };

function styleFor(kind: string): KindStyle {
  return KIND_STYLES[kind] ?? DEFAULT_STYLE;
}

function routeFor(kind: string, id: string): string | null {
  switch (kind) {
    case "person":
      return `/people/${id}`;
    case "org":
    case "company":
      return `/companies/${id}`;
    case "meeting":
      return `/meetings/${id}/draft`;
    default:
      return null;
  }
}

function truncateLabel(label: string, maxChars = 18): string {
  const trimmed = label.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars - 1).trimEnd()}…`;
}

interface Positioned {
  id: string;
  label: string;
  kind: string;
  x: number;
  y: number;
  radius: number;
}

function layoutNodes(center: EgoGraphCenter, nodes: EgoGraphNode[]): Positioned[] {
  const ringNodes = nodes.slice(0, MAX_NODES);
  const useTwoRings = ringNodes.length > TWO_RING_THRESHOLD;
  const innerCount = useTwoRings ? Math.ceil(ringNodes.length / 2) : ringNodes.length;

  const positioned: Positioned[] = [
    { id: center.id, label: center.label, kind: center.kind, x: CENTER, y: CENTER, radius: CENTER_NODE_RADIUS },
  ];

  ringNodes.forEach((node, i) => {
    const isInner = !useTwoRings || i < innerCount;
    const ringIndex = isInner ? i : i - innerCount;
    const ringTotal = isInner ? innerCount : ringNodes.length - innerCount;
    const radius = useTwoRings ? (isInner ? INNER_RING_RADIUS : OUTER_RING_RADIUS) : SINGLE_RING_RADIUS;
    const angle = (ringIndex / Math.max(ringTotal, 1)) * Math.PI * 2 - Math.PI / 2;
    positioned.push({
      id: node.id,
      label: node.label,
      kind: node.kind,
      x: CENTER + radius * Math.cos(angle),
      y: CENTER + radius * Math.sin(angle),
      radius: RING_NODE_RADIUS,
    });
  });

  return positioned;
}

/** Clickable node: circle + initial + label, linking to the right route for its kind. */
function NodeMark({ node }: { node: Positioned }) {
  const style = styleFor(node.kind);
  const href = routeFor(node.kind, node.id);
  const initial = node.label.trim().charAt(0).toUpperCase() || "?";
  const labelY = node.y + node.radius + 14;
  const fontSize = node.radius === CENTER_NODE_RADIUS ? 13 : 10;

  const content = (
    <g className="transition-opacity hover:opacity-80">
      <circle cx={node.x} cy={node.y} r={node.radius} fill={style.fill} stroke={style.stroke} strokeWidth={1.5} />
      <text
        x={node.x}
        y={node.y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={node.radius === CENTER_NODE_RADIUS ? 18 : 12}
        fontWeight={600}
        fill={style.text}
      >
        {initial}
      </text>
      <title>{node.label}</title>
      <text
        x={node.x}
        y={labelY}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight={node.radius === CENTER_NODE_RADIUS ? 600 : 400}
        fill="#404040"
      >
        {truncateLabel(node.label, node.radius === CENTER_NODE_RADIUS ? 18 : 12)}
      </text>
    </g>
  );

  if (!href) return content;

  return (
    <Link href={href} aria-label={node.label} className="cursor-pointer focus-visible:outline-none">
      {content}
    </Link>
  );
}

function EdgeLine({ edge, positions }: { edge: EgoGraphEdge; positions: Map<string, Positioned> }) {
  const from = positions.get(edge.from);
  const to = positions.get(edge.to);
  if (!from || !to) return null;

  const midX = from.x + (to.x - from.x) * 0.62;
  const midY = from.y + (to.y - from.y) * 0.62;
  const labelWidth = Math.max(edge.relation.length * 4.6 + 8, 20);

  return (
    <g>
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#d4d4d4" strokeWidth={1.25} />
      <rect
        x={midX - labelWidth / 2}
        y={midY - 7}
        width={labelWidth}
        height={13}
        rx={3}
        fill="white"
        fillOpacity={0.9}
      />
      <text x={midX} y={midY} textAnchor="middle" dominantBaseline="central" fontSize={8} fill="#737373">
        {edge.relation}
      </text>
    </g>
  );
}

const LEGEND_ITEMS: { kind: string; label: string }[] = [
  { kind: "person", label: "Person" },
  { kind: "org", label: "Organisation" },
  { kind: "meeting", label: "Meeting" },
];

/** Shared node list (link + relation) used by both the mobile-open and desktop-collapsed list views below. */
function NodeListItems({ nodes, className = "" }: { nodes: EgoGraphNode[]; className?: string }) {
  return (
    <ul className={`space-y-1 ${className}`}>
      {nodes.map((node) => {
        const href = routeFor(node.kind, node.id);
        return (
          <li key={node.id}>
            {href ? (
              <Link href={href} className={`rounded-control text-ink-600 hover:underline ${FOCUS_RING}`}>
                {node.label}
              </Link>
            ) : (
              <span>{node.label}</span>
            )}
            {node.relation ? <span className="text-paper-500"> — {node.relation}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function EgoGraph({
  center,
  nodes,
  edges,
}: {
  center: EgoGraphCenter;
  nodes: EgoGraphNode[];
  edges: EgoGraphEdge[];
}) {
  const cappedNodes = nodes.slice(0, MAX_NODES);
  const overflow = nodes.length - cappedNodes.length;
  const positioned = layoutNodes(center, cappedNodes);
  const positions = new Map(positioned.map((p) => [p.id, p]));
  const ringPositions = positioned.filter((p) => p.id !== center.id);

  return (
    <div className="rounded-surface border border-paper-200 bg-white p-4 shadow-raised">
      <div className="mx-auto w-full max-w-[520px]">
        <svg
          viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
          role="img"
          aria-label={`Ego graph for ${center.label}, showing ${cappedNodes.length} connections`}
          className="h-auto w-full"
        >
          {edges.map((edge, i) => (
            <EdgeLine key={`${edge.from}-${edge.to}-${i}`} edge={edge} positions={positions} />
          ))}
          {ringPositions.map((node) => (
            <NodeMark key={node.id} node={node} />
          ))}
          {positions.has(center.id) ? <NodeMark node={positions.get(center.id) as Positioned} /> : null}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-caption text-paper-500">
        {LEGEND_ITEMS.map((item) => (
          <span key={item.kind} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: styleFor(item.kind).stroke }}
            />
            {item.label}
          </span>
        ))}
      </div>

      {overflow > 0 ? (
        <p className="mt-2 text-center text-caption text-paper-500">and {overflow} more not shown</p>
      ) : null}

      {/*
        Below `sm`, up to 24 radially-packed labels get crowded fast on a
        375px screen — the list is the reliable, legible fallback there, so
        it's shown open (not tucked behind a tap) by default. At `sm` and up
        the graph has enough room, so the list goes back to a collapsed
        <details> to avoid duplicating content.
      */}
      <div className="mt-3 rounded-surface border border-paper-200 bg-paper-50 p-3 text-caption text-paper-500 sm:hidden">
        <p className="font-medium text-paper-600">List view</p>
        <NodeListItems nodes={cappedNodes} className="mt-2" />
      </div>

      <details className="mt-3 hidden text-caption text-paper-500 sm:block">
        <summary className={`cursor-pointer select-none rounded-control text-paper-500 hover:text-paper-700 ${FOCUS_RING}`}>
          View as list
        </summary>
        <NodeListItems nodes={cappedNodes} className="mt-2" />
      </details>
    </div>
  );
}
