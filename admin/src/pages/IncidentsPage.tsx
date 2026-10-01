import {
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm, zodResolver } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { z } from 'zod';
import { api, qs } from '../lib/api';
import { Incident, IncidentType, OfftimeRequest } from '../lib/types';
import { PageHeader } from '../components/PageHeader';
import { Pager } from '../components/Pager';
import { useActiveEmployees } from '../lib/queries';
import { fmtDateTime, fmtDate } from '../lib/format';
import { dateEntryBounds, isDateEntryAllowed, toDateKey } from '../lib/dates';
import {
  incidentSeverityColor,
  incidentSeverityLabel,
  incidentTypeLabel,
  offStatusColor,
  offStatusLabel,
  offTypeLabel,
} from '../lib/format';

const offSchema = z.object({
  employee_id: z.string().min(1, 'Elige un empleado.'),
  off_type: z.enum(['permission', 'vacation', 'incapacity']),
  starts_on: z.string(),
  ends_on: z.string(),
  reason: z.string().trim().min(3).max(500),
}).superRefine((values, ctx) => {
  if (!isDateEntryAllowed(values.starts_on)) ctx.addIssue({ code: 'custom', path: ['starts_on'], message: 'Elige una fecha desde hoy y dentro de los próximos 3 meses.' });
  if (!isDateEntryAllowed(values.ends_on)) ctx.addIssue({ code: 'custom', path: ['ends_on'], message: 'Elige una fecha desde hoy y dentro de los próximos 3 meses.' });
  if (values.starts_on && values.ends_on && values.ends_on < values.starts_on) ctx.addIssue({ code: 'custom', path: ['ends_on'], message: 'La fecha de fin debe ser igual o posterior al inicio.' });
});

const incidentSchema = z.object({
  employee_id: z.string().min(1, 'Elige un empleado.'),
  incident_type: z.enum(['late', 'absent', 'out_of_window', 'location', 'device', 'duplicate', 'other']),
  severity: z.enum(['info', 'warning', 'critical']),
});

export default function IncidentsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'offtime' | 'incidents'>('offtime');
  const [offPage, setOffPage] = useState(1);
  const [incPage, setIncPage] = useState(1);
  const [offStatus, setOffStatus] = useState('');
  const [incStatus, setIncStatus] = useState('');
  const [search, setSearch] = useState('');
  const [createOffOpened, setCreateOffOpened] = useState(false);
  const [createIncOpened, setCreateIncOpened] = useState(false);
  const dateBounds = dateEntryBounds();

  const { data: employees } = useActiveEmployees();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-offtime'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-incidents'] });
  };

  const offtime = useQuery({
    queryKey: ['admin-offtime', offPage, offStatus, search],
    queryFn: () =>
      api.get<{ data: OfftimeRequest[]; total: number }>(
        `/admin/offtime?${qs({
          page: offPage,
          limit: 20,
          status: offStatus || undefined,
          search: search || undefined,
        })}`
      ),
    enabled: tab === 'offtime',
  });

  const incidents = useQuery({
    queryKey: ['admin-incidents', incPage, incStatus],
    queryFn: () =>
      api.get<{ data: Incident[]; total: number }>(
        `/admin/incidents?${qs({ page: incPage, limit: 20, status: incStatus || undefined })}`
      ),
    enabled: tab === 'incidents',
  });

  const offForm = useForm({
    initialValues: { employee_id: '', off_type: 'permission' as const, starts_on: '', ends_on: '', reason: '' },
    validate: zodResolver(offSchema),
  });

  const incForm = useForm({
    initialValues: { employee_id: '', incident_type: 'other' as IncidentType, severity: 'info' as const },
    validate: zodResolver(incidentSchema),
  });

  const createOff = useMutation({
    mutationFn: (v: typeof offForm.values) =>
      api.post('/admin/offtime', {
        employee_id: v.employee_id,
        off_type: v.off_type,
        starts_on: v.starts_on,
        ends_on: v.ends_on,
        reason: v.reason,
      }),
    onSuccess: () => {
      notifications.show({ message: 'Solicitud creada', color: 'green' });
      setCreateOffOpened(false);
      offForm.reset();
      invalidate();
    },
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  const reviewOff = useMutation({
    mutationFn: (args: { id: string; approved: boolean }) =>
      api.patch(`/admin/offtime/${args.id}/review`, { approved: args.approved }),
    onSuccess: (_d, args) => {
      notifications.show({ message: args.approved ? 'Solicitud aprobada' : 'Solicitud rechazada', color: 'green' });
      invalidate();
    },
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  const createIncident = useMutation({
    mutationFn: (v: typeof incForm.values) =>
      api.post('/admin/incidents', {
        employee_id: v.employee_id,
        incident_type: v.incident_type,
        severity: v.severity,
        detail: {},
      }),
    onSuccess: () => {
      notifications.show({ message: 'Incidencia registrada', color: 'green' });
      setCreateIncOpened(false);
      incForm.reset();
      invalidate();
    },
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  const resolveIncident = useMutation({
    mutationFn: (id: string) => api.patch(`/admin/incidents/${id}/resolve`, {}),
    onSuccess: () => {
      notifications.show({ message: 'Incidencia resuelta', color: 'green' });
      invalidate();
    },
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  const employeesData = (employees ?? []).map((e) => ({ value: e.id, label: `${e.full_name} (${e.code})` }));

  return (
    <>
      <PageHeader
        title="Incidencias"
        subtitle="Permisos, vacaciones, incapacidades e incidencias"
        actions={
          tab === 'offtime' ? (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setCreateOffOpened(true)}>
              Nueva solicitud
            </Button>
          ) : (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setCreateIncOpened(true)}>
              Nueva incidencia
            </Button>
          )
        }
      />

      <Tabs value={tab} onChange={(v) => setTab((v as 'offtime') ?? 'offtime')} mb="md">
        <Tabs.List>
          <Tabs.Tab value="offtime">Permisos / Vacaciones / Incapacidades</Tabs.Tab>
          <Tabs.Tab value="incidents">Incidencias</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="offtime" pt="md">
          <Group mb="sm">
            <Select
              placeholder="Estatus"
              clearable
              data={[
                { value: 'pending', label: 'Pendientes' },
                { value: 'approved', label: 'Aprobadas' },
                { value: 'rejected', label: 'Rechazadas' },
              ]}
              value={offStatus || null}
              onChange={(v) => {
                setOffStatus(v ?? '');
                setOffPage(1);
              }}
              w={160}
            />
            <TextInput
              placeholder="Buscar por empleado…"
              leftSection={<IconSearch size={14} />}
              value={search}
              onChange={(e) => {
                setSearch(e.currentTarget.value);
                setOffPage(1);
              }}
              w={220}
            />
          </Group>
          <Paper withBorder>
            {offtime.isLoading ? (
              <Box p="xl" ta="center"><Loader /></Box>
            ) : (
              <Table.ScrollContainer minWidth={720}>
              <Table striped highlightOnHover horizontalSpacing="md" verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Empleado</Table.Th>
                    <Table.Th>Tipo</Table.Th>
                    <Table.Th>Periodo</Table.Th>
                    <Table.Th>Razón</Table.Th>
                    <Table.Th>Folio</Table.Th>
                    <Table.Th>Estatus</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Acciones</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(offtime.data?.data ?? []).map((r) => (
                    <Table.Tr key={r.id}>
                      <Table.Td>
                        <Text size="sm" fw={600}>{r.employees?.full_name ?? '—'}</Text>
                        <Text size="xs" c="dimmed">{r.employees?.code}</Text>
                      </Table.Td>
                      <Table.Td>{offTypeLabel(r.off_type)}</Table.Td>
                      <Table.Td>{fmtDate(r.starts_on)} → {fmtDate(r.ends_on)}</Table.Td>
                      <Table.Td><Text size="sm">{r.reason ?? '—'}</Text></Table.Td>
                      <Table.Td>{r.ticket}</Table.Td>
                      <Table.Td>
                        <Badge color={offStatusColor(r.status)} variant="light">{offStatusLabel(r.status)}</Badge>
                        {r.review_note ? (
                          <Text size="xs" c="dimmed" mt={2}>{r.review_note}</Text>
                        ) : null}
                      </Table.Td>
                      <Table.Td ta="right">
                        {r.status === 'pending' ? (
                          <Group gap={4} justify="flex-end">
                            <Button size="xs" color="green" variant="light" loading={reviewOff.isPending} onClick={() => reviewOff.mutate({ id: r.id, approved: true })}>
                              Aprobar
                            </Button>
                            <Button size="xs" color="red" variant="light" loading={reviewOff.isPending} onClick={() => reviewOff.mutate({ id: r.id, approved: false })}>
                              Rechazar
                            </Button>
                          </Group>
                        ) : null}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              </Table.ScrollContainer>
            )}
          </Paper>
          <Pager page={offPage} totalPages={Math.max(1, Math.ceil((offtime.data?.total ?? 0) / 20))} total={offtime.data?.total ?? 0} onChange={setOffPage} />
        </Tabs.Panel>

        <Tabs.Panel value="incidents" pt="md">
          <Group mb="sm">
            <Select
              placeholder="Estatus"
              clearable
              data={[
                { value: 'open', label: 'Abiertas' },
                { value: 'resolved', label: 'Resueltas' },
              ]}
              value={incStatus || null}
              onChange={(v) => {
                setIncStatus(v ?? '');
                setIncPage(1);
              }}
              w={160}
            />
          </Group>
          <Paper withBorder>
            {incidents.isLoading ? (
              <Box p="xl" ta="center"><Loader /></Box>
            ) : (
              <Table.ScrollContainer minWidth={720}>
              <Table striped highlightOnHover horizontalSpacing="md" verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Empleado</Table.Th>
                    <Table.Th>Tipo</Table.Th>
                    <Table.Th>Severidad</Table.Th>
                    <Table.Th>Creada</Table.Th>
                    <Table.Th>Estatus</Table.Th>
                    <Table.Th style={{ textAlign: 'right' }}>Acciones</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(incidents.data?.data ?? []).map((r) => (
                    <Table.Tr key={r.id}>
                      <Table.Td>
                        <Text size="sm" fw={600}>{r.employees?.full_name ?? '—'}</Text>
                        <Text size="xs" c="dimmed">{r.employees?.code}</Text>
                      </Table.Td>
                      <Table.Td>{incidentTypeLabel(r.incident_type)}</Table.Td>
                      <Table.Td>
                        <Badge color={incidentSeverityColor(r.severity)} variant="light">
                          {incidentSeverityLabel(r.severity)}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{fmtDateTime(r.created_at)}</Table.Td>
                      <Table.Td>
                        <Badge color={r.status === 'open' ? 'orange' : 'gray'} variant="light">
                          {r.status === 'open' ? 'Abierta' : 'Resuelta'}
                        </Badge>
                      </Table.Td>
                      <Table.Td ta="right">
                        {r.status === 'open' ? (
                          <Button size="xs" variant="light" color="teal" loading={resolveIncident.isPending} onClick={() => resolveIncident.mutate(r.id)}>
                            Resolver
                          </Button>
                        ) : null}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
              </Table.ScrollContainer>
            )}
          </Paper>
          <Pager page={incPage} totalPages={Math.max(1, Math.ceil((incidents.data?.total ?? 0) / 20))} total={incidents.data?.total ?? 0} onChange={setIncPage} />
        </Tabs.Panel>
      </Tabs>

      {/* Crear solicitud */}
      <Modal opened={createOffOpened} onClose={() => setCreateOffOpened(false)} title="Nueva solicitud" centered>
        <form onSubmit={offForm.onSubmit((v) => createOff.mutate(v))}>
          <Stack gap="sm">
            <Select label="Empleado" searchable data={employeesData} {...offForm.getInputProps('employee_id')} />
            <Select
              label="Tipo"
              data={[
                { value: 'permission', label: 'Permiso' },
                { value: 'vacation', label: 'Vacaciones' },
                { value: 'incapacity', label: 'Incapacidad' },
              ]}
              {...offForm.getInputProps('off_type')}
            />
            <Group grow>
              <DateInput label="Inicio" valueFormat="DD/MM/YYYY" clearable minDate={dateBounds.minDate} maxDate={dateBounds.maxDate}
                value={offForm.values.starts_on ? new Date(offForm.values.starts_on) : null}
                onChange={(d) => offForm.setFieldValue('starts_on', d ? toDateKey(d) : '')}
              />
              <DateInput label="Fin" valueFormat="DD/MM/YYYY" clearable minDate={offForm.values.starts_on ? new Date(`${offForm.values.starts_on}T00:00:00`) : dateBounds.minDate} maxDate={dateBounds.maxDate}
                value={offForm.values.ends_on ? new Date(offForm.values.ends_on) : null}
                onChange={(d) => offForm.setFieldValue('ends_on', d ? toDateKey(d) : '')}
              />
            </Group>
            <Textarea label="Razón" minRows={3} {...offForm.getInputProps('reason')} />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setCreateOffOpened(false)}>Cancelar</Button>
              <Button type="submit" loading={createOff.isPending}>Crear</Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Crear incidencia */}
      <Modal opened={createIncOpened} onClose={() => setCreateIncOpened(false)} title="Nueva incidencia" centered>
        <form onSubmit={incForm.onSubmit((v) => createIncident.mutate(v))}>
          <Stack gap="sm">
            <Select label="Empleado" searchable data={employeesData} {...incForm.getInputProps('employee_id')} />
            <Select
              label="Tipo"
              data={[
                { value: 'late', label: 'Retardo' },
                { value: 'absent', label: 'Ausencia' },
                { value: 'out_of_window', label: 'Fuera de horario' },
                { value: 'location', label: 'Ubicación' },
                { value: 'device', label: 'Dispositivo' },
                { value: 'duplicate', label: 'Checada duplicada' },
                { value: 'other', label: 'Otra' },
              ]}
              {...incForm.getInputProps('incident_type')}
            />
            <Select
              label="Severidad"
              data={[
                { value: 'info', label: 'Info' },
                { value: 'warning', label: 'Advertencia' },
                { value: 'critical', label: 'Crítica' },
              ]}
              {...incForm.getInputProps('severity')}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setCreateIncOpened(false)}>Cancelar</Button>
              <Button type="submit" loading={createIncident.isPending}>Registrar</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
