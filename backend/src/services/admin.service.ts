import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { supabaseAdmin } from '../config/supabase';
import { adminRead, adminRpc, adminWrite } from '../repositories/admin.repository';
import { fileService } from './file.service';
import { auditService } from './audit.service';
import {
  AdminAttendanceRow,
  AnnouncementRow,
  AttendanceDayRow,
  AuditLogRow,
  DeviceRow,
  DisplayRow,
  IncidentRow,
  MediaRow,
  OfftimeRequestRow,
} from '../types';
import { HTTPError } from '../utils/http-error';
import { buildPagination, PageResult } from '../utils/pagination';

const DISPLAY_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function pairingCode(): string {
  const bytes = randomBytes(8);
  let raw = '';
  for (const b of bytes) raw += DISPLAY_CODE_ALPHABET[b % DISPLAY_CODE_ALPHABET.length];
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function displayCode(): string {
  const bytes = randomBytes(8);
  let code = '';
  for (const b of bytes) code += DISPLAY_CODE_ALPHABET[b % DISPLAY_CODE_ALPHABET.length];
  return code;
}

function weekdaysInRange(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (end < start) return 0;
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function dateRange(from: string, to: string): string[] {
  const days: string[] = [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function businessToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  return `${parts.find((part) => part.type === 'year')!.value}-${parts.find((part) => part.type === 'month')!.value}-${parts.find((part) => part.type === 'day')!.value}`;
}

type Dim = 'employee' | 'department' | 'branch';

interface Actor {
  id: string;
  role: string;
}

interface ReportEmp {
  id: string;
  full_name: string;
  department_id: string | null;
  branch_id: string | null;
  departments?: { name: string } | null;
  branches?: { name: string } | null;
}

interface ReportGroup {
  key: string;
  name: string;
  employees: number;
  present: number;
  late: number;
  excused: number;
  missing: number;
  minutes: number;
  hours: number;
}

export const adminService = {
  // ---------- Dashboard ----------

  async dashboardSummary(date?: string): Promise<Record<string, unknown>> {
    return (await adminRpc.dashboardSummary(date ?? businessToday())) as Record<string, unknown>;
  },

  // ---------- Asistencia ----------

  async attendanceList(query: {
    from?: string;
    to?: string;
    employeeId?: string;
    departmentId?: string;
    branchId?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<PageResult<AdminAttendanceRow>> {
    const from = query.from ?? businessToday();
    const to = query.to ?? from;
    const pagination = buildPagination(query.page, query.limit);
    const result = await adminRpc.attendanceSearch({
      from,
      to,
      employeeId: query.employeeId,
      departmentId: query.departmentId,
      branchId: query.branchId,
      status: query.status ?? 'all',
      search: query.search,
      limit: pagination.limit,
      offset: pagination.offset,
    });
    return {
      data: result.rows,
      page: pagination.page,
      limit: pagination.limit,
      total: result.total,
      hasMore: result.total > pagination.offset + result.rows.length,
    };
  },

  async attendanceDetail(sessionId: string): Promise<Record<string, unknown>> {
    const detail = await adminRpc.attendanceDetail(sessionId);
    const evidence = (detail.evidence ?? []).map((item: { file_path: string }) => item.file_path);
    const withSigned = await Promise.all(
      evidence.map(async (path: string) => {
        const { signedUrl } = await fileService
          .createSignedUrl('attendance-evidence', path, undefined, { id: 'system', role: 'admin' })
          .catch(() => ({ signedUrl: null }));
        const item = detail.evidence.find((e: { file_path: string }) => e.file_path === path);
        return item ? { ...item, signed_url: signedUrl } : null;
      })
    );
    return { ...detail, evidence: withSigned.filter(Boolean) };
  },

  async editAttendance(args: {
    eventId: string;
    happenedAt?: string | null;
    status?: string | null;
    motivo: string;
    actor: Actor;
  }): Promise<Record<string, unknown>> {
    return (await adminRpc.editAttendance({ ...args, actorId: args.actor.id })) as Record<string, unknown>;
  },

  // ---------- Permisos / vacaciones / incapacidades ----------

  async offtimeList(query: { status?: string; search?: string; page?: number; limit?: number }): Promise<PageResult<OfftimeRequestRow>> {
    const pagination = buildPagination(query.page, query.limit);
    const { data, total } = await adminRead.offtimeList({
      status: query.status,
      search: query.search,
      offset: pagination.offset,
      limit: pagination.limit,
    });
    return { data, page: pagination.page, limit: pagination.limit, total, hasMore: total > pagination.offset + data.length };
  },

  async createOff(args: { employeeId: string; offType: string; startsOn: string; endsOn: string; reason: string; actor: Actor }): Promise<Record<string, unknown>> {
    return (await adminRpc.createOff({ ...args, actorId: args.actor.id })) as Record<string, unknown>;
  },

  async reviewOff(args: { requestId: string; approved: boolean; note?: string; actor: Actor }): Promise<Record<string, unknown>> {
    return (await adminRpc.reviewOff({ ...args, actorId: args.actor.id })) as Record<string, unknown>;
  },

  // ---------- Incidencias ----------

  async incidentsList(query: { status?: string; search?: string; page?: number; limit?: number }): Promise<PageResult<IncidentRow>> {
    const pagination = buildPagination(query.page, query.limit);
    const { data, total } = await adminRead.incidentsList({
      status: query.status,
      search: query.search,
      offset: pagination.offset,
      limit: pagination.limit,
    });
    return { data, page: pagination.page, limit: pagination.limit, total, hasMore: total > pagination.offset + data.length };
  },

  async createIncident(args: {
    employeeId: string;
    incidentType: string;
    severity: string;
    detail: Record<string, unknown>;
    actor: Actor;
  }): Promise<Record<string, unknown>> {
    return (await adminRpc.createIncident({ ...args, actorId: args.actor.id })) as Record<string, unknown>;
  },

  async resolveIncident(args: { incidentId: string; note?: string; actor: Actor }): Promise<Record<string, unknown>> {
    return (await adminRpc.resolveIncident({ ...args, actorId: args.actor.id })) as Record<string, unknown>;
  },

  // ---------- Avisos ----------

  async announcementsList(query: { active?: boolean; search?: string; page?: number; limit?: number }): Promise<PageResult<AnnouncementRow>> {
    const pagination = buildPagination(query.page, query.limit);
    const { data, total } = await adminRead.announcementsList({
      active: query.active,
      search: query.search,
      offset: pagination.offset,
      limit: pagination.limit,
    });
    return { data, page: pagination.page, limit: pagination.limit, total, hasMore: total > pagination.offset + data.length };
  },

  async createAnnouncement(input: {
    title: string;
    body: string;
    audienceRole?: string[];
    priority: string;
    publishedAt?: string;
    expiresAt?: string | null;
    active: boolean;
    actor: Actor;
  }): Promise<AnnouncementRow> {
    const row = await adminWrite.insert('announcements', {
      title: input.title,
      body: input.body,
      audience_role: input.audienceRole ?? (['employee'] as never),
      priority: input.priority,
      published_at: input.publishedAt ?? new Date().toISOString(),
      expires_at: input.expiresAt ?? null,
      active: input.active,
      created_by: input.actor.id,
    });
    await auditService.write({
      actorId: input.actor.id,
      action: 'CREATE',
      entity: 'announcements',
      entityId: row.id as string,
      newData: row,
      metadata: { title: input.title },
    });
    return row as unknown as AnnouncementRow;
  },

  async updateAnnouncement(id: string, patch: Record<string, unknown>, actor: Actor): Promise<AnnouncementRow> {
    const row = await adminWrite.update('announcements', id, patch);
    await auditService.write({
      actorId: actor.id,
      action: 'UPDATED',
      entity: 'announcements',
      entityId: id,
      newData: row,
      metadata: { title: row.title },
    });
    return row as unknown as AnnouncementRow;
  },

  // ---------- Multimedia ----------

  async mediaList(query: { search?: string; page?: number; limit?: number }): Promise<PageResult<MediaRow>> {
    const pagination = buildPagination(query.page, query.limit);
    const { data, total } = await adminRead.mediaList({
      search: query.search,
      offset: pagination.offset,
      limit: pagination.limit,
    });
    const withSigned = await Promise.all(
      data.map(async (m) => {
        if (m.file_path) {
          const { signedUrl } = await fileService
            .createSignedUrl('media', m.file_path, undefined, { id: 'system', role: 'admin' })
            .catch(() => ({ signedUrl: null }));
          return { ...m, signed_url: signedUrl };
        }
        return m;
      })
    );
    return { data: withSigned, page: pagination.page, limit: pagination.limit, total, hasMore: total > pagination.offset + data.length };
  },

  async createMedia(input: {
    kind: string;
    title: string;
    url?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    durationS?: number | null;
    actor: Actor;
  }): Promise<MediaRow> {
    const row = await adminWrite.insert('media', {
      kind: input.kind,
      title: input.title,
      url: input.url ?? null,
      file_path: null,
      mime_type: input.mimeType ?? null,
      size_bytes: input.sizeBytes ?? null,
      duration_s: input.durationS ?? null,
      active: true,
      created_by: input.actor.id,
    });
    await auditService.write({
      actorId: input.actor.id,
      action: 'CREATE',
      entity: 'media',
      entityId: row.id as string,
      newData: row,
      metadata: { title: row.title, kind: row.kind },
    });
    return row as unknown as MediaRow;
  },

  async uploadMedia(args: { title: string; file: Express.Multer.File; actor: Actor }): Promise<MediaRow> {
    const rawExt = (args.file.originalname.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
    const safeExt = /^(jpe?g|png|webp|mp4|webm)$/i.test(rawExt) ? rawExt : 'bin';
    const filePath = `${args.actor.id}/${randomUUID()}.${safeExt}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('media')
      .upload(filePath, args.file.buffer, { contentType: args.file.mimetype });
    if (uploadError) {
      throw new HTTPError(500, 'No se pudo subir el archivo al almacenamiento.', {
        code: 'STORAGE_ERROR',
        details: uploadError.message,
      });
    }

    const kind = args.file.mimetype.startsWith('video/') ? 'video' : 'image';
    const row = await adminWrite.insert('media', {
      kind,
      title: args.title,
      url: null,
      file_path: filePath,
      mime_type: args.file.mimetype,
      size_bytes: args.file.size,
      duration_s: null,
      active: true,
      created_by: args.actor.id,
    });
    await auditService.write({
      actorId: args.actor.id,
      action: 'CREATE',
      entity: 'media',
      entityId: row.id as string,
      newData: row,
      metadata: { title: row.title, kind, file_path: filePath },
    });
    return row as unknown as MediaRow;
  },

  async updateMedia(id: string, patch: Record<string, unknown>, actor: Actor): Promise<MediaRow> {
    const row = await adminWrite.update('media', id, patch);
    await auditService.write({
      actorId: actor.id,
      action: 'UPDATED',
      entity: 'media',
      entityId: id,
      newData: row,
      metadata: { title: row.title },
    });
    return row as unknown as MediaRow;
  },

  // ---------- Playlists ----------

  async playlistList(displayId: string): Promise<Record<string, unknown>[]> {
    const items = await adminRead.playlists(displayId);

    const announcementIds = items.filter((i) => i.item_type === 'announcement').map((i) => i.item_id as string);
    const mediaIds = items.filter((i) => i.item_type === 'media').map((i) => i.item_id as string);

    let announcements: { id: string; title: string }[] = [];
    let media: { id: string; title: string }[] = [];
    if (announcementIds.length) {
      const { data } = await supabaseAdmin.from('announcements').select('id, title').in('id', announcementIds);
      announcements = (data as { id: string; title: string }[] | null) ?? [];
    }
    if (mediaIds.length) {
      const { data } = await supabaseAdmin.from('media').select('id, title').in('id', mediaIds);
      media = (data as { id: string; title: string }[] | null) ?? [];
    }

    const resolve = (i: Record<string, unknown>): Record<string, unknown> => {
      const id = i.item_id as string;
      if (i.item_type === 'announcement') {
        const a = announcements.find((x) => x.id === id);
        return { ...i, item_kind: 'announcement', item_title: a?.title ?? 'Aviso eliminado' };
      }
      const m = media.find((x) => x.id === id);
      return { ...i, item_kind: 'media', item_title: m?.title ?? 'Multimedia eliminada' };
    };

    return items.map(resolve);
  },

  async addPlaylistItem(input: {
    displayId: string;
    itemType: string;
    itemId: string;
    durationS: number;
    position?: number;
    actor: Actor;
  }): Promise<Record<string, unknown>> {
    const items = await adminRead.playlists(input.displayId);
    const position = input.position ?? (items.length ? Math.max(...items.map((i) => (i.position as number) ?? 0)) + 1 : 0);
    const row = await adminWrite.insert('display_playlists', {
      display_id: input.displayId,
      item_type: input.itemType,
      item_id: input.itemId,
      duration_s: input.durationS,
      position,
      active: true,
    });
    await auditService.write({
      actorId: input.actor.id,
      action: 'CREATE',
      entity: 'display_playlists',
      entityId: row.id as string,
      newData: row,
      metadata: { display_id: input.displayId },
    });
    return row;
  },

  async updatePlaylistItem(itemId: string, patch: Record<string, unknown>, actor: Actor): Promise<Record<string, unknown>> {
    const row = await adminWrite.update('display_playlists', itemId, patch);
    await auditService.write({
      actorId: actor.id,
      action: 'UPDATED',
      entity: 'display_playlists',
      entityId: itemId,
      newData: row,
    });
    return row;
  },

  async removePlaylistItem(itemId: string, actor: Actor): Promise<void> {
    await adminWrite.softDeletePlaylistItem(itemId);
    await auditService.write({
      actorId: actor.id,
      action: 'DELETED',
      entity: 'display_playlists',
      entityId: itemId,
      metadata: { soft: true },
    });
  },

  // ---------- Displays ----------

  async displaysList(): Promise<DisplayRow[]> {
    return adminRead.displaysList();
  },

  async displayTokens(displayId: string): Promise<Record<string, unknown>[]> {
    return adminRead.displayTokens(displayId);
  },

  async createDisplayPairingCode(displayId: string, actor: Actor): Promise<{ code: string; expires_at: string }> {
    const display = (await adminRead.displaysList()).find((item) => item.id === displayId);
    if (!display) throw HTTPError.notFound('La pantalla no existe.');
    if (!display.is_active) throw HTTPError.badRequest('Activa la pantalla antes de conectarla.');
    const code = pairingCode();
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const { error: revokeError } = await supabaseAdmin
      .from('display_pairing_codes')
      .update({ consumed_at: new Date().toISOString() })
      .eq('display_id', displayId)
      .is('consumed_at', null);
    if (revokeError) throw new HTTPError(503, 'No se pudo generar el código de conexión.', { details: revokeError.message });
    const { error } = await supabaseAdmin.from('display_pairing_codes').insert({
      display_id: displayId,
      code_hash: createHash('sha256').update(code.replace(/-/g, '')).digest('hex'),
      expires_at: expiresAt,
      created_by: actor.id,
    });
    if (error) throw new HTTPError(503, 'No se pudo generar el código de conexión.', { details: error.message });
    await auditService.write({
      actorId: actor.id,
      action: 'CREATE',
      entity: 'displays',
      entityId: displayId,
      metadata: { action: 'PAIRING_CODE_CREATED', expires_at: expiresAt },
    });
    return { code, expires_at: expiresAt };
  },

  async createDisplay(input: { name: string; branchId?: string | null; settings?: Record<string, unknown>; actor: Actor }): Promise<DisplayRow> {
    const existing = await adminRead.displaysList();
    const codes = new Set(existing.map((d) => d.code));
    let code = displayCode();
    while (codes.has(code)) code = displayCode();

    const row = await adminWrite.insert('displays', {
      name: input.name,
      code,
      branch_id: input.branchId ?? null,
      status: 'offline',
      settings: input.settings ?? {},
      is_active: true,
    });
    await auditService.write({
      actorId: input.actor.id,
      action: 'CREATE',
      entity: 'displays',
      entityId: row.id as string,
      newData: row,
      metadata: { name: row.name as string, code },
    });
    return row as unknown as DisplayRow;
  },

  async updateDisplay(id: string, patch: Record<string, unknown>, actor: Actor): Promise<DisplayRow> {
    const row = await adminWrite.update('displays', id, patch);
    await auditService.write({
      actorId: actor.id,
      action: 'UPDATED',
      entity: 'displays',
      entityId: id,
      newData: row,
      metadata: { name: row.name },
    });
    return row as unknown as DisplayRow;
  },

  async setDisplayActive(id: string, active: boolean, actor: Actor): Promise<Record<string, unknown>> {
    return (await adminRpc.setDisplayActive({ displayId: id, active, actorId: actor.id })) as Record<string, unknown>;
  },

  async rotateDisplayToken(id: string, actor: Actor): Promise<{ token: string; display_id: string; token_id: string }> {
    const result = await adminRpc.rotateDisplayToken(id);
    await auditService.write({
      actorId: actor.id,
      action: 'ROTATED_TOKEN',
      entity: 'displays',
      entityId: id,
      metadata: { token_id: result.token_id },
    });
    return result;
  },

  async revokeDisplayToken(displayId: string, tokenId: string, actor: Actor): Promise<void> {
    await adminRpc.revokeDisplayToken(tokenId);
    await auditService.write({
      actorId: actor.id,
      action: 'REVOKED_TOKEN',
      entity: 'displays',
      entityId: displayId,
      metadata: { token_id: tokenId },
    });
  },

  // ---------- Dispositivos ----------

  async devicesList(query: { authorization?: string; search?: string; page?: number; limit?: number }): Promise<PageResult<DeviceRow>> {
    const pagination = buildPagination(query.page, query.limit);
    const { data, total } = await adminRead.devicesList({
      authorization: query.authorization,
      search: query.search,
      offset: pagination.offset,
      limit: pagination.limit,
    });
    return { data, page: pagination.page, limit: pagination.limit, total, hasMore: total > pagination.offset + data.length };
  },

  async updateDevice(id: string, patch: Record<string, unknown>, actor: Actor): Promise<DeviceRow> {
    const row = await adminWrite.update('devices', id, patch);
    await auditService.write({
      actorId: actor.id,
      action: 'UPDATED',
      entity: 'devices',
      entityId: id,
      newData: row,
      metadata: { device_identifier: row.device_identifier },
    });
    return row as unknown as DeviceRow;
  },

  // ---------- Auditoría ----------

  async auditList(query: { entity?: string; page?: number; limit?: number }): Promise<PageResult<AuditLogRow>> {
    const pagination = buildPagination(query.page, query.limit);
    const { data, total } = await adminRead.auditList({
      entity: query.entity,
      offset: pagination.offset,
      limit: pagination.limit,
    });
    return { data, page: pagination.page, limit: pagination.limit, total, hasMore: total > pagination.offset + data.length };
  },

  // ---------- Reportes ----------

  async reportByDay(args: { from: string; to: string; departmentId?: string; branchId?: string }): Promise<Record<string, unknown>[]> {
    const { roster, rowsByDay } = await this.loadReportData(args);
    return dateRange(args.from, args.to).map((day) => {
      const rows = rowsByDay.get(day) ?? [];
      const present = new Set(rows.map((r) => r.employee_id)).size;
      const late = new Set(rows.filter((r) => r.status === 'late').map((r) => r.employee_id)).size;
      const excused = new Set(rows.filter((r) => r.status === 'excused').map((r) => r.employee_id)).size;
      const minutes = rows.reduce((acc, r) => acc + (r.minutes_worked ?? 0), 0);
      return { date: day, present, late, excused, missing: Math.max(0, roster.length - present - excused), minutes, hours: round2(minutes / 60) };
    });
  },

  async reportByDimension(args: { from: string; to: string; dimension: Dim; departmentId?: string; branchId?: string }): Promise<Record<string, unknown>[]> {
    const { roster, rowsByEmployee: rawRows } = await this.loadReportData(args);
    const weekdays = weekdaysInRange(args.from, args.to);

    const groups = new Map<string, ReportGroup>();
    for (const emp of roster) {
      const key =
        args.dimension === 'employee'
          ? emp.id
          : args.dimension === 'department'
            ? emp.department_id ?? 'sin-depto'
            : emp.branch_id ?? 'sin-sucursal';
      const name =
        args.dimension === 'employee'
          ? emp.full_name
          : args.dimension === 'department'
            ? (emp.departments?.name ?? 'Sin departamento')
            : (emp.branches?.name ?? 'Sin sucursal');

      let group = groups.get(key);
      if (!group) {
        group = { key, name, employees: 0, present: 0, late: 0, excused: 0, missing: 0, minutes: 0, hours: 0 };
        groups.set(key, group);
      }
      group.employees += 1;

      const empRows = rawRows.get(emp.id) ?? [];
      const presentDays = new Set(empRows.filter((r) => r.status !== 'excused').map((r) => r.check_date)).size;
      group.present += presentDays;
      group.late += new Set(empRows.filter((r) => r.status === 'late').map((r) => r.check_date)).size;
      group.excused += new Set(empRows.filter((r) => r.status === 'excused').map((r) => r.check_date)).size;
      group.minutes += empRows.reduce((acc, r) => acc + (r.minutes_worked ?? 0), 0);
      group.missing += Math.max(0, weekdays - presentDays - empRows.filter((r) => r.status === 'excused').length);
    }

    return [...groups.values()]
      .map((g) => ({ ...g, hours: round2(g.minutes / 60) }))
      .sort((a, b) => (a.name < b.name ? -1 : 1));
  },

  async loadReportData(args: { departmentId?: string; branchId?: string }): Promise<{ roster: ReportEmp[]; rowsByDay: Map<string, AttendanceDayRow[]>; rowsByEmployee: Map<string, AttendanceDayRow[]> }> {
    const [rows, all] = await Promise.all([adminRead.attendanceDays('1970-01-01', '2099-01-01'), adminRead.roster()]);
    let roster = all.filter((e) => e.active && e.role === 'employee');
    if (args.departmentId) roster = roster.filter((e) => e.department_id === args.departmentId);
    if (args.branchId) roster = roster.filter((e) => e.branch_id === args.branchId);

    const rowsByDay = new Map<string, AttendanceDayRow[]>();
    const rowsByEmployee = new Map<string, AttendanceDayRow[]>();
    for (const r of rows) {
      if (!rowsByDay.has(r.check_date)) rowsByDay.set(r.check_date, []);
      rowsByDay.get(r.check_date)!.push(r);
      if (!rowsByEmployee.has(r.employee_id)) rowsByEmployee.set(r.employee_id, []);
      rowsByEmployee.get(r.employee_id)!.push(r);
    }
    return { roster, rowsByDay, rowsByEmployee };
  },
};
