import { Redirect } from 'expo-router';

import { useAuth } from '@/context/auth-context';

export default function IndexRedirect() {
  const { status } = useAuth();
  if (status === 'loading') return null;
  return <Redirect href={status === 'signedIn' ? '/(tabs)' : '/login'} />;
}