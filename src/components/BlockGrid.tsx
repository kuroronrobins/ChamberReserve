import ChamberBlockMap, { type ChamberBlockMapDensity, type ChamberBlockMapSurface } from './ChamberBlockMap';
import type { BlockMapStateInput } from '../domain/blockMapEngine';
import type { BlockId } from '../domain/types';

interface BlockGridProps extends BlockMapStateInput {
  onChange?: (blocks: BlockId[]) => void;
  compact?: boolean;
  size?: 'compact' | 'standard' | 'large';
  surface?: ChamberBlockMapSurface;
  title?: string;
}

function resolveDensity(compact?: boolean, size: BlockGridProps['size'] = 'standard'): ChamberBlockMapDensity {
  if (compact || size === 'compact') {
    return 'compact';
  }
  if (size === 'large') {
    return 'large';
  }
  return 'inline';
}

function resolveSurface(surface: ChamberBlockMapSurface | undefined, density: ChamberBlockMapDensity): ChamberBlockMapSurface {
  if (surface) {
    return surface;
  }
  return density === 'inline' ? 'plain' : 'chamber';
}

export default function BlockGrid({ compact, size = 'standard', surface, ...props }: BlockGridProps) {
  const density = resolveDensity(compact, size);
  return (
    <ChamberBlockMap
      {...props}
      density={density}
      surface={resolveSurface(surface, density)}
    />
  );
}
