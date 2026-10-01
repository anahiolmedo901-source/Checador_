import { Button, Group, Text } from '@mantine/core';

interface PagerProps {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
}

export function Pager({ page, totalPages, total, onChange }: PagerProps) {
  return (
    <Group justify="space-between" mt="md">
      <Text size="sm" c="dimmed">
        {total} resultado{total === 1 ? '' : 's'} · página {page} de {Math.max(1, totalPages)}
      </Text>
      <Group gap="xs">
        <Button variant="default" size="xs" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Anterior
        </Button>
        <Button variant="default" size="xs" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          Siguiente
        </Button>
      </Group>
    </Group>
  );
}