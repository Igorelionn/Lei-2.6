import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabaseClient } from '@/lib/supabase-client';
import { logger } from '@/lib/logger';

export function useRealtimeSync() {
  const queryClient = useQueryClient();
  
  // 🔒 FIX MEMORY LEAK: Usar ref para evitar recriação de channels
  const queryClientRef = useRef(queryClient);
  
  // ⚡ PERFORMANCE: Debounce para invalidações (evitar múltiplas invalidações simultâneas)
  const invalidationTimersRef = useRef<Record<string, NodeJS.Timeout>>({});
  
  const debouncedInvalidate = (queryKey: string[], delay = 500) => {
    const key = queryKey.join('-');
    
    // Limpar timer anterior se existir
    if (invalidationTimersRef.current[key]) {
      clearTimeout(invalidationTimersRef.current[key]);
    }
    
    // Criar novo timer
    invalidationTimersRef.current[key] = setTimeout(() => {
      queryClientRef.current.invalidateQueries({ queryKey });
      delete invalidationTimersRef.current[key];
    }, delay);
  };
  
  useEffect(() => {
    queryClientRef.current = queryClient;
  }, [queryClient]);

  useEffect(() => {
    // Configurar sincronização para leilões
    const auctionsChannel = supabaseClient
      .channel('auctions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'auctions',
        },
        (_payload) => {
          // ⚡ OTIMIZAÇÃO: Usar debounce para evitar múltiplas invalidações
          debouncedInvalidate(['supabase-auctions']);
          debouncedInvalidate(['dashboard-stats'], 1000);
        }
      )
      .subscribe();

    // Configurar sincronização para arrematantes
    const biddersChannel = supabaseClient
      .channel('bidders-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bidders',
        },
        (_payload) => {
          // ⚡ OTIMIZAÇÃO: Usar debounce para evitar múltiplas invalidações
          debouncedInvalidate(['supabase-bidders']);
          debouncedInvalidate(['supabase-auctions'], 700);
          debouncedInvalidate(['dashboard-stats'], 1000);
        }
      )
      .subscribe();

    // Configurar sincronização para lotes
    const lotsChannel = supabaseClient
      .channel('lots-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lots',
        },
        (payload) => {
          logger.debug('Lot change received', { payload });
          // ⚡ OTIMIZAÇÃO: Usar debounce para evitar múltiplas invalidações
          debouncedInvalidate(['supabase-lots']);
          debouncedInvalidate(['dashboard-stats'], 1000);
        }
      )
      .subscribe();

    // Configurar sincronização para mercadorias
    const merchandiseChannel = supabaseClient
      .channel('merchandise-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'merchandise',
        },
        (payload) => {
          logger.debug('Merchandise change received', { payload });
          // ⚡ OTIMIZAÇÃO: Usar debounce para evitar múltiplas invalidações
          debouncedInvalidate(['supabase-merchandise']);
        }
      )
      .subscribe();

    // Configurar sincronização para lotes de convidados
    const guestLotsChannel = supabaseClient
      .channel('guest-lots-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'guest_lots',
        },
        (_payload) => {
          logger.debug('Guest lot change received');
          // ⚡ OTIMIZAÇÃO: Usar debounce para evitar múltiplas invalidações
          debouncedInvalidate(['guest-lots']);
        }
      )
      .subscribe();

    // ⚡ PERFORMANCE: Cleanup de timers ao desmontar
    return () => {
      Object.values(invalidationTimersRef.current).forEach(timer => clearTimeout(timer));
      invalidationTimersRef.current = {};
      
      auctionsChannel.unsubscribe();
      biddersChannel.unsubscribe();
      lotsChannel.unsubscribe();
      merchandiseChannel.unsubscribe();
      guestLotsChannel.unsubscribe();
    };
  }, []);


  return {
    // Função para forçar sincronização manual
    forceSyncAll: () => {
      queryClient.invalidateQueries({ queryKey: ['supabase-auctions'] });
      queryClient.invalidateQueries({ queryKey: ['supabase-bidders'] });
      queryClient.invalidateQueries({ queryKey: ['supabase-lots'] });
      queryClient.invalidateQueries({ queryKey: ['supabase-merchandise'] });
      queryClient.invalidateQueries({ queryKey: ['supabase-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['supabase-documents'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  };
}
