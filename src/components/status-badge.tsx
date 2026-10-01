import { StyleSheet, Text, View } from 'react-native';

import { getStatusLabel } from '@/lib/checks';
import { AttendanceStatus } from '@/types';

type Props = {
  status: AttendanceStatus;
  label?: string;
};

const COLORS: Record<AttendanceStatus, { background: string; text: string }> = {
  on_time: { background: 'rgba(46, 125, 91, 0.12)', text: '#256B4C' },
  late: { background: 'rgba(185, 58, 58, 0.12)', text: '#A02E2E' },
  out_of_window: { background: 'rgba(154, 103, 0, 0.12)', text: '#8A5D00' },
  excused: { background: 'rgba(47, 95, 150, 0.12)', text: '#2F5F96' },
};

export function StatusBadge({ status, label }: Props) {
  const palette = COLORS[status];

  return (
    <View style={[styles.badge, { backgroundColor: palette.background }]}>
      <Text style={[styles.text, { color: palette.text }]}>
        {label ?? getStatusLabel(status)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
  },
});