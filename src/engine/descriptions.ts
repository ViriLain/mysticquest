import type { PlayerState, RoomDef } from './types';

export function isRoomCleared(room: RoomDef, player: PlayerState): boolean {
  if (room.clear_flag) return !!player.firedEvents[room.clear_flag];

  if (room.enemies && room.enemies.length > 0) {
    return room.enemies.every(enemyId => room._dead_enemies?.[enemyId]);
  }

  return false;
}

export function pickDescription(room: RoomDef, player: PlayerState): string {
  if (room.description_cleared && isRoomCleared(room, player)) {
    return room.description_cleared;
  }
  return room.description;
}
