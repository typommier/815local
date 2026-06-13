import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kyneaettrynagavewefi.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5bmVhZXR0cnluYWdhdmV3ZWZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MTQyNjYsImV4cCI6MjA5MjE5MDI2Nn0.M0II61ANo67dJk-8kz4VCkiwaI4uxdtIFsLI0aR0uZk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Storage key for team data (no auth in MVP — teams identified by coach_code)
export const TEAM_STORAGE_KEY = 'dugout_team_id';
