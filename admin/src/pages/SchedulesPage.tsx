import { Badge, Button, Card, Group, Loader, Modal, SimpleGrid, Stack, Switch, Text, TextInput, Title } from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useDisclosure } from '@mantine/hooks';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IconEdit, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { z } from 'zod';
import { api } from '../lib/api';
import { Schedule } from '../lib/types';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../lib/auth';
import { useSchedules } from '../lib/queries';

const schema = z.object({
  name: z.string().trim().min(3).max(120),
  code: z.string().trim().min(2).max(24).regex(/^[A-Za-z0-9_-]+$/, 'Solo letras, números, - y _.'),
  check_in: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:MM'),
  check_out: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato HH:MM'),
  tolerance_min: z.coerce.number().int().min(0).max(120),
  break_min: z.coerce.number().int().min(0).max(600),
}).superRefine(({ check_in, check_out }, ctx) => {
  if (check_out <= check_in) ctx.addIssue({ code: 'custom', path: ['check_out'], message: 'La salida debe ser posterior a la entrada. Los turnos nocturnos requieren configuración aparte.' });
});

export default function SchedulesPage() {
  const { can } = useAuth();
  const canWrite = can('schedules.write');
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [opened, { open, close }] = useDisclosure(false);

  const list = useSchedules();

  const form = useForm({
    initialValues: { name: '', code: '', check_in: '09:00', check_out: '18:00', tolerance_min: 5, break_min: 30 },
    validate: zodResolver(schema),
  });

  function openCreate() {
    setEditing(null);
    form.reset();
    open();
  }

  function openEdit(s: Schedule) {
    setEditing(s);
    form.setValues({ name: s.name, code: s.code, check_in: s.check_in.slice(0, 5), check_out: s.check_out.slice(0, 5), tolerance_min: s.tolerance_min, break_min: s.break_min });
    open();
  }

  const mutate = useMutation({
    mutationFn: (values: typeof form.values) =>
      editing
        ? api.patch<Schedule>(`/schedules/${editing.id}`, values)
        : api.post<Schedule>('/schedules', values),
    onSuccess: () => {
      notifications.show({ message: editing ? 'Horario actualizado' : 'Horario creado', color: 'green' });
      close();
      void queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  const toggle = useMutation({
    mutationFn: (s: Schedule) => api.patch<Schedule>(`/schedules/${s.id}`, { active: !s.active }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['schedules'] });
    },
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  return (
    <>
      <PageHeader
        title="Horarios"
        subtitle="Turnos de trabajo (entrada, salida, tolerancia y descanso)"
        actions={canWrite ? <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>Nuevo horario</Button> : undefined}
      />

      {list.isLoading ? (
        <Loader />
      ) : (
        <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="md">
          {(list.data ?? []).map((s) => (
            <Card key={s.id} withBorder>
              <Group justify="space-between" mb="xs">
                <div>
                  <Title order={5}>{s.name}</Title>
                  <Text size="xs" c="dimmed">{s.code}</Text>
                </div>
                <Badge color={s.active ? 'green' : 'gray'} variant="light">
                  {s.active ? 'Activo' : 'Inactivo'}
                </Badge>
              </Group>
              <Group gap="lg">
                <div>
                  <Text size="xs" c="dimmed">Entrada</Text>
                  <Text fw={600}>{s.check_in.slice(0, 5)}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">Salida</Text>
                  <Text fw={600}>{s.check_out.slice(0, 5)}</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">Tolerancia</Text>
                  <Text fw={600}>{s.tolerance_min} min</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">Descanso</Text>
                  <Text fw={600}>{s.break_min} min</Text>
                </div>
              </Group>
              {canWrite ? (
                <Group mt="md" justify="space-between">
                  <Button size="xs" variant="light" leftSection={<IconEdit size={14} />} onClick={() => openEdit(s)}>
                    Editar
                  </Button>
                  <Switch label={s.active ? 'Activo' : 'Inactivo'} checked={s.active} onChange={() => toggle.mutate(s)} size="sm" />
                </Group>
              ) : null}
            </Card>
          ))}
        </SimpleGrid>
      )}

      <Modal opened={opened} onClose={close} title={editing ? `Editar ${editing.name}` : 'Nuevo horario'} centered>
        <form onSubmit={form.onSubmit((values) => mutate.mutate(values))}>
          <Stack gap="sm">
            <Group grow>
              <TextInput label="Nombre" placeholder="Turno matutino" {...form.getInputProps('name')} />
              <TextInput label="Código" placeholder="MAT-1" {...form.getInputProps('code')} />
            </Group>
            <Group grow>
              <TextInput label="Entrada (HH:MM)" {...form.getInputProps('check_in')} />
              <TextInput label="Salida (HH:MM)" {...form.getInputProps('check_out')} />
            </Group>
            <Group grow>
              <TextInput label="Tolerancia (min)" type="number" {...form.getInputProps('tolerance_min')} />
              <TextInput label="Descanso (min)" type="number" {...form.getInputProps('break_min')} />
            </Group>
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={close}>Cancelar</Button>
              <Button type="submit" loading={mutate.isPending}>{editing ? 'Guardar' : 'Crear'}</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
