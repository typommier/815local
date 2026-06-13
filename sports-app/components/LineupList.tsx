import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import { Colors } from '../constants/colors';
import type { GameLineup } from '../lib/types';

interface Props {
  lineup: GameLineup[];
  currentOrder: number;
  onAdvance: () => void;
  onSubstitute: (lineupEntry: GameLineup) => void;
}

export default function LineupList({ lineup, currentOrder, onAdvance, onSubstitute }: Props) {
  const sorted = [...lineup].sort((a, b) => a.batting_order - b.batting_order);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {sorted.map((entry) => {
          const isCurrent = entry.batting_order === currentOrder;
          const isNext = entry.batting_order === (currentOrder % lineup.length) + 1;
          const player = entry.player;

          return (
            <View
              key={entry.id}
              style={[
                styles.row,
                isCurrent && styles.rowCurrent,
                entry.is_sub && styles.rowSub,
              ]}
            >
              <View style={styles.orderBadge}>
                <Text style={[styles.orderText, isCurrent && styles.orderTextActive]}>
                  {entry.batting_order}
                </Text>
              </View>

              <View style={styles.playerInfo}>
                <Text style={[styles.playerName, isCurrent && styles.playerNameActive]}>
                  {player?.name ?? '—'}
                  {entry.role !== 'standard' && (
                    <Text style={styles.roleTag}> {entry.role}</Text>
                  )}
                </Text>
                {player?.jersey_number && (
                  <Text style={styles.jersey}>#{player.jersey_number}</Text>
                )}
                {isCurrent && <Text style={styles.atBatLabel}>AT BAT</Text>}
                {isNext && !isCurrent && <Text style={styles.onDeckLabel}>ON DECK</Text>}
              </View>

              <TouchableOpacity
                style={styles.subBtn}
                onPress={() => onSubstitute(entry)}
              >
                <Text style={styles.subBtnText}>SUB</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>

      <TouchableOpacity style={styles.advanceBtn} onPress={onAdvance}>
        <Text style={styles.advanceBtnText}>Next Batter</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
    minHeight: 56,
  },
  rowCurrent: {
    backgroundColor: Colors.navy + '10',
    borderLeftWidth: 4,
    borderLeftColor: Colors.orange,
  },
  rowSub: {
    opacity: 0.6,
  },
  orderBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  orderText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.muted,
  },
  orderTextActive: {
    color: Colors.orange,
  },
  playerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  playerNameActive: {
    color: Colors.navy,
    fontWeight: '800',
  },
  roleTag: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.muted,
  },
  jersey: {
    fontSize: 13,
    color: Colors.muted,
    fontWeight: '500',
  },
  atBatLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.orange,
    letterSpacing: 1,
    backgroundColor: Colors.orange + '20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  onDeckLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.muted,
    letterSpacing: 1,
  },
  subBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 8,
    minWidth: 44,
    alignItems: 'center',
  },
  subBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.muted,
  },
  advanceBtn: {
    margin: 16,
    backgroundColor: Colors.orange,
    height: 60,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  advanceBtnText: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: 0.5,
  },
});
