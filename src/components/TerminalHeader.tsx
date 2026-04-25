import { memo } from 'react';
import type { HeaderState } from '../engine/types';
import { getAsciiLines, getRegionArtName } from '../engine/asciiArt';

export interface TerminalHeaderProps {
  header: HeaderState;
  currentRegion: string | null;
  headerColor: string;
  dimColor: string;
  /** When true, render a brief "[saved]" indicator in the header. */
  autosaveFlashing: boolean;
}

/**
 * Player-stat header at the top of the terminal: title, HP/LVL/gold, weapon,
 * plus the per-region ASCII banner. Hidden until the engine has populated
 * `header.maxHp` (i.e. once the player exists).
 *
 * Pure presentational — depends only on props, no store access. Memoized:
 * skips re-rendering on cursor blinks / typewriter ticks since those don't
 * change any of its props.
 */
function TerminalHeaderImpl({
  header, currentRegion, headerColor, dimColor, autosaveFlashing,
}: TerminalHeaderProps) {
  if (!header.title || header.maxHp <= 0) return null;

  const regionArtKey = getRegionArtName(currentRegion);
  const regionBannerLines = regionArtKey ? getAsciiLines(regionArtKey) : null;

  return (
    <>
      <div className="terminal-header" style={{ color: headerColor }}>
        {`${header.title}    HP:${header.hp}/${header.maxHp}  LVL:${header.level}  G:${header.gold}  ${header.weapon}`}
        {autosaveFlashing && <span style={{ marginLeft: '1em', opacity: 0.8 }}>[saved]</span>}
      </div>
      {regionBannerLines && (
        <div className="terminal-region-banner" style={{ color: headerColor }}>
          {regionBannerLines.join('\n')}
        </div>
      )}
      <div className="terminal-separator" style={{ backgroundColor: dimColor }} />
    </>
  );
}

export default memo(TerminalHeaderImpl);
