import { lazy, Suspense } from 'react';
import { Loader } from '@mantine/core';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShellLayout } from './layouts/AppShellLayout';
import { RequireAuth, RequirePerm } from './components/guard';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import EmployeesPage from './pages/EmployeesPage';
import SchedulesPage from './pages/SchedulesPage';
import AttendancePage from './pages/AttendancePage';
import IncidentsPage from './pages/IncidentsPage';
import BranchesPage from './pages/BranchesPage';
import DepartmentsPage from './pages/DepartmentsPage';
import PositionsPage from './pages/PositionsPage';
import DisplaysPage from './pages/DisplaysPage';
import DisplayMonitorPage from './pages/DisplayMonitorPage';
import DevicesPage from './pages/DevicesPage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import MediaPage from './pages/MediaPage';
import PlaylistsPage from './pages/PlaylistsPage';
import AuditPage from './pages/AuditPage';
import ForbiddenPage from './pages/ForbiddenPage';

const ReportsPage = lazy(() => import('./pages/ReportsPage'));

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forbidden" element={<ForbiddenPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShellLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/employees" element={<RequirePerm permission="employees.read"><EmployeesPage /></RequirePerm>} />
          <Route path="/schedules" element={<RequirePerm permission="schedules.read"><SchedulesPage /></RequirePerm>} />
          <Route path="/attendance" element={<RequirePerm permission="attendance.read"><AttendancePage /></RequirePerm>} />
          <Route path="/incidents" element={<RequirePerm permission="offtime.approve"><IncidentsPage /></RequirePerm>} />
          <Route path="/branches" element={<RequirePerm permission="branches.read"><BranchesPage /></RequirePerm>} />
          <Route path="/departments" element={<RequirePerm permission="departments.read"><DepartmentsPage /></RequirePerm>} />
          <Route path="/positions" element={<RequirePerm permission="positions.read"><PositionsPage /></RequirePerm>} />
          <Route path="/displays" element={<RequirePerm permission="displays.read"><DisplaysPage /></RequirePerm>} />
          <Route path="/displays/monitor" element={<RequirePerm permission="displays.read"><DisplayMonitorPage /></RequirePerm>} />
          <Route path="/devices" element={<RequirePerm permission="attendance.read"><DevicesPage /></RequirePerm>} />
          <Route path="/announcements" element={<RequirePerm permission="announcements.read"><AnnouncementsPage /></RequirePerm>} />
          <Route path="/media" element={<RequirePerm permission="media.read"><MediaPage /></RequirePerm>} />
          <Route path="/playlists" element={<RequirePerm permission="displays.read"><PlaylistsPage /></RequirePerm>} />
          <Route
            path="/reports"
            element={
              <RequirePerm permission="reports.export">
                <Suspense fallback={<Loader />}>
                  <ReportsPage />
                </Suspense>
              </RequirePerm>
            }
          />
          <Route path="/audit" element={<RequirePerm permission="audit.read"><AuditPage /></RequirePerm>} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}