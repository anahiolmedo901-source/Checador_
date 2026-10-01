import type { AuthUser } from './api';

/** Espejo del catálogo `role_permissions` (el backend es la autoridad). */
const CATALOG: Record<AuthUser['role'], string[]> = {
  admin: ['*'],
  hr: [
    'employees.read',
    'employees.write',
    'attendance.read',
    'attendance.manage',
    'reports.export',
    'offtime.approve',
    'incidents.manage',
    'announcements.read',
    'announcements.write',
    'media.read',
    'media.write',
    'displays.read',
    'branches.read',
    'branches.write',
    'departments.read',
    'positions.read',
    'positions.write',
    'schedules.read',
    'schedules.assign',
    'files.read',
    'audit.read',
  ],
  employee: ['attendance.self', 'offtime.request', 'profile.self', 'files.attendance.self'],
};

export function hasPermission(role: AuthUser['role'], action: string): boolean {
  const granted = CATALOG[role] ?? [];
  return granted.includes('*') || granted.includes(action);
}

export type ModuleKey =
  | 'dashboard'
  | 'employees'
  | 'schedules'
  | 'attendance'
  | 'incidents'
  | 'branches'
  | 'departments'
  | 'positions'
  | 'displays'
  | 'monitor'
  | 'devices'
  | 'announcements'
  | 'media'
  | 'playlists'
  | 'reports'
  | 'audit';

const MODULES: { key: ModuleKey; label: string; permission: string }[] = [
  { key: 'dashboard', label: 'Dashboard', permission: 'attendance.read' },
  { key: 'employees', label: 'Empleados', permission: 'employees.read' },
  { key: 'schedules', label: 'Horarios', permission: 'schedules.read' },
  { key: 'attendance', label: 'Asistencia', permission: 'attendance.read' },
  { key: 'incidents', label: 'Incidencias', permission: 'offtime.approve' },
  { key: 'branches', label: 'Sucursales', permission: 'branches.read' },
  { key: 'departments', label: 'Departamentos', permission: 'departments.read' },
  { key: 'positions', label: 'Puestos', permission: 'positions.read' },
  { key: 'displays', label: 'Pantallas', permission: 'displays.read' },
  { key: 'monitor', label: 'Monitoreo', permission: 'displays.read' },
  { key: 'devices', label: 'Dispositivos', permission: 'attendance.read' },
  { key: 'announcements', label: 'Avisos', permission: 'announcements.read' },
  { key: 'media', label: 'Multimedia', permission: 'media.read' },
  { key: 'playlists', label: 'Playlists', permission: 'displays.read' },
  { key: 'reports', label: 'Reportes', permission: 'reports.export' },
  { key: 'audit', label: 'Auditoría', permission: 'audit.read' },
];

export function accessibleModules(role: AuthUser['role']): { key: ModuleKey; label: string }[] {
  return MODULES.filter((m) => hasPermission(role, m.permission)).map(({ key, label }) => ({ key, label }));
}