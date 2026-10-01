import { Badge, Box, Button, Card, Group, Image, Loader, Modal, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { z } from 'zod';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconEdit, IconPlayerPlay, IconPlus, IconUpload } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { api, qs } from '../lib/api';
import { MediaItem, PageResult } from '../lib/types';
import { PageHeader } from '../components/PageHeader';
import { Pager } from '../components/Pager';
import { useAuth } from '../lib/auth';
import { fmtDateTime } from '../lib/format';


const httpUrl = z
  .string()
  .trim()
  .url('Ingresa un enlace válido.')
  .refine((u) => /^https?:\/\//i.test(u), 'El enlace debe comenzar con http:// o https://');

const durationField = z.coerce.number({ invalid_type_error: 'Ingresa un número válido.' }).int('Debe ser un número entero.').min(1, 'Mínimo 1 segundo.').max(3600, 'Máximo 3600 segundos.');

const urlSchema = z.object({
  title: z.string().trim().min(1, 'Escribe un título.').max(160),
  url: httpUrl,
  duration_s: durationField,
});

// Al editar, los archivos subidos no tienen URL externa: se permite vacío.
const editSchema = z.object({
  title: z.string().trim().min(1, 'Escribe un título.').max(160),
  url: z.union([z.literal(''), httpUrl]),
  duration_s: durationField,
});

export default function MediaPage() {
  const { can } = useAuth();
  const canWrite = can('media.write');
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<MediaItem | null>(null);
  const [urlOpened, setUrlOpened] = useState(false);
  const [uploading, setUploading] = useState(false);

  const list = useQuery({
    queryKey: ['admin-media', page],
    queryFn: () => api.get<PageResult<MediaItem>>(`/admin/media?${qs({ page, limit: 24 })}`),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin-media'] });

  const editForm = useForm({ initialValues: { title: '', url: '', duration_s: 15 }, validate: zodResolver(editSchema) });
  const urlForm = useForm({ initialValues: { title: '', url: '', duration_s: 15 }, validate: zodResolver(urlSchema) });

  function openEdit(m: MediaItem) {
    setEditing(m);
    editForm.setValues({ title: m.title, url: m.url ?? '', duration_s: m.duration_s ?? 15 });
  }

  async function onUpload(file: File) {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name.replace(/\.[^.]+$/, ''));
      await api.upload<MediaItem>('/admin/media/upload', formData);
      notifications.show({ message: 'Multimedia subida', color: 'green' });
      invalidate();
    } catch (err) {
      notifications.show({ message: (err as Error).message, color: 'red' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const update = useMutation({
    mutationFn: (v: typeof editForm.values) =>
      api.patch<MediaItem>(`/admin/media/${editing!.id}`, {
        title: v.title,
        url: v.url || null,
        duration_s: Number(v.duration_s),
      }),
    onSuccess: () => {
      notifications.show({ message: 'Multimedia actualizada', color: 'green' });
      setEditing(null);
      invalidate();
    },
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  const createUrl = useMutation({
    mutationFn: (v: typeof urlForm.values) =>
      api.post<MediaItem>('/admin/media', { kind: 'url', title: v.title, url: v.url, duration_s: Number(v.duration_s) }),
    onSuccess: () => {
      notifications.show({ message: 'Enlace registrado', color: 'green' });
      setUrlOpened(false);
      urlForm.reset();
      invalidate();
    },
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  const toggle = useMutation({
    mutationFn: (m: MediaItem) => api.patch<MediaItem>(`/admin/media/${m.id}`, { active: !m.active }),
    onSuccess: () => invalidate(),
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  return (
    <>
      <PageHeader
        title="Multimedia"
        subtitle="Imágenes y videos para avisos y playlists de pantallas"
        actions={
          canWrite ? (
            <Group>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" hidden onChange={(e) => e.target.files?.[0] && void onUpload(e.target.files[0])} />
              <Button leftSection={<IconUpload size={16} />} loading={uploading} onClick={() => fileRef.current?.click()}>
                Subir archivo
              </Button>
              <Button variant="default" leftSection={<IconPlus size={16} />} onClick={() => setUrlOpened(true)}>
                Añadir enlace
              </Button>
            </Group>
          ) : undefined
        }
      />

      {list.isLoading ? (
        <Loader />
      ) : (
        <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 6 }} spacing="md">
          {(list.data?.data ?? []).map((m) => (
            <Card key={m.id} withBorder p="sm">
              {m.kind === 'image' && m.signed_url ? (
                <Image src={m.signed_url} h={110} fit="cover" radius="sm" fallbackSrc="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBkPSJNMTIgMkExMCAxMCAwIDEgMCAxMiAyMnYtMkE4IDggMCAwIDEgMTIgNHoiIGZpbGw9IiNiYmIiLz48L3N2Zz4=" />
              ) : m.kind === 'video' && m.signed_url ? (
                <Box h={110} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f3f5', borderRadius: 6 }}>
                  <IconPlayerPlay size={36} color="gray" />
                </Box>
              ) : (
                <Box h={110} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f3f5', borderRadius: 6 }}>
                  <IconPlayerPlay size={36} color="gray" />
                </Box>
              )}
              <Text size="sm" fw={600} mt="xs" lineClamp={1}>{m.title}</Text>
              <Group justify="space-between" mt={4}>
                <Badge size="xs" variant="light">{m.kind === 'url' ? 'Enlace' : m.kind}</Badge>
                <Badge size="xs" color={m.active ? 'green' : 'gray'} variant="light">{m.active ? 'Activo' : 'Inactivo'}</Badge>
              </Group>
              <Text size="xs" c="dimmed">{m.duration_s ? `${m.duration_s}s` : m.mime_type ?? ''} · {fmtDateTime(m.created_at)}</Text>
              {canWrite ? (
                <Group mt="sm" gap={4}>
                  <Button size="xs" variant="light" leftSection={<IconEdit size={14} />} onClick={() => openEdit(m)}>Editar</Button>
                  <Button size="xs" variant="subtle" color={m.active ? 'red' : 'green'} onClick={() => toggle.mutate(m)}>
                    {m.active ? 'Desactivar' : 'Activar'}
                  </Button>
                </Group>
              ) : null}
            </Card>
          ))}
        </SimpleGrid>
      )}

      <Pager page={page} totalPages={Math.max(1, Math.ceil((list.data?.total ?? 0) / 24))} total={list.data?.total ?? 0} onChange={setPage} />

      <Modal opened={urlOpened} onClose={() => setUrlOpened(false)} title="Añadir enlace de multimedia" centered>
        <form onSubmit={urlForm.onSubmit((v) => createUrl.mutate(v))}>
          <Stack gap="sm">
            <TextInput label="Título" withAsterisk {...urlForm.getInputProps('title')} />
            <TextInput label="URL" withAsterisk placeholder="https://…" {...urlForm.getInputProps('url')} />
            <TextInput label="Duración (s)" type="number" {...urlForm.getInputProps('duration_s')} />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setUrlOpened(false)}>Cancelar</Button>
              <Button type="submit" loading={createUrl.isPending}>Registrar</Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={!!editing} onClose={() => setEditing(null)} title={`Editar ${editing?.title ?? ''}`} centered>
        <form onSubmit={editForm.onSubmit((v) => update.mutate(v))}>
          <Stack gap="sm">
            <TextInput label="Título" {...editForm.getInputProps('title')} />
            <TextInput label="URL" {...editForm.getInputProps('url')} />
            <TextInput label="Duración (s)" type="number" {...editForm.getInputProps('duration_s')} />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button type="submit" loading={update.isPending}>Guardar</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}