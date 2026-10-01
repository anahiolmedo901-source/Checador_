import { AttendanceStatus, CheckKind } from '@/types';

const CHECK_KINDS: CheckKind[] = ['check_in', 'break_out', 'break_in', 'check_out'];

export function parseCheckKind(raw?: string | null): CheckKind | null {
  if (raw && (CHECK_KINDS as string[]).includes(raw)) return raw as CheckKind;
  return null;
}

type CheckMeta = {
  kind: CheckKind;
  title: string;
  shortTitle: string;
  verb: string;
  hint: string;
  success: string;
};

export const CHECK_META: Record<CheckKind, CheckMeta> = {
  check_in: {
    kind: 'check_in',
    title: 'Registrar entrada',
    shortTitle: 'Entrada',
    verb: 'Registrar entrada',
    hint: 'Confirma tu identidad y presencia para iniciar tu jornada.',
    success: 'Entrada registrada',
  },
  break_out: {
    kind: 'break_out',
    title: 'Salida a comida',
    shortTitle: 'Salida a comida',
    verb: 'Registrar salida a comida',
    hint: 'Confirma tu identidad y presencia al salir a tu pausa de comida.',
    success: 'Salida a comida registrada',
  },
  break_in: {
    kind: 'break_in',
    title: 'Regreso de comida',
    shortTitle: 'Regreso de comida',
    verb: 'Registrar regreso de comida',
    hint: 'Confirma tu identidad y presencia al volver de tu pausa.',
    success: 'Regreso de comida registrado',
  },
  check_out: {
    kind: 'check_out',
    title: 'Registrar salida',
    shortTitle: 'Salida',
    verb: 'Registrar salida',
    hint: 'Confirma tu identidad y presencia al terminar tu jornada.',
    success: 'Salida registrada',
  },
};

export function getCheckMeta(kind: CheckKind): CheckMeta {
  return CHECK_META[kind];
}

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  on_time: 'A tiempo',
  late: 'Retardo',
  out_of_window: 'Fuera de horario',
  excused: 'Justificado',
};

export function getStatusLabel(status: AttendanceStatus): string {
  return STATUS_LABELS[status] ?? status;
}