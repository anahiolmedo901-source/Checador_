import type { MantineColor } from '@mantine/core';
import dayjs from 'dayjs';

export function fmtDate(value?: string | null): string {
  if (!value) return '—';
  return dayjs(value).format('DD/MM/YYYY');
}

export function fmtDateTime(value?: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}

export function fmtTime(value?: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}

export function fmtMinutes(minutes?: number | null): string {
  if (minutes === null || minutes === undefined) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

export function statusColor(status?: string | null): MantineColor {
  switch (status) {
    case 'on_time':
      return 'green';
    case 'late':
      return 'yellow';
    case 'out_of_window':
      return 'orange';
    case 'excused':
      return 'blue';
    default:
      return 'gray';
  }
}

export function statusLabel(status?: string | null): string {
  switch (status) {
    case 'on_time':
      return 'A tiempo';
    case 'late':
      return 'Retardo';
    case 'out_of_window':
      return 'Fuera de horario';
    case 'excused':
      return 'Justificada';
    case 'missing':
      return 'Falta';
    case 'present':
      return 'Presente';
    default:
      return status ?? '—';
  }
}

export function offTypeLabel(type?: string | null): string {
  switch (type) {
    case 'vacation':
      return 'Vacaciones';
    case 'permission':
      return 'Permiso';
    case 'incapacity':
      return 'Incapacidad';
    default:
      return type ?? '—';
  }
}

export function offStatusColor(status?: string | null): MantineColor {
  switch (status) {
    case 'pending':
      return 'yellow';
    case 'approved':
      return 'green';
    case 'rejected':
      return 'red';
    default:
      return 'gray';
  }
}

export function offStatusLabel(status?: string | null): string {
  switch (status) {
    case 'pending':
      return 'Pendiente';
    case 'approved':
      return 'Aprobada';
    case 'rejected':
      return 'Rechazada';
    default:
      return status ?? '—';
  }
}

export function incidentTypeLabel(type?: string | null): string {
  switch (type) {
    case 'late':
      return 'Retardo';
    case 'absent':
      return 'Ausencia';
    case 'out_of_window':
      return 'Fuera de horario';
    case 'location':
      return 'Ubicación';
    case 'device':
      return 'Dispositivo';
    case 'duplicate':
      return 'Duplicado';
    case 'other':
      return 'Otra';
    default:
      return type ?? '—';
  }
}

export function incidentSeverityLabel(s?: string | null): string {
  switch (s) {
    case 'info':
      return 'Info';
    case 'warning':
      return 'Advertencia';
    case 'critical':
      return 'Crítica';
    default:
      return s ?? '—';
  }
}

export function incidentSeverityColor(s?: string | null): MantineColor {
  switch (s) {
    case 'info':
      return 'gray';
    case 'warning':
      return 'yellow';
    case 'critical':
      return 'red';
    default:
      return 'gray';
  }
}

export function priorityLabel(p?: string | null): string {
  switch (p) {
    case 'low':
      return 'Baja';
    case 'high':
      return 'Alta';
    case 'critical':
      return 'Crítica';
    default:
      return 'Normal';
  }
}

export function priorityColor(p?: string | null): MantineColor {
  switch (p) {
    case 'low':
      return 'gray';
    case 'high':
      return 'orange';
    case 'critical':
      return 'red';
    default:
      return 'blue';
  }
}

export function checkTypeLabel(type?: string | null): string {
  switch (type) {
    case 'check_in':
      return 'Entrada';
    case 'check_out':
      return 'Salida';
    case 'break_start':
      return 'Inicio de descanso';
    case 'break_end':
      return 'Fin de descanso';
    case 'late':
      return 'Retardo';
    case 'missing':
      return 'Falta';
    case 'excused':
      return 'Incidencia';
    default:
      return type ?? '—';
  }
}

export function checkTypeColor(type?: string | null): MantineColor {
  switch (type) {
    case 'late':
      return 'yellow';
    case 'missing':
      return 'red';
    case 'excused':
      return 'violet';
    default:
      return 'green';
  }
}
