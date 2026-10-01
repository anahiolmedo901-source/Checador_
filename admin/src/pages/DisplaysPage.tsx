import {
  Badge,
  Box,
  Button,
  Code,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconKey, IconPlus, IconDeviceTv } from '@tabler/icons-react';
import { useState } from 'react';
import { api } from '../lib/api';
import { Display, DisplayToken } from '../lib/types';
import { PageHeader } from '../components/PageHeader';
import { useAuth } from '../lib/auth';
import { useBranches } from '../lib/queries';
import { fmtDateTime } from '../lib/format';

export default function DisplaysPage() {
  const { can } = useAuth();
  const canManage = can('displays.manage');
  const queryClient = useQueryClient();
  const [tokenFor, setTokenFor] = useState<Display | null>(null);
  const [tokens, setTokens] = useState<DisplayToken[]>([]);
  const [name, setName] = useState('');
  const [branchId, setBranchId] = useState('');
  const [newToken, setNewToken] = useState<{ token: string; display_id: string; token_id: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [pairingFor, setPairingFor] = useState<Display | null>(null);
  const [pairingCode, setPairingCode] = useState<{ code: string; expires_at: string } | null>(null);

  const { data: branches } = useBranches();

  const list = useQuery({ queryKey: ['displays'], queryFn: () => api.get<Display[]>('/admin/displays') });
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['displays'] });

  const loadTokens = async (display: Display) => {
    setTokenFor(display);
    setNewToken(null);
    const data = await api.get<DisplayToken[]>(`/admin/displays/${display.id}/tokens`);
    setTokens(data);
  };

  const create = useMutation({
    mutationFn: () => api.post<Display>('/admin/displays', { name, branch_id: branchId || null }),
    onSuccess: () => {
      notifications.show({ message: 'Pantalla creada', color: 'green' });
      setCreating(false);
      setName('');
      setBranchId('');
      invalidate();
    },
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  const toggleActive = useMutation({
    mutationFn: (d: Display) => api.patch(`/admin/displays/${d.id}/active`, { active: !d.is_active }),
    onSuccess: (_d, d) => {
      notifications.show({ message: d.is_active ? 'Pantalla desactivada' : 'Pantalla activada', color: 'green' });
      invalidate();
    },
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  const rotate = useMutation({
    mutationFn: () =>
      api.post<{ token: string; display_id: string; token_id: string }>(`/admin/displays/${tokenFor!.id}/token`),
    onSuccess: (data) => {
      setNewToken(data);
      void loadTokens(tokenFor!);
    },
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  const revoke = useMutation({
    mutationFn: (tokenId: string) =>
      api.del(`/admin/displays/${tokenFor!.id}/token`, { token_id: tokenId }),
    onSuccess: () => {
      notifications.show({ message: 'Token revocado', color: 'green' });
      void loadTokens(tokenFor!);
    },
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  const makePairingCode = useMutation({
    mutationFn: (display: Display) => api.post<{ code: string; expires_at: string }>(`/admin/displays/${display.id}/pairing-code`),
    onSuccess: (data, display) => {
      setPairingFor(display);
      setPairingCode(data);
    },
    onError: (err) => notifications.show({ message: (err as Error).message, color: 'red' }),
  });

  return (
    <>
      <PageHeader
        title="Pantallas"
        subtitle="Smart Displays (TV) que muestran la rotación de contenidos"
        actions={
          canManage ? (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)}>
              Nueva pantalla
            </Button>
          ) : undefined
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
                <Table.Th>Nombre</Table.Th>
                <Table.Th>Código</Table.Th>
                <Table.Th>Sucursal</Table.Th>
                <Table.Th>Estado</Table.Th>
                <Table.Th>Última conexión</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>Acciones</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(list.data ?? []).map((d) => (
                <Table.Tr key={d.id}>
                  <Table.Td><Text fw={600}>{d.name}</Text></Table.Td>
                  <Table.Td><Text size="sm" c="dimmed">{d.code}</Text></Table.Td>
                  <Table.Td>{d.branches?.name ?? '—'}</Table.Td>
                  <Table.Td>
                    <Badge color={!d.is_active ? 'gray' : d.status === 'online' ? 'green' : d.status === 'maintenance' ? 'yellow' : 'red'} variant="light">
                      {!d.is_active ? 'Inactiva' : d.status === 'online' ? 'En línea' : d.status === 'maintenance' ? 'Mantenimiento' : 'Desconectada'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{fmtDateTime(d.last_seen_at)}</Table.Td>
                  <Table.Td ta="right">
                    <Group gap={4} justify="flex-end">
                      {canManage ? (
                        <Button size="xs" variant="light" color="teal" leftSection={<IconDeviceTv size={14} />} loading={makePairingCode.isPending} onClick={() => makePairingCode.mutate(d)}>
                          Conectar TV
                        </Button>
                      ) : null}
                      <Button size="xs" variant="light" leftSection={<IconKey size={14} />} onClick={() => void loadTokens(d)}>
                        Tokens
                      </Button>
                      {canManage ? (
                        <Button
                          size="xs"
                          variant={d.is_active ? 'light' : 'filled'}
                          color={d.is_active ? 'red' : 'green'}
                          loading={toggleActive.isPending}
                          onClick={() => toggleActive.mutate(d)}
                        >
                          {d.is_active ? 'Desactivar' : 'Activar'}
                        </Button>
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

      {/* Crear */}
      <Modal opened={creating} onClose={() => setCreating(false)} title="Nueva pantalla" centered>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Stack gap="sm">
            <TextInput label="Nombre" withAsterisk placeholder="TV recepción" maxLength={120} value={name} onChange={(e) => setName(e.currentTarget.value)} error={name.length > 0 && name.trim().length < 3 ? 'Mínimo 3 caracteres.' : undefined} />
            <Select label="Sucursal" clearable placeholder="Global" data={(branches ?? []).map((b) => ({ value: b.id, label: b.name }))} value={branchId || null} onChange={(v) => setBranchId(v ?? '')} />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setCreating(false)}>Cancelar</Button>
              <Button type="submit" loading={create.isPending} disabled={name.trim().length < 3}>Crear</Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal opened={!!pairingFor} onClose={() => { setPairingFor(null); setPairingCode(null); }} title={`Conectar ${pairingFor?.name ?? 'pantalla'}`} centered>
        <Stack gap="sm">
          <Text size="sm">En la TV abre la pantalla Checador e ingresa este código. Se conecta automáticamente y vence en 10 minutos.</Text>
          {pairingCode ? <Code block ta="center" style={{ fontSize: 32, letterSpacing: 5 }}>{pairingCode.code}</Code> : <Loader />}
          {pairingCode ? <Text size="sm" c="dimmed">Vence: {fmtDateTime(pairingCode.expires_at)} · Este código solo se puede usar una vez.</Text> : null}
          <Text size="sm">La TV no necesita que escribas ni copies el token.</Text>
          <Group justify="flex-end"><Button onClick={() => { setPairingFor(null); setPairingCode(null); }}>Listo</Button></Group>
        </Stack>
      </Modal>

      {/* Tokens */}
      <Modal opened={!!tokenFor} onClose={() => setTokenFor(null)} title={`Tokens de ${tokenFor?.name ?? ''}`} centered size="lg">
        <Stack gap="md">
          {newToken ? (
            <Paper withBorder p="md" style={{ borderColor: 'var(--mantine-color-teal-4)' }}>
              <Title order={6} c="teal">Token nuevo (cópialo ahora)</Title>
              <Text size="sm">Se usa en la configuración de la TV con este comando en el canal:</Text>
              <Code block mt="sm" style={{ wordBreak: 'break-all' }}>
                {JSON.stringify({ display_id: newToken.display_id, token: newToken.token }, null, 2)}
              </Code>
              <Button size="xs" color="teal" mt="sm" onClick={() => setNewToken(null)}>Entendido</Button>
            </Paper>
          ) : null}

          {canManage ? (
            <Button leftSection={<IconKey size={16} />} loading={rotate.isPending} onClick={() => rotate.mutate()} variant="light" color="teal" w="fit-content">
              Rotar token (nuevo)
            </Button>
          ) : null}

          <Table.ScrollContainer minWidth={720}>
          <Table withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Estado</Table.Th>
                <Table.Th>Creado</Table.Th>
                <Table.Th>Último uso</Table.Th>
                {canManage ? <Table.Th style={{ textAlign: 'right' }}>Acción</Table.Th> : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {tokens.map((t) => (
                <Table.Tr key={t.id}>
                  <Table.Td><Badge color={t.active ? 'green' : 'red'} variant="light">{t.active ? 'Activo' : 'Revocado'}</Badge></Table.Td>
                  <Table.Td>{fmtDateTime(t.created_at)}</Table.Td>
                  <Table.Td>{fmtDateTime(t.last_used_at)}</Table.Td>
                  {canManage ? (
                    <Table.Td ta="right">
                      {t.active ? (
                        <Button size="xs" color="red" variant="light" loading={revoke.isPending} onClick={() => revoke.mutate(t.id)}>
                          Revocar
                        </Button>
                      ) : null}
                    </Table.Td>
                  ) : null}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          </Table.ScrollContainer>
        </Stack>
      </Modal>
    </>
  );
}
