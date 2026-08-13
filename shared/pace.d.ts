import type { Stop } from '../client/src/lib/types';

export declare const DEFAULT_PACE: number;
export declare const MIN_PACE: number;
export declare const MAX_PACE: number;

export declare function isDefaultPace(paceFactor: number | null | undefined): boolean;
export declare function applyPace(stops: readonly Stop[], paceFactor: number | null | undefined): Stop[];
