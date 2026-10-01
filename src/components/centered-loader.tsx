import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

type Props = {
  message?: string;
};

export function CenteredLoader({ message = 'Cargando…' }: Props) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#2F5F96" />
      <ThemedText type="small" themeColor="textSecondary" style={styles.message}>
        {message}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  message: {
    textAlign: 'center',
  },
});