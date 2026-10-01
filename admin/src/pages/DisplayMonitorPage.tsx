import { Badge, Button, Group, Loader, Paper, SimpleGrid, Stack, Text, Title, Tooltip } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IconBroadcast, IconRefresh } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { api, connectEvents } from '../lib/api';
import { Display, DisplaySnapshot, LiveCheckPayload } from '../lib/types';
import { PageHeader } from '../components/PageHeader';
import { checkTypeColor, checkTypeLabel, fmtDateTime } from '../lib/format';

interface FeedEntry {
  seq: number;
  name: string;
  check_type: string;
  full_time: string;
  branch_name: string | null;
  display_names: string[];
}

function Counter({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <Paper withBorder p="xs" style={{ flex: 1, minWidth: 0 }}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="lg" fw={700} c={color}>
        {value}
      </Text>
    </Paper>
  );
}

function DisplayBoard({ display }: { display: Display }) {
  const q = useQuery({
    queryKey: ['admin-display-snapshot', display.id],
    queryFn: () => api.get<DisplaySnapshot>(`/admin/displays/${display.id}/snapshot`),
    refetchInterval: 20_000,
  });

  const place = display.branches?.name ?? 'Sin sucursal';
  const status = !display.is_active
    ? { label: 'Inactiva', color: 'gray' as const }
    : display.status === 'online'
      ? { label: 'En línea', color: 'green' as const }
      : display.status === 'maintenance'
        ? { label: 'Mantenimiento', color: 'yellow' as const }
        : { label: 'Desconectada', color: 'red' as const };

  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="xs">
        <div>
          <Title order={5}>{display.name}</Title>
          <Text size="xs" c="dimmed">
            {place} · {display.code}
          </Text>
        </div>
        <Badge color={status.color} variant="light">
          {status.label}
        </Badge>
      </Group>

      {q.isLoading ? (
        <Loader size="sm" mt="md" />
      ) : q.data ? (
        <>
          <Group gap="xs" align="stretch">
            <Counter label="Total" value={q.data.counts.total} color="blue" />
            <Counter label="Presentes" value={q.data.counts.present} color="green" />
            <Counter label="Retardo" value={q.data.counts.late} color="yellow" />
            <Counter label="Justif." value={q.data.counts.excused} color="blue" />
            <Counter label="Faltas" value={q.data.counts.missing} color="red" />
          </Group>

          <Stack gap={4} mt="md">
            <Text size="xs" fw={700} c="dimmed" tt="uppercase">
              Últimos checados
            </Text>
            {(q.data.last_checks ?? []).slice(0, 3).map((c) => (
              <Group key={c.id} justify="space-between" gap="xs" wrap="nowrap">
                <Text size="sm" truncate style={{ flex: 1 }}>
                  {c.name}
                </Text>
                <Badge size="xs" color={checkTypeColor(c.check_type)} variant="light">
                  {checkTypeLabel(c.check_type)}
                </Badge>
                <Text size="xs" c="dimmed" style={{ width: 84, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {c.time}
                </Text>
              </Group>
            ))}
            {(q.data.last_checks ?? []).length === 0 ? (
              <Text size="xs" c="dimmed">
                Sin registros todavía
              </Text>
            ) : null}
          </Stack>

          <Text size="xs" c="dimmed" mt="sm">
            Actualizado {fmtDateTime(q.data.generated_at)}
          </Text>
        </>
      ) : null}
    </Paper>
  );
}

export default function DisplayMonitorPage() {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState<'live' | 'connecting' | 'offline'>('connecting');
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const displaysRef = useRef<Display[]>([]);

  const displaysQuery = useQuery({ queryKey: ['displays'], queryFn: () => api.get<Display[]>('/admin/displays') });
  displaysRef.current = displaysQuery.data ?? [];
  const displays = displaysQuery.data ?? [];

  useEffect(() => {
    let alive = true;
    let seq = 0;
    const conn = connectEvents(
      '/admin/displays/live',
      (event, data) => {
        if (event !== 'check') return;
        const p = data as LiveCheckPayload;
        const list = displaysRef.current;
        const branchName = list.find((d) => d.branch_id === p.branch_id)?.branches?.name ?? null;
        const displayNames = list.filter((d) => p.displays.includes(d.id)).map((d) => d.name);
        if (alive) {
          seq += 1;
          setFeed((f) =>
            [
              {
                seq,
                name: p.check.name,
                check_type: p.check.check_type,
                full_time: p.check.full_time,
                branch_name: branchName,
                display_names: displayNames,
              },
              ...f,
            ].slice(0, 30)
          );
        }
        for (const d of list) {
          if (d.branch_id === p.branch_id) void queryClient.invalidateQueries({ queryKey: ['admin-display-snapshot', d.id] });
        }
      },
      (state) => {
        if (!alive) return;
        setConnected(state === 'open' ? 'live' : 'offline');
      }
    );
    return () => {
      alive = false;
      conn.close();
    };
  }, [queryClient]);

  const liveLabel =
    connected === 'live'
      ? { text: 'En vivo', color: 'green' as const }
      : connected === 'connecting'
        ? { text: 'Conectando…', color: 'yellow' as const }
        : { text: 'Desconectado', color: 'red' as const };

  return (
    <>
      <PageHeader
        title="Monitoreo en vivo"
        subtitle="Lo que se proyecta en las pantallas al checar entrada y salida"
        actions={
          <Badge
            size="lg"
            color={liveLabel.color}
            variant="light"
            leftSection={<IconBroadcast size={14} style={{ display: 'block', flexShrink: 0 }} />}
            style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
          >
            {liveLabel.text}
          </Badge>
        }
      />

      <Stack gap="lg">
        <Paper withBorder p="md">
          <Group justify="space-between" mb="xs">
            <Group gap="xs">
              <Title order={5}>Checados en vivo</Title>
              {connected === 'live' ? (
                <Badge size="sm" color="green" variant="filled">
                  {feed.length}
                </Badge>
              ) : null}
            </Group>
            <Button size="xs" variant="light" leftSection={<IconRefresh size={14} />} onClick={() => void queryClient.invalidateQueries()}>
              Refrescar
            </Button>
          </Group>

          {feed.length === 0 ? (
            <Text c="dimmed" size="sm">
              Esperando checados. Esto es lo que vería una pantalla al proyectar una entrada o salida.
            </Text>
          ) : (
            <Stack gap={6}>
              {feed.map((e) => (
                <Tooltip
                  key={e.seq}
                  label={e.display_names.length > 0 ? `Proyectado en: ${e.display_names.join(', ')}` : 'Sin pantallas en esa sucursal'}
                  openDelay={300}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Group gap="xs" wrap="nowrap" miw={0} style={{ flex: 1 }}>
                      <Badge size="sm" color={checkTypeColor(e.check_type)} variant="filled" style={{ width: 150 }} tt="none">
                        {checkTypeLabel(e.check_type)}
                      </Badge>
                      <Text size="sm" fw={600} truncate>
                        {e.name}
                      </Text>
                    </Group>
                    <Group gap="xs" wrap="nowrap">
                      <Text size="xs" c="dimmed">
                        {e.branch_name ?? '—'}
                      </Text>
                      <Text size="xs" fw={600} style={{ width: 84, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {e.full_time}
                      </Text>
                    </Group>
                  </Group>
                </Tooltip>
              ))}
            </Stack>
          )}
        </Paper>

        {displaysQuery.isLoading ? (
          <Loader />
        ) : displays.length === 0 ? (
          <Paper withBorder p="xl">
            <Text ta="center" c="dimmed">
              No hay pantallas registradas.
            </Text>
          </Paper>
        ) : (
          <>
            <Title order={4}>Pantallas</Title>
            <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="md">
              {displays.map((d) => (
                <DisplayBoard key={d.id} display={d} />
              ))}
            </SimpleGrid>
          </>
        )}
      </Stack>
    </>
  );
}
