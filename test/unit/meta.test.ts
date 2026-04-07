import { describe, expect, it } from 'vitest';
import { createInitialStore } from '../../src/engine/gameReducer';
import { handleLearn } from '../../src/engine/handlers/meta';
import { createPlayer } from '../../src/engine/player';

describe('meta handlers', () => {
  it('learn applies immediate skill effects and invokes callbacks', () => {
    const store = createInitialStore();
    store.player = createPlayer();
    store.player.skillPoints = 1;

    const emitted: string[] = [];
    let refreshed = 0;
    let scholarChecks = 0;

    handleLearn(
      store,
      'iron will',
      () => {
        refreshed++;
      },
      sound => {
        emitted.push(sound);
      },
      () => {
        scholarChecks++;
      },
    );

    expect(store.player.skills.iron_will).toBe(true);
    expect(store.player.skillPoints).toBe(0);
    expect(store.player.maxHp).toBe(35);
    expect(store.player.hp).toBe(35);
    expect(emitted).toEqual(['levelUp']);
    expect(refreshed).toBe(1);
    expect(scholarChecks).toBe(1);
  });
});
