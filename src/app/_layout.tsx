import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CenteredLoader } from '@/components/centered-loader';
import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';

function RootNavigator() {
  const { status, profile } = useAuth();
  const isAdminStaff = profile?.employee?.role === 'admin' || profile?.employee?.role === 'hr';

  if (status === 'loading') {
    return (
      <>
        <CenteredLoader message="Verificando sesión…" />
      </>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
      }}>
      <Stack.Protected guard={status === 'signedIn'}>
        <Stack.Screen name="(tabs)" />
        <Stack.Protected guard={isAdminStaff}>
          <Stack.Screen name="admin" />
        </Stack.Protected>
        <Stack.Screen name="check" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="confirm" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen name="attendance/[id]" options={{ presentation: 'card' }} />
      </Stack.Protected>
      <Stack.Protected guard={status !== 'signedIn'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

const LightNav = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: Colors.light.background, card: Colors.light.backgroundElement, primary: '#2F5F96', text: Colors.light.text },
};
const DarkNav = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: Colors.dark.background, card: Colors.dark.backgroundElement, primary: '#7FA6D6', text: Colors.dark.text },
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkNav : LightNav}>
          <RootNavigator />
        </ThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
