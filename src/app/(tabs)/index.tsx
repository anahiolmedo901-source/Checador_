import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CenteredLoader } from '@/components/centered-loader';
import { PrimaryButton } from '@/components/primary-button';
import { StatusBadge } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/context/auth-context';
import { getCheckMeta } from '@/lib/checks';
import { formatDuration, formatFullDate, formatTime } from '@/lib/dates';
import { useSessionState } from '@/hooks/use-session-state';
import { getInitials } from '@/lib/format';
import { Spacing } from '@/constants/theme';
import { CheckKind, Shift } from '@/types';

function HomeButton({ kind, disabled = false }: { kind: CheckKind; disabled?: boolean }) {
  const meta = getCheckMeta(kind);
  const isEntry = kind === 'check_in';
  return (
    <PrimaryButton
      title={meta.verb}
      onPress={() => router.push(`/check?kind=${kind}`)}
      variant={isEntry ? 'success' : 'primary'}
      disabled={disabled}
    />
  );
}

export default function HomeScreen() {
  const { profile, device, isDeviceUsable } = useAuth();
  const { state, loading, error, refresh } = useSessionState();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const initials = getInitials(profile?.employee.full_name);

  const open = state?.session ?? null;
  const nextKind = state?.next_check ?? 'check_in';
  const nextMeta = getCheckMeta(nextKind);
  const deviceBlocked = device != null && !isDeviceUsable;
  const shift = profile?.shift ?? null;
  const entryAlreadyRecorded = state?.entry_window?.already_recorded === true;

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <ThemedView type="backgroundElement" style={styles.avatar}>
              <ThemedText type="smallBold">{initials}</ThemedText>
            </ThemedView>
            <View style={styles.headerText}>
              <ThemedText type="small" themeColor="textSecondary">
                Hola,
              </ThemedText>
              <ThemedText numberOfLines={1} style={styles.name}>
                {profile?.employee.full_name ?? 'Empleado'}
              </ThemedText>
            </View>
          </View>

          <ThemedText type="title" style={styles.clock}>
            {now.toLocaleTimeString('es-MX', { hour12: true })}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.date}>
            {formatFullDate(now)}
          </ThemedText>
        </View>

        {deviceBlocked && (
          <ThemedView type="backgroundElement" style={styles.blockCard}>
            <ThemedText type="smallBold" style={styles.blockTitle}>
              Dispositivo desactivado
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              No podrás registrar checadas en este dispositivo.
            </ThemedText>
          </ThemedView>
        )}

        {shift && <ShiftCard shift={shift} />}

        {loading ? (
          <CenteredLoader message="Consultando tu día…" />
        ) : error ? (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyHint}>
              {error}
            </ThemedText>
            <PrimaryButton title="Reintentar" onPress={() => refresh()} variant="secondary" />
          </ThemedView>
        ) : open ? (
          <ThemedView type="backgroundElement" style={styles.card}>
            <StatusBadge
              status={open.status}
              label={open.check_out ? 'Jornada terminada' : 'Entrada registrada'}
            />
            <View style={styles.cardRow}>
              <View style={styles.timeBlock}>
                <ThemedText type="small" themeColor="textSecondary">
                  Entrada a las
                </ThemedText>
                <ThemedText type="subtitle" style={styles.timeValue}>
                  {formatTime(open.check_in)}
                </ThemedText>
              </View>
              {open.break_out_at ? (
                <View style={styles.timeBlock}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Pausa a las
                  </ThemedText>
                  <ThemedText type="subtitle" style={styles.timeValue}>
                    {formatTime(open.break_out_at)}
                  </ThemedText>
                </View>
              ) : (
                <View style={styles.timeBlock}>
                  <ThemedText type="small" themeColor="textSecondary">
                    En jornada
                  </ThemedText>
                  <ThemedText type="subtitle" style={styles.timeValue}>
                    {formatDuration(open.check_in ?? now, new Date())}
                  </ThemedText>
                </View>
              )}
            </View>
            <HomeButton kind={nextKind} />
          </ThemedView>
        ) : (
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.emptyIcon}>
              <ThemedText type="subtitle">🚪</ThemedText>
            </View>
            <ThemedText style={styles.emptyTitle}>
              {entryAlreadyRecorded ? 'Tu entrada de hoy ya está registrada' : 'Aún no registras tu entrada'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyHint}>
              {entryAlreadyRecorded
                ? 'No puedes registrar una segunda entrada el mismo día.'
                : 'Se te tomará una fotografía y se validará tu ubicación en la sucursal.'}
            </ThemedText>
            {nextKind === 'check_in' && state?.entry_window?.allowed !== true ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.scheduleHint}>
                {state?.entry_window?.message ?? 'No se pudo validar tu horario. Intenta actualizar la pantalla.'}
              </ThemedText>
            ) : null}
            {!entryAlreadyRecorded ? (
              <HomeButton kind={nextKind} disabled={nextKind === 'check_in' && state?.entry_window?.allowed !== true} />
            ) : null}
          </ThemedView>
        )}

        {!loading && !error && open && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.nextHint}>
            Siguiente paso: {nextMeta.title.toLowerCase()}
          </ThemedText>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ShiftCard({ shift }: { shift: Shift }) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.cardRow}>
        <ThemedText type="smallBold">{shift.name}</ThemedText>
      </View>
      <View style={[styles.cardRow, styles.rowGap]}>
        <View style={styles.timeBlock}>
          <ThemedText type="small" themeColor="textSecondary">
            Entrada
          </ThemedText>
          <ThemedText type="subtitle" style={styles.timeValue}>
            {shift.start_time}
          </ThemedText>
        </View>
        <View style={styles.timeBlock}>
          <ThemedText type="small" themeColor="textSecondary">
            Salida
          </ThemedText>
          <ThemedText type="subtitle" style={styles.timeValue}>
            {shift.end_time}
          </ThemedText>
        </View>
        <View style={styles.timeBlock}>
          <ThemedText type="small" themeColor="textSecondary">
            Comida
          </ThemedText>
          <ThemedText type="subtitle" style={styles.timeValue}>
            {shift.break_min} min
          </ThemedText>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    padding: Spacing.four,
    gap: Spacing.four,
    paddingBottom: Spacing.six,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    alignSelf: 'stretch',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
  },
  clock: {
    fontSize: 44,
  },
  date: {
    textTransform: 'capitalize',
  },
  card: {
    borderRadius: 24,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  blockCard: {
    borderRadius: 18,
    padding: Spacing.three,
    gap: Spacing.one,
    borderWidth: 1,
    borderColor: 'rgba(228, 138, 0, 0.5)',
  },
  blockTitle: {
    color: '#E48A00',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  rowGap: {
    marginTop: Spacing.two,
  },
  timeBlock: {
    flex: 1,
    gap: Spacing.half,
  },
  timeValue: {
    fontSize: 22,
    lineHeight: 28,
  },
  emptyIcon: {
    alignItems: 'center',
  },
  emptyTitle: {
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 18,
  },
  emptyHint: {
    textAlign: 'center',
  },
  nextHint: {
    textAlign: 'center',
  },
  scheduleHint: {
    textAlign: 'center',
    lineHeight: 20,
  },
});
