import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, PitchColors } from '../constants/colors';
import type { PitchStatus } from '../lib/types';

interface Props {
  count: number;
  status: PitchStatus;
  limit: number | null;
  onAdd: () => void;
  onSubtract: () => void;
}

export default function PitchCounter({ count, status, limit, onAdd, onSubtract }: Props) {
  const statusColor = PitchColors[status.color as keyof typeof PitchColors] ?? Colors.muted;

  return (
    <View style={styles.container}>
      <View style={[styles.countDisplay, { borderColor: statusColor }]}>
        <Text style={[styles.countNumber, { color: statusColor }]}>{count}</Text>
        <Text style={styles.countLabel}>PITCHES</Text>
      </View>

      {limit !== null && (
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.min(100, (count / limit) * 100)}%` as `${number}%`,
                backgroundColor: statusColor,
              },
            ]}
          />
        </View>
      )}

      <Text style={[styles.statusLabel, { color: statusColor }]}>{status.label}</Text>

      {status.daysRest > 0 && (
        <View style={[styles.restBanner, { backgroundColor: statusColor + '20' }]}>
          <Text style={[styles.restText, { color: statusColor }]}>
            {status.daysRest} day{status.daysRest > 1 ? 's' : ''} rest required after game
          </Text>
        </View>
      )}

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.btn, styles.btnSubtract]}
          onPress={onSubtract}
          disabled={count <= 0}
        >
          <Text style={styles.btnText}>-1</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.btn, styles.btnAdd]} onPress={onAdd}>
          <Text style={[styles.btnText, styles.btnAddText]}>+1 Pitch</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  countDisplay: {
    alignItems: 'center',
    borderWidth: 4,
    borderRadius: 80,
    width: 160,
    height: 160,
    justifyContent: 'center',
    marginBottom: 12,
  },
  countNumber: {
    fontSize: 72,
    fontWeight: '800',
    lineHeight: 80,
  },
  countLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.muted,
    letterSpacing: 2,
  },
  progressBar: {
    width: '80%',
    height: 8,
    backgroundColor: Colors.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  restBanner: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 16,
  },
  restText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  btn: {
    height: 72,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  btnSubtract: {
    backgroundColor: Colors.surfaceAlt,
    minWidth: 80,
  },
  btnAdd: {
    backgroundColor: Colors.navy,
    minWidth: 160,
  },
  btnText: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.muted,
  },
  btnAddText: {
    color: Colors.white,
  },
});
