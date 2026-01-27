import { useQuery } from "@tanstack/react-query";
import { supabaseClient } from "@/lib/supabase-client";
import { logger } from "@/lib/logger";

interface DashboardStats {
  leiloes_agendados: number;
  leiloes_em_andamento: number;
  leiloes_finalizados: number;
  total_leiloes: number;
  total_custos: number;
  total_arrematantes: number;
  arrematantes_atrasados: number;
  arrematantes_pendentes: number;
  faturas_em_aberto: number;
  faturas_atrasadas: number;
  valor_faturas_pendentes: number;
  total_a_receber: number;
  total_recebido: number;
}

const DASHBOARD_STATS_KEY = ["dashboard-stats"] as const;

export function useDashboardStats() {
  const query = useQuery({
    queryKey: DASHBOARD_STATS_KEY,
    queryFn: async (): Promise<DashboardStats> => {
      // ✅ CORREÇÃO: Usar .maybeSingle() para evitar erro 406 se view estiver vazia
      const { data, error } = await supabaseClient
        .from('dashboard_stats')
        .select('*')
        .maybeSingle();

      // Se erro que não seja "sem resultados", lançar
      if (error) {
        logger.error('Erro ao buscar estatísticas do dashboard:', error);
        throw error;
      }
      
      // Se não houver dados (view vazia), retornar valores padrão
      if (!data) {
        logger.warn('⚠️ Dashboard stats vazia, retornando valores padrão');
        return {
          leiloes_agendados: 0,
          leiloes_em_andamento: 0,
          leiloes_finalizados: 0,
          total_leiloes: 0,
          total_custos: 0,
          total_arrematantes: 0,
          arrematantes_atrasados: 0,
          arrematantes_pendentes: 0,
          faturas_em_aberto: 0,
          faturas_atrasadas: 0,
          valor_faturas_pendentes: 0,
          total_a_receber: 0,
          total_recebido: 0,
        };
      }
      
      // Type assertion para acessar propriedades que sabemos que existem na view
      const statsData = data as Record<string, unknown>;
      
      return {
        leiloes_agendados: Number(statsData.leiloes_agendados) || 0,
        leiloes_em_andamento: Number(statsData.leiloes_em_andamento) || 0,
        leiloes_finalizados: Number(statsData.leiloes_finalizados) || 0,
        total_leiloes: Number(statsData.total_leiloes) || 0,
        total_custos: Number(statsData.total_custos) || 0,
        total_arrematantes: Number(statsData.total_arrematantes) || 0,
        arrematantes_atrasados: Number(statsData.arrematantes_atrasados) || 0,
        arrematantes_pendentes: Number(statsData.arrematantes_pendentes) || 0,
        faturas_em_aberto: Number(statsData.faturas_em_aberto) || 0,
        faturas_atrasadas: Number(statsData.faturas_atrasadas) || 0,
        valor_faturas_pendentes: Number(statsData.valor_faturas_pendentes) || 0,
        total_a_receber: Number(statsData.total_a_receber) || 0,
        total_recebido: Number(statsData.total_recebido) || 0,
      };
    },
    refetchInterval: 30000, // Recarregar a cada 30 segundos
  });

  return {
    stats: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
  };
}
