import { createTheme, MantineProvider, type MantineColorsTuple } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IconProps } from '@tabler/icons-react';

const brand: MantineColorsTuple = [
  '#EEF3F9', '#DCE6F2', '#B9CDE4', '#93B0D2', '#6D93C0',
  '#4A78AD', '#2F5F96', '#254D7B', '#1C3B60', '#142B47',
];

const theme = createTheme({
  colors: { brand },
  primaryColor: 'brand',
  primaryShade: { light: 6, dark: 5 },
  autoContrast: true,
  defaultRadius: 'md',
  fontFamily:
    'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  headings: { fontWeight: '700', fontFamily: 'Inter, -apple-system, "Segoe UI", Roboto, sans-serif' },
  components: {
    Button: { defaultProps: { fw: 600 } },
    Badge: { defaultProps: { fw: 600, variant: 'light' } },
    Paper: { defaultProps: { radius: 'md' } },
    Card: { defaultProps: { radius: 'md' } },
    Modal: { defaultProps: { overlayProps: { backgroundOpacity: 0.4 }, radius: 'md', shadow: 'md' } },
    Drawer: { defaultProps: { overlayProps: { backgroundOpacity: 0.4 }, shadow: 'md' } },
    TextInput: { defaultProps: { size: 'sm' }, styles: { label: { fontWeight: 600, marginBottom: 4, fontSize: 13 } } },
    PasswordInput: { styles: { label: { fontWeight: 600, marginBottom: 4, fontSize: 13 } } },
    Select: { styles: { label: { fontWeight: 600, marginBottom: 4, fontSize: 13 } } },
    DateInput: { styles: { label: { fontWeight: 600, marginBottom: 4, fontSize: 13 } } },
    Textarea: { styles: { label: { fontWeight: 600, marginBottom: 4, fontSize: 13 } } },
    NumberInput: { styles: { label: { fontWeight: 600, marginBottom: 4, fontSize: 13 } } },
  },
});

export type IconType = React.ComponentType<IconProps>;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={theme}>
        <Notifications position="top-right" />
        {children}
      </MantineProvider>
    </QueryClientProvider>
  );
}