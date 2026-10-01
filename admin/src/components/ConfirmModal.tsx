import { Button, Group, Modal, Text } from '@mantine/core';

export interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  color?: 'red' | 'blue' | 'yellow' | 'green';
  onConfirm: () => void | Promise<void>;
}

export function ConfirmModal({ state, onClose }: { state: ConfirmState; onClose: () => void }) {
  return (
    <Modal opened={state.open} onClose={onClose} title={state.title} centered>
      <Text size="sm" mb="lg">
        {state.message}
      </Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          color={state.color ?? 'red'}
          loading={false}
          onClick={() => {
            void state.onConfirm();
          }}
        >
          {state.confirmLabel ?? 'Confirmar'}
        </Button>
      </Group>
    </Modal>
  );
}