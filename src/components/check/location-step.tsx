import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LocationFix } from '@/types';

export type LocationStepState = 'idle' | 'locating' | 'done' | 'unavailable' | 'error';

type Props = {
  locState: LocationStepState;
  locMessage: string | null;
  branchName?: string;
  fix: LocationFix | null;
  withinRange: boolean;
  submitError: string | null;
  submitting: boolean;
  canSubmit: boolean;
  verb: string;
  onRetry: () => void;
  onSubmit: () => void;
};

export function LocationStep({
  locState,
  locMessage,
  branchName,
  fix,
  withinRange,
  submitError,
  submitting,
  canSubmit,
  verb,
  onRetry,
  onSubmit,
}: Props) {
  return (
    <ScrollView contentContainerStyle={styles.centerContent}>
      <Ionicons
        name="location"
        size={64}
        color={locState === 'done' && withinRange ? '#2E7D5B' : '#2F5F96'}
      />
      <ThemedText type="subtitle" style={styles.centerTitle}>
        Ubicación
      </ThemedText>

      {locState === 'locating' && (
        <View style={styles.inlineCenter}>
          <ActivityIndicator size="large" color="#2F5F96" />
          <ThemedText type="small" themeColor="textSecondary">
            Obteniendo tu posición…
          </ThemedText>
        </View>
      )}

      {(locState === 'unavailable' || locState === 'error') && (
        <>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centerHint}>
            {locMessage}
          </ThemedText>
          <PrimaryButton title="Reintentar" onPress={onRetry} style={styles.wide} />
        </>
      )}

      {locState === 'done' && fix && (
        <>
          <ThemedView type="backgroundElement" style={styles.fixCard}>
            <View style={styles.fixRow}>
              <Ionicons name="business-outline" size={22} color="#2F5F96" />
              <View style={styles.branchText}>
                <ThemedText type="small" themeColor="textSecondary">Sucursal</ThemedText>
                <ThemedText type="smallBold" numberOfLines={2}>{branchName ?? 'Sucursal asignada'}</ThemedText>
              </View>
            </View>
            <View style={withinRange ? styles.inRangeBadge : styles.outRangeBadge}>
              <Ionicons
                name={withinRange ? 'checkmark-circle' : 'close-circle'}
                size={20}
                color={withinRange ? '#2E7D5B' : '#B93A3A'}
              />
              <View style={styles.rangeText}>
                <Text style={withinRange ? styles.inRangeText : styles.outRangeText}>
                  {withinRange ? 'Dentro del rango permitido' : 'Fuera del rango permitido'}
                </Text>
                {!withinRange ? (
                  <Text style={styles.outRangeDetail}>
                    Acércate a {branchName ?? 'tu sucursal'} para registrar tu checada.
                  </Text>
                ) : null}
              </View>
            </View>
          </ThemedView>

          {submitError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{submitError}</Text>
            </View>
          )}

          <PrimaryButton
            title={verb}
            onPress={onSubmit}
            disabled={!canSubmit}
            loading={submitting}
            style={styles.wide}
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centerContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  inlineCenter: {
    alignItems: 'center',
    gap: 12,
  },
  centerTitle: {
    textAlign: 'center',
  },
  centerHint: {
    textAlign: 'center',
  },
  wide: {
    alignSelf: 'stretch',
  },
  fixCard: {
    borderRadius: 16,
    padding: 16,
    alignSelf: 'stretch',
    gap: 10,
  },
  fixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  branchText: {
    flex: 1,
    gap: 2,
  },
  rangeText: {
    flex: 1,
    gap: 2,
  },
  inRangeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(48, 164, 108, 0.16)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    alignSelf: 'stretch',
  },
  inRangeText: {
    color: '#2E7D5B',
    fontWeight: '700',
    fontSize: 14,
  },
  outRangeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(229, 72, 77, 0.16)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    alignSelf: 'stretch',
  },
  outRangeText: {
    color: '#B93A3A',
    fontWeight: '700',
    fontSize: 14,
  },
  outRangeDetail: {
    color: '#B93A3A',
    fontSize: 13,
  },
  errorBox: {
    backgroundColor: 'rgba(229, 72, 77, 0.16)',
    borderRadius: 12,
    padding: 14,
    alignSelf: 'stretch',
  },
  errorText: {
    color: '#B93A3A',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
