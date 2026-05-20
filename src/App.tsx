import { useEffect } from 'react';
import Game from './components/Game';
import { validateContent } from './engine/contentValidation';
import {
  ACCESSORIES, ARMOR, ENEMIES, ENDINGS, ITEMS, NPCS, SHOPS, STORY_REGIONS, WEAPONS,
} from './engine/data';
import { OBJECTIVES } from './engine/objectives';

function App() {
  useEffect(() => {
    // Non-blocking integrity check: catches data drift in shipped builds the
    // same way the CI test does, but only emits a console warning so a single
    // bad JSON edit can't take the whole game down.
    const errors = validateContent({
      regions: [...STORY_REGIONS],
      items: ITEMS,
      weapons: WEAPONS,
      armor: ARMOR,
      accessories: ACCESSORIES,
      enemies: ENEMIES,
      npcs: NPCS,
      shops: SHOPS,
      endings: ENDINGS,
      objectives: [...OBJECTIVES],
      startingRoom: 'manor_entry',
    });
    if (errors.length > 0) {
      console.warn(`[MysticQuest] content validation found ${errors.length} issue(s):`);
      for (const err of errors) console.warn('  - ' + err);
    }
  }, []);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: '#000',
    }}>
      <Game />
    </div>
  );
}

export default App;
