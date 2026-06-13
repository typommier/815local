import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '../constants/colors';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.navy },
          headerTintColor: Colors.white,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: Colors.surface },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="onboarding/create-team"
          options={{ title: 'Create Your Team', headerBackTitle: '' }}
        />
        <Stack.Screen
          name="onboarding/add-players"
          options={{ title: 'Add Players', headerBackTitle: '' }}
        />
        <Stack.Screen
          name="game/[id]"
          options={{ title: 'Game Day', headerBackTitle: 'Games' }}
        />
      </Stack>
    </>
  );
}
