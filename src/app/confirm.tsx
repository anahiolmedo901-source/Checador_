import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CenteredLoader } from '@/components/centered-loader';
import { PrimaryButton } from '@/components/primary-button';
import { StatusBadge } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getCheckMeta, parseCheckKind } from '@/lib/checks';
import { formatTime } from '@/lib/dates';
import { getFriendlyError } from '@/lib/errors';
import { getEvidenceUrl } from '@/lib/evidence';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/hooks/use-theme';
import { AttendanceDetail, CheckKind } from '@/types';

function relevantTime(detail: AttendanceDetail, kind: CheckKind): string {
  const s = detail.session;
  switch (kind) {
    case 'check_in':
      return s.check_in ?? '';
    case 'break_out':
      return s.break_out_at ?? '';
    case 'break_in':
      return s.break_in_at ?? '';
    case 'check_out':
      return s.check_out ?? '';
  }
}

export default function ConfirmScreen() {
  const params = useLocalSearchParams<{ kind?: string; session?: string }>();
  const kind = parseCheckKind(params.kind);
  const theme = useTheme();

  const [detail, setDetail] = useState<AttendanceDetail | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!kind || !params.session) {
        setError('Confirmación no válida.');
        return;
      }
      setError(null);
      const { data, error: rpcError } = await supabase.rpc('attendance_detail', {
        p_session_id: params.session,
      });
      if (rpcError) {
        setError(getFriendlyError(rpcError));
        return;
      }
      const casted = data as AttendanceDetail | null;
      if (!casted?.session) {
        setError('No se encontró la checada registrada.');
        return;
      }
      setDetail(casted);
      const event = casted.events.find((e) => e.check_type === kind);
      const photo = event?.photo_url ?? casted.session.photo_url;
      const url = await getEvidenceUrl(photo);
      setPhotoUrl(url);
    })();
  }, [kind, params.session]);

  const meta = kind ? getCheckMeta(kind) : null;
  const showLate = kind === 'check_in' && detail?.session.status === 'late';
  const showOutOfWindow = kind === 'check_in' && detail?.session.status === 'out_of_window';

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.centerContent}>
          <Ionicons name="alert-circle" size={64} color="#B93A3A" />
          <ThemedText type="subtitle" style={styles.centerTitle}>
            {error}
          </ThemedText>
          <PrimaryButton title="Ir al inicio" onPress={() => router.replace('/')} style={styles.wide} />
        </View>
      </SafeAreaView>
    );
  }

  if (!detail) {
    return <CenteredLoader message="Confirmando tu checada…" />;
  }

  const time = relevantTime(detail, kind ?? 'check_in');

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
      edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.centerContent} showsVerticalScrollIndicator={false}>
        <Ionicons name="checkmark-circle" size={96} color="#2E7D5B" />
        <ThemedText type="subtitle" style={styles.centerTitle}>
          {meta?.success ?? 'Checada registrada'}
        </ThemedText>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.confirmTime}>
          {time ? formatTime(time) : '--:--'}
        </ThemedText>

        {(showLate || showOutOfWindow) && (
          <StatusBadge status={detail.session.status} label={showLate ? 'Retardo' : 'Fuera de horario'} />
        )}

        {photoUrl && (
          <View style={styles.photoWrap}>
            <Image source={{ uri: photoUrl }} style={styles.photo} resizeMode="cover" />
          </View>
        )}

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="small" themeColor="textSecondary">
            {detail.session.branch_name ?? 'Sucursal'}
          </ThemedText>
          <ThemedText type="smallBold">
            {detail.session.check_in ? `Entrada ${formatTime(detail.session.check_in)}` : ''}
            {detail.session.check_out ? ` · Salida ${formatTime(detail.session.check_out)}` : ''}
          </ThemedText>
        </ThemedView>

        <PrimaryButton title="Listo" onPress={() => router.replace('/')} style={styles.wide} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  centerTitle: {
    textAlign: 'center',
  },
  confirmTime: {
    textAlign: 'center',
    fontSize: 18,
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
  },
  photoWrap: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  photo: {
    width: 160,
    height: 160,
    borderRadius: 24,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    alignSelf: 'stretch',
    gap: 4,
    alignItems: 'center',
  },
  wide: {
    alignSelf: 'stretch',
  },
});
