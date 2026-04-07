import { describe, expect, it } from 'vitest';
import { pickMinimapLabels, type MinimapLayout } from '../../src/engine/minimap';

const layout: MinimapLayout = {
  positions: {
    current: { roomId: 'current', name: 'Current Room', region: 'manor', x: 0, y: 0 },
    east: { roomId: 'east', name: 'Very Long East Room', region: 'manor', x: 1, y: 0 },
    west: { roomId: 'west', name: 'Very Long West Room', region: 'manor', x: -1, y: 0 },
  },
  edges: [],
  bounds: { minX: -1, maxX: 1, minY: 0, maxY: 0 },
};

describe('pickMinimapLabels', () => {
  it('always includes the current room label', () => {
    const labels = pickMinimapLabels(layout, 'current', roomName => roomName.length * 6, 7);
    expect(labels.some(label => label.roomId === 'current')).toBe(true);
  });

  it('stagger labels so nearby rooms do not overlap', () => {
    const labels = pickMinimapLabels(layout, 'current', roomName => roomName.length * 6, 7);
    expect(labels.length).toBe(3);

    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i];
        const b = labels[j];
        const overlaps =
          a.x < b.x + b.w &&
          a.x + a.w > b.x &&
          a.y < b.y + b.h &&
          a.y + a.h > b.y;
        expect(overlaps).toBe(false);
      }
    }
  });
});
