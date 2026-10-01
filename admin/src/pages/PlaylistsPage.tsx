import { ActionIcon, Badge, Button, Group, Loader, Paper, Select, Table, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { api } from '../lib/api';
import { Announcement, Display, MediaItem, PlaylistItem } from '../lib/types';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../lib/auth';

export default function PlaylistsPage() {
  const { can } = useAuth();
  const canWrite = can('media.write');
  const queryClient = useQueryClient();
  const [displayId, setDisplayId] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [itemType, setItemType] = useState<'announcement' | 'media'>('announcement');
  const [itemId, setItemId] = useState('');
  const [duration, setDuration] = useState(15);

  const displays = useQuery({ queryKey: ['displays'], queryFn: () => api.get<Display[]>('/admin/displays') });
  const announcements = useQuery({ queryKey: ['admin-announcements', 'all'], queryFn: () => api.get<{ data: Announcement[] }>('/admin/announcements?limit=100') });
  const media = useQuery({ queryKey: ['admin-media', 'all'], queryFn: () => api.get<{ data: MediaItem[] }>('/admin/media?limit=100') });

  const items = useQuery({
    queryKey: ['playlists', displayId],
    queryFn: () => api.get<PlaylistItem[]>(`/admin/playlists?display_id=${displayId}`),
    enabled: !!displayId,
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['playlists', displayId] });

  const addItem = useMutation({
    mutationFn: () =>
      api.post('/admin/playlists', { display_id: displayId, item_type: itemType, item_id: itemId, duration_s: duration }),
    onSuccess: () => {
      notifications.show({ message: 'Ítem agregado a la playlist', color: 'green' });
      setAddOpen(false);
      setItemId('');
      invalidate();
    },
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  const move = useMutation({
    mutationFn: (args: { item: PlaylistItem; dir: 1 | -1 }) => {
      const sorted = [...(items.data ?? [])].sort((a, b) => a.position - b.position);
      const idx = sorted.findIndex((i) => i.id === args.item.id);
      const swap = sorted[idx + args.dir];
      if (!swap) throw new Error('No hay posición destino.');
      const patches = [
        api.patch(`/admin/playlists/items/${args.item.id}`, { position: swap.position }),
        api.patch(`/admin/playlists/items/${swap.id}`, { position: args.item.position }),
      ];
      return Promise.all(patches);
    },
    onSuccess: () => invalidate(),
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  const remove = useMutation({
    mutationFn: (itemId: string) => api.del(`/admin/playlists/items/${itemId}`),
    onSuccess: () => {
      notifications.show({ message: 'Ítem eliminado', color: 'green' });
      invalidate();
    },
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  const selectedDisplays = (displays.data ?? []).filter((d) => d.is_active);
  const announcementOptions = (announcements.data?.data ?? []).filter((a) => a.active).map((a) => ({ value: a.id, label: a.title }));
  const mediaOptions = (media.data?.data ?? []).filter((m) => m.active).map((m) => ({ value: m.id, label: `${m.title} (${m.kind})` }));

  return (
    <>
      <PageHeader
        title="Playlists"
        subtitle="Rotación de estadísticas, avisos y multimedia por pantalla"
        actions={
          <Select
            placeholder="Elige una pantalla"
            searchable
            data={selectedDisplays.map((d) => ({ value: d.id, label: d.name }))}
            value={displayId || null}
            onChange={(v) => setDisplayId(v ?? '')}
            w={240}
          />
        }
      />

      {!displayId ? (
        <Paper withBorder p="xl" ta="center">
          <Text c="dimmed">Selecciona una pantalla para ver su playlist.</Text>
        </Paper>
      ) : items.isLoading ? (
        <Loader />
      ) : (
        <Paper withBorder>
          <Table.ScrollContainer minWidth={720}>
          <Table striped highlightOnHover horizontalSpacing="md" verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>#</Table.Th>
                <Table.Th>Ítem</Table.Th>
                <Table.Th>Tipo</Table.Th>
                <Table.Th>Duración</Table.Th>
                <Table.Th>Estatus</Table.Th>
                {canWrite ? <Table.Th style={{ textAlign: 'right' }}>Acciones</Table.Th> : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(items.data ?? []).map((it, i) => (
                <Table.Tr key={it.id}>
                  <Table.Td>{i + 1}</Table.Td>
                  <Table.Td><Text fw={600}>{it.item_title ?? it.item_id}</Text></Table.Td>
                  <Table.Td>
                    <Badge variant="light" color={it.item_type === 'stats' ? 'teal' : it.item_kind === 'announcement' ? 'blue' : 'grape'}>
                      {it.item_type === 'stats' ? 'Estadísticas' : it.item_kind === 'announcement' ? 'Aviso' : 'Multimedia'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{it.duration_s}s</Table.Td>
                  <Table.Td><Badge color={it.active ? 'green' : 'gray'} variant="light">{it.active ? 'Activo' : 'Inactivo'}</Badge></Table.Td>
                  {canWrite ? (
                    <Table.Td ta="right">
                      <Group gap={4} justify="flex-end">
                        <ActionIcon size="sm" variant="light" disabled={i === 0} onClick={() => move.mutate({ item: it, dir: -1 })}>
                          <IconArrowUp size={14} />
                        </ActionIcon>
                        <ActionIcon size="sm" variant="light" disabled={i === (items.data?.length ?? 1) - 1} onClick={() => move.mutate({ item: it, dir: 1 })}>
                          <IconArrowDown size={14} />
                        </ActionIcon>
                        <ActionIcon size="sm" color="red" variant="light" loading={remove.isPending} onClick={() => remove.mutate(it.id)}>
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  ) : null}
                </Table.Tr>
              ))}
              {(items.data ?? []).length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={6} ta="center" c="dimmed">
                    Playlist vacía. Agrega estadísticas (automáticas) o ítems manuales.
                  </Table.Td>
                </Table.Tr>
              ) : null}
            </Table.Tbody>
          </Table>
          </Table.ScrollContainer>
        </Paper>
      )}

      {canWrite && displayId ? (
        <Group mt="md">
          <Button leftSection={<IconPlus size={16} />} onClick={() => setAddOpen(true)} disabled={!displayId}>
            Agregar ítem
          </Button>
        </Group>
      ) : null}

      {addOpen ? (
        <Paper withBorder p="md" mt="md">
          <Text fw={600} mb="sm">Agregar a la playlist</Text>
          <Group align="flex-end" wrap="wrap">
            <Select
              label="Tipo"
              data={[
                { value: 'announcement', label: 'Aviso' },
                { value: 'media', label: 'Multimedia' },
              ]}
              value={itemType}
              onChange={(v) => {
                setItemType((v as 'announcement') ?? 'announcement');
                setItemId('');
              }}
              w={140}
            />
            <Select
              label={itemType === 'announcement' ? 'Aviso' : 'Multimedia'}
              searchable
              data={itemType === 'announcement' ? announcementOptions : mediaOptions}
              value={itemId || null}
              onChange={(v) => setItemId(v ?? '')}
              w={280}
            />
            <TextInput label="Duración (s)" type="number" value={duration} onChange={(e) => setDuration(Number(e.currentTarget.value))} w={110} />
            <Button loading={addItem.isPending} disabled={!itemId || !duration} onClick={() => addItem.mutate()}>
              Agregar
            </Button>
            <Button variant="default" onClick={() => setAddOpen(false)}>Cancelar</Button>
          </Group>
          <Text size="xs" c="dimmed" mt="sm">
            Las estadísticas (📍 empleados actuales, 🕒 hora del día y estado de checadas) se rotan automáticamente; no se agregan manualmente.
          </Text>
        </Paper>
      ) : null}
    </>
  );
}