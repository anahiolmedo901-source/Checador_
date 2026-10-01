import { Container, Stack, Text, Title } from '@mantine/core';

export default function ForbiddenPage() {
  return (
    <Container size="sm" py="xl">
      <Stack align="center" gap="sm">
        <Title order={2} c="red">
          Acceso denegado
        </Title>
        <Text c="dimmed" ta="center">
          Tu usuario no tiene permisos para acceder al panel administrativo.
          <br />
          Si crees que es un error, contacta al administrador del sistema.
        </Text>
      </Stack>
    </Container>
  );
}