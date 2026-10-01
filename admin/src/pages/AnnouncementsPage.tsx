import { Badge, Box, Button, Group, Loader, Modal, MultiSelect, Paper, Select, Stack, Switch, Table, Text, TextInput, Textarea } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm, zodResolver } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconEdit, IconPlus, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { z } from 'zod';
import { api, qs } from '../lib/api';
import { Announcement, PageResult } from '../lib/types';
import { PageHeader } from '../components/PageHeader';
import { Pager } from '../components/Pager';
import { useAuth } from '../lib/auth';
import { fmtDateTime } from '../lib/format';
import { priorityColor, priorityLabel } from '../lib/format';
import { dateEntryBounds, isDateEntryAllowed, toDateKey } from '../lib/dates';

const schema = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(1).max(5000),
  priority: z.enum(['low', 'normal', 'high', 'critical']),
  audience_role: z.array(z.enum(['admin', 'hr', 'employee'])),
  expires_at: z.string().optional(),
  active: z.boolean(),
});

type AnnouncementForm = z.infer<typeof schema>;

export default function AnnouncementsPage() {
  const { can } = useAuth();
  const canWrite = can('announcements.write');
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ page: 1, active: '', search: '' });
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [opened, setOpened] = useState(false);
  const dateBounds = dateEntryBounds();

  const list = useQuery({
    queryKey: ['admin-announcements', filters],
    queryFn: () =>
      api.get<PageResult<Announcement>>(
        `/admin/announcements?${qs({
          active: filters.active || undefined,
          search: filters.search || undefined,
          page: filters.page,
          limit: 20,
        })}`
      ),
  });

  const form = useForm<AnnouncementForm>({
    initialValues: {
      title: '',
      body: '',
      priority: 'normal',
      audience_role: ['employee'] as AnnouncementForm['audience_role'],
      expires_at: '',
      active: true,
    },
    validate: zodResolver(schema),
  });

  function openEdit(a?: Announcement) {
    setEditing(a ?? null);
    form.setValues(
      a
        ? {
            title: a.title,
            body: a.body,
            priority: a.priority,
            audience_role: (a.audience_role ?? ['employee']) as AnnouncementForm['audience_role'],
            expires_at: a.expires_at ? a.expires_at.slice(0, 10) : '',
            active: a.active,
          }
        : {
            title: '',
            body: '',
            priority: 'normal',
            audience_role: ['employee'] as AnnouncementForm['audience_role'],
            expires_at: '',
            active: true,
          }
    );
    setOpened(true);
  }

  const mutate = useMutation({
    mutationFn: (v: typeof form.values) => {
      const payload: Record<string, unknown> = {
        title: v.title,
        body: v.body,
        priority: v.priority,
        audience_role: v.audience_role,
        expires_at: v.expires_at ? new Date(v.expires_at + 'T23:59:59').toISOString() : null,
        active: v.active,
      };
      if (v.expires_at && !isDateEntryAllowed(v.expires_at) && (!editing?.expires_at || editing.expires_at.slice(0, 10) !== v.expires_at)) {
        throw new Error('La fecha de expiración debe ser desde hoy y dentro de los próximos 3 meses.');
      }
      return editing
        ? api.patch<Announcement>(`/admin/announcements/${editing.id}`, payload)
        : api.post<Announcement>('/admin/announcements', payload);
    },
    onSuccess: () => {
      notifications.show({ message: editing ? 'Aviso actualizado' : 'Aviso creado', color: 'green' });
      setOpened(false);
      void queryClient.invalidateQueries({ queryKey: ['admin-announcements'] });
    },
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  const toggle = useMutation({
    mutationFn: (a: Announcement) => api.patch(`/admin/announcements/${a.id}`, { active: !a.active }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-announcements'] }),
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  const total = list.data?.total ?? 0;
  const audienceLabels: Record<string, string> = { admin: 'Admin', hr: 'RRHH', employee: 'Empleados' };

  return (
    <>
      <PageHeader
        title="Avisos"
        subtitle="Anuncios que aparecen en la app móvil y pantallas"
        actions={
          <Group>
            <Select
              placeholder="Estado"
              clearable
              data={[
                { value: 'true', label: 'Activos' },
                { value: 'false', label: 'Inactivos' },
              ]}
              value={filters.active || null}
              onChange={(v) => setFilters((f) => ({ ...f, page: 1, active: v ?? '' }))}
              w={130}
            />
            <TextInput
              placeholder="Buscar…"
              leftSection={<IconSearch size={14} />}
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, page: 1, search: e.currentTarget.value }))}
              w={190}
            />
            {canWrite ? <Button leftSection={<IconPlus size={16} />} onClick={() => openEdit()}>Nuevo aviso</Button> : null}
          </Group>
        }
      />

      <Paper withBorder>
        {list.isLoading ? (
          <Box p="xl" ta="center"><Loader /></Box>
        ) : (
          <Table.ScrollContainer minWidth={720}>
          <Table striped highlightOnHover horizontalSpacing="md" verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Publicado</Table.Th>
                <Table.Th>Título</Table.Th>
                <Table.Th>Prioridad</Table.Th>
                <Table.Th>Audiencia</Table.Th>
                <Table.Th>Expira</Table.Th>
                <Table.Th>Estatus</Table.Th>
                {canWrite ? <Table.Th style={{ textAlign: 'right' }}>Acciones</Table.Th> : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(list.data?.data ?? []).map((a) => (
                <Table.Tr key={a.id}>
                  <Table.Td>{fmtDateTime(a.published_at)}</Table.Td>
                  <Table.Td>
                    <Text fw={600}>{a.title}</Text>
                    <Text size="xs" c="dimmed" lineClamp={2}>{a.body}</Text>
                  </Table.Td>
                  <Table.Td><Badge color={priorityColor(a.priority)} variant="light">{priorityLabel(a.priority)}</Badge></Table.Td>
                  <Table.Td>{(a.audience_role ?? []).map((r) => audienceLabels[r]).filter(Boolean).join(', ') || '—'}</Table.Td>
                  <Table.Td>{a.expires_at ? fmtDateTime(a.expires_at) : '—'}</Table.Td>
                  <Table.Td><Badge color={a.active ? 'green' : 'gray'} variant="light">{a.active ? 'Activo' : 'Inactivo'}</Badge></Table.Td>
                  {canWrite ? (
                    <Table.Td ta="right">
                      <Group gap={4} justify="flex-end">
                        <Button size="xs" variant="light" leftSection={<IconEdit size={14} />} onClick={() => openEdit(a)}>Editar</Button>
                        <Switch size="sm" checked={a.active} onChange={() => toggle.mutate(a)} label={a.active ? 'On' : 'Off'} />
                      </Group>
                    </Table.Td>
                  ) : null}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      <Pager page={filters.page} totalPages={Math.max(1, Math.ceil(total / 20))} total={total} onChange={(p) => setFilters((f) => ({ ...f, page: p }))} />

      <Modal opened={opened} onClose={() => setOpened(false)} title={editing ? `Editar ${editing.title}` : 'Nuevo aviso'} centered size="lg">
        <form onSubmit={form.onSubmit((v) => mutate.mutate(v))}>
          <Stack gap="sm">
            <TextInput label="Título" {...form.getInputProps('title')} />
            <Textarea label="Contenido" minRows={5} {...form.getInputProps('body')} />
            <Group grow>
              <Select
                label="Prioridad"
                data={[
                  { value: 'low', label: 'Baja' },
                  { value: 'normal', label: 'Normal' },
                  { value: 'high', label: 'Alta' },
                  { value: 'critical', label: 'Crítica' },
                ]}
                {...form.getInputProps('priority')}
              />
              <MultiSelect
                label="Audiencia"
                clearable
                searchable
                hidePickedOptions
                data={[
                  { value: 'admin', label: 'Admin' },
                  { value: 'hr', label: 'RRHH' },
                  { value: 'employee', label: 'Empleados' },
                ]}
                {...form.getInputProps('audience_role')}
              />
              <DateInput label="Expira el" valueFormat="DD/MM/YYYY" clearable minDate={dateBounds.minDate} maxDate={dateBounds.maxDate}
                value={form.values.expires_at ? new Date(form.values.expires_at) : null}
                onChange={(d) => form.setFieldValue('expires_at', d ? toDateKey(d) : '')}
              />
            </Group>
            <Switch label="Publicado (activo)" {...form.getInputProps('active', { type: 'checkbox' })} />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setOpened(false)}>Cancelar</Button>
              <Button type="submit" loading={mutate.isPending}>{editing ? 'Guardar' : 'Publicar'}</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
