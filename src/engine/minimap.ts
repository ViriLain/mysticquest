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

export interface UnexploredExit {
  fromRoomId: string;
  direction: string;
  dx: number;
  dy: number;
}

export interface MinimapLayout {
  positions: Record<string, RoomPosition>;
  edges: RoomEdge[];
  unexploredExits: UnexploredExit[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

export interface MinimapLabelPlacement {
  roomId: string;
  text: string;
  centerX: number;
  baselineY: number;
  x: number;
  y: number;
  w: number;
  h: number;
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
  const unexploredExits: UnexploredExit[] = [];
  const unexploredSeen = new Set<string>();

  // Pick BFS start: prefer manor_entry if visited, else current room
  const startRoom =
    visitedIds.has('manor_entry') ? 'manor_entry' : player.currentRoom;

  if (!visitedIds.has(startRoom)) {
    // Nothing to lay out
    return {
      positions: {},
      edges: [],
      unexploredExits: [],
      bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
    };
  }

  // BFS. Positions live in `positions`; we queue room ids only so the visit
  // order matches the map in one place.
  const queue: string[] = [];
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
  queue.push(startRoom);

  while (queue.length > 0) {
    const roomId = queue.shift()!;
    const room = world.rooms[roomId];
    if (!room) continue;

    const { x: px, y: py } = positions[roomId];
    const allExits = { ...room.exits, ...room._dynamic_exits };

    for (const [dir, targetId] of Object.entries(allExits)) {
      if (!visitedIds.has(targetId)) {
        // Track as unexplored stub (skip secret_* — those are the puzzle).
        if (!dir.startsWith('secret_')) {
          const stubKey = `${roomId}|${dir}`;
          if (!unexploredSeen.has(stubKey)) {
            unexploredSeen.add(stubKey);
            const [sdx, sdy] = directionOffset(dir);
            unexploredExits.push({ fromRoomId: roomId, direction: dir, dx: sdx, dy: sdy });
          }
        }
        continue;
      }

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
        placeRoom(targetId, px + dx, py + dy);
        queue.push(targetId);
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

  return { positions, edges, unexploredExits, bounds };
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

export function pickMinimapLabels(
  layout: MinimapLayout,
  currentRoom: string,
  measureText: (text: string) => number,
  nodeHalf: number,
): MinimapLabelPlacement[] {
  const labels: MinimapLabelPlacement[] = [];
  const labelHeight = 10;
  const labelGap = 3;
  const placements = Object.values(layout.positions).sort((a, b) => {
    if (a.roomId === currentRoom) return -1;
    if (b.roomId === currentRoom) return 1;
    return a.roomId.localeCompare(b.roomId);
  });

  const makePlacement = (room: RoomPosition, pass: number): MinimapLabelPlacement => {
    const width = measureText(room.name);
    const centeredX = room.x;
    const above = room.roomId === currentRoom || (room.x + room.y + pass) % 2 === 0;
    const baselineY = above
      ? room.y - nodeHalf - 8 - pass * 12
      : room.y + nodeHalf + 12 + pass * 12;
    const boxY = above ? baselineY - labelHeight + 2 : baselineY - labelHeight + 2;
    return {
      roomId: room.roomId,
      text: room.name,
      centerX: centeredX,
      baselineY,
      x: centeredX - width / 2 - labelGap,
      y: boxY - labelGap,
      w: width + labelGap * 2,
      h: labelHeight + labelGap * 2,
    };
  };

  const overlaps = (candidate: MinimapLabelPlacement): boolean =>
    labels.some(label =>
      candidate.x < label.x + label.w &&
      candidate.x + candidate.w > label.x &&
      candidate.y < label.y + label.h &&
      candidate.y + candidate.h > label.y
    );

  for (const room of placements) {
    let chosen: MinimapLabelPlacement | null = null;
    for (let pass = 0; pass < 4; pass++) {
      const candidate = makePlacement(room, pass);
      if (!overlaps(candidate)) {
        chosen = candidate;
        break;
      }
    }
    if (!chosen) {
      chosen = makePlacement(room, 4);
    }
    labels.push(chosen);
  }

  return labels;
}
