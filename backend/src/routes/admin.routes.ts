import { Router } from 'express';

import { adminController } from '../controllers/admin.controller';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/authorize';
import { uploadMedia } from '../middleware/upload';
import { validate } from '../middleware/validate';
import { idParamSchema } from '../validators/common';
import {
  addPlaylistItemSchema,
  announcementsListQuerySchema,
  attendanceEditSchema,
  attendanceListQuerySchema,
  auditListQuerySchema,
  createAnnouncementSchema,
  createDisplaySchema,
  createIncidentSchema,
  createMediaSchema,
  createOffSchema,
  dashboardQuerySchema,
  devicesListQuerySchema,
  displayTokenSchema,
  incidentsListQuerySchema,
  mediaListQuerySchema,
  offtimeListQuerySchema,
  playlistQuerySchema,
  reportDimensionQuerySchema,
  reportQuerySchema,
  resolveIncidentSchema,
  reviewOffSchema,
  setDisplayActiveSchema,
  updateAnnouncementSchema,
  updateDeviceSchema,
  updateDisplaySchema,
  updateMediaSchema,
  updatePlaylistItemSchema,
} from '../validators/admin.schema';
import { z } from '../validators/common';

const sessionIdSchema = z.object({ params: z.object({ sessionId: z.string().uuid('Debe ser un UUID válido.') }) });
const idOnly = z.object({ params: idParamSchema.shape.params });
const itemIdSchema = z.object({ params: z.object({ itemId: z.string().uuid('Debe ser un UUID válido.') }) });

const router = Router();

router.use(authenticate);

// ---------- Dashboard ----------
router.get('/dashboard', requirePermission('attendance.read'), validate(dashboardQuerySchema), adminController.dashboard);

// ---------- Asistencia ----------
router.get('/attendance', requirePermission('attendance.read'), validate(attendanceListQuerySchema), adminController.attendanceList);
router.get('/attendance/sessions/:sessionId', requirePermission('attendance.read'), validate(sessionIdSchema), adminController.attendanceDetail);
router.patch('/attendance/events/:eventId', requirePermission('attendance.manage'), validate(attendanceEditSchema), adminController.editAttendance);

// ---------- Permisos / vacaciones / incapacidades ----------
router.get('/offtime', requirePermission('offtime.approve'), validate(offtimeListQuerySchema), adminController.offtimeList);
router.post('/offtime', requirePermission('offtime.approve'), validate(createOffSchema), adminController.createOff);
router.patch('/offtime/:id/review', requirePermission('offtime.approve'), validate(reviewOffSchema), adminController.reviewOff);

// ---------- Incidencias ----------
router.get('/incidents', requirePermission('incidents.manage'), validate(incidentsListQuerySchema), adminController.incidentsList);
router.post('/incidents', requirePermission('incidents.manage'), validate(createIncidentSchema), adminController.createIncident);
router.patch('/incidents/:id/resolve', requirePermission('incidents.manage'), validate(resolveIncidentSchema), adminController.resolveIncident);

// ---------- Avisos ----------
router.get('/announcements', requirePermission('announcements.read'), validate(announcementsListQuerySchema), adminController.announcementsList);
router.post('/announcements', requirePermission('announcements.write'), validate(createAnnouncementSchema), adminController.createAnnouncement);
router.patch('/announcements/:id', requirePermission('announcements.write'), validate(idOnly), validate(updateAnnouncementSchema), adminController.updateAnnouncement);

// ---------- Multimedia ----------
router.get('/media', requirePermission('media.read'), validate(mediaListQuerySchema), adminController.mediaList);
router.post('/media/upload', requirePermission('media.write'), uploadMedia, adminController.uploadMedia);
router.post('/media', requirePermission('media.write'), validate(createMediaSchema), adminController.createMedia);
router.patch('/media/:id', requirePermission('media.write'), validate(idOnly), validate(updateMediaSchema), adminController.updateMedia);

// ---------- Playlists ----------
router.get('/playlists', requirePermission('displays.read'), validate(playlistQuerySchema), adminController.playlistList);
router.post('/playlists', requirePermission('media.write'), validate(addPlaylistItemSchema), adminController.addPlaylistItem);
router.patch('/playlists/items/:itemId', requirePermission('media.write'), validate(updatePlaylistItemSchema), adminController.updatePlaylistItem);
router.delete('/playlists/items/:itemId', requirePermission('media.write'), validate(itemIdSchema), adminController.removePlaylistItem);

// ---------- Displays ----------
router.get('/displays', requirePermission('displays.read'), adminController.displaysList);
router.get('/displays/live', requirePermission('displays.read'), adminController.displayLiveStream);
router.get('/displays/:id/snapshot', requirePermission('displays.read'), validate(idOnly), adminController.displaySnapshot);
router.get('/displays/:id/tokens', requirePermission('displays.read'), validate(displayTokenSchema), adminController.displayTokens);
router.post('/displays', requirePermission('displays.manage'), validate(createDisplaySchema), adminController.createDisplay);
router.patch('/displays/:id', requirePermission('displays.manage'), validate(updateDisplaySchema), adminController.updateDisplay);
router.patch('/displays/:id/active', requirePermission('displays.manage'), validate(setDisplayActiveSchema), adminController.setDisplayActive);
router.post('/displays/:id/token', requirePermission('displays.manage'), validate(displayTokenSchema), adminController.rotateDisplayToken);
router.post('/displays/:id/pairing-code', requirePermission('displays.manage'), validate(displayTokenSchema), adminController.createDisplayPairingCode);
router.delete('/displays/:id/token', requirePermission('displays.manage'), validate(displayTokenSchema), adminController.revokeDisplayToken);

// ---------- Dispositivos ----------
router.get('/devices', requirePermission('attendance.read'), validate(devicesListQuerySchema), adminController.devicesList);
router.patch('/devices/:id', requirePermission('employees.write'), validate(updateDeviceSchema), adminController.updateDevice);

// ---------- Auditoría ----------
router.get('/audit', requirePermission('audit.read'), validate(auditListQuerySchema), adminController.auditList);

// ---------- Reportes ----------
router.get('/reports/by-day', requirePermission('reports.export'), validate(reportQuerySchema), adminController.reportByDay);
router.get('/reports/by-dimension', requirePermission('reports.export'), validate(reportDimensionQuerySchema), adminController.reportByDimension);

export default router;
