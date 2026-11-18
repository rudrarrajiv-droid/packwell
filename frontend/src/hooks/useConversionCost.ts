import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, subMonths } from 'date-fns';
import {
  DEFAULT_STANDARD_CONVERSION_COST,
  getCachedStandardConversionCost,
  getStandardConversionCost,
  getStandardConversionCostHistory,
  saveStandardConversionCost,
  fetchMultiMonthConversionMetrics,
} from '../lib/conversionCostService';

export function useConversionCost(selectedMonth?: string) {
  const queryClient = useQueryClient();
  const now = new Date();
  const currentMonth = format(now, 'yyyy-MM');
  const previousMonth = format(subMonths(now, 1), 'yyyy-MM');
  const targetMonth = selectedMonth || currentMonth;

  const { data: standardInfo, isLoading: loadingStandard } = useQuery({
    queryKey: ['standardConversionCost'],
    queryFn: getStandardConversionCost,
    initialData: () => ({
      rate: getCachedStandardConversionCost(),
      updatedBy: null,
      updatedAt: null,
    }),
    staleTime: 1000 * 60 * 5,
  });

  const { data: history = [], isLoading: loadingHistory } = useQuery({
    queryKey: ['standardConversionCostHistory'],
    queryFn: () => getStandardConversionCostHistory(15),
    staleTime: 1000 * 60 * 5,
  });

  const monthsToFetch = Array.from(new Set([targetMonth, currentMonth, previousMonth]));

  const {
    data: monthlyMetricsMap = {},
    isLoading: loadingMonthly,
    refetch: refetchMonthly,
  } = useQuery({
    queryKey: ['monthlyConversionStats', ...monthsToFetch],
    queryFn: () => fetchMultiMonthConversionMetrics(monthsToFetch),
    staleTime: 1000 * 60 * 2,
  });

  const updateRateMutation = useMutation({
    mutationFn: async ({ newRate, user }: { newRate: number; user: string }) => {
      return saveStandardConversionCost(
        newRate,
        user,
        standardInfo?.rate ?? DEFAULT_STANDARD_CONVERSION_COST
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['standardConversionCost'] });
      queryClient.invalidateQueries({ queryKey: ['standardConversionCostHistory'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-logs'] });
    },
  });

  return {
    currentMonth,
    previousMonth,
    targetMonth,
    standardRate: standardInfo?.rate ?? DEFAULT_STANDARD_CONVERSION_COST,
    standardInfo,
    history,
    loadingStandard,
    loadingHistory,
    loadingMonthly,
    refetchMonthly,
    currentMonthMetrics: monthlyMetricsMap[currentMonth] ?? null,
    previousMonthMetrics: monthlyMetricsMap[previousMonth] ?? null,
    targetMonthMetrics: monthlyMetricsMap[targetMonth] ?? null,
    monthlyMetricsMap,
    updateStandardRate: updateRateMutation.mutateAsync,
    isUpdatingRate: updateRateMutation.isPending,
  };
}
