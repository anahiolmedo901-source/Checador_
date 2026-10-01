import { Badge, Box, Button, Group, Loader, Paper, Select, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, qs } from '../lib/api';
import { Device, PageResult } from '../lib/types';
import { PageHeader } from '../components/PageHeader';
import { Pager } from '../components/Pager';
import { useAuth } from '../lib/auth';
import { fmtDateTime } from '../lib/format';

const authColor = (a: string) => (a === 'authorized' ? 'green' : a === 'pending' ? 'yellow' : 'red');
const authLabel = (a: string) => (a === 'authorized' ? 'Autorizado' : a === 'pending' ? 'Pendiente' : 'Denegado');

export default function DevicesPage() {
  const { can } = useAuth();
  const canWrite = can('employees.write');
  const queryClient = useQueryClient();
  const [auth, setAuth] = useState('');
  const [page, setPage] = useState(1);

  const list = useQuery({
    queryKey: ['devices', auth, page],
    queryFn: () =>
      api.get<PageResult<Device>>(`/admin/devices?${qs({ authorization: auth || undefined, page, limit: 20 })}`),
  });

  const update = useMutation({
    mutationFn: (args: { id: string; patch: Record<string, string | boolean> }) =>
      api.patch<Device>(`/admin/devices/${args.id}`, args.patch),
    onSuccess: () => {
      notifications.show({ message: 'Dispositivo actualizado', color: 'green' });
      void queryClient.invalidateQueries({ queryKey: ['devices'] });
    },
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  const total = list.data?.total ?? 0;

  return (
    <>
      <PageHeader
        title="Dispositivos"
        subtitle="Tablets/quioscos de checado registrados por los empleados"
        actions={
          <Select
            placeholder="Autorización"
            clearable
            data={[
              { value: 'authorized', label: 'Autorizados' },
              { value: 'pending', label: 'Pendientes' },
              { value: 'denied', label: 'Denegados' },
            ]}
            value={auth || null}
            onChange={(v) => {
              setAuth(v ?? '');
              setPage(1);
            }}
            w={170}
          />
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
                <Table.Th>Identificador</Table.Th>
                <Table.Th>Empleado</Table.Th>
                <Table.Th>Modelo</Table.Th>
                <Table.Th>Plataforma</Table.Th>
                <Table.Th>App</Table.Th>
                <Table.Th>Última conexión</Table.Th>
                <Table.Th>Autorización</Table.Th>
                {canWrite ? <Table.Th style={{ textAlign: 'right' }}>Acciones</Table.Th> : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(list.data?.data ?? []).map((d) => (
                <Table.Tr key={d.id}>
                  <Table.Td><Text size="sm" fw={600} span style={{ fontFamily: 'monospace' }}>{d.device_identifier}</Text></Table.Td>
                  <Table.Td>{d.employees?.full_name ? `${d.employees.full_name} (${d.employees.code})` : '—'}</Table.Td>
                  <Table.Td>{[d.manufacturer, d.model].filter(Boolean).join(' ') || '—'}</Table.Td>
                  <Table.Td>
                    <Text size="sm">{d.platform ?? '—'}</Text>
                    <Text size="xs" c="dimmed">{d.os_version ?? ''}</Text>
                  </Table.Td>
                  <Table.Td>{d.app_version ?? '—'}</Table.Td>
                  <Table.Td>{fmtDateTime(d.last_seen_at)}</Table.Td>
                  <Table.Td>
                    <Badge color={authColor(d.authorization)} variant="light">{authLabel(d.authorization)}</Badge>
                  </Table.Td>
                  {canWrite ? (
                    <Table.Td ta="right">
                      <Group gap={4} justify="flex-end">
                        {d.authorization !== 'authorized' ? (
                          <Button size="xs" color="green" variant="light" loading={update.isPending} onClick={() => update.mutate({ id: d.id, patch: { authorization: 'authorized', is_active: true } })}>
                            Autorizar
                          </Button>
                        ) : null}
                        {d.authorization !== 'denied' ? (
                          <Button size="xs" color="red" variant="light" loading={update.isPending} onClick={() => update.mutate({ id: d.id, patch: { authorization: 'denied', is_active: false } })}>
                            Denegar
                          </Button>
                        ) : null}
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
      <Pager page={page} totalPages={Math.max(1, Math.ceil(total / 20))} total={total} onChange={setPage} />
    </>
  );
}