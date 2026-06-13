import type { PitchStatus, Sport } from './types';

interface PitchTier {
  min: number;
  max: number;
  days: number;
}

interface AgeRules {
  dailyMax: number;
  tiers: PitchTier[];
}

// USA Baseball Pitch Smart 2024 guidelines
const PITCH_SMART: Record<string, AgeRules> = {
  '7-8U':  { dailyMax: 50,  tiers: [{min:1,max:20,days:0},{min:21,max:35,days:1},{min:36,max:50,days:2}] },
  '9-10U': { dailyMax: 75,  tiers: [{min:1,max:20,days:0},{min:21,max:35,days:1},{min:36,max:50,days:2},{min:51,max:65,days:3},{min:66,max:75,days:4}] },
  '11-12U':{ dailyMax: 85,  tiers: [{min:1,max:20,days:0},{min:21,max:35,days:1},{min:36,max:50,days:2},{min:51,max:65,days:3},{min:66,max:85,days:4}] },
  '13-14U':{ dailyMax: 95,  tiers: [{min:1,max:20,days:0},{min:21,max:35,days:1},{min:36,max:50,days:2},{min:51,max:65,days:3},{min:66,max:95,days:4}] },
  '15-16U':{ dailyMax: 95,  tiers: [{min:1,max:20,days:0},{min:21,max:35,days:1},{min:36,max:50,days:2},{min:51,max:65,days:3},{min:66,max:95,days:4}] },
  '17-18U':{ dailyMax: 105, tiers: [{min:1,max:20,days:0},{min:21,max:35,days:1},{min:36,max:50,days:2},{min:51,max:65,days:3},{min:66,max:80,days:4}] },
};

export const AGE_GROUPS = ['7-8U','9-10U','11-12U','13-14U','15-16U','17-18U'];

export function getPitchStatus(ageGroup: string, count: number, sport: Sport): PitchStatus {
  // Softball uses track-only mode by default
  if (sport === 'softball') {
    return {
      color: 'gray',
      label: `${count} pitches (tracking)`,
      daysRest: 0,
      remaining: 999,
      canPitch: true,
    };
  }

  const rules = PITCH_SMART[ageGroup];
  if (!rules) {
    return { color: 'gray', label: `${count} pitches`, daysRest: 0, remaining: 999, canPitch: true };
  }

  const remaining = Math.max(0, rules.dailyMax - count);
  const pct = count / rules.dailyMax;

  const daysRest = [...rules.tiers]
    .reverse()
    .find(t => count >= t.min)?.days ?? 0;

  if (pct >= 1.0) {
    return { color: 'red', label: `LIMIT (${rules.dailyMax} max)`, daysRest, remaining: 0, canPitch: false };
  }
  if (pct >= 0.8) {
    return { color: 'amber', label: `${remaining} left`, daysRest, remaining, canPitch: true };
  }
  return { color: 'green', label: `${count} pitches`, daysRest, remaining, canPitch: true };
}

export function getPitchLimit(ageGroup: string, sport: Sport): number | null {
  if (sport === 'softball') return null;
  return PITCH_SMART[ageGroup]?.dailyMax ?? null;
}

export function formatOrdinal(inning: number): string {
  const s = ['th','st','nd','rd'];
  const v = inning % 100;
  return inning + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function formatInning(inning: number, half: 'top' | 'bottom'): string {
  const arrow = half === 'top' ? 'Top' : 'Bot';
  return `${arrow} ${formatOrdinal(inning)}`;
}
