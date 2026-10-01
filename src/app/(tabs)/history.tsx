import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CenteredLoader } from '@/components/centered-loader';
import { StatusBadge } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { formatDate, formatDuration, formatTime } from '@/lib/dates';
import { getFriendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import { Attendance } from '@/types';
import { useAuth } from '@/context/auth-context';

export default function HistoryScreen() {
  const { profile } = useAuth();
  const theme = useTheme();
  const [rows, setRows] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('my_attendance', {
      p_limit: 100,
      p_offset: 0,
    });
    if (rpcError) {
      setError(getFriendlyError(rpcError));
    } else {
      setError(null);
      setRows((data as Attendance[]) ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return <CenteredLoader message="Cargando tu historial…" />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <ThemedText type="subtitle">Historial</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {profile?.employee.full_name}
        </ThemedText>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <ThemedText type="small" style={styles.errorText}>
            {error}
          </ThemedText>
        </View>
      )}

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textSecondary} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={48} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
              Aún no tienes asistencias registradas.
            </ThemedText>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/attendance/${item.id}`)}
            accessibilityRole="button">
            <ThemedView type="backgroundElement" style={styles.row}>
              <View style={styles.rowTop}>
                <ThemedText style={styles.date}>
                  {item.check_date ? formatDate(new Date(`${item.check_date}T12:00:00`)) : '—'}
                </ThemedText>
                {item.status !== 'on_time' && <StatusBadge status={item.status} />}
              </View>
              {item.branch_name ? (
                <View style={styles.branchRow}>
                  <Ionicons name="business-outline" size={14} color={theme.textSecondary} />
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.branch_name}
                  </ThemedText>
                </View>
              ) : null}
              <View style={styles.rowTimes}>
                <View style={styles.timeBox}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Entrada
                  </ThemedText>
                  <ThemedText type="smallBold">{item.check_in ? formatTime(item.check_in) : '—'}</ThemedText>
                </View>
                <View style={styles.timeBox}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Salida
                  </ThemedText>
                  <ThemedText type="smallBold">
                    {item.check_out ? formatTime(item.check_out) : '—'}
                  </ThemedText>
                </View>
                <View style={styles.timeBox}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Duración
                  </ThemedText>
                  <ThemedText type="smallBold">
                    {item.check_in && item.check_out
                      ? formatDuration(item.check_in, item.check_out)
                      : item.is_open
                        ? 'En curso'
                        : '—'}
                  </ThemedText>
                </View>
              </View>
              <View style={styles.chevronRow}>
                <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
              </View>
            </ThemedView>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.half,
  },
  list: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  row: {
    borderRadius: 18,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  date: {
    fontWeight: '700',
    fontSize: 16,
    textTransform: 'capitalize',
  },
  branchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  rowTimes: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  timeBox: {
    flex: 1,
    gap: 2,
  },
  chevronRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  errorBox: {
    marginHorizontal: Spacing.four,
    marginTop: Spacing.three,
    backgroundColor: 'rgba(229, 72, 77, 0.14)',
    borderRadius: 12,
    padding: 12,
  },
  errorText: {
    color: '#B93A3A',
    fontWeight: '600',
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.six,
  },
  emptyText: {
    textAlign: 'center',
  },
});