export interface Pagination {
  page: number;
  limit: number;
  offset: number;
}

export interface PageResult<T> {
  data: T[];
  page: number;
  limit: number;
  total: number | null;
  hasMore: boolean;
}

export function buildPagination(page?: number, limit?: number): Pagination {
  const safePage = Math.max(1, Math.min(page ?? 1, 1_000_000));
  const safeLimit = Math.max(1, Math.min(limit ?? 20, 100));
  return {
    page: safePage,
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit,
  };
}