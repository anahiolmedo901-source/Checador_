import { Card, Grid, Group, Loader, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useState } from 'react';
import { api } from '../lib/api';
import { DashboardSummary } from '../lib/types';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../lib/auth';
import { toDateKey } from '../lib/dates';

function StatCard({ label, value, color = 'brand', hint }: { label: string; value: string | number; color?: string; hint?: string }) {
  const c = color === 'blue' ? 'brand' : color;
  return (
    <Card withBorder style={{ borderLeft: `4px solid var(--mantine-color-${c}-6)` }}>
      <Text size="xs" fw={600} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.04em' }}>
        {label}
      </Text>
      <Text fz={30} fw={700} lh={1.2} mt={4}>
        {value}
      </Text>
      {hint ? <Text size="xs" c="dimmed">{hint}</Text> : null}
    </Card>
  );
}

export default function DashboardPage() {
  const [date, setDate] = useState<Date | null>(new Date());
  const { user, can } = useAuth();
  const day = toDateKey(date ?? new Date());

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', day],
    queryFn: () => api.get<DashboardSummary>(`/admin/dashboard?date=${day}`),
    enabled: can('attendance.read'),
  });

  const maxBar =
    data?.series?.reduce((m, d) => Math.max(m, d.present + Math.max(d.late, d.missing)), 1) ?? 1;

  return (
    <>
      <PageHeader
        title={user?.role === 'hr' ? 'Dashboard — Recursos Humanos' : 'Dashboard'}
        subtitle="Resumen de asistencia por día"
        actions={
          <DateInput
            value={date}
            onChange={setDate}
            label="Fecha"
            placeholder="Selecciona el día"
            valueFormat="DD/MM/YYYY"
            clearable
            maxDate={new Date()}
          />
        }
      />

      {isLoading ? (
        <Loader />
      ) : data ? (
        <>
          <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} spacing="md">
            <StatCard label="Empleados activos" value={data.counts.total} color="brand" />
            <StatCard label="Presentes" value={data.counts.present} color="green" />
            <StatCard label="Con retardo" value={data.counts.late} color="yellow" />
            <StatCard label="Justificadas" value={data.counts.excused} color="indigo" />
            <StatCard label="Faltas" value={data.counts.missing} color="red" />
            <StatCard label="Sesiones abiertas" value={data.counts.open_sessions} color="teal" />
          </SimpleGrid>

          <Paper withBorder p="md" mt="lg">
            <Title order={5} mb="md">
              Últimos 7 días
            </Title>
            <Grid align="flex-end">
              {data.series?.map((d) => (
                <Grid.Col span={Math.floor(12 / 7)} key={d.date}>
                  <Stack gap={4} justify="flex-end" style={{ height: 190 }}>
                    <Group gap={3} align="flex-end" style={{ flex: 1 }}>
                      <div
                        title={`${dayjs(d.date).format('DD/MM')} retardo: ${d.late}`}
                        style={{
                          flex: 1,
                          height: `${Math.max(2, (d.late / maxBar) * 100)}%`,
                          background: 'var(--mantine-color-yellow-5)',
                          borderTopLeftRadius: 3,
                        }}
                      />
                      <div
                        title={`${dayjs(d.date).format('DD/MM')} falta: ${d.missing}`}
                        style={{
                          flex: 1,
                          height: `${Math.max(2, (d.missing / maxBar) * 100)}%`,
                          background: 'var(--mantine-color-red-5)',
                          borderTopRightRadius: 3,
                        }}
                      />
                      <div
                        title={`${dayjs(d.date).format('DD/MM')} presente: ${d.present}`}
                        style={{
                          flex: 1,
                          height: `${Math.max(2, (d.present / maxBar) * 100)}%`,
                          background: 'var(--mantine-color-green-5)',
                          borderRadius: 3,
                        }}
                      />
                    </Group>
                    <Text size="xs" c="dimmed" ta="center">
                      {dayjs(d.date).format('DD/MM')}
                    </Text>
                  </Stack>
                </Grid.Col>
              ))}
            </Grid>
          </Paper>

          {can('attendance.read') ? (
            <Paper withBorder p="sm" mt="lg">
              <Title order={5} mb="sm">
                Colas por resolver
              </Title>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                {can('offtime.approve') ? (
                  <Card withBorder component={Link} to="/incidents" p="sm" style={{ textDecoration: 'none', minHeight: 76 }}>
                    <Group justify="space-between" align="center" wrap="nowrap" gap="sm" h="100%">
                      <Text size="sm" c="dimmed" style={{ flex: 1 }}>Permisos / vacaciones / incapacidades pendientes</Text>
                      <Text fz={24} fw={700} lh={1} c="yellow">{data.queues.pending_offtime}</Text>
                    </Group>
                  </Card>
                ) : (
                  <Card withBorder p="sm" style={{ minHeight: 76 }}>
                    <Group justify="space-between" align="center" wrap="nowrap" gap="sm" h="100%">
                      <Text size="sm" c="dimmed" style={{ flex: 1 }}>Permisos / vacaciones / incapacidades pendientes</Text>
                      <Text fz={24} fw={700} lh={1} c="yellow">{data.queues.pending_offtime}</Text>
                    </Group>
                  </Card>
                )}
                <Card withBorder p="sm" style={{ minHeight: 76 }}>
                  <Group justify="space-between" align="center" wrap="nowrap" gap="sm" h="100%">
                    <Text size="sm" c="dimmed" style={{ flex: 1 }}>Incidencias abiertas</Text>
                    <Text fz={24} fw={700} lh={1} c="orange">{data.queues.open_incidents}</Text>
                  </Group>
                </Card>
              </SimpleGrid>
            </Paper>
          ) : null}
        </>
      ) : null}
    </>
  );
}
