import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, Alert, TextInput, Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, TEAM_STORAGE_KEY } from '../../lib/supabase';
import { Colors } from '../../constants/colors';
import type { Player, BatHand } from '../../lib/types';

export default function Roster() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [jersey, setJersey] = useState('');
  const [bats, setBats] = useState<BatHand>('R');
  const [canPitch, setCanPitch] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const teamId = await AsyncStorage.getItem(TEAM_STORAGE_KEY);
    if (!teamId) return;
    const { data } = await supabase
      .from('sp_players')
      .select('*')
      .eq('team_id', teamId)
      .eq('is_active', true)
      .order('sort_order');
    if (data) setPlayers(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addPlayer = async () => {
    if (!name.trim()) { Alert.alert('Player name required'); return; }
    const teamId = await AsyncStorage.getItem(TEAM_STORAGE_KEY);
    if (!teamId) return;
    setSaving(true);
    const { error } = await supabase.from('sp_players').insert({
      team_id: teamId,
      name: name.trim(),
      jersey_number: jersey.trim() || null,
      bats,
      can_pitch: canPitch,
      sort_order: players.length,
    });
    setSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setName(''); setJersey(''); setBats('R'); setCanPitch(false);
    setShowAdd(false);
    load();
  };

  const deactivate = (player: Player) => {
    Alert.alert(
      'Remove Player',
      `Remove ${player.name} from the active roster?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('sp_players').update({ is_active: false }).eq('id', player.id);
            load();
          },
        },
      ],
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={Colors.navy} size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={players}
        keyExtractor={p => p.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={() => (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyText}>No players yet. Add your roster below.</Text>
          </View>
        )}
        renderItem={({ item: p }) => (
          <View style={styles.row}>
            <View style={styles.jerseyBadge}>
              <Text style={styles.jerseyText}>{p.jersey_number ?? '?'}</Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.playerName}>{p.name}</Text>
              <View style={styles.tags}>
                {p.can_pitch && <Text style={styles.tag}>⚾ Pitcher</Text>}
                {p.bats !== 'R' && <Text style={styles.tag}>Bats {p.bats}</Text>}
              </View>
            </View>
            <TouchableOpacity onPress={() => deactivate(p)} style={styles.removeBtn}>
              <Text style={styles.removeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <TouchableOpacity style={styles.addFab} onPress={() => setShowAdd(true)}>
        <Text style={styles.addFabText}>+ Add Player</Text>
      </TouchableOpacity>

      <Modal visible={showAdd} animationType="slide" presentationStyle="formSheet">
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Add Player</Text>

          <TextInput
            style={styles.input}
            placeholder="Name"
            value={name}
            onChangeText={setName}
            autoFocus
          />
          <TextInput
            style={[styles.input, { marginTop: 10 }]}
            placeholder="Jersey # (optional)"
            value={jersey}
            onChangeText={setJersey}
            keyboardType="number-pad"
            maxLength={3}
          />

          <View style={styles.optRow}>
            <Text style={styles.optLabel}>Bats</Text>
            {(['R','L','S'] as BatHand[]).map(h => (
              <TouchableOpacity
                key={h}
                style={[styles.optBtn, bats === h && styles.optBtnActive]}
                onPress={() => setBats(h)}
              >
                <Text style={[styles.optBtnText, bats === h && styles.optBtnTextActive]}>{h}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.optBtn, canPitch && styles.optBtnGreen, { marginLeft: 16 }]}
              onPress={() => setCanPitch(v => !v)}
            >
              <Text style={[styles.optBtnText, canPitch && styles.optBtnTextActive]}>⚾ P</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={addPlayer}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.saveBtnText}>Add</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAdd(false)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, gap: 8 },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 15, color: Colors.muted, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  jerseyBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.navy,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  jerseyText: { fontSize: 14, fontWeight: '800', color: Colors.white },
  info: { flex: 1 },
  playerName: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  tags: { flexDirection: 'row', gap: 6 },
  tag: { fontSize: 11, fontWeight: '600', color: Colors.muted, backgroundColor: Colors.surfaceAlt, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  removeBtn: { padding: 8 },
  removeBtnText: { fontSize: 16, color: Colors.muted },
  addFab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    left: 20,
    backgroundColor: Colors.orange,
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addFabText: { fontSize: 17, fontWeight: '800', color: Colors.white },
  modal: { flex: 1, padding: 24, backgroundColor: Colors.surface },
  modalTitle: { fontSize: 22, fontWeight: '800', color: Colors.navy, marginBottom: 20, marginTop: 8 },
  input: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.text,
  },
  optRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 8 },
  optLabel: { fontSize: 13, fontWeight: '700', color: Colors.muted },
  optBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: Colors.border },
  optBtnActive: { backgroundColor: Colors.navy, borderColor: Colors.navy },
  optBtnGreen: { backgroundColor: Colors.green + '15', borderColor: Colors.green },
  optBtnText: { fontSize: 13, fontWeight: '700', color: Colors.muted },
  optBtnTextActive: { color: Colors.white },
  saveBtn: { marginTop: 28, backgroundColor: Colors.navy, height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  saveBtnText: { fontSize: 17, fontWeight: '800', color: Colors.white },
  cancelBtn: { alignItems: 'center', paddingVertical: 14 },
  cancelText: { fontSize: 15, color: Colors.muted },
});
