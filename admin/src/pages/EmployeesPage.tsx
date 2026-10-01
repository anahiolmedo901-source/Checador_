import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  Switch,
  Table,
  Text,
  TextInput,
  Timeline,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm, zodResolver } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useDisclosure } from '@mantine/hooks';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconEdit, IconEye, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { z } from 'zod';
import { api, qs } from '../lib/api';
import { Employee, EmployeeSchedule, PageResult } from '../lib/types';
import { PageHeader } from '../components/PageHeader';
import { Pager } from '../components/Pager';
import { ConfirmModal, ConfirmState } from '../components/ConfirmModal';
import { useAuth } from '../lib/auth';
import { useBranches, useDepartments, usePositions, useSchedules } from '../lib/queries';
import { fmtDate } from '../lib/format';
import { toDateKey } from '../lib/dates';

const createSchema = z.object({
  code: z.string().trim().min(3).max(20).regex(/^[A-Za-z0-9_-]+$/, 'Solo letras, números, - y _.'),
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30).regex(/^[0-9+()\s-]*$/, 'Solo números, espacios, + ( ) -').optional(),
  hire_date: z.string().optional(),
  password: z.string().min(8).max(128),
  branch_id: z.string().optional(),
  department_id: z.string().optional(),
  position_id: z.string().optional(),
});

const editSchema = z.object({
  first_name: z.string().trim().min(1).max(80).optional(),
  last_name: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().max(30).regex(/^[0-9+()\s-]*$/, 'Solo números, espacios, + ( ) -').optional(),
  hire_date: z.string().optional(),
  branch_id: z.string().optional(),
  department_id: z.string().optional(),
  position_id: z.string().optional(),
  active: z.boolean().optional(),
});

const assignSchema = z.object({
  schedule_id: z.string().min(1, 'Elige un horario.'),
});

function employeesKey(f: { page: number; search: string; departmentId: string; active: string }) {
  return ['employees', f];
}

export default function EmployeesPage() {
  const { can } = useAuth();
  const canWrite = can('employees.write');
  const canAssign = can('schedules.assign');
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState({ page: 1, search: '', departmentId: '', active: 'true' });
  const [selected, setSelected] = useState<Employee | null>(null);
  const [opened, { open, close }] = useDisclosure(false);
  const [editOpened, { open: openEdit, close: closeEdit }] = useDisclosure(false);
  const [scheduleSel, setScheduleSel] = useState<Employee | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>({ open: false, title: '', message: '', onConfirm: () => undefined });

  const { data: branches } = useBranches();
  const { data: departments } = useDepartments();
  const { data: positions } = usePositions();
  const { data: schedules } = useSchedules();

  const list = useQuery({
    queryKey: employeesKey(filters),
    queryFn: () =>
      api.get<PageResult<Employee>>(
        `/employees?${qs({
          page: filters.page,
          limit: 20,
          search: filters.search || undefined,
          department_id: filters.departmentId || undefined,
          active: filters.active === 'all' ? undefined : filters.active,
        })}`
      ),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['employees'] });
  };

  const deactivate = useMutation({
    mutationFn: (id: string) => api.del<Employee>(`/employees/${id}`),
    onSuccess: () => {
      notifications.show({ message: 'Empleado desactivado', color: 'green' });
      setConfirm((c) => ({ ...c, open: false }));
      invalidate();
    },
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  const createForm = useForm({
    initialValues: {
      code: '',
      first_name: '',
      last_name: '',
      phone: '',
      hire_date: '',
      password: '',
      branch_id: '',
      department_id: '',
      position_id: '',
    },
    validate: zodResolver(createSchema),
  });

  const editForm = useForm({
    initialValues: { first_name: '', last_name: '', phone: '', hire_date: '', branch_id: '', department_id: '', position_id: '', active: true },
    validate: zodResolver(editSchema),
  });

  function openCreate() {
    createForm.reset();
    open();
  }

  function openEditEmployee(emp: Employee) {
    setSelected(emp);
    editForm.setValues({
      first_name: emp.first_name ?? '',
      last_name: emp.last_name ?? '',
      phone: emp.phone ?? '',
      hire_date: emp.hire_date ? emp.hire_date.slice(0, 10) : '',
      branch_id: emp.branch_id ?? '',
      department_id: emp.department_id ?? '',
      position_id: emp.position_id ?? '',
      active: emp.active,
    });
    openEdit();
  }

  const create = useMutation({
    mutationFn: (values: typeof createForm.values) =>
      api.post<Employee>('/employees', {
        code: values.code,
        full_name: values.first_name || values.last_name ? [values.first_name, values.last_name].filter(Boolean).join(' ').trim() : undefined,
        first_name: values.first_name || null,
        last_name: values.last_name || null,
        phone: values.phone || null,
        hire_date: values.hire_date || null,
        password: values.password,
        branch_id: values.branch_id || null,
        department_id: values.department_id || null,
        position_id: values.position_id || null,
      }),
    onSuccess: () => {
      notifications.show({ message: 'Empleado creado', color: 'green' });
      createForm.reset();
      close();
      invalidate();
    },
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  const update = useMutation({
    mutationFn: (values: typeof editForm.values) => {
      const id = selected?.id;
      if (!id) throw new Error('Sin empleado.');
      return api.patch<Employee>(`/employees/${id}`, {
        full_name: values.first_name || values.last_name ? [values.first_name, values.last_name].filter(Boolean).join(' ').trim() : undefined,
        first_name: values.first_name || null,
        last_name: values.last_name || null,
        phone: values.phone || null,
        hire_date: values.hire_date || null,
        branch_id: values.branch_id || null,
        department_id: values.department_id || null,
        position_id: values.position_id || null,
        active: values.active,
      });
    },
    onSuccess: () => {
      notifications.show({ message: 'Empleado actualizado', color: 'green' });
      closeEdit();
      invalidate();
    },
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  const assignForm = useForm({ initialValues: { schedule_id: '' }, validate: zodResolver(assignSchema) });

  const schedulesQ = useQuery({
    queryKey: ['employee-schedules', scheduleSel?.id],
    queryFn: () => api.get<EmployeeSchedule[]>(`/employees/${scheduleSel!.id}/schedules`),
    enabled: !!scheduleSel,
  });

  const assign = useMutation({
    mutationFn: (values: { schedule_id: string }) => api.post(`/employees/${scheduleSel!.id}/schedules`, { schedule_id: values.schedule_id }),
    onSuccess: () => {
      notifications.show({ message: 'Horario asignado', color: 'green' });
      assignForm.reset();
      void queryClient.invalidateQueries({ queryKey: ['employee-schedules', scheduleSel?.id] });
    },
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  const unassign = useMutation({
    mutationFn: (assignmentId: string) => api.del(`/employees/${scheduleSel!.id}/schedules/${assignmentId}`),
    onSuccess: () => {
      notifications.show({ message: 'Asignación finalizada', color: 'green' });
      void queryClient.invalidateQueries({ queryKey: ['employee-schedules', scheduleSel?.id] });
    },
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  const rows = list.data?.data ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <>
      <PageHeader
        title="Empleados"
        subtitle={`${total} empleado${total === 1 ? '' : 's'}`}
        actions={
          canWrite ? (
            <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
              Nuevo empleado
            </Button>
          ) : undefined
        }
      />

      <Paper withBorder p="md" mb="md">
        <Group gap="md" wrap="wrap">
          <TextInput
            placeholder="Buscar por nombre o código…"
            leftSection={<IconSearch size={16} />}
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, page: 1, search: e.currentTarget.value }))}
            style={{ flex: 1, minWidth: 220 }}
          />
          <Select
            placeholder="Departamento"
            clearable
            data={(departments ?? []).map((d) => ({ value: d.id, label: d.name }))}
            value={filters.departmentId || null}
            onChange={(v) => setFilters((f) => ({ ...f, page: 1, departmentId: v ?? '' }))}
            w={200}
          />
          <Select
            placeholder="Estatus"
            data={[
              { value: 'true', label: 'Activos' },
              { value: 'false', label: 'Inactivos' },
              { value: 'all', label: 'Todos' },
            ]}
            value={filters.active}
            onChange={(v) => setFilters((f) => ({ ...f, page: 1, active: v ?? 'true' }))}
            w={140}
          />
        </Group>
      </Paper>

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
                <Table.Th>Empleado</Table.Th>
                <Table.Th>Perfil</Table.Th>
                <Table.Th>Departamento</Table.Th>
                <Table.Th>Puesto</Table.Th>
                <Table.Th>Sucursal</Table.Th>
                <Table.Th>Teléfono</Table.Th>
                <Table.Th>Ingreso</Table.Th>
                <Table.Th>Estatus</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Acciones</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((emp) => (
                <Table.Tr key={emp.id}>
                  <Table.Td>
                    <Group gap="sm" wrap="nowrap">
                      <Avatar size="sm" color="blue" radius="xl">
                        {emp.full_name?.slice(0, 1) ?? '?'}
                      </Avatar>
                      <div>
                        <Text size="sm" fw={600}>{emp.full_name}</Text>
                        <Text size="xs" c="dimmed">{emp.code}</Text>
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={emp.role === 'admin' ? 'red' : emp.role === 'hr' ? 'violet' : 'blue'} variant="light">
                      {emp.role === 'admin' ? 'Admin' : emp.role === 'hr' ? 'RRHH' : 'Empleado'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{emp.departments?.name ?? '—'}</Table.Td>
                  <Table.Td>{emp.positions?.title ?? '—'}</Table.Td>
                  <Table.Td>{emp.branches?.name ?? '—'}</Table.Td>
                  <Table.Td>{emp.phone ?? '—'}</Table.Td>
                  <Table.Td>{fmtDate(emp.hire_date)}</Table.Td>
                  <Table.Td>
                    <Badge color={emp.active ? 'green' : 'gray'} variant="light">
                      {emp.active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} justify="flex-end">
                      {canAssign ? (
                        <ActionIcon variant="light" color="violet" title="Horarios" onClick={() => setScheduleSel(emp)}>
                          <IconEye size={16} />
                        </ActionIcon>
                      ) : null}
                      {canWrite ? (
                        <>
                          <ActionIcon variant="light" color="blue" title="Editar" onClick={() => openEditEmployee(emp)}>
                            <IconEdit size={16} />
                          </ActionIcon>
                          {emp.active ? (
                            <ActionIcon
                              variant="light"
                              color="red"
                              title="Desactivar"
                              onClick={() =>
                                setConfirm({
                                  open: true,
                                  title: 'Desactivar empleado',
                                  message: `¿Desactivar a ${emp.full_name}? No podrá registrar checadas.`,
                                  confirmLabel: 'Desactivar',
                                  color: 'red',
                                  onConfirm: () => void deactivate.mutateAsync(emp.id),
                                })
                              }
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          ) : null}
                        </>
                      ) : null}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      {total > 20 ? (
        <Pager page={filters.page} totalPages={totalPages} total={total} onChange={(p) => setFilters((f) => ({ ...f, page: p }))} />
      ) : null}

      {/* Crear */}
      <Modal opened={opened} onClose={close} title="Nuevo empleado" centered size="lg">
        <form onSubmit={createForm.onSubmit((values) => create.mutate(values))}>
          <Group grow>
            <TextInput label="Código" placeholder="EMP001" {...createForm.getInputProps('code')} />
            <TextInput label="Nombre(s)" {...createForm.getInputProps('first_name')} />
            <TextInput label="Apellidos" {...createForm.getInputProps('last_name')} />
          </Group>
          <Group grow mt="sm">
            <TextInput label="Teléfono" placeholder="55 0000 0000" {...createForm.getInputProps('phone')} />
            <DateInput label="Fecha de ingreso" valueFormat="DD/MM/YYYY" placeholder="Selecciona" clearable
              value={createForm.values.hire_date ? new Date(createForm.values.hire_date) : null}
              onChange={(d) => createForm.setFieldValue('hire_date', d ? toDateKey(d) : '')}
            />
            <TextInput label="Contraseña inicial" type="password" {...createForm.getInputProps('password')} />
          </Group>
          <Group grow mt="sm">
            <Select label="Sucursal" clearable data={(branches ?? []).map((b) => ({ value: b.id, label: b.name }))} {...createForm.getInputProps('branch_id')} />
            <Select label="Departamento" clearable data={(departments ?? []).map((d) => ({ value: d.id, label: d.name }))} {...createForm.getInputProps('department_id')} />
            <Select label="Puesto" clearable data={(positions ?? []).map((p) => ({ value: p.id, label: p.title }))} {...createForm.getInputProps('position_id')} />
          </Group>
          <Group justify="flex-end" mt="lg">
            <Button variant="default" onClick={close}>Cancelar</Button>
            <Button type="submit" loading={create.isPending}>Crear empleado</Button>
          </Group>
        </form>
      </Modal>

      {/* Editar */}
      <Modal opened={editOpened} onClose={closeEdit} title={`Editar ${selected?.full_name ?? ''}`} centered size="lg">
        <form onSubmit={editForm.onSubmit((values) => update.mutate(values))}>
          <Group grow>
            <TextInput label="Nombre(s)" {...editForm.getInputProps('first_name')} />
            <TextInput label="Apellidos" {...editForm.getInputProps('last_name')} />
          </Group>
          <Group grow mt="sm">
            <TextInput label="Teléfono" {...editForm.getInputProps('phone')} />
            <DateInput label="Fecha de ingreso" valueFormat="DD/MM/YYYY" clearable
              value={editForm.values.hire_date ? new Date(editForm.values.hire_date) : null}
              onChange={(d) => editForm.setFieldValue('hire_date', d ? toDateKey(d) : '')}
            />
            <Switch label="Activo" mt="lg" {...editForm.getInputProps('active', { type: 'checkbox' })} />
          </Group>
          <Group grow mt="sm">
            <Select label="Sucursal" clearable data={(branches ?? []).map((b) => ({ value: b.id, label: b.name }))} {...editForm.getInputProps('branch_id')} />
            <Select label="Departamento" clearable data={(departments ?? []).map((d) => ({ value: d.id, label: d.name }))} {...editForm.getInputProps('department_id')} />
            <Select label="Puesto" clearable data={(positions ?? []).map((p) => ({ value: p.id, label: p.title }))} {...editForm.getInputProps('position_id')} />
          </Group>
          <Group justify="flex-end" mt="lg">
            <Button variant="default" onClick={closeEdit}>Cancelar</Button>
            <Button type="submit" loading={update.isPending}>Guardar</Button>
          </Group>
        </form>
      </Modal>

      {/* Horarios del empleado */}
      <Modal opened={!!scheduleSel} onClose={() => setScheduleSel(null)} title={`Horarios de ${scheduleSel?.full_name ?? ''}`} centered>
        <Timeline active={0} bulletSize={10} lineWidth={2}>
          {(schedulesQ.data ?? []).map((a) => (
            <Timeline.Item key={a.id} title={a.schedules?.name ?? ''}>
              <Text size="xs" c="dimmed">
                Desde {a.effective_from ? new Date(a.effective_from).toLocaleDateString('es-MX') : '—'}
                {a.effective_to ? ` hasta ${new Date(a.effective_to).toLocaleDateString('es-MX')}` : ' (vigente)'}
              </Text>
              {canAssign && a.active ? (
                <Button size="xs" variant="light" color="red" mt={4} loading={unassign.isPending} onClick={() => unassign.mutate(a.id)}>
                  Terminar
                </Button>
              ) : null}
            </Timeline.Item>
          ))}
        </Timeline>
        {canAssign ? (
          <form onSubmit={assignForm.onSubmit((values) => assign.mutate(values))} style={{ marginTop: 16 }}>
            <Group align="flex-end">
              <Select
                label="Asignar horario"
                placeholder="Elige un horario"
                data={(schedules ?? []).filter((s) => s.active).map((s) => ({ value: s.id, label: `${s.name} (${s.check_in}–${s.check_out})` }))}
                style={{ flex: 1 }}
                {...assignForm.getInputProps('schedule_id')}
              />
              <Button type="submit" loading={assign.isPending}>Asignar</Button>
            </Group>
          </form>
        ) : null}
      </Modal>

      <ConfirmModal state={confirm} onClose={() => setConfirm((c) => ({ ...c, open: false }))} />
    </>
  );
}