import { useEffect, useRef, useCallback } from 'react';
import type { WorldState, PlayerState } from '../engine/types';
import { getMinimapLayout, pickMinimapLabels } from '../engine/minimap';

interface MinimapProps {
  world: WorldState;
  player: PlayerState;
  pan: { x: number; y: number };
  onPanChange: (pan: { x: number; y: number }) => void;
}

const CELL_SIZE = 60;
const NODE_SIZE = 14;
const PADDING = 40;
const CANVAS_W = 1280;
const CANVAS_H = 720;

const REGION_COLORS: Record<string, string> = {
  manor: '#40a040',
  wilds: '#a08040',
  darkness: '#a04040',
  wastes: '#a0a040',
  hidden: '#ff00ff', // placeholder, will cycle rainbow
  dungeon: '#8040a0',
};

const REGION_LABELS: Array<[string, string]> = [
  ['manor', '#40a040'],
  ['wilds', '#a08040'],
  ['darkness', '#a04040'],
  ['wastes', '#a0a040'],
  ['dungeon', '#8040a0'],
];

function getRegionColor(region: string, time: number): string {
  const r = region.toLowerCase();
  if (r === 'hidden') {
    const hue = (time * 0.1) % 360;
    return `hsl(${hue}, 80%, 60%)`;
  }
  for (const key of Object.keys(REGION_COLORS)) {
    if (r.includes(key)) return REGION_COLORS[key];
  }
  return '#40a040';
}

export default function Minimap({ world, player, pan, onPanChange }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const draggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const layout = getMinimapLayout(world, player);
    const now = Date.now();

    // Clear
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Center offset: put current room in center, then apply pan
    const currentPos = layout.positions[player.currentRoom];
    const centerX = CANVAS_W / 2;
    const centerY = CANVAS_H / 2;
    const offsetX = centerX - (currentPos ? currentPos.x * CELL_SIZE : 0) + pan.x;
    const offsetY = centerY - (currentPos ? currentPos.y * CELL_SIZE : 0) + pan.y;

    // Helper: room position to canvas coords
    const toCanvas = (roomId: string): { x: number; y: number } | null => {
      const p = layout.positions[roomId];
      if (!p) return null;
      return { x: p.x * CELL_SIZE + offsetX, y: p.y * CELL_SIZE + offsetY };
    };

    // Draw edges
    ctx.strokeStyle = 'rgba(40, 180, 40, 0.25)';
    ctx.lineWidth = 1;
    for (const edge of layout.edges) {
      const a = toCanvas(edge.from);
      const b = toCanvas(edge.to);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Draw unexplored-exit stubs as faded dashed lines with a "?" marker.
    // These point in the in-game direction the player would type — they hint
    // at where to explore next, not where the room will land on the map.
    const stubLen = CELL_SIZE * 0.45;
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(180, 220, 140, 0.5)';
    ctx.lineWidth = 1;
    for (const stub of layout.unexploredExits) {
      const a = toCanvas(stub.fromRoomId);
      if (!a) continue;
      // Start the stub just outside the node so it doesn't sit under the fill.
      const startOffset = NODE_SIZE / 2 + 1;
      const sx = a.x + stub.dx * startOffset;
      const sy = a.y + stub.dy * startOffset;
      const ex = a.x + stub.dx * stubLen;
      const ey = a.y + stub.dy * stubLen;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(200, 230, 160, 0.75)';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const stub of layout.unexploredExits) {
      const a = toCanvas(stub.fromRoomId);
      if (!a) continue;
      const ex = a.x + stub.dx * stubLen;
      const ey = a.y + stub.dy * stubLen;
      ctx.fillText('?', ex, ey);
    }
    ctx.textBaseline = 'alphabetic';

    // Draw route history line
    const route = player.routeHistory;
    if (route.length > 1) {
      ctx.lineWidth = 2;
      for (let i = 0; i < route.length - 1; i++) {
        const a = toCanvas(route[i]);
        const b = toCanvas(route[i + 1]);
        if (!a || !b) continue;
        const alpha = 0.2 + 0.6 * (i / (route.length - 1));
        ctx.strokeStyle = `rgba(255, 180, 50, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // Draw room nodes
    const half = NODE_SIZE / 2;
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';

    for (const roomId of Object.keys(layout.positions)) {
      const pos = toCanvas(roomId);
      if (!pos) continue;
      const rp = layout.positions[roomId];
      const isCurrent = roomId === player.currentRoom;
      const color = getRegionColor(rp.region, now);

      // Filled rect
      ctx.fillStyle = isCurrent ? color : color;
      if (isCurrent) {
        // Brighter fill for current room
        ctx.globalAlpha = 1.0;
      } else {
        ctx.globalAlpha = 0.7;
      }
      ctx.fillRect(pos.x - half, pos.y - half, NODE_SIZE, NODE_SIZE);
      ctx.globalAlpha = 1.0;

      // Pulsing border for current room
      if (isCurrent) {
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.005);
        ctx.strokeStyle = `rgba(255, 255, 255, ${pulse})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(pos.x - half - 2, pos.y - half - 2, NODE_SIZE + 4, NODE_SIZE + 4);
      }
    }

    const canvasLayout = {
      ...layout,
      positions: Object.fromEntries(
        Object.entries(layout.positions).map(([roomId, room]) => [
          roomId,
          {
            ...room,
            x: room.x * CELL_SIZE + offsetX,
            y: room.y * CELL_SIZE + offsetY,
          },
        ]),
      ),
    };

    for (const label of pickMinimapLabels(canvasLayout, player.currentRoom, text => ctx.measureText(text).width, half)) {
      ctx.fillStyle = label.roomId === player.currentRoom
        ? 'rgba(10, 10, 10, 0.85)'
        : 'rgba(10, 10, 10, 0.72)';
      ctx.fillRect(label.x, label.y, label.w, label.h);

      ctx.fillStyle = label.roomId === player.currentRoom
        ? 'rgba(255, 255, 255, 0.95)'
        : 'rgba(200, 200, 200, 0.78)';
      ctx.fillText(label.text, label.centerX, label.baselineY);
    }

    // Draw legend in top-right
    const legendX = CANVAS_W - PADDING - 100;
    let legendY = PADDING;
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(200, 200, 200, 0.8)';
    ctx.fillText('REGIONS', legendX, legendY);
    legendY += 16;

    for (const [label, col] of REGION_LABELS) {
      ctx.fillStyle = col;
      ctx.fillRect(legendX, legendY - 8, 10, 10);
      ctx.fillStyle = 'rgba(200, 200, 200, 0.6)';
      ctx.fillText(label, legendX + 16, legendY);
      legendY += 16;
    }

    // Unexplored-exit legend entry
    legendY += 4;
    ctx.fillStyle = 'rgba(200, 230, 160, 0.75)';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('?', legendX + 4, legendY);
    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(200, 200, 200, 0.6)';
    ctx.fillText('unexplored', legendX + 16, legendY);

    // Bottom instructions
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(150, 150, 150, 0.6)';
    ctx.fillText('ESC to close', PADDING, CANVAS_H - PADDING - 16);
    ctx.fillText('Drag to pan', PADDING, CANVAS_H - PADDING);

    // Title top-left
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#40a040';
    ctx.fillText('MAP', PADDING, PADDING + 4);

    animFrameRef.current = requestAnimationFrame(draw);
  }, [world, player, pan]);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [draw]);

  // Mouse handlers for panning
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    draggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { x: pan.x, y: pan.y };
  }, [pan]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    onPanChange({ x: panStartRef.current.x + dx, y: panStartRef.current.y + dy });
  }, [onPanChange]);

  const onMouseUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  return (
    <div className="minimap-overlay">
      <canvas
        ref={canvasRef}
        className="minimap-canvas"
        width={CANVAS_W}
        height={CANVAS_H}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      />
    </div>
  );
}
