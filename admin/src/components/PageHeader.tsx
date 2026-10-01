import { Group, Paper, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <Paper mb="md" p="md" className="page-header">
      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
        <div>
          <Title order={3} className="page-header__title">
            {title}
          </Title>
          {subtitle ? (
            <Text size="sm" c="dimmed" fw={500}>
              {subtitle}
            </Text>
          ) : null}
        </div>
        {actions ? <Group gap="xs">{actions}</Group> : null}
      </Group>
    </Paper>
  );
}
