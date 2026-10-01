import { supabaseAdmin } from '../config/supabase';
import {
  AdminAttendanceRow,
  AnnouncementRow,
  AuditLogRow,
  AttendanceDayRow,
  DeviceRow,
  DisplayRow,
  EmployeeWithRelations,
  IncidentRow,
  MediaRow,
  OfftimeRequestRow,
} from '../types';
import { throwPostgrest } from '../utils/postgrest-error';

// ---------- RPCs de 0010 ----------

export const adminRpc = {
  async dashboardSummary(date: string): Promise<Record<string, unknown>> {
    return extract(await supabaseAdmin.rpc('admin_dashboard_summary', { p_date: date }));
  },

  async attendanceSearch(args: {
    from: string;
    to: string;
    employeeId?: string;
    departmentId?: string;
    branchId?: string;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ total: number; rows: AdminAttendanceRow[] }> {
    return extract(
      await supabaseAdmin.rpc('admin_attendance_search', {
        p_from: args.from,
        p_to: args.to,
        p_employee_id: args.employeeId ?? null,
        p_department_id: args.departmentId ?? null,
        p_branch_id: args.branchId ?? null,
        p_status: args.status ? (args.status === 'all' ? 'all' : args.status) : 'all',
        p_search: args.search ?? null,
        p_limit: args.limit ?? 50,
        p_offset: args.offset ?? 0,
      })
    );
  },

  async attendanceDetail(sessionId: string): Promise<{ session: Record<string, unknown>; events: any[]; evidence: any[] }> {
    return extract(await supabaseAdmin.rpc('admin_attendance_detail', { p_session_id: sessionId }));
  },

  async editAttendance(args: {
    eventId: string;
    happenedAt?: string | null;
    status?: string | null;
    motivo: string;
    actorId: string;
  }): Promise<Record<string, unknown>> {
    return extract(
      await supabaseAdmin.rpc('admin_edit_attendance', {
        p_event_id: args.eventId,
        p_happened_at: args.happenedAt ?? null,
        p_status: args.status ?? null,
        p_motivo: args.motivo,
        p_actor_id: args.actorId,
      })
    );
  },

  async createOff(args: {
    employeeId: string;
    offType: string;
    startsOn: string;
    endsOn: string;
    reason: string;
    actorId: string;
  }): Promise<Record<string, unknown>> {
    return extract(
      await supabaseAdmin.rpc('admin_create_off', {
        p_employee_id: args.employeeId,
        p_off_type: args.offType as never,
        p_starts_on: args.startsOn,
        p_ends_on: args.endsOn,
        p_reason: args.reason,
        p_actor_id: args.actorId,
      })
    );
  },

  async reviewOff(args: { requestId: string; approved: boolean; note?: string | null; actorId: string }): Promise<Record<string, unknown>> {
    return extract(
      await supabaseAdmin.rpc('admin_review_off', {
        p_request_id: args.requestId,
        p_approved: args.approved,
        p_note: args.note ?? null,
        p_actor_id: args.actorId,
      })
    );
  },

  async createIncident(args: {
    employeeId: string;
    incidentType: string;
    severity: string;
    detail: Record<string, unknown>;
    actorId: string;
  }): Promise<Record<string, unknown>> {
    return extract(
      await supabaseAdmin.rpc('admin_create_incident', {
        p_employee_id: args.employeeId,
        p_incident_type: args.incidentType as never,
        p_severity: args.severity,
        p_detail: args.detail,
        p_actor_id: args.actorId,
      })
    );
  },

  async resolveIncident(args: { incidentId: string; note?: string | null; actorId: string }): Promise<Record<string, unknown>> {
    return extract(
      await supabaseAdmin.rpc('admin_resolve_incident', {
        p_incident_id: args.incidentId,
        p_note: args.note ?? null,
        p_actor_id: args.actorId,
      })
    );
  },

  async setDisplayActive(args: { displayId: string; active: boolean; actorId: string }): Promise<Record<string, unknown>> {
    return extract(
      await supabaseAdmin.rpc('admin_set_display_active', {
        p_display_id: args.displayId,
        p_active: args.active,
        p_actor_id: args.actorId,
      })
    );
  },

  async rotateDisplayToken(displayId: string): Promise<{ token: string; display_id: string; token_id: string }> {
    return extract(await supabaseAdmin.rpc('display_token_rotate', { p_display_id: displayId }));
  },

  async revokeDisplayToken(tokenId: string): Promise<boolean> {
    await supabaseAdmin.rpc('display_token_revoke', { p_token_id: tokenId });
    return true;
  },
};

function extract<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throwPostgrest(error as never);
  if (data === null || data === undefined) throw new Error('La operación no devolvió datos.');
  return data;
}

// ---------- Lectura directa (service_role; valida RBAC el controlador) ----------

const OFFTIME_SELECT = `*, employees!employee_id(id, full_name, code, branch_id, departments(name))`;
const INCIDENT_SELECT = `*, employees!employee_id(id, full_name, code, branch_id, departments(name))`;
const DEVICE_SELECT = `*, employees(id, full_name, code)`;

export const adminRead = {
  async offtimeList(args: { status?: string; search?: string; offset: number; limit: number }): Promise<{ data: OfftimeRequestRow[]; total: number }> {
    let q = supabaseAdmin.from('offtime_requests').select(OFFTIME_SELECT, { count: 'exact' });
    if (args.status) q = q.eq('status', args.status as never);
    if (args.search) {
      const term = args.search.trim().replace(/%/g, '\\%');
      q = q.or(`reason.ilike.%${term}%,employees.full_name.ilike.%${term}%,employees.code.ilike.%${term}%`);
    }
    const { data, error, count } = await q.order('created_at', { ascending: false }).range(args.offset, args.offset + args.limit - 1);
    if (error) throwPostgrest(error);
    return { data: (data as unknown as OfftimeRequestRow[]) ?? [], total: count ?? 0 };
  },

  async incidentsList(args: { status?: string; search?: string; offset: number; limit: number }): Promise<{ data: IncidentRow[]; total: number }> {
    let q = supabaseAdmin.from('incidents').select(INCIDENT_SELECT, { count: 'exact' });
    if (args.status) q = q.eq('status', args.status as never);
    if (args.search) {
      const term = args.search.trim().replace(/%/g, '\\%');
      q = q.or(`incident_type.ilike.%${term}%,employees.full_name.ilike.%${term}%,employees.code.ilike.%${term}%`);
    }
    const { data, error, count } = await q.order('created_at', { ascending: false }).range(args.offset, args.offset + args.limit - 1);
    if (error) throwPostgrest(error);
    return { data: (data as unknown as IncidentRow[]) ?? [], total: count ?? 0 };
  },

  async announcementsList(args: { active?: boolean; search?: string; offset: number; limit: number }): Promise<{ data: AnnouncementRow[]; total: number }> {
    let q = supabaseAdmin.from('announcements').select('*', { count: 'exact' });
    if (args.active !== undefined) q = q.eq('active', args.active);
    if (args.search) {
      const term = args.search.trim().replace(/%/g, '\\%');
      q = q.or(`title.ilike.%${term}%,body.ilike.%${term}%`);
    }
    const { data, error, count } = await q.order('published_at', { ascending: false }).range(args.offset, args.offset + args.limit - 1);
    if (error) throwPostgrest(error);
    return { data: (data as unknown as AnnouncementRow[]) ?? [], total: count ?? 0 };
  },

  async mediaList(args: { search?: string; offset: number; limit: number }): Promise<{ data: MediaRow[]; total: number }> {
    let q = supabaseAdmin.from('media').select('*', { count: 'exact' });
    if (args.search) {
      const term = args.search.trim().replace(/%/g, '\\%');
      q = q.or(`title.ilike.%${term}%`);
    }
    const { data, error, count } = await q.order('created_at', { ascending: false }).range(args.offset, args.offset + args.limit - 1);
    if (error) throwPostgrest(error);
    return { data: (data as unknown as MediaRow[]) ?? [], total: count ?? 0 };
  },

  async playlists(displayId: string): Promise<Record<string, unknown>[]> {
    const { data, error } = await supabaseAdmin
      .from('display_playlists')
      .select('*')
      .eq('display_id', displayId)
      .order('position', { ascending: true });
    if (error) throwPostgrest(error);
    return (data as unknown as Record<string, unknown>[]) ?? [];
  },

  async displaysList(): Promise<DisplayRow[]> {
    const { data, error } = await supabaseAdmin
      .from('displays')
      .select('*, branches(name)')
      .order('created_at', { ascending: false });
    if (error) throwPostgrest(error);
    return (data as unknown as DisplayRow[]) ?? [];
  },

  async displayTokens(displayId: string): Promise<Record<string, unknown>[]> {
    const { data, error } = await supabaseAdmin
      .from('display_tokens')
      .select('id, active, created_at, revoked_at, last_used_at')
      .eq('display_id', displayId)
      .order('created_at', { ascending: false });
    if (error) throwPostgrest(error);
    return (data as unknown as Record<string, unknown>[]) ?? [];
  },

  async devicesList(args: { authorization?: string; search?: string; offset: number; limit: number }): Promise<{ data: DeviceRow[]; total: number }> {
    let q = supabaseAdmin.from('devices').select(DEVICE_SELECT, { count: 'exact' });
    if (args.authorization) q = q.eq('authorization', args.authorization as never);
    if (args.search) {
      const term = args.search.trim().replace(/%/g, '\\%');
      q = q.or(`device_identifier.ilike.%${term}%,employees.full_name.ilike.%${term}%`);
    }
    const { data, error, count } = await q.order('created_at', { ascending: false }).range(args.offset, args.offset + args.limit - 1);
    if (error) throwPostgrest(error);
    return { data: (data as unknown as DeviceRow[]) ?? [], total: count ?? 0 };
  },

  async auditList(args: { entity?: string; offset: number; limit: number }): Promise<{ data: AuditLogRow[]; total: number }> {
    let q = supabaseAdmin.from('audit_logs').select('*', { count: 'exact' });
    if (args.entity) q = q.eq('entity', args.entity);
    const { data, error, count } = await q.order('created_at', { ascending: false }).range(args.offset, args.offset + args.limit - 1);
    if (error) throwPostgrest(error);
    const logs = (data as unknown as AuditLogRow[]) ?? [];
    const actorIds = [...new Set(logs.map((l) => l.actor_id).filter((id): id is string => Boolean(id)))];
    if (actorIds.length > 0) {
      const { data: actors, error: actorError } = await supabaseAdmin
        .from('employees')
        .select('id, full_name')
        .in('id', actorIds);
      if (actorError) throwPostgrest(actorError);
      const names = new Map((actors as unknown as { id: string; full_name: string }[]).map((e) => [e.id, { id: e.id, full_name: e.full_name }]));
      for (const log of logs) {
        (log as AuditLogRow & { employees?: { id: string; full_name: string } | null }).employees = log.actor_id ? (names.get(log.actor_id) ?? null) : null;
      }
    }
    return { data: logs, total: count ?? 0 };
  },

  /** Filas de asistencia para reportes (todo el rango). */
  async attendanceDays(from: string, to: string): Promise<AttendanceDayRow[]> {
    const { data, error } = await supabaseAdmin
      .from('attendance_days')
      .select('employee_id, check_date, status, minutes_worked, excused_types')
      .gte('check_date', from)
      .lte('check_date', to);
    if (error) throwPostgrest(error);
    return (data as unknown as AttendanceDayRow[]) ?? [];
  },

  async roster(): Promise<EmployeeWithRelations[]> {
    const { data, error } = await supabaseAdmin
      .from('employees')
      .select('id, full_name, code, active, role, branch_id, department_id, branches(name), departments(name)')
      .order('full_name', { ascending: true });
    if (error) throwPostgrest(error);
    return (data as unknown as EmployeeWithRelations[]) ?? [];
  },
};

// ---------- Escritura directa (service_role) ----------

export const adminWrite = {
  async insert(table: 'announcements' | 'media' | 'display_playlists' | 'displays', row: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { data, error } = await supabaseAdmin.from(table).insert(row as never).select().single();
    if (error) throwPostgrest(error);
    return (data as unknown as Record<string, unknown>) ?? {};
  },

  async update(table: 'announcements' | 'media' | 'display_playlists' | 'displays' | 'devices', id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { data, error } = await supabaseAdmin.from(table).update(patch as never).eq('id', id).select().single();
    if (error) throwPostgrest(error);
    return (data as unknown as Record<string, unknown>) ?? {};
  },

  async softDeletePlaylistItem(itemId: string): Promise<void> {
    const { error } = await supabaseAdmin.from('display_playlists').update({ active: false as never }).eq('id', itemId);
    if (error) throwPostgrest(error);
  },
};