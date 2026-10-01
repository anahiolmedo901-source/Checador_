export type Role = 'admin' | 'hr' | 'employee';

export interface Branch {
  id: string;
  name: string;
  address?: string | null;
  lat: number;
  lon: number;
  radius_m: number;
  active: boolean;
  created_at: string;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  active: boolean;
  created_at: string;
}

export interface Position {
  id: string;
  department_id?: string | null;
  title: string;
  code: string;
  active: boolean;
  created_at: string;
}

export interface Employee {
  id: string;
  code: string;
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  hire_date?: string | null;
  photo_url?: string | null;
  role: Role;
  active: boolean;
  branch_id?: string | null;
  department_id?: string | null;
  position_id?: string | null;
  branches?: { name: string } | null;
  departments?: { name: string } | null;
  positions?: { title: string } | null;
  created_at: string;
}

export interface PageResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface Schedule {
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

export interface EmployeeSchedule {
  id: string;
  employee_id: string;
  schedule_id: string;
  schedules?: { id: string; name: string } | null;
  effective_from: string;
  effective_to?: string | null;
  active: boolean;
  created_at: string;
}

export type DayStatus = 'on_time' | 'late' | 'out_of_window' | 'excused' | 'missing';

export interface AdminAttendanceRow {
  employee_id: string;
  code: string;
  full_name: string;
  photo_url?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  branch_name?: string | null;
  check_date: string;
  check_in?: string | null;
  check_out?: string | null;
  minutes_worked?: number | null;
  day_status: DayStatus;
  session_id?: string | null;
}

export interface SessionOverview {
  id: string;
  employee_id: string;
  branch_id?: string | null;
  device_id?: string | null;
  check_date: string;
  check_in: string | null;
  check_out: string | null;
  status: string | null;
  is_open?: boolean;
  minutes_worked?: number | null;
  branch_name?: string | null;
  branch_address?: string | null;
}

export interface AttendanceEvent {
  id: string;
  check_type?: string | null;
  happened_at?: string | null;
  status?: string | null;
  photo_url?: string | null;
  lat?: number | null;
  lon?: number | null;
  accuracy_m?: number | null;
  source?: string | null;
  note?: string | null;
}

export interface AttendanceEvidence {
  id: string;
  attendance_id?: string | null;
  kind?: string | null;
  file_path?: string | null;
  mime_type?: string | null;
  uploaded_at?: string | null;
  signed_url?: string | null;
}

export interface AttendanceDetail {
  session: SessionOverview;
  events: AttendanceEvent[];
  evidence: AttendanceEvidence[];
}

export interface OfftimeRequest {
  id: string;
  employee_id: string;
  employees?: { full_name?: string | null; code?: string } | null;
  off_type: 'permission' | 'vacation' | 'incapacity';
  starts_on: string;
  ends_on: string;
  reason?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  ticket: string;
  created_at: string;
}

export type IncidentType = 'late' | 'absent' | 'out_of_window' | 'location' | 'device' | 'duplicate' | 'other';

export interface Incident {
  id: string;
  employee_id: string;
  employees?: { full_name?: string | null; code?: string } | null;
  attendance_id?: string | null;
  incident_type: IncidentType;
  severity: 'info' | 'warning' | 'critical';
  detail?: Record<string, unknown> | null;
  status: 'open' | 'resolved';
  resolved_by?: string | null;
  resolved_at?: string | null;
  created_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience_role?: string[] | null;
  priority: 'low' | 'normal' | 'high' | 'critical';
  published_at?: string | null;
  expires_at?: string | null;
  active: boolean;
  created_by?: string | null;
  created_at: string;
}

export interface MediaItem {
  id: string;
  kind: 'image' | 'video' | 'url';
  title: string;
  file_path?: string | null;
  url?: string | null;
  signed_url?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  duration_s?: number | null;
  active: boolean;
  created_at: string;
}

export interface PlaylistItem {
  id: string;
  display_id: string;
  item_type: 'announcement' | 'media' | 'stats';
  item_id: string;
  position: number;
  duration_s: number;
  active: boolean;
  item_kind?: 'announcement' | 'media';
  item_title?: string;
}

export interface Display {
  id: string;
  name: string;
  code: string;
  branch_id?: string | null;
  branches?: { name: string } | null;
  status: 'online' | 'offline' | 'maintenance';
  settings?: Record<string, unknown> | null;
  is_active: boolean;
  software?: string | null;
  os_version?: string | null;
  last_seen_at?: string | null;
  created_at: string;
}

export interface DisplayToken {
  id: string;
  active: boolean;
  created_at: string;
  revoked_at?: string | null;
  last_used_at?: string | null;
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

export interface DisplaySnapshot {
  display_id: string;
  generated_at: string;
  branch: { id: string | null; name: string | null; address: string | null };
  counts: DisplaySnapshotCounts;
  last_checks: DisplayLastCheck[];
  announcements?: { id: string; title: string }[];
  playlist?: Array<{ item_type: string; duration_s?: number }>;
  config?: { stats_s?: number; announcement_s?: number; media_s?: number; check_overlay_s?: number };
}

export interface LiveCheckPayload {
  branch_id: string;
  displays: string[];
  check: {
    name: string;
    check_type: string;
    happened_at: string;
    time: string;
    full_time: string;
  };
}

export interface Device {
  id: string;
  employee_id?: string | null;
  employees?: { full_name?: string | null; code?: string } | null;
  device_identifier: string;
  platform?: string | null;
  model?: string | null;
  manufacturer?: string | null;
  os_version?: string | null;
  app_version?: string | null;
  authorization: 'authorized' | 'pending' | 'denied';
  is_active: boolean;
  last_seen_at?: string | null;
  created_at: string;
}

export interface AuditLogRow {
  id: number;
  actor_id?: string | null;
  employees?: { full_name?: string | null } | null;
  actor_role?: string | null;
  action: string;
  entity?: string | null;
  entity_id?: string | null;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  created_at: string;
}

export interface DashboardCounts {
  total: number;
  present: number;
  late: number;
  excused: number;
  open_sessions: number;
  missing: number;
}

export interface DashboardQueues {
  pending_offtime: number;
  open_incidents: number;
}

export interface DashboardSerie {
  date: string;
  present: number;
  late: number;
  missing: number;
}

export interface DashboardSummary {
  date: string;
  counts: DashboardCounts;
  queues: DashboardQueues;
  series: DashboardSerie[];
}

export interface ReportByDayRow {
  date: string;
  present: number;
  late: number;
  excused: number;
  missing: number;
  minutes: number;
  hours: number;
}

export interface ReportGroupResult {
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