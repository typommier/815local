import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, Alert, TextInput, Modal,
} from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, TEAM_STORAGE_KEY } from '../../lib/supabase';
import { Colors } from '../../constants/colors';
import type { Team, Game } from '../../lib/types';

export default function Dashboard() {
  const [team, setTeam] = useState<Team | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewGame, setShowNewGame] = useState(false);
  const [opponent, setOpponent] = useState('');
  const [gameDate, setGameDate] = useState(new Date().toISOString().split('T')[0]);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const teamId = await AsyncStorage.getItem(TEAM_STORAGE_KEY);
    if (!teamId) { router.replace('/onboarding/create-team'); return; }

    const [teamRes, gamesRes] = await Promise.all([
      supabase.from('sp_teams').select('*').eq('id', teamId).single(),
      supabase.from('sp_games').select('*').eq('team_id', teamId).order('game_date', { ascending: false }),
    ]);

    if (teamRes.data) setTeam(teamRes.data);
    if (gamesRes.data) setGames(gamesRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createGame = async () => {
    if (!opponent.trim() || !team) return;
    setCreating(true);
    const { data, error } = await supabase
      .from('sp_games')
      .insert({ team_id: team.id, opponent: opponent.trim(), game_date: gameDate })
      .select()
      .single();

    setCreating(false);
    if (error || !data) { Alert.alert('Error', error?.message ?? 'Try again'); return; }

    setShowNewGame(false);
    setOpponent('');
    router.push({ pathname: '/game/[id]', params: { id: data.id } });
  };

  const statusChip = (status: Game['status']) => {
    if (status === 'live') return { label: 'LIVE', color: Colors.red };
    if (status === 'final') return { label: 'FINAL', color: Colors.muted };
    return { label: 'UPCOMING', color: Colors.green };
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={Colors.navy} size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      {/* Team header */}
      {team && (
        <View style={styles.teamHeader}>
          <Text style={styles.teamName}>{team.name}</Text>
          <View style={styles.teamBadges}>
            <Text style={styles.badge}>
              {team.sport === 'baseball' ? '⚾' : '🥎'} {team.age_group}
            </Text>
          </View>
        </View>
      )}

      {/* Games list */}
      <FlatList
        data={games}
        keyExtractor={g => g.id}
        style={styles.list}
        contentContainerStyle={games.length === 0 ? styles.listEmpty : styles.listContent}
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>No games yet</Text>
            <Text style={styles.emptySubtitle}>Tap the button below to schedule your first game.</Text>
          </View>
        )}
        renderItem={({ item: game }) => {
          const chip = statusChip(game.status);
          return (
            <TouchableOpacity
              style={styles.gameCard}
              onPress={() => router.push({ pathname: '/game/[id]', params: { id: game.id } })}
            >
              <View style={styles.gameCardLeft}>
                <Text style={styles.gameOpponent}>vs. {game.opponent}</Text>
                <Text style={styles.gameDate}>{game.game_date}</Text>
              </View>
              <View style={styles.gameCardRight}>
                {game.status !== 'scheduled' && (
                  <Text style={styles.gameScore}>
                    {game.our_score} – {game.their_score}
                  </Text>
                )}
                <View style={[styles.statusChip, { backgroundColor: chip.color + '20' }]}>
                  <Text style={[styles.statusChipText, { color: chip.color }]}>{chip.label}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* New game FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowNewGame(true)}>
        <Text style={styles.fabText}>+ New Game</Text>
      </TouchableOpacity>

      {/* New game modal */}
      <Modal visible={showNewGame} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>New Game</Text>

          <Text style={styles.modalLabel}>Opponent</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="e.g. Rockford Thunder"
            value={opponent}
            onChangeText={setOpponent}
            returnKeyType="done"
            autoFocus
          />

          <Text style={styles.modalLabel}>Date</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="YYYY-MM-DD"
            value={gameDate}
            onChangeText={setGameDate}
            keyboardType="number-pad"
          />

          <TouchableOpacity
            style={[styles.modalBtn, creating && styles.modalBtnDisabled]}
            onPress={createGame}
            disabled={creating}
          >
            {creating
              ? <ActivityIndicator color={Colors.white} />
              : <Text style={styles.modalBtnText}>Start Game</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowNewGame(false)}>
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
  teamHeader: {
    backgroundColor: Colors.navy,
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 8,
  },
  teamName: { fontSize: 22, fontWeight: '800', color: Colors.white, marginBottom: 6 },
  teamBadges: { flexDirection: 'row', gap: 8 },
  badge: { fontSize: 13, color: Colors.white + 'CC', fontWeight: '600' },
  list: { flex: 1 },
  listContent: { padding: 16, gap: 10 },
  listEmpty: { flex: 1 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 48 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: Colors.navy, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: Colors.muted, textAlign: 'center' },
  gameCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  gameCardLeft: { flex: 1 },
  gameOpponent: { fontSize: 16, fontWeight: '700', color: Colors.navy, marginBottom: 4 },
  gameDate: { fontSize: 13, color: Colors.muted },
  gameCardRight: { alignItems: 'flex-end', gap: 6 },
  gameScore: { fontSize: 18, fontWeight: '800', color: Colors.text },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusChipText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    left: 20,
    backgroundColor: Colors.orange,
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: { fontSize: 17, fontWeight: '800', color: Colors.white },
  modal: { flex: 1, padding: 24, backgroundColor: Colors.surface },
  modalTitle: { fontSize: 24, fontWeight: '800', color: Colors.navy, marginBottom: 24, marginTop: 8 },
  modalLabel: { fontSize: 13, fontWeight: '700', color: Colors.muted, letterSpacing: 0.5, marginBottom: 8, marginTop: 16 },
  modalInput: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.text,
  },
  modalBtn: { marginTop: 28, backgroundColor: Colors.navy, height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  modalBtnDisabled: { opacity: 0.6 },
  modalBtnText: { fontSize: 17, fontWeight: '800', color: Colors.white },
  cancelBtn: { alignItems: 'center', paddingVertical: 16 },
  cancelText: { fontSize: 15, color: Colors.muted },
});
