import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CenteredLoader } from '@/components/centered-loader';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenHeader } from '@/components/screen-header';
import { StatusBadge } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CHECK_META } from '@/lib/checks';
import { formatDate, formatDuration, formatTime } from '@/lib/dates';
import { getFriendlyError } from '@/lib/errors';
import { getEvidenceUrl } from '@/lib/evidence';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/hooks/use-theme';
import { AttendanceDetail, AttendanceEvent } from '@/types';

export default function AttendanceDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();

  const [detail, setDetail] = useState<AttendanceDetail | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!params.id) {
        setError('Checada no válida.');
        return;
      }
      const { data, error: rpcError } = await supabase.rpc('attendance_detail', {
        p_session_id: params.id,
      });
      if (rpcError) {
        setError(getFriendlyError(rpcError));
        return;
      }
      const casted = data as AttendanceDetail | null;
      if (!casted?.session) {
        setError('No se encontró esta checada.');
        return;
      }
      setDetail(casted);
      const urls: Record<string, string> = {};
      for (const ev of casted.events) {
        if (ev.photo_url && !urls[ev.id]) {
          const url = await getEvidenceUrl(ev.photo_url);
          if (url) urls[ev.id] = url;
        }
      }
      setPhotoUrls(urls);
    })();
  }, [params.id]);

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.center}>
          <Ionicons name="alert-circle" size={56} color="#B93A3A" />
          <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
            {error}
          </ThemedText>
          <PrimaryButton title="Volver" onPress={() => router.back()} style={styles.wide} />
        </View>
      </SafeAreaView>
    );
  }

  if (!detail) {
    return <CenteredLoader message="Cargando detalle…" />;
  }

  const s = detail.session;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <ScreenHeader title="Detalle" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ThemedView type="backgroundElement" style={styles.card}>
          <View style={styles.row}>
            <ThemedText style={styles.date}>
              {s.check_date ? formatDate(new Date(`${s.check_date}T12:00:00`)) : '—'}
            </ThemedText>
            {s.status && <StatusBadge status={s.status} />}
          </View>
          <View style={styles.row}>
            <ThemedText type="small" themeColor="textSecondary">
              Sucursal
            </ThemedText>
            <ThemedText type="smallBold">{s.branch_name ?? 'Sin sucursal'}</ThemedText>
          </View>
          {s.branch_address ? (
            <View style={styles.row}>
              <ThemedText type="small" themeColor="textSecondary">
                Dirección
              </ThemedText>
              <ThemedText type="smallBold" style={styles.rightText}>
                {s.branch_address}
              </ThemedText>
            </View>
          ) : null}
          {s.minutes_worked != null && s.minutes_worked > 0 ? (
            <View style={styles.row}>
              <ThemedText type="small" themeColor="textSecondary">
                Duración total
              </ThemedText>
              <ThemedText type="smallBold">
                {formatDuration(new Date(0), new Date(s.minutes_worked * 60000))}
              </ThemedText>
            </View>
          ) : null}
        </ThemedView>

        <ThemedText type="smallBold" style={styles.section}>
          Checadas del día
        </ThemedText>
        {detail.events.map((ev) => (
          <EventRow key={ev.id} event={ev} photoUrl={photoUrls[ev.id]} />
        ))}

        {Object.keys(photoUrls).length === 0 && detail.events.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            Sin checadas registradas.
          </ThemedText>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function EventRow({
  event,
  photoUrl,
}: {
  event: AttendanceEvent;
  photoUrl?: string;
}) {
  const meta = CHECK_META[event.check_type];
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.row}>
        <ThemedText type="smallBold">{meta?.shortTitle ?? event.check_type}</ThemedText>
        <ThemedText type="smallBold">{formatTime(event.happened_at)}</ThemedText>
      </View>
      <View style={styles.row}>
        <ThemedText type="small" themeColor="textSecondary">
          {event.status === 'on_time' ? 'Registrado' : 'Con observación'}
        </ThemedText>
        {event.status !== 'on_time' && <StatusBadge status={event.status} />}
      </View>
      {photoUrl ? (
        <View style={styles.photoWrap}>
          <Image source={{ uri: photoUrl }} style={styles.photo} resizeMode="cover" />
        </View>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    padding: 16,
    gap: 12,
    paddingBottom: 48,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  date: {
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  rightText: {
    flex: 1,
    textAlign: 'right',
  },
  section: {
    marginTop: 8,
  },
  photoWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    alignSelf: 'center',
    marginTop: 4,
  },
  photo: {
    width: 200,
    height: 200,
    borderRadius: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  centerText: {
    textAlign: 'center',
  },
  wide: {
    alignSelf: 'stretch',
  },
  empty: {
    textAlign: 'center',
    marginTop: 8,
  },
});