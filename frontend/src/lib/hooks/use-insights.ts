import { useQuery } from '@tanstack/react-query'
import { insightsApi } from '@/lib/api/insights'
import { QUERY_KEYS } from '@/lib/api/query-client'

export function useInsight(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['insights', id],
    queryFn: () => insightsApi.get(id),
    enabled: options?.enabled !== false && !!id,
    staleTime: 30 * 1000, // 30 seconds
  })
}

/**
 * A source's insights. Views open on the same source at once (its panel and
 * its chat's reference titles) share one request.
 */
export function useSourceInsights(sourceId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.sourceInsights(sourceId),
    queryFn: () => insightsApi.listForSource(sourceId),
    enabled: !!sourceId,
    // Insights also appear in the background (a transformation finishing),
    // so a view that opens the source reads them again.
    staleTime: 0,
  })
}
