import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, TEAM_STORAGE_KEY } from '../../lib/supabase';
import { AGE_GROUPS } from '../../lib/pitchSmart';
import { Colors } from '../../constants/colors';
import type { Sport } from '../../lib/types';

export default function CreateTeam() {
  const [teamName, setTeamName] = useState('');
  const [sport, setSport] = useState<Sport>('baseball');
  const [ageGroup, setAgeGroup] = useState(AGE_GROUPS[2]);
  const [loading, setLoading] = useState(false);

  const coachCode = React.useMemo(() =>
    Math.random().toString(36).slice(2, 8).toUpperCase(), []);

  const handleCreate = async () => {
    if (!teamName.trim()) {
      Alert.alert('Team name required');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('sp_teams')
      .insert({
        name: teamName.trim(),
        sport,
        age_group: ageGroup,
        coach_code: coachCode,
        pitch_limit_mode: sport === 'softball' ? 'track_only' : 'pitch_smart',
      })
      .select()
      .single();

    setLoading(false);

    if (error || !data) {
      Alert.alert('Error', error?.message ?? 'Could not create team. Try again.');
      return;
    }

    await AsyncStorage.setItem(TEAM_STORAGE_KEY, data.id);
    router.replace({
      pathname: '/onboarding/add-players',
      params: { teamId: data.id },
    });
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create Your Team</Text>
      <Text style={styles.subtitle}>
        One setup, then you're running games in minutes.
      </Text>

      <Text style={styles.label}>Team Name</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Rockets 12U"
        value={teamName}
        onChangeText={setTeamName}
        maxLength={60}
        returnKeyType="done"
      />

      <Text style={styles.label}>Sport</Text>
      <View style={styles.sportRow}>
        {(['baseball', 'softball'] as Sport[]).map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.sportBtn, sport === s && styles.sportBtnActive]}
            onPress={() => setSport(s)}
          >
            <Text style={styles.sportIcon}>{s === 'baseball' ? '⚾' : '🥎'}</Text>
            <Text style={[styles.sportLabel, sport === s && styles.sportLabelActive]}>
              {s === 'baseball' ? 'Baseball' : 'Softball'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Age Group</Text>
      <View style={styles.ageGrid}>
        {AGE_GROUPS.map((ag) => (
          <TouchableOpacity
            key={ag}
            style={[styles.ageBtn, ageGroup === ag && styles.ageBtnActive]}
            onPress={() => setAgeGroup(ag)}
          >
            <Text style={[styles.ageBtnText, ageGroup === ag && styles.ageBtnTextActive]}>
              {ag}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {sport === 'softball' && (
        <View style={styles.infoBanner}>
          <Text style={styles.infoText}>
            Softball: pitch counts tracked for reference, no hard limits applied.
            You can customize this in team settings later.
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.createBtn, loading && styles.createBtnDisabled]}
        onPress={handleCreate}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color={Colors.white} />
          : <Text style={styles.createBtnText}>Create Team & Add Players</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.surface },
  container: { padding: 24, paddingBottom: 48 },
  title: { fontSize: 28, fontWeight: '800', color: Colors.navy, marginBottom: 8 },
  subtitle: { fontSize: 15, color: Colors.muted, marginBottom: 32, lineHeight: 22 },
  label: { fontSize: 13, fontWeight: '700', color: Colors.muted, letterSpacing: 0.5, marginBottom: 8, marginTop: 20 },
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
  sportRow: { flexDirection: 'row', gap: 12 },
  sportBtn: {
    flex: 1,
    paddingVertical: 20,
    borderRadius: 12,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  sportBtnActive: { borderColor: Colors.navy, backgroundColor: Colors.navy + '08' },
  sportIcon: { fontSize: 32, marginBottom: 8 },
  sportLabel: { fontSize: 15, fontWeight: '700', color: Colors.muted },
  sportLabelActive: { color: Colors.navy },
  ageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ageBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    minWidth: 80,
    alignItems: 'center',
  },
  ageBtnActive: { borderColor: Colors.orange, backgroundColor: Colors.orange + '10' },
  ageBtnText: { fontSize: 14, fontWeight: '700', color: Colors.muted },
  ageBtnTextActive: { color: Colors.orange },
  infoBanner: {
    marginTop: 16,
    backgroundColor: Colors.amber + '15',
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: Colors.amber,
  },
  infoText: { fontSize: 13, color: Colors.text, lineHeight: 18 },
  createBtn: {
    marginTop: 36,
    backgroundColor: Colors.navy,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createBtnDisabled: { opacity: 0.6 },
  createBtnText: { fontSize: 17, fontWeight: '800', color: Colors.white },
});
