import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { Branch, Department, Position, Schedule, Employee } from './types';

export function useBranches(enabled = true) {
  return useQuery({ queryKey: ['branches'], queryFn: () => api.get<Branch[]>('/branches'), enabled });
}

export function useDepartments(enabled = true) {
  return useQuery({ queryKey: ['departments'], queryFn: () => api.get<Department[]>('/departments'), enabled });
}

export function usePositions(enabled = true) {
  return useQuery({ queryKey: ['positions'], queryFn: () => api.get<Position[]>('/positions'), enabled });
}

export function useSchedules(enabled = true) {
  return useQuery({ queryKey: ['schedules'], queryFn: () => api.get<Schedule[]>('/schedules'), enabled });
}

export function useActiveEmployees(enabled = true) {
  return useQuery({
    queryKey: ['employees', 'active'],
    queryFn: () =>
      api.get<{ data: Employee[] }>(`/employees?limit=100&active=true`).then((r) => r.data),
    enabled,
  });
}