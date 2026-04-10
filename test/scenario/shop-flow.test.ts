import { describe, expect, it } from 'vitest';
import { expectLine } from '../fixtures/assert-output';
import { input, newGame } from '../fixtures/mock-input';

describe('shop flow', () => {
  it("opens Dusty's shop from dialogue", () => {
    let s = newGame();
    s.player!.attack = 100;
    s = input(s, 'attack rat');
    for (let i = 0; i < 10 && s.state === 'combat'; i++) {
      s = input(s, 'attack');
    }
    s = input(s, 'go north');
    s = input(s, 'go north');
    expect(s.player!.currentRoom).toBe('manor_main_hall');

    s = input(s, 'talk dusty');
    expect(s.state).toBe('dialogue');

    s = input(s, '2');
    expect(s.state).toBe('shop');
    expect(s.shopState.activeShopId).toBe('manor_dusty');
    expectLine(s, "DUSTY'S WARES");
    expectLine(s, 'Small Potion');
  });

  it('buys a potion when player has gold', () => {
    let s = newGame();
    s.player!.attack = 100;
    s = input(s, 'attack rat');
    for (let i = 0; i < 10 && s.state === 'combat'; i++) {
      s = input(s, 'attack');
    }
    s = input(s, 'go north');
    s = input(s, 'go north');
    s = input(s, 'talk dusty');
    s = input(s, '2');
    expect(s.state).toBe('shop');
    s.player!.gold = 50;

    s = input(s, 'buy potion');
    expect(s.player!.gold).toBe(38);
    expect(s.player!.inventory.potion).toBe(1);
    expectLine(s, 'Bought Potion');
  });

  it('refuses purchase when broke', () => {
    let s = newGame();
    s.player!.attack = 100;
    s = input(s, 'attack rat');
    for (let i = 0; i < 10 && s.state === 'combat'; i++) {
      s = input(s, 'attack');
    }
    s = input(s, 'go north');
    s = input(s, 'go north');
    s = input(s, 'talk dusty');
    s = input(s, '2');
    s.player!.gold = 0;

    s = input(s, 'buy potion');
    expect(s.player!.gold).toBe(0);
    expect(s.player!.inventory.potion).toBeUndefined();
    expectLine(s, 'more gold');
  });

  it('sells an item back to Dusty', () => {
    let s = newGame();
    s.player!.attack = 100;
    s = input(s, 'take small potion');
    s = input(s, 'attack rat');
    for (let i = 0; i < 10 && s.state === 'combat'; i++) {
      s = input(s, 'attack');
    }
    s = input(s, 'go north');
    s = input(s, 'go north');
    s = input(s, 'talk dusty');
    s = input(s, '2');

    expect(s.player!.inventory.small_potion).toBe(1);
    const goldBefore = s.player!.gold;
    s = input(s, 'sell small potion');
    expect(s.player!.gold).toBe(goldBefore + 2);
    expect(s.player!.inventory.small_potion).toBeUndefined();
    expectLine(s, 'Sold Small Potion');
  });

  it('leave returns to NPC dialogue after shopping', () => {
    let s = newGame();
    s.player!.attack = 100;
    s = input(s, 'attack rat');
    for (let i = 0; i < 10 && s.state === 'combat'; i++) {
      s = input(s, 'attack');
    }
    s = input(s, 'go north');
    s = input(s, 'go north');
    s = input(s, 'talk dusty');
    s = input(s, '2');

    s = input(s, 'leave');
    expect(s.state).toBe('dialogue');
    expect(s.shopState.activeShopId).toBe(null);
    expect(s.npcDialogue).not.toBe(null);
  });

  it('refuses to sell key items', () => {
    let s = newGame();
    s.player!.attack = 100;
    s.player!.keyItems.rusty_key = true;
    s = input(s, 'attack rat');
    for (let i = 0; i < 10 && s.state === 'combat'; i++) {
      s = input(s, 'attack');
    }
    s = input(s, 'go north');
    s = input(s, 'go north');
    s = input(s, 'talk dusty');
    s = input(s, '2');

    s = input(s, 'sell rusty key');
    expect(s.player!.keyItems.rusty_key).toBe(true);
    expectLine(s, "can't sell that");
  });
});
