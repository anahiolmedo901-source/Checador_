export type Branch = {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lon: number;
  radius_m: number;
};

export type Shift = {
  id: string;
  name: string;
  code?: string;
  start_time: string;
  end_time: string;
  tolerance_min: number;
  break_min: number;
};

export type Employee = {
  id: string;
  code: string;
  full_name: string;
  photo_url: string | null;
  role: 'employee' | 'hr' | 'admin';
  active: boolean;
};

export type EmployeeProfile = {
  employee: Employee;
  branch: Branch | null;
  shift: Shift | null;
  department?: { id: string; name: string; code: string } | null;
  position?: { id: string; title: string; code: string } | null;
};

export type AttendanceStatus = 'on_time' | 'late' | 'out_of_window' | 'excused';

export type CheckKind = 'check_in' | 'check_out' | 'break_out' | 'break_in';

export type Attendance = {
  id: string;
  employee_id: string;
  branch_id: string | null;
  device_id: string | null;
  check_date: string | null;
  check_in: string | null;
  check_out: string | null;
  break_out_at: string | null;
  break_in_at: string | null;
  status: AttendanceStatus;
  photo_url: string | null;
  photo_out_url: string | null;
  lat: number | null;
  lon: number | null;
  accuracy_m: number | null;
  lat_out: number | null;
  lon_out: number | null;
  accuracy_out_m: number | null;
  source: string | null;
  created_at: string | null;
  is_open: boolean | null;
  minutes_worked: number | null;
  branch_name: string | null;
  branch_address: string | null;
};

export type AttendanceEvent = {
  id: string;
  check_type: CheckKind;
  happened_at: string;
  status: AttendanceStatus;
  photo_url: string | null;
  lat: number | null;
  lon: number | null;
  accuracy_m: number | null;
  source: string | null;
};

export type EvidenceKind = 'photo' | 'video' | 'signature';

export type EvidenceItem = {
  id: string;
  attendance_id: string;
  kind: EvidenceKind;
  file_path: string;
  uploaded_at: string | null;
};

export type AttendanceDetail = {
  session: Attendance;
  events: AttendanceEvent[];
  evidence: EvidenceItem[];
};

export type DeviceAuthorization = 'authorized' | 'pending' | 'denied';

export type DeviceInfo = {
  id: string;
  authorization: DeviceAuthorization;
  is_active: boolean;
  employee_id: string | null;
};

export type DeviceSummary = {
  id: string;
  authorization: DeviceAuthorization;
  is_active: boolean;
};

export type SessionState = {
  session: Attendance | null;
  next_check: CheckKind;
  device: DeviceSummary | null;
  entry_window?: {
    allowed: boolean;
    already_recorded?: boolean;
    message: string;
    schedule_name: string | null;
    start_time: string | null;
    end_time: string | null;
  };
};

export type LocationFix = {
  lat: number;
  lon: number;
  accuracy: number | null;
  distanceToBranch: number;
};
