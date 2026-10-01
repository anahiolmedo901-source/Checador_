import { AdminListScreen, ListRow } from '@/components/admin/list-screen';
import { useAdminList } from '@/hooks/use-admin-list';
import { supabase } from '@/lib/supabase';

interface MobileScheduleSummary {
  id: string;
  name: string;
  code: string;
  check_in: string;
  check_out: string;
  tolerance_min: number;
  break_min: number;
  active: boolean;
}

export default function AdminSchedulesScreen() {
  const list = useAdminList<MobileScheduleSummary>(async () => {
    const { data, error } = await supabase.rpc('mobile_admin_schedule_list');
    if (error) throw error;
    return (data as MobileScheduleSummary[] | null) ?? [];
  });

  const rows: ListRow[] = list.items.map((s) => ({
    key: s.id,
    title: s.name,
    subtitle: `${s.code} · ${s.check_in.slice(0, 5)}–${s.check_out.slice(0, 5)} · Tolerancia ${s.tolerance_min} min · Comida ${s.break_min} min`,
    badge: s.active ? { text: 'Activo', color: '#2E9E63' } : { text: 'Inactivo', color: '#B0B4BA' },
  }));

  return (
    <AdminListScreen
      title="Horarios"
      subtitle={`${list.items.length} horario(s)`}
      loading={list.loading}
      error={list.error}
      onRetry={list.reload}
      rows={rows}
      emptyText="No hay horarios registrados."
    />
  );
}
