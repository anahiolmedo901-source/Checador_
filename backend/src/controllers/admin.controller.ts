import { Request, Response } from 'express';

import { adminService } from '../services/admin.service';
import { displayService } from '../services/display.service';
import { liveFeedService } from '../services/live-feed.service';
import { HTTPError } from '../utils/http-error';
import { withAsync } from '../utils/async-handler';

function actor(req: Request): { id: string; role: string } {
  if (!req.user) throw HTTPError.unauthorized();
  return { id: req.user.id, role: req.user.role };
}

function paramsOf(req: Request): Record<string, string> {
  return req.params as Record<string, string>;
}

function queryOf(req: Request): Record<string, unknown> {
  return req.query as Record<string, unknown>;
}

const rawAdminController = {
  // ---------- Dashboard ----------
  async dashboard(req: Request, res: Response): Promise<void> {
    const { date } = queryOf(req);
    res.status(200).json({ success: true, data: await adminService.dashboardSummary(date as string | undefined) });
  },

  // ---------- Asistencia ----------
  async attendanceList(req: Request, res: Response): Promise<void> {
    const q = queryOf(req);
    res.status(200).json({
      success: true,
      data: await adminService.attendanceList({
        from: q.from as string | undefined,
        to: q.to as string | undefined,
        employeeId: q.employee_id as string | undefined,
        departmentId: q.department_id as string | undefined,
        branchId: q.branch_id as string | undefined,
        status: q.status as string | undefined,
        search: q.search as string | undefined,
        page: q.page as number | undefined,
        limit: q.limit as number | undefined,
      }),
    });
  },

  async attendanceDetail(req: Request, res: Response): Promise<void> {
    const { sessionId } = paramsOf(req);
    res.status(200).json({ success: true, data: await adminService.attendanceDetail(sessionId) });
  },

  async editAttendance(req: Request, res: Response): Promise<void> {
    const { eventId } = paramsOf(req);
    const body = req.body as { happened_at?: string | null; status?: string | null; motivo: string };
    res.status(200).json({
      success: true,
      data: await adminService.editAttendance({
        eventId,
        happenedAt: body.happened_at,
        status: body.status,
        motivo: body.motivo,
        actor: actor(req),
      }),
    });
  },

  // ---------- Permisos / vacaciones / incapacidades ----------
  async offtimeList(req: Request, res: Response): Promise<void> {
    const q = queryOf(req);
    res.status(200).json({
      success: true,
      data: await adminService.offtimeList({
        status: q.status as string | undefined,
        search: q.search as string | undefined,
        page: q.page as number | undefined,
        limit: q.limit as number | undefined,
      }),
    });
  },

  async createOff(req: Request, res: Response): Promise<void> {
    const body = req.body as { employee_id: string; off_type: string; starts_on: string; ends_on: string; reason: string };
    res.status(201).json({
      success: true,
      data: await adminService.createOff({
        employeeId: body.employee_id,
        offType: body.off_type,
        startsOn: body.starts_on,
        endsOn: body.ends_on,
        reason: body.reason,
        actor: actor(req),
      }),
    });
  },

  async reviewOff(req: Request, res: Response): Promise<void> {
    const { id } = paramsOf(req);
    const body = req.body as { approved: boolean; note?: string };
    res.status(200).json({
      success: true,
      data: await adminService.reviewOff({ requestId: id, approved: body.approved, note: body.note, actor: actor(req) }),
    });
  },

  // ---------- Incidencias ----------
  async incidentsList(req: Request, res: Response): Promise<void> {
    const q = queryOf(req);
    res.status(200).json({
      success: true,
      data: await adminService.incidentsList({
        status: q.status as string | undefined,
        search: q.search as string | undefined,
        page: q.page as number | undefined,
        limit: q.limit as number | undefined,
      }),
    });
  },

  async createIncident(req: Request, res: Response): Promise<void> {
    const body = req.body as { employee_id: string; incident_type: string; severity: string; detail?: Record<string, unknown> };
    res.status(201).json({
      success: true,
      data: await adminService.createIncident({
        employeeId: body.employee_id,
        incidentType: body.incident_type,
        severity: body.severity,
        detail: body.detail ?? {},
        actor: actor(req),
      }),
    });
  },

  async resolveIncident(req: Request, res: Response): Promise<void> {
    const { id } = paramsOf(req);
    const body = req.body as { note?: string };
    res.status(200).json({
      success: true,
      data: await adminService.resolveIncident({ incidentId: id, note: body.note, actor: actor(req) }),
    });
  },

  // ---------- Avisos ----------
  async announcementsList(req: Request, res: Response): Promise<void> {
    const q = queryOf(req);
    res.status(200).json({
      success: true,
      data: await adminService.announcementsList({
        active: q.active === undefined ? undefined : q.active === 'true',
        search: q.search as string | undefined,
        page: q.page as number | undefined,
        limit: q.limit as number | undefined,
      }),
    });
  },

  async createAnnouncement(req: Request, res: Response): Promise<void> {
    const body = req.body as { title: string; body: string; audience_role?: string[]; priority: string; published_at?: string; expires_at?: string | null; active: boolean };
    res.status(201).json({
      success: true,
      data: await adminService.createAnnouncement({
        title: body.title,
        body: body.body,
        audienceRole: body.audience_role,
        priority: body.priority,
        publishedAt: body.published_at,
        expiresAt: body.expires_at,
        active: body.active,
        actor: actor(req),
      }),
    });
  },

  async updateAnnouncement(req: Request, res: Response): Promise<void> {
    const { id } = paramsOf(req);
    res.status(200).json({
      success: true,
      data: await adminService.updateAnnouncement(id, req.body as Record<string, unknown>, actor(req)),
    });
  },

  // ---------- Multimedia ----------
  async mediaList(req: Request, res: Response): Promise<void> {
    const q = queryOf(req);
    res.status(200).json({
      success: true,
      data: await adminService.mediaList({ search: q.search as string | undefined, page: q.page as number | undefined, limit: q.limit as number | undefined }),
    });
  },

  async createMedia(req: Request, res: Response): Promise<void> {
    const body = req.body as { kind: string; title: string; url?: string | null; mime_type?: string | null; size_bytes?: number | null; duration_s?: number | null };
    res.status(201).json({
      success: true,
      data: await adminService.createMedia({
        kind: body.kind,
        title: body.title,
        url: body.url,
        mimeType: body.mime_type,
        sizeBytes: body.size_bytes,
        durationS: body.duration_s,
        actor: actor(req),
      }),
    });
  },

  async uploadMedia(req: Request, res: Response): Promise<void> {
    if (!req.file) throw HTTPError.badRequest('No se recibió ningún archivo.');
    const title = (req.body.title as string | undefined)?.trim() || req.file.originalname;
    res.status(201).json({
      success: true,
      data: await adminService.uploadMedia({ title, file: req.file, actor: actor(req) }),
    });
  },

  async updateMedia(req: Request, res: Response): Promise<void> {
    const { id } = paramsOf(req);
    res.status(200).json({ success: true, data: await adminService.updateMedia(id, req.body as Record<string, unknown>, actor(req)) });
  },

  // ---------- Playlists ----------
  async playlistList(req: Request, res: Response): Promise<void> {
    const { display_id } = queryOf(req);
    if (!display_id) throw HTTPError.badRequest('Se requiere display_id.');
    res.status(200).json({ success: true, data: await adminService.playlistList(display_id as string) });
  },

  async addPlaylistItem(req: Request, res: Response): Promise<void> {
    const body = req.body as { display_id: string; item_type: 'announcement' | 'media'; item_id: string; duration_s: number; position?: number };
    res.status(201).json({
      success: true,
      data: await adminService.addPlaylistItem({
        displayId: body.display_id,
        itemType: body.item_type,
        itemId: body.item_id,
        durationS: body.duration_s,
        position: body.position,
        actor: actor(req),
      }),
    });
  },

  async updatePlaylistItem(req: Request, res: Response): Promise<void> {
    const { itemId } = paramsOf(req);
    res.status(200).json({ success: true, data: await adminService.updatePlaylistItem(itemId, req.body as Record<string, unknown>, actor(req)) });
  },

  async removePlaylistItem(req: Request, res: Response): Promise<void> {
    const { itemId } = paramsOf(req);
    await adminService.removePlaylistItem(itemId, actor(req));
    res.status(200).json({ success: true, data: { id: itemId, active: false } });
  },

  // ---------- Displays ----------
  async displaysList(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ success: true, data: await adminService.displaysList() });
  },

  async createDisplay(req: Request, res: Response): Promise<void> {
    const body = req.body as { name: string; branch_id?: string | null; settings?: Record<string, unknown> };
    res.status(201).json({
      success: true,
      data: await adminService.createDisplay({ name: body.name, branchId: body.branch_id, settings: body.settings, actor: actor(req) }),
    });
  },

  async updateDisplay(req: Request, res: Response): Promise<void> {
    const { id } = paramsOf(req);
    res.status(200).json({ success: true, data: await adminService.updateDisplay(id, req.body as Record<string, unknown>, actor(req)) });
  },

  async setDisplayActive(req: Request, res: Response): Promise<void> {
    const { id } = paramsOf(req);
    const body = req.body as { active: boolean };
    res.status(200).json({ success: true, data: await adminService.setDisplayActive(id, body.active, actor(req)) });
  },

  async displayTokens(req: Request, res: Response): Promise<void> {
    const { id } = paramsOf(req);
    res.status(200).json({ success: true, data: await adminService.displayTokens(id) });
  },

  async createDisplayPairingCode(req: Request, res: Response): Promise<void> {
    const { id } = paramsOf(req);
    res.status(201).json({ success: true, data: await adminService.createDisplayPairingCode(id, actor(req)) });
  },

  async rotateDisplayToken(req: Request, res: Response): Promise<void> {
    const { id } = paramsOf(req);
    res.status(200).json({ success: true, data: await adminService.rotateDisplayToken(id, actor(req)) });
  },

  async revokeDisplayToken(req: Request, res: Response): Promise<void> {
    const { id } = paramsOf(req);
    const body = req.body as { token_id: string };
    if (!body.token_id) throw HTTPError.badRequest('Se requiere token_id.');
    await adminService.revokeDisplayToken(id, body.token_id, actor(req));
    res.status(200).json({ success: true, data: { token_id: body.token_id, active: false } });
  },

  /** GET /api/admin/displays/live — SSE: checados proyectados en pantallas. */
  async displayLiveStream(req: Request, res: Response): Promise<void> {
    req.socket.setTimeout(0);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    liveFeedService.register(res);
    res.write(`event: hello\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`);
  },

  /** GET /api/admin/displays/:id/snapshot — lo que la pantalla proyecta hoy. */
  async displaySnapshot(req: Request, res: Response): Promise<void> {
    const { id } = paramsOf(req);
    res.status(200).json({ success: true, data: await displayService.snapshot(id) });
  },

  // ---------- Dispositivos ----------
  async devicesList(req: Request, res: Response): Promise<void> {
    const q = queryOf(req);
    res.status(200).json({
      success: true,
      data: await adminService.devicesList({
        authorization: q.authorization as string | undefined,
        search: q.search as string | undefined,
        page: q.page as number | undefined,
        limit: q.limit as number | undefined,
      }),
    });
  },

  async updateDevice(req: Request, res: Response): Promise<void> {
    const { id } = paramsOf(req);
    res.status(200).json({ success: true, data: await adminService.updateDevice(id, req.body as Record<string, unknown>, actor(req)) });
  },

  // ---------- Auditoría ----------
  async auditList(req: Request, res: Response): Promise<void> {
    const q = queryOf(req);
    res.status(200).json({
      success: true,
      data: await adminService.auditList({ entity: q.entity as string | undefined, page: q.page as number | undefined, limit: q.limit as number | undefined }),
    });
  },

  // ---------- Reportes ----------
  async reportByDay(req: Request, res: Response): Promise<void> {
    const q = queryOf(req);
    res.status(200).json({
      success: true,
      data: await adminService.reportByDay({
        from: q.from as string,
        to: q.to as string,
        departmentId: q.department_id as string | undefined,
        branchId: q.branch_id as string | undefined,
      }),
    });
  },

  async reportByDimension(req: Request, res: Response): Promise<void> {
    const q = queryOf(req);
    res.status(200).json({
      success: true,
      data: await adminService.reportByDimension({
        from: q.from as string,
        to: q.to as string,
        dimension: q.dimension as 'employee' | 'department' | 'branch',
        departmentId: q.department_id as string | undefined,
        branchId: q.branch_id as string | undefined,
      }),
    });
  },
};

export const adminController = withAsync(rawAdminController);
