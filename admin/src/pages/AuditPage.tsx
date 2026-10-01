import { Accordion, Badge, Box, Group, Loader, Paper, Select, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, qs } from '../lib/api';
import { AuditLogRow, PageResult } from '../lib/types';
import { PageHeader } from '../components/PageHeader';
import { Pager } from '../components/Pager';
import { fmtDateTime } from '../lib/format';

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'green',
  UPDATED: 'blue',
  DELETED: 'red',
  LOGIN: 'teal',
};

const ENTITIES = [
  'attendance_sessions',
  'attendance_events',
  'employees',
  'offtime_requests',
  'incidents',
  'announcements',
  'media',
  'display_playlists',
  'displays',
  'devices',
  'branches',
  'schedules',
  'departments',
  'positions',
  'employee_schedules',
  'auth',
];

export default function AuditPage() {
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);

  const list = useQuery({
    queryKey: ['audit', entity, page],
    queryFn: () => api.get<PageResult<AuditLogRow>>(`/admin/audit?${qs({ entity: entity || undefined, page, limit: 20 })}`),
  });

  const total = list.data?.total ?? 0;

  return (
    <>
      <PageHeader
        title="Bitácora de auditoría"
        subtitle="Registro inmutable de acciones en el panel"
        actions={
          <Select
            placeholder="Entidad"
            clearable
            searchable
            data={ENTITIES}
            value={entity || null}
            onChange={(v) => {
              setEntity(v ?? '');
              setPage(1);
            }}
            w={220}
          />
        }
      />

      <Paper withBorder>
        {list.isLoading ? (
          <Box p="xl" ta="center"><Loader /></Box>
        ) : (
          <Accordion>
            {(list.data?.data ?? []).map((log) => (
              <Accordion.Item key={log.id} value={String(log.id)}>
                <Accordion.Control>
                  <Group wrap="wrap">
                    <Badge color={ACTION_COLORS[log.action] ?? 'gray'} variant="light">{log.action}</Badge>
                    <Text fw={600} size="sm">{log.entity ?? '—'}</Text>
                    <Text size="xs" c="dimmed">{log.entity_id ?? ''}</Text>
                    <Text size="sm">{log.employees?.full_name ?? '—'}</Text>
                    <Badge size="xs" variant="default">{log.actor_role ?? '—'}</Badge>
                    <Text size="xs" c="dimmed">{fmtDateTime(log.created_at)}</Text>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Group gap="lg" align="flex-start">
                    {log.old_data ? (
                      <Box>
                        <Text size="xs" fw={700} mb={4}>Antes</Text>
                        <pre style={{ margin: 0, fontSize: 11, maxHeight: 220, overflow: 'auto' }}>{JSON.stringify(log.old_data, null, 2)}</pre>
                      </Box>
                    ) : null}
                    {log.new_data ? (
                      <Box>
                        <Text size="xs" fw={700} mb={4}>Después</Text>
                        <pre style={{ margin: 0, fontSize: 11, maxHeight: 220, overflow: 'auto' }}>{JSON.stringify(log.new_data, null, 2)}</pre>
                      </Box>
                    ) : null}
                    {log.metadata ? (
                      <Box>
                        <Text size="xs" fw={700} mb={4}>Metadatos</Text>
                        <pre style={{ margin: 0, fontSize: 11 }}>{JSON.stringify(log.metadata, null, 2)}</pre>
                      </Box>
                    ) : null}
                    {log.ip ? <Text size="xs" c="dimmed">IP: {log.ip}</Text> : null}
                  </Group>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        )}
      </Paper>

      <Pager page={page} totalPages={Math.max(1, Math.ceil(total / 20))} total={total} onChange={setPage} />
    </>
  );
}