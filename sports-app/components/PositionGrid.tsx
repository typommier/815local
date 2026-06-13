import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../constants/colors';
import type { FieldPosition, Player, Sport } from '../lib/types';

type Assignment = Partial<Record<FieldPosition, Player>>;

interface Props {
  sport: Sport;
  assignments: Assignment;
  roster: Player[];
  onAssign: (position: FieldPosition, player: Player | null) => void;
}

interface PositionSlot {
  pos: FieldPosition;
  label: string;
  gridColumn: number;
  gridRow: number;
}

const BASEBALL_LAYOUT: PositionSlot[] = [
  { pos: 'CF',  label: 'CF',  gridColumn: 4, gridRow: 1 },
  { pos: 'LF',  label: 'LF',  gridColumn: 2, gridRow: 2 },
  { pos: 'RF',  label: 'RF',  gridColumn: 6, gridRow: 2 },
  { pos: 'SS',  label: 'SS',  gridColumn: 3, gridRow: 3 },
  { pos: '2B',  label: '2B',  gridColumn: 5, gridRow: 3 },
  { pos: '3B',  label: '3B',  gridColumn: 2, gridRow: 4 },
  { pos: '1B',  label: '1B',  gridColumn: 6, gridRow: 4 },
  { pos: 'P',   label: 'P',   gridColumn: 4, gridRow: 4 },
  { pos: 'C',   label: 'C',   gridColumn: 4, gridRow: 5 },
];

const SOFTBALL_EXTRA: PositionSlot[] = [
  { pos: 'DP',  label: 'DP',  gridColumn: 1, gridRow: 5 },
  { pos: 'FLEX',label: 'FLX', gridColumn: 7, gridRow: 5 },
];

export default function PositionGrid({ sport, assignments, roster, onAssign }: Props) {
  const slots = sport === 'softball'
    ? [...BASEBALL_LAYOUT, ...SOFTBALL_EXTRA]
    : BASEBALL_LAYOUT;

  const COLS = 7;
  const ROWS = 5;
  const CELL = 44;

  return (
    <View style={[styles.grid, { width: COLS * CELL + (COLS - 1) * 4, height: ROWS * CELL + (ROWS - 1) * 4 }]}>
      {slots.map(({ pos, label, gridColumn, gridRow }) => {
        const player = assignments[pos];
        return (
          <TouchableOpacity
            key={pos}
            style={[
              styles.slot,
              {
                left: (gridColumn - 1) * (CELL + 4),
                top: (gridRow - 1) * (CELL + 4),
                width: CELL,
                height: CELL,
              },
              player ? styles.slotFilled : styles.slotEmpty,
            ]}
            onPress={() => onAssign(pos, player ?? null)}
          >
            <Text style={styles.posLabel}>{label}</Text>
            {player && (
              <Text style={styles.playerLabel} numberOfLines={1}>
                #{player.jersey_number ?? '?'}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    position: 'relative',
    alignSelf: 'center',
    marginVertical: 16,
  },
  slot: {
    position: 'absolute',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  slotEmpty: {
    backgroundColor: Colors.surfaceAlt,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  slotFilled: {
    backgroundColor: Colors.navy,
    borderColor: Colors.navy,
  },
  posLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.muted,
    letterSpacing: 0.5,
  },
  playerLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.white,
    marginTop: 1,
  },
});
