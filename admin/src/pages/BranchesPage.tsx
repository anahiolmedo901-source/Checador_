import { Badge, Box, Button, Group, Loader, Modal, NumberInput, Paper, Stack, Table, Text, TextInput } from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IconCurrentLocation, IconEdit, IconExternalLink, IconMapPin, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { z } from 'zod';
import { api } from '../lib/api';
import { Branch } from '../lib/types';
import { PageHeader } from '../components/PageHeader';
import { ConfirmModal, ConfirmState } from '../components/ConfirmModal';
import { useAuth } from '../lib/auth';
import { useBranches } from '../lib/queries';

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().max(200).optional(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  radius_m: z.number().int().min(0).max(5000),
});

export default function BranchesPage() {
  const { can } = useAuth();
  const canWrite = can('branches.write');
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Branch | null>(null);
  const [opened, setOpened] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>({ open: false, title: '', message: '', onConfirm: () => undefined });

  const list = useBranches();

  const [geocoding, setGeocoding] = useState(false);

  // Nominatim devuelve puntos de OpenStreetMap que a veces difieren de Google Maps y del GPS.
  // Preferimos los resultados puntuales (dirección exacta) sobre municipios/estados/país.
  function pickBestGeocode(results: { lat: string; lon: string; type?: string }[]) {
    const vague = new Set(['city', 'state', 'country', 'county', 'municipality', 'province', 'region', 'postcode']);
    return (
      results.find((r) => r.type && !vague.has(r.type)) ??
      results[0] ??
      undefined
    );
  }

  async function geocodeAddress() {
    const addr = form.values.address?.trim();
    if (!addr) {
      notifications.show({ message: 'Escribe una dirección primero', color: 'yellow' });
      return;
    }
    setGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&dedupe=1&q=${encodeURIComponent(addr)}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) throw new Error('No se pudo contactar el servicio de geocodificación');
      const results = (await res.json()) as { lat: string; lon: string; type?: string }[];
      const hit = Array.isArray(results) ? pickBestGeocode(results) : undefined;
      if (!hit) {
        notifications.show({ message: 'No se encontró la dirección. Ajusta las coordenadas manualmente.', color: 'yellow' });
        return;
      }
      form.setFieldValue('lat', Number(Number.parseFloat(hit.lat).toFixed(6)));
      form.setFieldValue('lon', Number(Number.parseFloat(hit.lon).toFixed(6)));
      notifications.show({
        message: `Coordenadas desde la dirección (OSM): ${hit.lat.substr(0, 8)}, ${hit.lon.substr(0, 8)}`,
        color: 'green',
      });
    } catch (err) {
      notifications.show({ message: (err as Error).message, color: 'red' });
    } finally {
      setGeocoding(false);
    }
  }

  function useCurrentLocation() {
    if (!('geolocation' in navigator)) {
      notifications.show({ message: 'Tu navegador no soporta ubicación (usa localhost/HTTPS).', color: 'red' });
      return;
    }
    setGeocoding(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        form.setFieldValue('lat', Number(pos.coords.latitude.toFixed(6)));
        form.setFieldValue('lon', Number(pos.coords.longitude.toFixed(6)));
        notifications.show({
          message: `Ubicación real del dispositivo (GPS) ±${Math.round(pos.coords.accuracy)} m`,
          color: 'green',
        });
        setGeocoding(false);
      },
      (err) => {
        setGeocoding(false);
        notifications.show({ message: `No se pudo obtener tu ubicación (${err.message})`, color: 'red' });
      },
      // High-accuracy GPS with a zero-age cache often expires on desktop and indoors.
      { enableHighAccuracy: false, timeout: 30000, maximumAge: 120000 }
    );
  }

  const form = useForm({
    initialValues: { name: '', address: '', lat: 19.4326, lon: -99.1332, radius_m: 200 },
    validate: zodResolver(schema),
  });

  function openEdit(b?: Branch) {
    setEditing(b ?? null);
    form.setValues(
      b
        ? { name: b.name, address: b.address ?? '', lat: b.lat, lon: b.lon, radius_m: b.radius_m }
        : { name: '', address: '', lat: 19.4326, lon: -99.1332, radius_m: 200 }
    );
    setOpened(true);
  }

  const mutate = useMutation({
    mutationFn: (v: typeof form.values) =>
      editing
        ? api.patch<Branch>(`/branches/${editing.id}`, v)
        : api.post<Branch>('/branches', { ...v, address: v.address || null }),
    onSuccess: () => {
      notifications.show({ message: editing ? 'Sucursal actualizada' : 'Sucursal creada', color: 'green' });
      setOpened(false);
      void queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  const toggle = useMutation({
    mutationFn: (b: Branch) => api.patch<Branch>(`/branches/${b.id}`, { active: !b.active }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['branches'] }),
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  const remove = useMutation({
    mutationFn: (b: Branch) => api.del(`/branches/${b.id}`),
    onSuccess: (_data, b) => {
      notifications.show({ message: `Sucursal ${b.name} eliminada`, color: 'green' });
      void queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  return (
    <>
      <PageHeader
        title="Sucursales"
        subtitle="Ubicaciones y radio de geocercas"
        actions={canWrite ? <Button leftSection={<IconPlus size={16} />} onClick={() => openEdit()}>Nueva sucursal</Button> : undefined}
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
                <Table.Th>Dirección</Table.Th>
                <Table.Th>Coordenadas</Table.Th>
                <Table.Th>Radio</Table.Th>
                <Table.Th>Estatus</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Acciones</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(list.data ?? []).map((b) => (
                <Table.Tr key={b.id}>
                  <Table.Td><Text fw={600}>{b.name}</Text></Table.Td>
                  <Table.Td>{b.address ?? '—'}</Table.Td>
                  <Table.Td>{b.lat.toFixed(5)}, {b.lon.toFixed(5)}</Table.Td>
                  <Table.Td>{b.radius_m} m</Table.Td>
                  <Table.Td>
                    <Badge color={b.active ? 'green' : 'gray'} variant="light">{b.active ? 'Activa' : 'Inactiva'}</Badge>
                  </Table.Td>
                  <Table.Td ta="right">
                    {canWrite ? (
                      <Group gap={4} justify="flex-end">
                        <Button size="xs" variant="light" leftSection={<IconEdit size={14} />} onClick={() => openEdit(b)}>Editar</Button>
                        <Button
                          size="xs"
                          variant={b.active ? 'light' : 'filled'}
                          color={b.active ? 'red' : 'green'}
                          onClick={() =>
                            b.active
                              ? setConfirm({
                                  open: true,
                                  title: 'Desactivar sucursal',
                                  message: `¿Desactivar ${b.name}? Los empleados ya no podrán checar en esta sucursal.`,
                                  confirmLabel: 'Desactivar',
                                  onConfirm: () => void toggle.mutateAsync(b),
                                })
                              : toggle.mutate(b)
                          }
                        >
                          {b.active ? 'Desactivar' : 'Activar'}
                        </Button>
                        <Button
                          size="xs"
                          variant="light"
                          color="red"
                          leftSection={<IconTrash size={14} />}
                          onClick={() => setConfirm({
                            open: true,
                            title: 'Eliminar sucursal',
                            message: `¿Eliminar ${b.name}? Esta acción no se puede deshacer. Si tiene empleados, pantallas o asistencias asociadas, el sistema impedirá eliminarla.`,
                            confirmLabel: 'Eliminar',
                            onConfirm: async () => {
                              await remove.mutateAsync(b);
                              setConfirm((current) => ({ ...current, open: false }));
                            },
                          })}
                        >
                          Eliminar
                        </Button>
                      </Group>
                    ) : null}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      <Modal opened={opened} onClose={() => setOpened(false)} title={editing ? `Editar ${editing.name}` : 'Nueva sucursal'} centered>
        <form onSubmit={form.onSubmit((v) => mutate.mutate(v))}>
          <Stack gap="sm">
            <TextInput label="Nombre" {...form.getInputProps('name')} />
            <TextInput label="Dirección" {...form.getInputProps('address')} />
            <Group justify="space-between" align="center">
              <Button
                size="xs"
                variant="light"
                leftSection={<IconMapPin size={14} />}
                loading={geocoding}
                onClick={geocodeAddress}
              >
                Buscar por dirección (OSM)
              </Button>
              <Button
                size="xs"
                variant="light"
                color="teal"
                leftSection={<IconCurrentLocation size={14} />}
                loading={geocoding}
                onClick={useCurrentLocation}
              >
                Usar mi ubicación actual (GPS real)
              </Button>
              <Button
                size="xs"
                variant="outline"
                leftSection={<IconExternalLink size={14} />}
                component="a"
                target="_blank"
                rel="noreferrer"
                href={`https://www.google.com/maps?q=${form.values.lat},${form.values.lon}`}
              >
                Ver ubicación en Google Maps
              </Button>
            </Group>
            <Text size="xs" c="dimmed">
              Google Maps y OSM pueden diferir algunos metros. Lo ideal es pararse en el local y usar
              “Usar mi ubicación actual (GPS real)”; así las coordenadas coinciden con las del teléfono al checar.
            </Text>
            <Group grow>
              <NumberInput label="Latitud" decimalScale={6} {...form.getInputProps('lat')} />
              <NumberInput label="Longitud" decimalScale={6} {...form.getInputProps('lon')} />
              <NumberInput label="Radio (m)" {...form.getInputProps('radius_m')} />
            </Group>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setOpened(false)}>Cancelar</Button>
              <Button type="submit" loading={mutate.isPending}>{editing ? 'Guardar' : 'Crear'}</Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <ConfirmModal state={confirm} onClose={() => setConfirm((c) => ({ ...c, open: false }))} />
    </>
  );
}
