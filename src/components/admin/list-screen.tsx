import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ReactElement, ReactNode } from 'react';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { CenteredLoader } from '@/components/centered-loader';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';

export interface ListBadge {
  text: string;
  color: string;
}

export interface ListRow {
  key: string;
  title: string;
  subtitle?: string | null;
  badge?: ListBadge | null;
  right?: ReactNode;
  onPress?: () => void;
}

type Props = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  rows: ListRow[];
  emptyText: string;
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  onAdd?: () => void;
  addLabel?: string;
  renderRow?: (row: ListRow) => ReactElement;
  outer?: ReactNode;
};

export function AdminListScreen({
  title,
  subtitle,
  onBack,
  loading,
  error,
  onRetry,
  rows,
  emptyText,
  search,
  onSearchChange,
  searchPlaceholder = 'Buscar…',
  onAdd,
  addLabel = 'Nuevo',
  renderRow,
  outer,
}: Props) {
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <ScreenHeader title={title} onBack={onBack ?? (router.canGoBack() ? () => router.back() : undefined)} />
      {outer}

      {onSearchChange ? (
        <View style={styles.searchWrap}>
          <TextInput
            value={search}
            onChangeText={onSearchChange}
            placeholder={searchPlaceholder}
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.search, { backgroundColor: theme.backgroundElement, color: theme.text }]}
          />
          {onAdd ? (
            <Pressable
              accessibilityRole="button"
              onPress={onAdd}
              style={({ pressed }) => [
                styles.addBtn,
                { backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}>
              <Ionicons name="add" size={24} color="#2F5F96" />
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.topBar}>
          <ThemedText type="small" themeColor="textSecondary">
            {subtitle ?? ''}
          </ThemedText>
          {onAdd ? (
            <Pressable
              accessibilityRole="button"
              onPress={onAdd}
              style={({ pressed }) => [
                styles.addBtn,
                { backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}>
              <Ionicons name="add" size={24} color="#2F5F96" />
            </Pressable>
          ) : (
            <View style={styles.topBarFill} />
          )}
        </View>
      )}

      {loading ? (
        <CenteredLoader message="Cargando…" />
      ) : error ? (
        <ScrollView contentContainerStyle={styles.centerBox}>
          <ThemedText type="small" style={styles.errorText}>
            {error}
          </ThemedText>
          {onRetry ? (
            <Pressable
              accessibilityRole="button"
              onPress={onRetry}
              style={({ pressed }) => [styles.retryBtn, { backgroundColor: theme.backgroundElement }, pressed && styles.pressed]}>
              <Text style={[styles.retryText, { color: theme.text }]}>Reintentar</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      ) : rows.length === 0 ? (
        <View style={styles.centerBox}>
          <ThemedText type="small" themeColor="textSecondary">
            {emptyText}
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          renderItem={({ item }) =>
            renderRow ? (
              renderRow(item)
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={item.onPress}
                disabled={!item.onPress}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: theme.backgroundElement },
                  pressed && item.onPress && styles.pressed,
                ]}>
                {item.onPress ? (
                  <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} style={styles.rowChevron} />
                ) : null}
                <View style={styles.rowBody}>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {item.title}
                  </ThemedText>
                  {item.subtitle ? (
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {item.subtitle}
                    </ThemedText>
                  ) : null}
                </View>
                {item.badge ? (
                  <View style={[styles.badge, { backgroundColor: item.badge.color }]}>
                    <Text style={styles.badgeText}>{item.badge.text}</Text>
                  </View>
                ) : null}
                {item.right}
              </Pressable>
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchWrap: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  search: {
    flex: 1,
    borderRadius: 16,
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  topBarFill: {
    flex: 1,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  centerBox: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  errorText: {
    color: '#B93A3A',
    textAlign: 'center',
  },
  retryBtn: {
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: {
    fontSize: 15,
    fontWeight: '700',
  },
  list: {
    padding: Spacing.four,
    gap: Spacing.two,
    paddingBottom: Spacing.six,
  },
  row: {
    borderRadius: 16,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  rowChevron: {
    transform: [{ rotate: '180deg' }],
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});
