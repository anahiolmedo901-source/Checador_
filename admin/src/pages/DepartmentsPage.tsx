import { Badge, Box, Button, Group, Loader, Modal, Paper, Stack, Table, Text, TextInput } from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IconEdit, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { z } from 'zod';
import { api } from '../lib/api';
import { Department } from '../lib/types';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../lib/auth';
import { useDepartments } from '../lib/queries';

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(2).max(24).regex(/^[A-Za-z0-9_-]+$/, 'Solo letras, números, - y _.'),
});

export default function DepartmentsPage() {
  const { can } = useAuth();
  const canWrite = can('departments.write');
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Department | null>(null);
  const [opened, setOpened] = useState(false);

  const list = useDepartments();

  const form = useForm({ initialValues: { name: '', code: '' }, validate: zodResolver(schema) });

  function openEdit(d?: Department) {
    setEditing(d ?? null);
    form.setValues(d ? { name: d.name, code: d.code } : { name: '', code: '' });
    setOpened(true);
  }

  const mutate = useMutation({
    mutationFn: (v: typeof form.values) =>
      editing ? api.patch<Department>(`/departments/${editing.id}`, v) : api.post<Department>('/departments', v),
    onSuccess: () => {
      notifications.show({ message: editing ? 'Departamento actualizado' : 'Departamento creado', color: 'green' });
      setOpened(false);
      void queryClient.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  return (
    <>
      <PageHeader
        title="Departamentos"
        subtitle="Organización interna"
        actions={canWrite ? <Button leftSection={<IconPlus size={16} />} onClick={() => openEdit()}>Nuevo departamento</Button> : undefined}
      />
      <Paper withBorder>
        {list.isLoading ? (
          <Box p="xl" ta="center"><Loader /></Box>
        ) : (
          <Table.ScrollContainer minWidth={720}>
          <Table striped highlightOnHover horizontalSpacing="md" verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Nombre</Table.Th>
                <Table.Th>Código</Table.Th>
                <Table.Th>Estatus</Table.Th>
                {canWrite ? <Table.Th style={{ textAlign: 'right' }}>Acciones</Table.Th> : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(list.data ?? []).map((d) => (
                <Table.Tr key={d.id}>
                  <Table.Td><Text fw={600}>{d.name}</Text></Table.Td>
                  <Table.Td>{d.code}</Table.Td>
                  <Table.Td><Badge color={d.active ? 'green' : 'gray'} variant="light">{d.active ? 'Activo' : 'Inactivo'}</Badge></Table.Td>
                  {canWrite ? (
                    <Table.Td ta="right">
                      <Button size="xs" variant="light" leftSection={<IconEdit size={14} />} onClick={() => openEdit(d)}>Editar</Button>
                    </Table.Td>
                  ) : null}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      <Modal opened={opened} onClose={() => setOpened(false)} title={editing ? `Editar ${editing.name}` : 'Nuevo departamento'} centered>
        <form onSubmit={form.onSubmit((v) => mutate.mutate(v))}>
          <Stack gap="sm">
            <TextInput label="Nombre" {...form.getInputProps('name')} />
            <TextInput label="Código" {...form.getInputProps('code')} />
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