import { Badge, Box, Button, Group, Loader, Modal, Paper, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconEdit, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { z } from 'zod';
import { api, qs } from '../lib/api';
import { Position } from '../lib/types';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../lib/auth';
import { useDepartments } from '../lib/queries';

const schema = z.object({
  title: z.string().trim().min(1).max(120),
  code: z.string().trim().min(2).max(24).regex(/^[A-Za-z0-9_-]+$/, 'Solo letras, números, - y _.'),
  department_id: z.string().optional(),
});

export default function PositionsPage() {
  const { can } = useAuth();
  const canWrite = can('positions.write');
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Position | null>(null);
  const [opened, setOpened] = useState(false);
  const [deptId, setDeptId] = useState('');

  const { data: departments } = useDepartments();

  const list = useQuery({
    queryKey: ['positions', deptId],
    queryFn: () => api.get<Position[]>(`/positions?${qs({ department_id: deptId || undefined })}`),
  });

  const form = useForm({ initialValues: { title: '', code: '', department_id: '' }, validate: zodResolver(schema) });

  function openEdit(p?: Position) {
    setEditing(p ?? null);
    form.setValues(p ? { title: p.title, code: p.code, department_id: p.department_id ?? '' } : { title: '', code: '', department_id: '' });
    setOpened(true);
  }

  const mutate = useMutation({
    mutationFn: (v: typeof form.values) =>
      editing
        ? api.patch<Position>(`/positions/${editing.id}`, { ...v, department_id: v.department_id || null })
        : api.post<Position>('/positions', { ...v, department_id: v.department_id || null }),
    onSuccess: () => {
      notifications.show({ message: editing ? 'Puesto actualizado' : 'Puesto creado', color: 'green' });
      setOpened(false);
      void queryClient.invalidateQueries({ queryKey: ['positions'] });
    },
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  return (
    <>
      <PageHeader
        title="Puestos"
        subtitle="Catálogo de puestos"
        actions={
          <Group>
            <Select
              placeholder="Departamento"
              clearable
              data={(departments ?? []).map((d) => ({ value: d.id, label: d.name }))}
              value={deptId || null}
              onChange={(v) => setDeptId(v ?? '')}
              w={200}
            />
            {canWrite ? <Button leftSection={<IconPlus size={16} />} onClick={() => openEdit()}>Nuevo puesto</Button> : null}
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
                <Table.Th>Título</Table.Th>
                <Table.Th>Código</Table.Th>
                <Table.Th>Departamento</Table.Th>
                <Table.Th>Estatus</Table.Th>
                {canWrite ? <Table.Th style={{ textAlign: 'right' }}>Acciones</Table.Th> : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(list.data ?? []).map((p) => {
                const dept = (departments ?? []).find((d) => d.id === p.department_id);
                return (
                  <Table.Tr key={p.id}>
                    <Table.Td><Text fw={600}>{p.title}</Text></Table.Td>
                    <Table.Td>{p.code}</Table.Td>
                    <Table.Td>{dept?.name ?? '—'}</Table.Td>
                    <Table.Td><Badge color={p.active ? 'green' : 'gray'} variant="light">{p.active ? 'Activo' : 'Inactivo'}</Badge></Table.Td>
                    {canWrite ? (
                      <Table.Td ta="right">
                        <Button size="xs" variant="light" leftSection={<IconEdit size={14} />} onClick={() => openEdit(p)}>Editar</Button>
                      </Table.Td>
                    ) : null}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      <Modal opened={opened} onClose={() => setOpened(false)} title={editing ? `Editar ${editing.title}` : 'Nuevo puesto'} centered>
        <form onSubmit={form.onSubmit((v) => mutate.mutate(v))}>
          <Stack gap="sm">
            <TextInput label="Título" {...form.getInputProps('title')} />
            <TextInput label="Código" {...form.getInputProps('code')} />
            <Select label="Departamento" clearable data={(departments ?? []).map((d) => ({ value: d.id, label: d.name }))} {...form.getInputProps('department_id')} />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setOpened(false)}>Cancelar</Button>
              <Button type="submit" loading={mutate.isPending}>{editing ? 'Guardar' : 'Crear'}</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}