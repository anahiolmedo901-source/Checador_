import {
  Badge,
  Box,
  Button,
  Drawer,
  Group,
  Image,
  Loader,
  Modal,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { DateInput, DateTimePicker } from '@mantine/dates';
import { useForm, zodResolver } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery } from '@tanstack/react-query';
import { IconEdit, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { z } from 'zod';
import { api, qs } from '../lib/api';
import { AdminAttendanceRow, AttendanceDetail, AttendanceEvent, Employee, PageResult } from '../lib/types';
import { PageHeader } from '../components/PageHeader';
import { Pager } from '../components/Pager';
import { useAuth } from '../lib/auth';
import { useBranches, useDepartments } from '../lib/queries';
import { fmtDateTime, fmtMinutes, fmtTime } from '../lib/format';
import { businessTodayDate, fromBusinessWallDate, toBusinessWallDate, toDateKey } from '../lib/dates';
import { statusColor, statusLabel } from '../lib/format';

const editSchema = z
  .object({
    happened_at: z.string().optional(),
    status: z.string().optional(),
    motivo: z.string().trim().min(3, 'El motivo debe tener al menos 3 caracteres.').max(500),
  })
  .refine((v) => v.happened_at || v.status, { message: 'Indica hora o estatus nuevo.' });

function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && toDateKey(parsed) === value;
}

function eventLabel(type: AttendanceEvent['check_type']): string {
  const labels: Record<string, string> = { check_in: 'Entrada', break_out: 'Salida a comida', break_in: 'Regreso de comida', check_out: 'Salida' };
  return type ? labels[type] ?? 'Checada' : 'Checada';
}

export default function AttendancePage() {
  const { can } = useAuth();
  const canManage = can('attendance.manage');
  const now = businessTodayDate();

  const [filters, setFilters] = useState({
    page: 1,
    from: toDateKey(now),
    to: toDateKey(now),
    employeeId: '',
    departmentId: '',
    branchId: '',
    status: 'all',
    search: '',
  });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<AttendanceEvent | null>(null);
  const rangeInvalid = (!!filters.from && !isValidDateKey(filters.from))
    || (!!filters.to && !isValidDateKey(filters.to))
    || (!!filters.from && !!filters.to && filters.from > filters.to);

  const { data: branches } = useBranches();
  const { data: departments } = useDepartments();

  const employees = useQuery({
    queryKey: ['employees', 'search', 'all-active'],
    queryFn: () => api.get<{ data: Employee[] }>(`/employees?limit=100&active=true`),
  });

  const list = useQuery({
    queryKey: ['admin-attendance', filters],
    queryFn: () =>
      api.get<PageResult<AdminAttendanceRow>>(
        `/admin/attendance?${qs({
          from: filters.from || undefined,
          to: filters.to || undefined,
          employee_id: filters.employeeId || undefined,
          department_id: filters.departmentId || undefined,
          branch_id: filters.branchId || undefined,
          status: filters.status === 'all' ? undefined : filters.status,
          search: filters.search || undefined,
          page: filters.page,
          limit: 50,
        })}`
      ),
    enabled: !rangeInvalid,
  });

  const detail = useQuery({
    queryKey: ['admin-attendance-detail', detailId],
    queryFn: () => api.get<AttendanceDetail>(`/admin/attendance/sessions/${detailId}`),
    enabled: !!detailId,
  });

  const editForm = useForm({
    initialValues: { happened_at: '', status: '', motivo: '' },
    validate: zodResolver(editSchema),
  });

  function openEdit(event: AttendanceEvent) {
    setEditingEvent(event);
    editForm.setValues({
      happened_at: event.happened_at ?? '',
      status: event.status ?? '',
      motivo: '',
    });
  }

  const editMutation = useMutation({
    mutationFn: (values: (typeof editForm)['values']) =>
      api.patch(`/admin/attendance/events/${editingEvent!.id}`, {
        happened_at: values.happened_at || null,
        status: values.status || undefined,
        motivo: values.motivo,
      }),
    onSuccess: () => {
      notifications.show({ message: 'Checada corregida (auditada)', color: 'green' });
      setEditingEvent(null);
      void detail.refetch();
    },
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  const rows = list.data?.data ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);
  const session = detail.data?.session;
  const events = detail.data?.events ?? [];
  const evidence = detail.data?.evidence ?? [];

  return (
    <>
      <PageHeader
        title="Asistencia"
        subtitle="Checadas del día y edición auditada"
      />

      <Paper withBorder p="md" mb="md">
        <Group gap="md" wrap="wrap">
          <DateInput
            label="Desde"
            value={filters.from ? new Date(filters.from + 'T12:00:00') : null}
            onChange={(d) => setFilters((f) => ({ ...f, page: 1, from: d ? toDateKey(d) : '' }))}
            valueFormat="DD/MM/YYYY"
            w={140}
            error={filters.from && !isValidDateKey(filters.from) ? 'Fecha no válida' : undefined}
          />
          <DateInput
            label="Hasta"
            value={filters.to ? new Date(filters.to + 'T12:00:00') : null}
            onChange={(d) => setFilters((f) => ({ ...f, page: 1, to: d ? toDateKey(d) : '' }))}
            valueFormat="DD/MM/YYYY"
            w={140}
            error={filters.to && !isValidDateKey(filters.to) ? 'Fecha no válida' : undefined}
          />
          <Select
            label="Empleado"
            clearable
            searchable
            data={(employees.data?.data ?? []).map((e) => ({ value: e.id, label: `${e.full_name} (${e.code})` }))}
            value={filters.employeeId || null}
            onChange={(v) => setFilters((f) => ({ ...f, page: 1, employeeId: v ?? '' }))}
            w={220}
          />
          <Select
            label="Departamento"
            clearable
            data={(departments ?? []).map((d) => ({ value: d.id, label: d.name }))}
            value={filters.departmentId || null}
            onChange={(v) => setFilters((f) => ({ ...f, page: 1, departmentId: v ?? '' }))}
            w={170}
          />
          <Select
            label="Sucursal"
            clearable
            data={(branches ?? []).map((b) => ({ value: b.id, label: b.name }))}
            value={filters.branchId || null}
            onChange={(v) => setFilters((f) => ({ ...f, page: 1, branchId: v ?? '' }))}
            w={170}
          />
          <Select
            label="Estatus"
            data={[
              { value: 'all', label: 'Todos' },
              { value: 'present', label: 'Presentes' },
              { value: 'on_time', label: 'A tiempo' },
              { value: 'late', label: 'Con retardo' },
              { value: 'out_of_window', label: 'Fuera de horario' },
              { value: 'excused', label: 'Justificadas' },
              { value: 'missing', label: 'Faltas' },
            ]}
            value={filters.status}
            onChange={(v) => setFilters((f) => ({ ...f, page: 1, status: v ?? 'all' }))}
            w={150}
          />
          <TextInput
            label="Buscar"
            placeholder="Nombre o código…"
            leftSection={<IconSearch size={14} />}
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, page: 1, search: e.currentTarget.value }))}
            w={190}
          />
        </Group>
      </Paper>

      {filters.from && filters.to && filters.from > filters.to ? (
        <Text c="red" size="sm" mb="sm">“Desde” debe ser igual o anterior a “Hasta”.</Text>
      ) : null}

      <Paper withBorder>
        {list.isLoading ? (
          <Box p="xl" ta="center">
            <Loader />
          </Box>
        ) : (
          <Table.ScrollContainer minWidth={720}>
          <Table striped highlightOnHover horizontalSpacing="md" verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Fecha</Table.Th>
                <Table.Th>Empleado</Table.Th>
                <Table.Th>Departamento</Table.Th>
                <Table.Th>Sucursal</Table.Th>
                <Table.Th>Entrada</Table.Th>
                <Table.Th>Salida</Table.Th>
                <Table.Th>Trabajado</Table.Th>
                <Table.Th>Estatus</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r, i) => (
                <Table.Tr
                  key={`${r.employee_id}-${r.check_date}-${i}`}
                  style={{ cursor: r.session_id ? 'pointer' : 'default' }}
                  onClick={() => r.session_id && setDetailId(r.session_id)}
                >
                  <Table.Td>{new Date(r.check_date + 'T12:00:00').toLocaleDateString('es-MX')}</Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={600}>{r.full_name}</Text>
                    <Text size="xs" c="dimmed">{r.code}</Text>
                  </Table.Td>
                  <Table.Td>{r.department_name ?? '—'}</Table.Td>
                  <Table.Td>{r.branch_name ?? '—'}</Table.Td>
                  <Table.Td>{fmtTime(r.check_in)}</Table.Td>
                  <Table.Td>{fmtTime(r.check_out)}</Table.Td>
                  <Table.Td>{fmtMinutes(r.minutes_worked)}</Table.Td>
                  <Table.Td>
                    <Badge color={statusColor(r.day_status)} variant="light">
                      {statusLabel(r.day_status)}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      {total > 50 ? (
        <Pager page={filters.page} totalPages={totalPages} total={total} onChange={(p) => setFilters((f) => ({ ...f, page: p }))} />
      ) : null}

      {/* Detalle de sesión */}
      <Drawer opened={!!detailId} onClose={() => setDetailId(null)} title={`Sesión — ${session?.employee_id ?? ''}`} size="lg" position="right">
        {detail.isLoading ? (
          <Loader />
        ) : session ? (
          <Stack gap="md">
            <Group gap="lg" wrap="wrap">
              <div>
                <Text size="xs" c="dimmed">Fecha</Text>
                <Text fw={600}>{new Date(session.check_date + 'T12:00:00').toLocaleDateString('es-MX')}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Sucursal</Text>
                <Text fw={600}>{session.branch_name ?? '—'}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Entrada</Text>
                <Text fw={600}>{fmtTime(session.check_in)}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Salida</Text>
                <Text fw={600}>{fmtTime(session.check_out)}</Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Trabajado</Text>
                <Text fw={600}>{fmtMinutes(session.minutes_worked)}</Text>
              </div>
            </Group>

            <Title order={6}>Eventos</Title>
            <Table.ScrollContainer minWidth={720}>
            <Table withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Tipo</Table.Th>
                  <Table.Th>Hora</Table.Th>
                  <Table.Th>Estatus</Table.Th>
                  <Table.Th>Origen</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Acción</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {events.map((ev) => (
                  <Table.Tr key={ev.id}>
                    <Table.Td>{eventLabel(ev.check_type)}</Table.Td>
                    <Table.Td>{fmtDateTime(ev.happened_at)}</Table.Td>
                    <Table.Td>
                      <Badge color={statusColor(ev.status)} variant="light">
                        {statusLabel(ev.status ?? '')}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{ev.source ?? '—'}</Table.Td>
                    <Table.Td ta="right">
                      {canManage ? (
                        <Button size="xs" variant="light" leftSection={<IconEdit size={14} />} onClick={() => openEdit(ev)}>
                          Corregir
                        </Button>
                      ) : null}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            </Table.ScrollContainer>

            {evidence.length ? (
              <>
                <Title order={6}>Evidencias</Title>
                <Group gap="md">
                  {evidence.map((ev) =>
                    ev.signed_url ? (
                      <Box key={ev.id}>
                        <Image radius="md" w={220} src={ev.signed_url} alt="Evidencia" />
                        <Text size="xs" c="dimmed">{fmtDateTime(ev.uploaded_at)}</Text>
                      </Box>
                    ) : null
                  )}
                </Group>
              </>
            ) : null}
          </Stack>
        ) : null}
      </Drawer>

      {/* Edición de evento */}
      <Modal opened={!!editingEvent} onClose={() => setEditingEvent(null)} title="Corregir checada" centered>
        <Stack>
          <form onSubmit={editForm.onSubmit((values) => editMutation.mutate(values))}>
            <Stack gap="sm">
              <DateTimePicker
                label="Nueva fecha y hora (hora de la empresa)"
                placeholder="Dejar vacío para no cambiar"
                value={editForm.values.happened_at ? toBusinessWallDate(new Date(editForm.values.happened_at)) : null}
                onChange={(d) => {
                  const iso = d ? fromBusinessWallDate(new Date(d)).toISOString() : '';
                  editForm.setFieldValue('happened_at', iso);
                }}
                clearable
              />
              <Select
                label="Nuevo estatus"
                placeholder="Dejar vacío para no cambiar"
                clearable
                data={[
                  { value: 'on_time', label: 'A tiempo' },
                  { value: 'late', label: 'Con retardo' },
                  { value: 'out_of_window', label: 'Fuera de horario' },
                ]}
                value={editForm.values.status || null}
                onChange={(v) => editForm.setFieldValue('status', v ?? '')}
              />
              <TextInput label="Motivo (obligatorio)" placeholder="Describe el motivo del cambio…" {...editForm.getInputProps('motivo')} />
              <Group justify="flex-end" mt="sm">
                <Button variant="default" onClick={() => setEditingEvent(null)}>Cancelar</Button>
                <Button type="submit" color="red" loading={editMutation.isPending}>Corregir (queda auditado)</Button>
              </Group>
            </Stack>
          </form>
          <Text size="xs" c="dimmed">
            Esta corrección se registra como evento administrativo con auditoría completa (antes/después, motivo y autor).
          </Text>
        </Stack>
      </Modal>
    </>
  );
}
