import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/context/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

interface ModuleItem {
  key: string;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  color: string;
  permission: string;
}

const MODULES: ModuleItem[] = [
  {
    key: 'employees',
    label: 'Empleados',
    description: 'Consulta empleados activos y su departamento.',
    icon: 'people-outline',
    route: '/admin/employees',
    color: '#2F5F96',
    permission: 'employees.read',
  },
  {
    key: 'schedules',
    label: 'Horarios',
    description: 'Consulta turnos, tolerancia y tiempo de comida.',
    icon: 'time-outline',
    route: '/admin/schedules',
    color: '#2E7D5B',
    permission: 'schedules.read',
  },
];

export default function AdminScreen() {
  const { profile } = useAuth();
  const theme = useTheme();
  const role = profile?.employee?.role;
  const allowed = role === 'admin' || role === 'hr';
  const [permissionState, setPermissionState] = useState<
    { role: string; actions: string[] } | { role: string; error: true } | null
  >(null);
  const [permissionRequest, setPermissionRequest] = useState(0);

  useEffect(() => {
    let active = true;

    if (role === 'admin' || role === 'hr') {
      supabase
        .from('role_permissions')
        .select('action')
        .eq('role', role)
        .then(({ data, error }) => {
          if (!active) return;
          if (error) {
            setPermissionState({ role, error: true });
            return;
          }
          setPermissionState({ role, actions: (data ?? []).map((permission) => permission.action) });
        });
    }

    return () => {
      active = false;
    };
  }, [role, permissionRequest]);

  const permissionResult = permissionState?.role === role ? permissionState : null;
  const permissions = permissionResult && 'actions' in permissionResult ? permissionResult.actions : null;
  const permissionsError = permissionResult != null && 'error' in permissionResult;
  const visibleModules = permissions?.includes('*')
    ? MODULES
    : MODULES.filter((module) => permissions?.includes(module.permission));

  if (!allowed) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <View style={styles.noAccess}>
          <Ionicons name="shield-outline" size={40} color="#B93A3A" />
          <ThemedText type="smallBold">Sin acceso</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.noAccessText}>
            Esta sección está reservada para administradores y recursos humanos.
          </ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.eyebrow}>
          PANEL MÓVIL
        </ThemedText>
        <ThemedText type="title" style={styles.title}>
          Administración
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Consulta la información habilitada para tu cuenta.
        </ThemedText>
      </View>

      {permissionsError ? (
        <View style={styles.permissionMessage}>
          <ThemedText type="smallBold">No se pudieron cargar tus permisos.</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Verifica tu conexión e inténtalo de nuevo.
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setPermissionState(null);
              setPermissionRequest((value) => value + 1);
            }}>
            <ThemedText type="smallBold" style={styles.retry}>Reintentar</ThemedText>
          </Pressable>
        </View>
      ) : permissions === null ? (
        <View style={styles.permissionMessage}>
          <ThemedText type="small" themeColor="textSecondary">Cargando permisos…</ThemedText>
        </View>
      ) : (
        <FlatList
          data={visibleModules}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="lock-closed-outline" size={28} color={theme.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary" style={styles.emptyText}>
                Tu cuenta no tiene acceso a Empleados ni Horarios.
              </ThemedText>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Abrir ${item.label}`}
              accessibilityHint="Abre la lista en modo de solo lectura"
              onPress={() => router.push(item.route as never)}
              style={({ pressed }) => [
                styles.module,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.backgroundSelected,
                },
                pressed && styles.pressed,
              ]}>
              <View style={[styles.moduleIcon, { backgroundColor: `${item.color}18` }]}>
                <Ionicons name={item.icon} size={26} color={item.color} />
              </View>
              <View style={styles.moduleCopy}>
                <ThemedText type="smallBold" style={styles.moduleTitle}>
                  {item.label}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.moduleDescription}>
                  {item.description}
                </ThemedText>
                <View style={[styles.readOnlyTag, { backgroundColor: theme.backgroundSelected }]}>
                  <ThemedText type="smallBold" style={{ color: item.color }}>
                    Solo lectura
                  </ThemedText>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.two,
  },
  eyebrow: {
    letterSpacing: 1.2,
    fontSize: 11,
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
  },
  noAccess: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  noAccessText: {
    textAlign: 'center',
  },
  permissionMessage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  retry: {
    color: '#2F5F96',
  },
  list: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.two,
    paddingBottom: Spacing.six,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  emptyText: {
    textAlign: 'center',
  },
  moduleCopy: {
    flex: 1,
    alignItems: 'flex-start',
    gap: Spacing.one,
  },
  module: {
    width: '100%',
    minHeight: 112,
    borderRadius: 18,
    borderWidth: 1,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  moduleIcon: {
    width: 54,
    height: 54,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleTitle: {
    fontSize: 16,
  },
  moduleDescription: {
    lineHeight: 18,
  },
  readOnlyTag: {
    marginTop: Spacing.one,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  pressed: {
    opacity: 0.7,
  },
});
