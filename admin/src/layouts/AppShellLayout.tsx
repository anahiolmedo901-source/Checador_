import { AppShell, Avatar, Burger, Group, NavLink, ScrollArea, Text, ThemeIcon, Title, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconBell,
  IconClockHour4,
  IconDashboard,
  IconDeviceTablet,
  IconFileReport,
  IconHistory,
  IconLogout,
  IconMovie,
  IconUsers,
  IconBuildingStore,
  IconCalendarStats,
  IconAlertTriangle,
  IconScreenShare,
  IconBroadcast,
  IconListDetails,
  IconUsersGroup,
  IconBriefcase,
} from '@tabler/icons-react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { IconType } from '../theme';
import { useAuth } from '../lib/auth';
import { accessibleModules, ModuleKey } from '../lib/permissions';

const ICONS: Record<ModuleKey, IconType> = {
  dashboard: IconDashboard,
  employees: IconUsers,
  schedules: IconClockHour4,
  attendance: IconCalendarStats,
  incidents: IconAlertTriangle,
  branches: IconBuildingStore,
  departments: IconUsersGroup,
  positions: IconBriefcase,
  displays: IconScreenShare,
  monitor: IconBroadcast,
  devices: IconDeviceTablet,
  announcements: IconBell,
  media: IconMovie,
  playlists: IconListDetails,
  reports: IconFileReport,
  audit: IconHistory,
};

const ROUTES: Record<ModuleKey, string> = {
  dashboard: '/dashboard',
  employees: '/employees',
  schedules: '/schedules',
  attendance: '/attendance',
  incidents: '/incidents',
  branches: '/branches',
  departments: '/departments',
  positions: '/positions',
  displays: '/displays',
  monitor: '/displays/monitor',
  devices: '/devices',
  announcements: '/announcements',
  media: '/media',
  playlists: '/playlists',
  reports: '/reports',
  audit: '/audit',
};

export function AppShellLayout() {
  const { user, logout, can } = useAuth();
  const [opened, { toggle, close }] = useDisclosure();
  const location = useLocation();

  if (!user) return null;
  const modules = accessibleModules(user.role);

  const navItems = modules.map(({ key, label }) => {
    const to = ROUTES[key];
    const Icon = ICONS[key];
    const active =
      location.pathname === to || (key !== 'displays' && location.pathname.startsWith(`${to}/`));
    return (
      <NavLink
        key={key}
        component={Link}
        to={to}
        label={label}
        leftSection={<Icon size={18} />}
        active={active}
        onClick={close}
      />
    );
  });

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header className="app-header">
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Abrir menú" />
            <ThemeIcon size={32} radius="md" variant="filled" color="brand">
              <IconClockHour4 size={20} />
            </ThemeIcon>
            <Title order={4} c="brand.8" style={{ letterSpacing: '-0.01em' }}>
              Checador
            </Title>
            <Text c="dimmed" size="sm" fw={500} visibleFrom="sm">
              Panel administrativo
            </Text>
          </Group>
          <Group gap="xs">
            <Avatar radius="xl" size="sm" color="brand" variant="light">
              {user.employee.full_name?.slice(0, 1) ?? 'U'}
            </Avatar>
            <Text size="sm" fw={600} visibleFrom="sm">
              {user.employee.full_name}
            </Text>
            {can('audit.read') ? (
              <Text size="xs" tt="uppercase" fw={600} c="dimmed" visibleFrom="sm">
                {user.role}
              </Text>
            ) : null}
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs" className="app-navbar">
        <AppShell.Section grow component={ScrollArea}>
          {navItems}
        </AppShell.Section>
        <AppShell.Section pt="xs" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
          <UnstyledButton
            onClick={logout}
            className="logout-btn"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--mantine-spacing-xs)',
              padding: 'var(--mantine-spacing-xs) var(--mantine-spacing-sm)',
              borderRadius: 'var(--mantine-radius-md)',
            }}
          >
            <IconLogout size={18} />
            <Text size="sm" fw={600} inherit>Cerrar sesión</Text>
          </UnstyledButton>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main className="app-main">
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}