import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';
import type { BatHand } from '../../lib/types';

interface DraftPlayer {
  name: string;
  jersey: string;
  bats: BatHand;
  canPitch: boolean;
}

export default function AddPlayers() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const [players, setPlayers] = useState<DraftPlayer[]>([]);
  const [name, setName] = useState('');
  const [jersey, setJersey] = useState('');
  const [bats, setBats] = useState<BatHand>('R');
  const [canPitch, setCanPitch] = useState(false);
  const [saving, setSaving] = useState(false);

  const addPlayer = () => {
    if (!name.trim()) return;
    setPlayers(prev => [...prev, { name: name.trim(), jersey: jersey.trim(), bats, canPitch }]);
    setName('');
    setJersey('');
    setBats('R');
    setCanPitch(false);
  };

  const removePlayer = (idx: number) => {
    setPlayers(prev => prev.filter((_, i) => i !== idx));
  };

  const handleDone = async () => {
    if (players.length === 0) {
      Alert.alert('Add at least one player before continuing.');
      return;
    }
    setSaving(true);
    const rows = players.map((p, i) => ({
      team_id: teamId,
      name: p.name,
      jersey_number: p.jersey || null,
      bats: p.bats,
      can_pitch: p.canPitch,
      sort_order: i,
    }));

    const { error } = await supabase.from('sp_players').insert(rows);
    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    router.replace('/(tabs)/dashboard');
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Add Your Roster</Text>
      <Text style={styles.subtitle}>Add all players now or come back later.</Text>

      {/* Add form */}
      <View style={styles.form}>
        <View style={styles.formRow}>
          <TextInput
            style={[styles.input, { flex: 2 }]}
            placeholder="Player name"
            value={name}
            onChangeText={setName}
            returnKeyType="next"
          />
          <TextInput
            style={[styles.input, { flex: 1, marginLeft: 8 }]}
            placeholder="#"
            value={jersey}
            onChangeText={setJersey}
            maxLength={3}
            keyboardType="number-pad"
          />
        </View>

        <View style={styles.optionsRow}>
          <View style={styles.batsGroup}>
            <Text style={styles.optionLabel}>Bats</Text>
            {(['R','L','S'] as BatHand[]).map(h => (
              <TouchableOpacity
                key={h}
                style={[styles.optionBtn, bats === h && styles.optionBtnActive]}
                onPress={() => setBats(h)}
              >
                <Text style={[styles.optionBtnText, bats === h && styles.optionBtnTextActive]}>{h}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.pitchToggle, canPitch && styles.pitchToggleActive]}
            onPress={() => setCanPitch(v => !v)}
          >
            <Text style={[styles.pitchToggleText, canPitch && styles.pitchToggleTextActive]}>
              ⚾ Pitcher
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.addBtn} onPress={addPlayer}>
          <Text style={styles.addBtnText}>+ Add Player</Text>
        </TouchableOpacity>
      </View>

      {/* Player list */}
      {players.length > 0 && (
        <View style={styles.list}>
          <Text style={styles.listHeader}>{players.length} player{players.length !== 1 ? 's' : ''} added</Text>
          {players.map((p, i) => (
            <View key={i} style={styles.playerRow}>
              <Text style={styles.playerName}>
                {p.jersey ? `#${p.jersey} ` : ''}{p.name}
                {p.canPitch ? ' ⚾' : ''}
                {p.bats !== 'R' ? ` (${p.bats})` : ''}
              </Text>
              <TouchableOpacity onPress={() => removePlayer(i)} style={styles.removeBtn}>
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={[styles.doneBtn, saving && styles.doneBtnDisabled]}
        onPress={handleDone}
        disabled={saving}
      >
        {saving
          ? <ActivityIndicator color={Colors.white} />
          : <Text style={styles.doneBtnText}>Done — Go to Dashboard</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.replace('/(tabs)/dashboard')} style={styles.skipBtn}>
        <Text style={styles.skipText}>Skip for now</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.surface },
  container: { padding: 24, paddingBottom: 48 },
  title: { fontSize: 26, fontWeight: '800', color: Colors.navy, marginBottom: 8 },
  subtitle: { fontSize: 14, color: Colors.muted, marginBottom: 24 },
  form: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
  },
  formRow: { flexDirection: 'row', marginBottom: 12 },
  input: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
  },
  optionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  batsGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  optionLabel: { fontSize: 13, fontWeight: '700', color: Colors.muted, marginRight: 4 },
  optionBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surfaceAlt, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: Colors.border },
  optionBtnActive: { backgroundColor: Colors.navy, borderColor: Colors.navy },
  optionBtnText: { fontSize: 13, fontWeight: '700', color: Colors.muted },
  optionBtnTextActive: { color: Colors.white },
  pitchToggle: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: Colors.surfaceAlt, borderWidth: 2, borderColor: Colors.border },
  pitchToggleActive: { backgroundColor: Colors.green + '15', borderColor: Colors.green },
  pitchToggleText: { fontSize: 13, fontWeight: '700', color: Colors.muted },
  pitchToggleTextActive: { color: Colors.green },
  addBtn: { backgroundColor: Colors.orange, height: 44, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  addBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  list: { marginBottom: 24 },
  listHeader: { fontSize: 13, fontWeight: '700', color: Colors.muted, marginBottom: 8, letterSpacing: 0.5 },
  playerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: 8, padding: 14, marginBottom: 6, borderWidth: 1, borderColor: Colors.border },
  playerName: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.text },
  removeBtn: { padding: 4 },
  removeBtnText: { fontSize: 16, color: Colors.muted },
  doneBtn: { backgroundColor: Colors.navy, height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  doneBtnDisabled: { opacity: 0.6 },
  doneBtnText: { fontSize: 17, fontWeight: '800', color: Colors.white },
  skipBtn: { alignItems: 'center', paddingVertical: 12 },
  skipText: { fontSize: 14, color: Colors.muted, textDecorationLine: 'underline' },
});
