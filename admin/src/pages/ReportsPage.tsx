import { Badge, Button, Group, Loader, Paper, Select, Table, Text } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { IconDownload } from '@tabler/icons-react';
import { useState } from 'react';
import { api, qs } from '../lib/api';
import { ReportByDayRow, ReportGroupResult } from '../lib/types';
import { PageHeader } from '../components/PageHeader';
import { exportCSV, exportExcel, exportPDF, ExportColumn } from '../lib/download';
import { fmtMinutes } from '../lib/format';
import { businessTodayDate, toDateKey } from '../lib/dates';
import { useBranches, useDepartments } from '../lib/queries';

const dayCols: ExportColumn<ReportByDayRow>[] = [
  { key: 'date', header: 'Fecha', get: (r) => new Date(r.date + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' }) },
  { key: 'present', header: 'Presentes' },
  { key: 'late', header: 'Con retardo' },
  { key: 'excused', header: 'Justificadas' },
  { key: 'missing', header: 'Faltas' },
  { key: 'minutes', header: 'Minutos', get: (r) => r.minutes },
  { key: 'hours', header: 'Horas', get: (r) => r.hours },
];

const dimCols: ExportColumn<ReportGroupResult>[] = [
  { key: 'name', header: 'Grupo' },
  { key: 'employees', header: 'Empleados' },
  { key: 'present', header: 'Presentes' },
  { key: 'late', header: 'Con retardo' },
  { key: 'excused', header: 'Justificadas' },
  { key: 'missing', header: 'Faltas' },
  { key: 'minutes', header: 'Minutos', get: (r) => r.minutes },
  { key: 'hours', header: 'Horas', get: (r) => r.hours },
];

export default function ReportsPage() {
  const [view, setView] = useState<'by-day' | 'by-employee' | 'by-department' | 'by-branch'>('by-day');
  const [from, setFrom] = useState(businessTodayDate());
  const [to, setTo] = useState(businessTodayDate());
  const [deptId, setDeptId] = useState('');
  const [branchId, setBranchId] = useState('');

  const { data: branches } = useBranches();
  const { data: departments } = useDepartments();

  const fmtFrom = toDateKey(from);
  const fmtTo = toDateKey(to);
  const dimension = view === 'by-employee' ? 'employee' : view === 'by-department' ? 'department' : 'branch';

  const byDay = useQuery({
    queryKey: ['report-by-day', fmtFrom, fmtTo, deptId, branchId],
    queryFn: () =>
      api.get<ReportByDayRow[]>(
        `/admin/reports/by-day?${qs({ from: fmtFrom, to: fmtTo, department_id: deptId || undefined, branch_id: branchId || undefined })}`
      ),
    enabled: view === 'by-day',
  });

  const byDim = useQuery({
    queryKey: ['report-by-dim', view, fmtFrom, fmtTo, deptId, branchId],
    queryFn: () =>
      api.get<ReportGroupResult[]>(
        `/admin/reports/by-dimension?${qs({
          from: fmtFrom,
          to: fmtTo,
          dimension,
          department_id: deptId || undefined,
          branch_id: branchId || undefined,
        })}`
      ),
    enabled: view !== 'by-day',
  });

  const subtitle = `${new Date(`${fmtFrom}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })} — ${new Date(`${fmtTo}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
  const isLoading = view === 'by-day' ? byDay.isLoading : byDim.isLoading;
  const rows = view === 'by-day' ? (byDay.data ?? []) : (byDim.data ?? []);
  const cols = view === 'by-day' ? dayCols : dimCols;
  const fileBase = `reporte-${dimension}-${fmtFrom}-${fmtTo}`;

  const byDayRows = byDay.data ?? [];
  const dimRows = byDim.data ?? [];
  const summary =
    view === 'by-day'
      ? byDayRows.reduce(
          (acc, r) => ({
            present: acc.present + r.present,
            late: acc.late + r.late,
            excused: acc.excused + r.excused,
            missing: acc.missing + r.missing,
          }),
          { present: 0, late: 0, excused: 0, missing: 0 }
        )
      : dimRows.reduce(
          (acc, r) => ({
            present: acc.present + r.present,
            late: acc.late + r.late,
            excused: acc.excused + r.excused,
            missing: acc.missing + r.missing,
          }),
          { present: 0, late: 0, excused: 0, missing: 0 }
        );

  return (
    <>
      <PageHeader
        title="Reportes"
        subtitle={subtitle}
        actions={
          <Group>
            <Button
              variant="default"
              leftSection={<IconDownload size={16} />}
              disabled={!rows.length}
              onClick={() => exportCSV(rows as never[], cols as never[], fileBase)}
            >
              CSV
            </Button>
            <Button
              variant="default"
              leftSection={<IconDownload size={16} />}
              disabled={!rows.length}
              onClick={() => void exportExcel(rows as never[], cols as never[], fileBase)}
            >
              Excel
            </Button>
            <Button
              variant="filled"
              leftSection={<IconDownload size={16} />}
              disabled={!rows.length}
              onClick={() => void exportPDF(rows as never[], cols as never[], fileBase, `Reporte de asistencia (${view})`, subtitle)}
            >
              PDF
            </Button>
          </Group>
        }
      />

      <Paper withBorder p="md" mb="md">
        <Group wrap="wrap" align="flex-end">
          <DateInput label="Desde" value={from} maxDate={to < businessTodayDate() ? to : businessTodayDate()} onChange={(d) => { if (!d) return; setFrom(d); if (d > to) setTo(d); }} valueFormat="DD/MM/YYYY" w={140} />
          <DateInput label="Hasta" value={to} minDate={from} maxDate={businessTodayDate()} onChange={(d) => { if (!d) return; setTo(d); if (d < from) setFrom(d); }} valueFormat="DD/MM/YYYY" w={140} />
          <Select label="Departamento" clearable data={(departments ?? []).map((d) => ({ value: d.id, label: d.name }))} value={deptId || null} onChange={(v) => setDeptId(v ?? '')} w={180} />
          <Select label="Sucursal" clearable data={(branches ?? []).map((b) => ({ value: b.id, label: b.name }))} value={branchId || null} onChange={(v) => setBranchId(v ?? '')} w={180} />
          <Group gap="xs">
            <Button size="xs" variant={view === 'by-day' ? 'filled' : 'default'} onClick={() => setView('by-day')}>Por día</Button>
            <Button size="xs" variant={view === 'by-employee' ? 'filled' : 'default'} onClick={() => setView('by-employee')}>Por empleado</Button>
            <Button size="xs" variant={view === 'by-department' ? 'filled' : 'default'} onClick={() => setView('by-department')}>Por departamento</Button>
            <Button size="xs" variant={view === 'by-branch' ? 'filled' : 'default'} onClick={() => setView('by-branch')}>Por sucursal</Button>
          </Group>
        </Group>
      </Paper>

      <Paper withBorder p="md" mb="md">
        <Group gap="xl" wrap="wrap">
          <div><Text size="xs" c="dimmed">Presentes</Text><Text fw={700} c="green">{summary.present}</Text></div>
          <div><Text size="xs" c="dimmed">Con retardo</Text><Text fw={700} c="yellow">{summary.late}</Text></div>
          <div><Text size="xs" c="dimmed">Justificadas</Text><Text fw={700} c="blue">{summary.excused}</Text></div>
          <div><Text size="xs" c="dimmed">Faltas</Text><Text fw={700} c="red">{summary.missing}</Text></div>
        </Group>
      </Paper>

      {isLoading ? (
        <Loader />
      ) : (
        <Paper withBorder>
          <Table.ScrollContainer minWidth={720}>
          <Table striped highlightOnHover horizontalSpacing="md" verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                {cols.map((c) => (
                  <Table.Th key={String(c.key)}>{c.header}</Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(rows as ReportGroupResult[]).map((r, i) => (
                <Table.Tr key={i}>
                  {view === 'by-day' ? (
                    <>
                      <Table.Td><Text fw={600}>{new Date((r as unknown as ReportByDayRow).date + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })}</Text></Table.Td>
                      <Table.Td>{r.present}</Table.Td>
                      <Table.Td><Badge color="yellow" variant="light">{r.late}</Badge></Table.Td>
                      <Table.Td>{r.excused}</Table.Td>
                      <Table.Td><Badge color="red" variant="light">{r.missing}</Badge></Table.Td>
                      <Table.Td>{fmtMinutes(r.minutes)}</Table.Td>
                      <Table.Td>{r.hours}</Table.Td>
                    </>
                  ) : (
                    <>
                      <Table.Td><Text fw={600}>{r.name}</Text></Table.Td>
                      <Table.Td>{r.employees}</Table.Td>
                      <Table.Td>{r.present}</Table.Td>
                      <Table.Td><Badge color="yellow" variant="light">{r.late}</Badge></Table.Td>
                      <Table.Td>{r.excused}</Table.Td>
                      <Table.Td><Badge color="red" variant="light">{r.missing}</Badge></Table.Td>
                      <Table.Td>{fmtMinutes(r.minutes)}</Table.Td>
                      <Table.Td>{r.hours}</Table.Td>
                    </>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          </Table.ScrollContainer>
        </Paper>
      )}
    </>
  );
}
