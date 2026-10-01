import { StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';

type Props = {
  title: string;
  backLabel?: string;
  onBack?: () => void;
};

export function ScreenHeader({ title, backLabel = 'Volver', onBack }: Props) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <View style={styles.sideSlot}>
          <PrimaryButton title={backLabel} onPress={onBack} variant="secondary" style={styles.backBtn} />
        </View>
      ) : (
        <View style={styles.sideSlot} />
      )}
      <ThemedText type="smallBold" numberOfLines={1} style={styles.headerStep}>
        {title}
      </ThemedText>
      <View style={styles.sideSlot} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 60,
  },
  sideSlot: {
    width: 100,
    flexShrink: 0,
  },
  backBtn: {
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  headerStep: {
    flex: 1,
    textAlign: 'center',
    flexShrink: 1,
    fontWeight: '700',
  },
});
