import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/colors';
import { TEAM_STORAGE_KEY } from '../lib/supabase';

export default function Index() {
  useEffect(() => {
    (async () => {
      const teamId = await AsyncStorage.getItem(TEAM_STORAGE_KEY);
      if (teamId) {
        router.replace('/(tabs)/dashboard');
      } else {
        router.replace('/onboarding/create-team');
      }
    })();
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.navy} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.navy,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
