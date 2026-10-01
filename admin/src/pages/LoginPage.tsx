import { Alert, Button, Card, Center, Group, PasswordInput, Stack, Text, TextInput, ThemeIcon, Title } from '@mantine/core';
import { IconClockHour4 } from '@tabler/icons-react';
import { useForm, zodResolver } from '@mantine/form';
import { z } from 'zod';
import { useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { notifications } from '@mantine/notifications';
import { useAuth } from '../lib/auth';

const schema = z.object({
  identifier: z.string().min(1, 'Ingresa tu clave o correo.'),
  password: z.string().min(1, 'Ingresa tu contraseña.'),
});

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const form = useForm({
    initialValues: { identifier: '', password: '' },
    validate: zodResolver(schema),
  });

  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  async function onSubmit(values: { identifier: string; password: string }) {
    setLoading(true);
    setError(null);
    try {
      const user = await login(values.identifier, values.password);
      if (user.role === 'employee') {
        navigate('/forbidden', { replace: true });
        return;
      }
      notifications.show({ message: `Bienvenido, ${user.employee.full_name}`, color: 'green' });
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Center mih="100dvh" p="md" className="login-bg">
      <Card w="100%" maw={400} p="xl" radius="md" className="login-card">
        <Stack gap="md">
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon size={44} radius="md" variant="filled" color="brand">
              <IconClockHour4 size={24} />
            </ThemeIcon>
            <div>
              <Title order={3} c="brand.8" style={{ lineHeight: 1.15 }}>
                Checador
              </Title>
              <Text c="dimmed" size="sm" fw={500}>
                Panel administrativo
              </Text>
            </div>
          </Group>
          {error ? <Alert color="red">{error}</Alert> : null}
          <form onSubmit={form.onSubmit(onSubmit)}>
            <Stack gap="sm">
              <TextInput
                label="Clave o correo"
                placeholder="Ej: EMP001"
                {...form.getInputProps('identifier')}
              />
              <PasswordInput label="Contraseña" placeholder="••••••••" {...form.getInputProps('password')} />
              <Button type="submit" loading={loading} fullWidth mt="sm">
                Iniciar sesión
              </Button>
            </Stack>
          </form>
        </Stack>
      </Card>
    </Center>
  );
}