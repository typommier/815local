import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Alert, Modal, FlatList,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, TEAM_STORAGE_KEY } from '../../lib/supabase';
import { getPitchStatus, getPitchLimit, formatInning } from '../../lib/pitchSmart';
import { Colors } from '../../constants/colors';
import LineupList from '../../components/LineupList';
import PitchCounter from '../../components/PitchCounter';
import PositionGrid from '../../components/PositionGrid';
import ShareSheet from '../../components/ShareSheet';
import type {
  Game, Team, Player, GameLineup, PitchLog, PositionLog, FieldPosition,
} from '../../lib/types';

type Tab = 'lineup' | 'pitching' | 'positions' | 'share';

export default function GameDay() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [game, setGame] = useState<Game | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [lineup, setLineup] = useState<GameLineup[]>([]);
  const [pitchLogs, setPitchLogs] = useState<PitchLog[]>([]);
  const [positionLogs, setPositionLogs] = useState<PositionLog[]>([]);
  const [roster, setRoster] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('lineup');
  const [showSubModal, setShowSubModal] = useState(false);
  const [subTarget, setSubTarget] = useState<GameLineup | null>(null);
  const [showPitcherModal, setShowPitcherModal] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [posAssignments, setPosAssignments] = useState<Partial<Record<FieldPosition, Player>>>({});

  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSync = useCallback((updatedGame: Game) => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(async () => {
      await supabase.from('sp_games').update({
        our_score: updatedGame.our_score,
        their_score: updatedGame.their_score,
        current_inning: updatedGame.current_inning,
        inning_half: updatedGame.inning_half,
        current_batter_order: updatedGame.current_batter_order,
        status: updatedGame.status,
      }).eq('id', updatedGame.id);
    }, 800);
  }, []);

  const load = useCallback(async () => {
    const teamId = await AsyncStorage.getItem(TEAM_STORAGE_KEY);
    if (!teamId || !id) return;

    const [gameRes, teamRes, lineupRes, pitchRes, posRes, rosterRes] = await Promise.all([
      supabase.from('sp_games').select('*').eq('id', id).single(),
      supabase.from('sp_teams').select('*').eq('id', teamId).single(),
      supabase.from('sp_game_lineup').select('*, player:sp_players(*)').eq('game_id', id).order('batting_order'),
      supabase.from('sp_pitch_logs').select('*, player:sp_players(*)').eq('game_id', id),
      supabase.from('sp_position_logs').select('*').eq('game_id', id),
      supabase.from('sp_players').select('*').eq('team_id', teamId).eq('is_active', true).order('sort_order'),
    ]);

    if (gameRes.data) setGame(gameRes.data);
    if (teamRes.data) setTeam(teamRes.data);
    if (lineupRes.data) setLineup(lineupRes.data as GameLineup[]);
    if (pitchRes.data) setPitchLogs(pitchRes.data as PitchLog[]);
    if (posRes.data) setPositionLogs(posRes.data);
    if (rosterRes.data) setRoster(rosterRes.data);

    // Prompt lineup setup if game has no lineup yet
    if ((!lineupRes.data || lineupRes.data.length === 0) && rosterRes.data?.length) {
      setShowSetupModal(true);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => () => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
  }, []);

  // --- Game actions ---
  const updateScore = (side: 'our' | 'their', delta: number) => {
    if (!game) return;
    const updated = {
      ...game,
      our_score: side === 'our' ? Math.max(0, game.our_score + delta) : game.our_score,
      their_score: side === 'their' ? Math.max(0, game.their_score + delta) : game.their_score,
      status: 'live' as const,
    };
    setGame(updated);
    scheduleSync(updated);
  };

  const advanceBatter = () => {
    if (!game || lineup.length === 0) return;
    const next = (game.current_batter_order % lineup.length) + 1;
    const updated = { ...game, current_batter_order: next, status: 'live' as const };
    setGame(updated);
    scheduleSync(updated);
  };

  const advanceInning = () => {
    if (!game) return;
    const isBottom = game.inning_half === 'bottom';
    const updated: Game = {
      ...game,
      current_inning: isBottom ? game.current_inning + 1 : game.current_inning,
      inning_half: isBottom ? 'top' : 'bottom',
    };
    setGame(updated);
    scheduleSync(updated);
  };

  const endGame = async () => {
    if (!game) return;
    Alert.alert('End Game', 'Mark this game as final?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Game',
        onPress: async () => {
          const updated = { ...game, status: 'final' as const };
          setGame(updated);
          await supabase.from('sp_games').update({ status: 'final' }).eq('id', game.id);
          router.back();
        },
      },
    ]);
  };

  // --- Lineup setup ---
  const setupLineup = async (orderedPlayers: Player[]) => {
    if (!game) return;
    const rows = orderedPlayers.map((p, i) => ({
      game_id: game.id,
      player_id: p.id,
      batting_order: i + 1,
    }));
    const { data, error } = await supabase.from('sp_game_lineup').insert(rows).select('*, player:sp_players(*)');
    if (error) { Alert.alert('Error', error.message); return; }
    if (data) setLineup(data as GameLineup[]);
    setShowSetupModal(false);

    // Set status to live
    const updated = { ...game, status: 'live' as const };
    setGame(updated);
    scheduleSync(updated);
  };

  // --- Substitution ---
  const handleSubstitute = (lineupEntry: GameLineup) => {
    setSubTarget(lineupEntry);
    setShowSubModal(true);
  };

  const executeSubstitution = async (newPlayer: Player) => {
    if (!subTarget || !game) return;
    const { error } = await supabase.from('sp_game_lineup')
      .update({
        player_id: newPlayer.id,
        is_sub: true,
        subbed_in_inning: game.current_inning,
        subbed_out_player_id: subTarget.player_id,
      })
      .eq('id', subTarget.id);
    if (error) { Alert.alert('Error', error.message); return; }
    setShowSubModal(false);
    load();
  };

  // --- Pitching ---
  const activePitcher = pitchLogs.find(l => l.inning_ended === null);

  const addPitch = async () => {
    if (!activePitcher || !game || !team) return;
    const newCount = activePitcher.pitch_count + 1;
    const limit = getPitchLimit(team.age_group, team.sport);
    if (limit && newCount > limit + 5) {
      Alert.alert('Way over limit', `${activePitcher.player?.name} is ${newCount - limit} over the ${limit}-pitch limit.`);
    }
    await supabase.from('sp_pitch_logs').update({ pitch_count: newCount }).eq('id', activePitcher.id);
    setPitchLogs(prev => prev.map(l => l.id === activePitcher.id ? { ...l, pitch_count: newCount } : l));
  };

  const subtractPitch = async () => {
    if (!activePitcher || activePitcher.pitch_count <= 0) return;
    const newCount = activePitcher.pitch_count - 1;
    await supabase.from('sp_pitch_logs').update({ pitch_count: newCount }).eq('id', activePitcher.id);
    setPitchLogs(prev => prev.map(l => l.id === activePitcher.id ? { ...l, pitch_count: newCount } : l));
  };

  const changePitcher = async (newPitcher: Player) => {
    if (!game) return;
    // Close current pitcher's log
    if (activePitcher) {
      await supabase.from('sp_pitch_logs')
        .update({ inning_ended: game.current_inning })
        .eq('id', activePitcher.id);
    }
    // Open new log
    const { data } = await supabase.from('sp_pitch_logs')
      .insert({ game_id: game.id, player_id: newPitcher.id, inning_started: game.current_inning })
      .select('*, player:sp_players(*)')
      .single();
    if (data) {
      setPitchLogs(prev => [
        ...prev.map(l => l.id === activePitcher?.id ? { ...l, inning_ended: game.current_inning } : l),
        data as PitchLog,
      ]);
    }
    setShowPitcherModal(false);
  };

  // --- Positions ---
  const logInning = async () => {
    if (!game) return;
    const rows = Object.entries(posAssignments).map(([pos, player]) => ({
      game_id: game.id,
      player_id: (player as Player).id,
      inning: game.current_inning,
      position: pos as FieldPosition,
    }));
    if (rows.length === 0) { Alert.alert('Assign positions first.'); return; }
    await supabase.from('sp_position_logs').upsert(rows, { onConflict: 'game_id,player_id,inning' });
    Alert.alert('Logged', `Inning ${game.current_inning} positions saved.`);
  };

  if (loading || !game || !team) {
    return <View style={styles.center}><ActivityIndicator color={Colors.navy} size="large" /></View>;
  }

  const pitchLimit = getPitchLimit(team.age_group, team.sport);
  const pitchCount = activePitcher?.pitch_count ?? 0;
  const pitchStatus = getPitchStatus(team.age_group, pitchCount, team.sport);
  const statusColor = { green: Colors.green, amber: Colors.amber, red: Colors.red, gray: Colors.muted }[pitchStatus.color];

  return (
    <View style={styles.container}>
      {/* Sticky game header */}
      <View style={styles.header}>
        <View style={styles.scoreBlock}>
          <Text style={styles.teamLabel}>US</Text>
          <View style={styles.scoreButtons}>
            <TouchableOpacity style={styles.scoreTap} onPress={() => updateScore('our', -1)}>
              <Text style={styles.scoreTapText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.score}>{game.our_score}</Text>
            <TouchableOpacity style={styles.scoreTap} onPress={() => updateScore('our', 1)}>
              <Text style={styles.scoreTapText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.inningBlock} onPress={advanceInning}>
          <Text style={styles.inningText}>{formatInning(game.current_inning, game.inning_half)}</Text>
          {game.status === 'live' && (
            <View style={styles.liveDot} />
          )}
        </TouchableOpacity>

        <View style={styles.scoreBlock}>
          <Text style={styles.teamLabel}>{game.opponent.slice(0, 6).toUpperCase()}</Text>
          <View style={styles.scoreButtons}>
            <TouchableOpacity style={styles.scoreTap} onPress={() => updateScore('their', -1)}>
              <Text style={styles.scoreTapText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.score}>{game.their_score}</Text>
            <TouchableOpacity style={styles.scoreTap} onPress={() => updateScore('their', 1)}>
              <Text style={styles.scoreTapText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Tab panels */}
      <View style={styles.content}>
        {tab === 'lineup' && (
          lineup.length === 0 ? (
            <View style={styles.emptyTab}>
              <Text style={styles.emptyTabText}>No lineup yet.</Text>
              <TouchableOpacity style={styles.emptyTabBtn} onPress={() => setShowSetupModal(true)}>
                <Text style={styles.emptyTabBtnText}>Set Lineup</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <LineupList
              lineup={lineup}
              currentOrder={game.current_batter_order}
              onAdvance={advanceBatter}
              onSubstitute={handleSubstitute}
            />
          )
        )}

        {tab === 'pitching' && (
          <ScrollView contentContainerStyle={styles.pitchingTab}>
            {activePitcher ? (
              <>
                <Text style={styles.pitcherName}>{activePitcher.player?.name}</Text>
                <Text style={styles.pitcherSub}>Now Pitching</Text>
                <PitchCounter
                  count={pitchCount}
                  status={pitchStatus}
                  limit={pitchLimit}
                  onAdd={addPitch}
                  onSubtract={subtractPitch}
                />

                {team.sport === 'softball' && (
                  <View style={styles.softballNote}>
                    <Text style={styles.softballNoteText}>
                      Softball: tracking pitches for reference. Circle rule reminder: if pitcher is in the circle and batter commits, batter must advance.
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.changePitcherBtn}
                  onPress={() => setShowPitcherModal(true)}
                >
                  <Text style={styles.changePitcherText}>Change Pitcher</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.emptyTab}>
                <Text style={styles.emptyTabText}>No pitcher set.</Text>
                <TouchableOpacity style={styles.emptyTabBtn} onPress={() => setShowPitcherModal(true)}>
                  <Text style={styles.emptyTabBtnText}>Select Pitcher</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Previous pitchers this game */}
            {pitchLogs.filter(l => l.inning_ended !== null).length > 0 && (
              <View style={styles.pitchHistory}>
                <Text style={styles.pitchHistoryTitle}>Today's Pitchers</Text>
                {pitchLogs.filter(l => l.inning_ended !== null).map(l => (
                  <View key={l.id} style={styles.pitchHistoryRow}>
                    <Text style={styles.pitchHistoryName}>{l.player?.name}</Text>
                    <Text style={[styles.pitchHistoryCount, { color: getPitchStatus(team.age_group, l.pitch_count, team.sport).color === 'red' ? Colors.red : Colors.text }]}>
                      {l.pitch_count} pitches
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )}

        {tab === 'positions' && (
          <ScrollView contentContainerStyle={styles.positionsTab}>
            <Text style={styles.inningLabel}>Inning {game.current_inning}</Text>
            <PositionGrid
              sport={team.sport}
              assignments={posAssignments}
              roster={roster}
              onAssign={(pos, _current) => {
                // Simple picker: cycle through roster
                const bench = roster.filter(p =>
                  !Object.values(posAssignments).find(ap => ap?.id === p.id)
                );
                if (bench.length === 0) return;
                const next = bench[0];
                setPosAssignments(prev => ({
                  ...prev,
                  [pos]: prev[pos] ? undefined : next,
                }));
              }}
            />
            <Text style={styles.posHint}>
              Tap a position to assign the next available player from your bench.
            </Text>
            <TouchableOpacity style={styles.logInningBtn} onPress={logInning}>
              <Text style={styles.logInningBtnText}>Log Inning {game.current_inning}</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {tab === 'share' && (
          <ScrollView>
            <ShareSheet shareToken={game.share_token} />
          </ScrollView>
        )}
      </View>

      {/* Bottom tab bar */}
      <View style={styles.tabBar}>
        {([
          { key: 'lineup',    icon: '📋', label: 'Lineup' },
          { key: 'pitching',  icon: '⚾', label: 'Pitching' },
          { key: 'positions', icon: '🏟', label: 'Field' },
          { key: 'share',     icon: '📲', label: 'Share' },
        ] as { key: Tab; icon: string; label: string }[]).map(({ key, icon, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.tabBtn, tab === key && styles.tabBtnActive]}
            onPress={() => setTab(key)}
          >
            <Text style={styles.tabIcon}>{icon}</Text>
            <Text style={[styles.tabLabel, tab === key && styles.tabLabelActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Pitcher picker modal */}
      <Modal visible={showPitcherModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Select Pitcher</Text>
          <FlatList
            data={roster.filter(p => p.can_pitch)}
            keyExtractor={p => p.id}
            ListEmptyComponent={() => (
              <Text style={styles.modalEmpty}>No pitchers on roster. Mark players as pitchers in the Roster tab.</Text>
            )}
            renderItem={({ item: p }) => {
              const log = pitchLogs.find(l => l.player_id === p.id);
              const total = log?.pitch_count ?? 0;
              const ps = getPitchStatus(team.age_group, total, team.sport);
              return (
                <TouchableOpacity
                  style={styles.pitcherOption}
                  onPress={() => changePitcher(p)}
                >
                  <View style={styles.pitcherOptionLeft}>
                    <Text style={styles.pitcherOptionName}>{p.name}</Text>
                    <Text style={styles.pitcherOptionCount}>{total} pitches today</Text>
                  </View>
                  <View style={[styles.pitcherStatusChip, { backgroundColor: { green: Colors.green, amber: Colors.amber, red: Colors.red, gray: Colors.muted }[ps.color] + '20' }]}>
                    <Text style={[styles.pitcherStatusText, { color: { green: Colors.green, amber: Colors.amber, red: Colors.red, gray: Colors.muted }[ps.color] }]}>
                      {ps.color === 'red' ? 'LIMIT' : ps.color === 'amber' ? 'WARN' : 'OK'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowPitcherModal(false)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Substitution modal */}
      <Modal visible={showSubModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>
            Sub for {subTarget?.player?.name}
          </Text>
          <FlatList
            data={roster.filter(p => !lineup.find(l => l.player_id === p.id))}
            keyExtractor={p => p.id}
            ListEmptyComponent={() => <Text style={styles.modalEmpty}>No bench players available.</Text>}
            renderItem={({ item: p }) => (
              <TouchableOpacity style={styles.pitcherOption} onPress={() => executeSubstitution(p)}>
                <Text style={styles.pitcherOptionName}>{p.name} {p.jersey_number ? `#${p.jersey_number}` : ''}</Text>
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowSubModal(false)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Lineup setup modal */}
      <LineupSetupModal
        visible={showSetupModal}
        roster={roster}
        onConfirm={setupLineup}
        onDismiss={() => setShowSetupModal(false)}
      />
    </View>
  );
}

// Simple drag-free lineup builder: tap players in batting order
function LineupSetupModal({
  visible, roster, onConfirm, onDismiss,
}: {
  visible: boolean;
  roster: Player[];
  onConfirm: (players: Player[]) => void;
  onDismiss: () => void;
}) {
  const [selected, setSelected] = useState<Player[]>([]);

  const toggle = (p: Player) => {
    setSelected(prev =>
      prev.find(x => x.id === p.id)
        ? prev.filter(x => x.id !== p.id)
        : [...prev, p]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modal}>
        <Text style={styles.modalTitle}>Set Batting Order</Text>
        <Text style={styles.modalSub}>Tap players in batting order (1st to last).</Text>
        <FlatList
          data={roster}
          keyExtractor={p => p.id}
          renderItem={({ item: p }) => {
            const idx = selected.findIndex(x => x.id === p.id);
            const inOrder = idx !== -1;
            return (
              <TouchableOpacity
                style={[styles.pitcherOption, inOrder && styles.pitcherOptionSelected]}
                onPress={() => toggle(p)}
              >
                <View style={styles.pitcherOptionLeft}>
                  {inOrder && (
                    <View style={styles.orderNum}>
                      <Text style={styles.orderNumText}>{idx + 1}</Text>
                    </View>
                  )}
                  <Text style={styles.pitcherOptionName}>{p.name}</Text>
                  {p.jersey_number && <Text style={styles.pitcherOptionCount}>#{p.jersey_number}</Text>}
                </View>
              </TouchableOpacity>
            );
          }}
        />
        <TouchableOpacity
          style={[styles.modalBtn, selected.length === 0 && { opacity: 0.4 }]}
          onPress={() => selected.length > 0 && onConfirm(selected)}
          disabled={selected.length === 0}
        >
          <Text style={styles.modalBtnText}>Set {selected.length} Batters</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelBtn} onPress={onDismiss}>
          <Text style={styles.cancelText}>Skip</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    backgroundColor: Colors.navy,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  scoreBlock: { flex: 1, alignItems: 'center' },
  teamLabel: { fontSize: 10, fontWeight: '800', color: Colors.white + '99', letterSpacing: 1, marginBottom: 4 },
  scoreButtons: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scoreTap: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.white + '20', justifyContent: 'center', alignItems: 'center' },
  scoreTapText: { fontSize: 18, color: Colors.white, fontWeight: '700' },
  score: { fontSize: 40, fontWeight: '900', color: Colors.white, minWidth: 48, textAlign: 'center' },
  inningBlock: { alignItems: 'center', paddingHorizontal: 8 },
  inningText: { fontSize: 14, fontWeight: '800', color: Colors.white, textAlign: 'center' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.red, marginTop: 4 },
  content: { flex: 1 },
  pitchingTab: { padding: 20, alignItems: 'center' },
  pitcherName: { fontSize: 26, fontWeight: '800', color: Colors.navy, textAlign: 'center', marginBottom: 4 },
  pitcherSub: { fontSize: 13, color: Colors.muted, letterSpacing: 1, marginBottom: 8 },
  softballNote: {
    backgroundColor: Colors.amber + '15',
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
    borderLeftWidth: 3,
    borderLeftColor: Colors.amber,
    width: '100%',
  },
  softballNoteText: { fontSize: 12, color: Colors.text, lineHeight: 18 },
  changePitcherBtn: {
    marginTop: 20,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
  },
  changePitcherText: { fontSize: 16, fontWeight: '700', color: Colors.navy },
  pitchHistory: { width: '100%', marginTop: 28 },
  pitchHistoryTitle: { fontSize: 13, fontWeight: '700', color: Colors.muted, letterSpacing: 0.5, marginBottom: 8 },
  pitchHistoryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  pitchHistoryName: { fontSize: 15, fontWeight: '600', color: Colors.text },
  pitchHistoryCount: { fontSize: 15, fontWeight: '700' },
  positionsTab: { padding: 16, alignItems: 'center' },
  inningLabel: { fontSize: 16, fontWeight: '700', color: Colors.navy, marginBottom: 8 },
  posHint: { fontSize: 12, color: Colors.muted, textAlign: 'center', marginBottom: 16 },
  logInningBtn: {
    backgroundColor: Colors.navy,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginTop: 8,
  },
  logInningBtnText: { fontSize: 16, fontWeight: '800', color: Colors.white },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingBottom: 16,
    paddingTop: 8,
    height: 68,
  },
  tabBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabBtnActive: {},
  tabIcon: { fontSize: 20 },
  tabLabel: { fontSize: 11, fontWeight: '600', color: Colors.muted },
  tabLabelActive: { color: Colors.orange },
  emptyTab: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTabText: { fontSize: 16, color: Colors.muted, marginBottom: 16 },
  emptyTabBtn: { backgroundColor: Colors.navy, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 10 },
  emptyTabBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  modal: { flex: 1, padding: 24, backgroundColor: Colors.surface },
  modalTitle: { fontSize: 22, fontWeight: '800', color: Colors.navy, marginBottom: 8, marginTop: 8 },
  modalSub: { fontSize: 14, color: Colors.muted, marginBottom: 16 },
  modalEmpty: { padding: 24, textAlign: 'center', color: Colors.muted, fontSize: 14 },
  modalBtn: { marginTop: 16, backgroundColor: Colors.navy, height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  modalBtnText: { fontSize: 17, fontWeight: '800', color: Colors.white },
  cancelBtn: { alignItems: 'center', paddingVertical: 14 },
  cancelText: { fontSize: 15, color: Colors.muted },
  pitcherOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.white,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pitcherOptionSelected: { borderColor: Colors.orange, backgroundColor: Colors.orange + '08' },
  pitcherOptionLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  pitcherOptionName: { fontSize: 16, fontWeight: '700', color: Colors.text },
  pitcherOptionCount: { fontSize: 13, color: Colors.muted },
  pitcherStatusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  pitcherStatusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  orderNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.orange, justifyContent: 'center', alignItems: 'center' },
  orderNumText: { fontSize: 13, fontWeight: '800', color: Colors.white },
});
