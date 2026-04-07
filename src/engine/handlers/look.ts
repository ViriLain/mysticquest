import type { GameStore } from '../types';
import { displayRoom } from '../display';
import { addLine } from '../output';

export function handleLook(store: GameStore): void {
  if (!store.player) return;
  addLine(store, '');
  displayRoom(store, store.player.currentRoom);
}
