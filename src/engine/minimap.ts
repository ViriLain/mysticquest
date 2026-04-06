import type { WorldState, PlayerState } from './types';

export interface RoomPosition {
  x: number;
  y: number;
  roomId: string;
  name: string;
  region: string;
}

export interface RoomEdge {
  from: string;
  to: string;
}

export interface MinimapLayout {
  positions: Record<string, RoomPosition>;
  edges: RoomEdge[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

/** Map exit direction names to (dx, dy) offsets. */
function directionOffset(dir: string): [number, number] {
  switch (dir) {
    case 'north': return [0, -1];
    case 'south': return [0, 1];
    case 'east':  return [1, 0];
    case 'west':  return [-1, 0];
    case 'up':    return [0, -1];
    case 'down':  return [0, 1];
    default:      return [0, 1]; // secret_south, descend, etc.
  }
}

/**
 * Spiral search for the nearest unoccupied cell around (cx, cy).
 * Returns the first free position.
 */
function findFreePosition(
  cx: number,
  cy: number,
  occupied: Set<string>,
): [number, number] {
  const key = `${cx},${cy}`;
  if (!occupied.has(key)) return [cx, cy];

  // Spiral outward: try increasing radius
  for (let radius = 1; radius <= 20; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const k = `${cx + dx},${cy + dy}`;
        if (!occupied.has(k)) return [cx + dx, cy + dy];
      }
    }
  }

  // Fallback — should never happen with reasonable room counts
  return [cx + 21, cy];
}

export function computeMinimapLayout(
  world: WorldState,
  player: PlayerState,
): MinimapLayout {
  const visited = player.visitedRooms;
  const visitedIds = new Set(Object.keys(visited));

  const positions: Record<string, RoomPosition> = {};
  const occupied = new Set<string>();
  const edgeSet = new Set<string>();
  const edges: RoomEdge[] = [];

  // Pick BFS start: prefer manor_entry if visited, else current room
  const startRoom =
    visitedIds.has('manor_entry') ? 'manor_entry' : player.currentRoom;

  if (!visitedIds.has(startRoom)) {
    // Nothing to lay out
    return { positions: {}, edges: [], bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 } };
  }

  // BFS
  const queue: Array<{ roomId: string; x: number; y: number }> = [];
  const enqueued = new Set<string>();

  const placeRoom = (roomId: string, x: number, y: number) => {
    const [fx, fy] = findFreePosition(x, y, occupied);
    occupied.add(`${fx},${fy}`);
    const room = world.rooms[roomId];
    positions[roomId] = {
      x: fx,
      y: fy,
      roomId,
      name: room?.name ?? roomId,
      region: room?.region ?? '',
    };
  };

  placeRoom(startRoom, 0, 0);
  enqueued.add(startRoom);
  queue.push({ roomId: startRoom, x: 0, y: 0 });

  while (queue.length > 0) {
    const { roomId, x: _x, y: _y } = queue.shift()!;
    const room = world.rooms[roomId];
    if (!room) continue;

    // Use the placed position (may differ from requested due to collision resolution)
    const pos = positions[roomId];
    const px = pos.x;
    const py = pos.y;

    const allExits = { ...room.exits, ...room._dynamic_exits };

    for (const [dir, targetId] of Object.entries(allExits)) {
      if (!visitedIds.has(targetId)) continue;

      // Add edge (deduplicated, alphabetical ordering)
      const [a, b] = roomId < targetId ? [roomId, targetId] : [targetId, roomId];
      const edgeKey = `${a}|${b}`;
      if (!edgeSet.has(edgeKey)) {
        edgeSet.add(edgeKey);
        edges.push({ from: a, to: b });
      }

      // Enqueue neighbor if not yet placed
      if (!enqueued.has(targetId)) {
        enqueued.add(targetId);
        const [dx, dy] = directionOffset(dir);
        const nx = px + dx;
        const ny = py + dy;
        placeRoom(targetId, nx, ny);
        queue.push({ roomId: targetId, x: nx, y: ny });
      }
    }
  }

  // Handle any visited rooms not reachable from startRoom via BFS
  // (disconnected subgraphs — place them in a row below the main graph)
  let offsetX = 0;
  for (const roomId of visitedIds) {
    if (enqueued.has(roomId)) continue;
    enqueued.add(roomId);
    // Find a spot below all current positions
    const maxY = Object.values(positions).reduce((m, p) => Math.max(m, p.y), 0);
    placeRoom(roomId, offsetX, maxY + 2);
    offsetX += 2;
  }

  // Compute bounds
  const allPos = Object.values(positions);
  const bounds = {
    minX: Math.min(...allPos.map((p) => p.x)),
    maxX: Math.max(...allPos.map((p) => p.x)),
    minY: Math.min(...allPos.map((p) => p.y)),
    maxY: Math.max(...allPos.map((p) => p.y)),
  };

  return { positions, edges, bounds };
}

// --- Caching layer ---

let cachedLayout: MinimapLayout | null = null;
let cachedVisitedCount = 0;

export function getMinimapLayout(
  world: WorldState,
  player: PlayerState,
): MinimapLayout {
  const count = Object.keys(player.visitedRooms).length;
  if (cachedLayout && cachedVisitedCount === count) return cachedLayout;
  cachedLayout = computeMinimapLayout(world, player);
  cachedVisitedCount = count;
  return cachedLayout;
}
