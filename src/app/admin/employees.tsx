import { AdminListScreen, ListRow } from '@/components/admin/list-screen';
import { useAdminList } from '@/hooks/use-admin-list';
import { supabase } from '@/lib/supabase';

const ROLE_COLOR: Record<string, string> = {
  admin: '#B93A3A',
  hr: '#8E5CE6',
  employee: '#2F5F96',
};

interface MobileEmployeeSummary {
  id: string;
  code: string;
  full_name: string;
  role: 'admin' | 'hr' | 'employee';
  department_name: string | null;
  active: boolean;
}

export default function AdminEmployeesScreen() {
  const list = useAdminList<MobileEmployeeSummary>(async (search) => {
    const { data, error } = await supabase.rpc('mobile_admin_employee_list', {
      p_search: search.trim() || null,
      p_limit: 100,
    });
    if (error) throw error;
    return (data as MobileEmployeeSummary[] | null) ?? [];
  });

  const rows: ListRow[] = list.items.map((emp) => ({
    key: emp.id,
    title: emp.full_name,
    subtitle: `${emp.code} · ${emp.department_name ?? 'Sin departamento'}`,
    badge: {
      text: emp.role === 'admin' ? 'Administrador' : emp.role === 'hr' ? 'Recursos humanos' : 'Empleado',
      color: ROLE_COLOR[emp.role] ?? '#2F5F96',
    },
  }));

  return (
    <AdminListScreen
      title="Empleados"
      subtitle={`${list.items.length} empleado(s)`}
      loading={list.loading}
      error={list.error}
      onRetry={list.reload}
      rows={rows}
      emptyText="No hay empleados activos registrados."
      search={list.search}
      onSearchChange={list.setSearch}
      searchPlaceholder="Buscar por nombre o código…"
    />
  );
}
