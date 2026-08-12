import type { Stop } from '../client/src/lib/types';

export type StopSchedule = { arrival: string | null; departure: string | null };

export function parseClockTime(raw: string | null | undefined): number | null;

export function scheduleForStops(
  stops: readonly Stop[],
  driveStartTime: string | null | undefined,
): (StopSchedule | null)[];
