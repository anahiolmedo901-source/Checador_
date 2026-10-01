export type EmployeeRole = 'admin' | 'hr' | 'employee';

export interface AuthenticatedUser {
  /** auth.users.id == employees.id */
  id: string;
  email: string;
  role: EmployeeRole;
  employee: EmployeeRow;
}

export interface EmployeeRow {
  id: string;
  code: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  hire_date: string | null;
  photo_url: string | null;
  branch_id: string | null;
  department_id: string | null;
  position_id: string | null;
  role: EmployeeRole;
  active: boolean;
  created_at: string;
}

export interface AttendanceDayRow {
  employee_id: string;
  check_date: string;
  check_in: string | null;
  check_out: string | null;
  minutes_worked: number | null;
  session_status: string | null;
  status: string;
  excused_types: string[] | null;
  branch_id: string | null;
}

export interface AdminAttendanceRow {
  employee_id: string;
  code: string;
  full_name: string;
  photo_url: string | null;
  department_id: string | null;
  department_name: string | null;
  branch_name: string | null;
  check_date: string;
  check_in: string | null;
  check_out: string | null;
  minutes_worked: number | null;
  day_status: string;
}

export interface OfftimeRequestRow {
  id: string;
  employee_id: string;
  off_type: string;
  starts_on: string;
  ends_on: string;
  reason: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  ticket: string;
  created_at: string;
}

export interface IncidentRow {
  id: string;
  employee_id: string;
  attendance_id: string | null;
  incident_type: string;
  severity: string;
  detail: Record<string, unknown>;
  status: string;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  audience_role: string[] | null;
  priority: string;
  published_at: string;
  expires_at: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface MediaRow {
  id: string;
  kind: 'image' | 'video' | 'url';
  title: string;
  file_path: string | null;
  url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  duration_s: number | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface DisplayRow {
  id: string;
  name: string;
  code: string;
  branch_id: string | null;
  auth_user_id: string | null;
  status: string;
  settings: Record<string, unknown>;
  is_active: boolean;
  software: string | null;
  os_version: string | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface DeviceRow {
  id: string;
  employee_id: string | null;
  device_identifier: string;
  platform: string;
  model: string | null;
  manufacturer: string | null;
  os_version: string | null;
  app_version: string | null;
  authorization: 'authorized' | 'pending' | 'denied';
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
}

export interface AuditLogRow {
  id: number;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  ip: string | null;
  created_at: string;
}

export interface EmployeeWithRelations extends EmployeeRow {
  branches?: { id: string; name: string } | null;
  departments?: { id: string; name: string } | null;
  positions?: { id: string; title: string } | null;
}

export interface DepartmentRow {
  id: string;
  name: string;
  code: string;
  active: boolean;
  created_at: string;
}

export interface PositionRow {
  id: string;
  department_id: string | null;
  title: string;
  code: string;
  active: boolean;
  created_at: string;
}

export interface BranchRow {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lon: number;
  radius_m: number;
  active: boolean;
  created_at: string;
}

export interface ScheduleRow {
  id: string;
  name: string;
  code: string;
  check_in: string;
  check_out: string;
  tolerance_min: number;
  break_min: number;
  active: boolean;
  created_at: string;
}

export interface EmployeeScheduleRow {
  id: string;
  employee_id: string;
  schedule_id: string;
  effective_from: string;
  effective_to: string | null;
  active: boolean;
  created_at: string;
}

export interface LoginResponse {
  access_token: string;
  user: { id: string; email: string };
  employee: EmployeeWithRelations;
}

// ---------- Fase 3: Smart Display / TV ----------

export type DisplayAuthReason =
  | 'display_not_found'
  | 'display_inactive'
  | 'token_invalid'
  | 'token_revoked';

export type AuthenticatedDisplay = NonNullable<DisplayAuthResult['display']>;

export interface DisplayAuthResult {
  ok: boolean;
  reason?: DisplayAuthReason;
  display?: {
    id: string;
    name: string;
    code: string;
    status: string;
    is_active: boolean;
    branch_id: string | null;
    settings: Record<string, unknown>;
  };
  token_id?: string;
}

export interface DisplaySnapshotCounts {
  total: number;
  present: number;
  late: number;
  excused: number;
  missing: number;
}

export interface DisplayLastCheck {
  id: string;
  name: string;
  check_type: string;
  label: string;
  time: string;
  full_time: string;
  status: string;
}

export interface DisplayMediaItem {
  id: string | null;
  kind: 'image' | 'video' | 'url' | string | null;
  title: string | null;
  file_path: string | null;
  url: string | null;
  mime_type: string | null;
  duration_s: number | null;
  signed_url?: string | null;
}

export interface DisplayPlaylistItem {
  position: number;
  item_type: 'stats' | 'announcement' | 'media';
  item_id: string | null;
  duration_s: number;
  announcement: { id: string; title: string; body: string } | null;
  media: DisplayMediaItem | null;
}

export interface DisplaySnapshot {
  display_id: string;
  generated_at: string;
  branch: { id: string | null; name: string | null; address: string | null };
  counts: DisplaySnapshotCounts;
  last_checks: DisplayLastCheck[];
  announcements: { id: string; title: string; body: string }[];
  playlist: DisplayPlaylistItem[];
  config: {
    stats_s: number;
    announcement_s: number;
    media_s: number;
    check_overlay_s: number;
  };
}

export interface RegisterDisplayResult {
  display: { id: string; name: string; code: string; branch_id: string | null };
  wsUrl: string;
  snapshot: DisplaySnapshot;
}