import { describe, expect, it } from 'vitest';
import { gameReducer } from '../../src/engine/gameReducer';
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

  it('sells armor back to Dusty', () => {
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
    s.player!.gold = 50;

    s = input(s, 'buy leather vest');
    expect(s.player!.inventory.leather_vest).toBe(1);
    const goldAfterBuy = s.player!.gold;

    s = input(s, 'sell leather vest');

    expect(s.player!.gold).toBe(goldAfterBuy + 10);
    expect(s.player!.inventory.leather_vest).toBeUndefined();
    expectLine(s, 'Sold Leather Vest');
  });

  it('sells armor through the shop menu selection', () => {
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
    s.player!.gold = 50;
    s = input(s, 'buy leather vest');
    const goldAfterBuy = s.player!.gold;

    s = input(s, 'sell');
    expect(s.shopMenuMode).toBe('sell');
    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'Enter' });

    expect(s.player!.gold).toBe(goldAfterBuy + 10);
    expect(s.player!.inventory.leather_vest).toBeUndefined();
    expectLine(s, 'Sold Leather Vest');
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

  // ---- Sell-confirm flow for equipped gear -----------------------------

  it('prompts before selling an equipped weapon and cancels on No', () => {
    let s = openShopWithEquippedDagger();
    const goldBefore = s.player!.gold;

    s = input(s, 'sell dagger');

    expect(s.shopMenuMode).toBe('sell_confirm');
    expect(s.shopSellConfirm).toEqual({ id: 'rusty_dagger', type: 'weapon' });
    expect(s.shopMenuSelected).toBe(1); // default to "No"
    expectLine(s, 'equipped weapon');

    // Press Enter on the default selection (No).
    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'Enter' });

    expect(s.shopMenuMode).toBe(null);
    expect(s.shopSellConfirm).toBe(null);
    expect(s.player!.equippedWeapon).toBe('rusty_dagger');
    expect(s.player!.weapons).toContain('rusty_dagger');
    expect(s.player!.gold).toBe(goldBefore);
    expectLine(s, 'Sale cancelled');
  });

  it('prompts before selling an equipped weapon and completes the sale on Yes', () => {
    let s = openShopWithEquippedDagger();
    const goldBefore = s.player!.gold;

    s = input(s, 'sell dagger');
    expect(s.shopMenuMode).toBe('sell_confirm');

    // ArrowUp to switch from No (1) to Yes (0), then Enter.
    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'ArrowUp' });
    expect(s.shopMenuSelected).toBe(0);
    s = gameReducer(s, { type: 'KEY_PRESSED', key: 'Enter' });

    expect(s.shopMenuMode).toBe(null);
    expect(s.shopSellConfirm).toBe(null);
    expect(s.player!.equippedWeapon).toBe(null);
    expect(s.player!.weapons).not.toContain('rusty_dagger');
    expect(s.player!.gold).toBeGreaterThan(goldBefore);
  });

  // ---- Examine in shop -------------------------------------------------

  it('examines a stocked weapon and shows the comparison vs the equipped one', () => {
    let s = openShopWithEquippedDagger();

    s = input(s, 'examine iron shield');

    expectLine(s, '=== Iron Shield ===');
    expectLine(s, 'Price:');
    expectLine(s, 'Your shield:'); // comparison line for shield-vs-shield
  });
});

// Walk the player from the starting room to Dusty's open shop with the rusty
// dagger equipped and enough gold to actually transact. Used by the
// sell-confirm tests below to keep them readable.
function openShopWithEquippedDagger() {
  let s = newGame();
  s.player!.attack = 100;
  s = input(s, 'attack rat');
  for (let i = 0; i < 10 && s.state === 'combat'; i++) {
    s = input(s, 'attack');
  }
  s = input(s, 'take dagger');
  s = input(s, 'go north');
  s = input(s, 'go north');
  s = input(s, 'talk dusty');
  s = input(s, '2'); // "Browse your wares" — opens shop
  s.player!.gold = 100;
  return s;
}
