import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabaseClient } from '@/lib/supabase-client';
import { Database } from '@/lib/database.types';

type Tables = Database['public']['Tables'];

export function useRealtimeSync() {
  const queryClient = useQueryClient();
  
  // 🔒 FIX MEMORY LEAK: Usar ref para evitar recriação de channels
  const queryClientRef = useRef(queryClient);
  
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
        (payload) => {
          // Invalidar queries relacionadas a leilões
          queryClientRef.current.invalidateQueries({ queryKey: ['supabase-auctions'] });
          queryClientRef.current.invalidateQueries({ queryKey: ['dashboard-stats'] });
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
        (payload) => {
          // Invalidar queries relacionadas a arrematantes
          queryClientRef.current.invalidateQueries({ queryKey: ['supabase-bidders'] });
          queryClientRef.current.invalidateQueries({ queryKey: ['supabase-auctions'] }); // Pode afetar arrematantes dos leilões
          queryClientRef.current.invalidateQueries({ queryKey: ['dashboard-stats'] });
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
          console.log('Lot change received:', payload);
          queryClientRef.current.invalidateQueries({ queryKey: ['supabase-lots'] });
          queryClientRef.current.invalidateQueries({ queryKey: ['dashboard-stats'] });
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
          console.log('Merchandise change received:', payload);
          queryClientRef.current.invalidateQueries({ queryKey: ['supabase-merchandise'] });
        }
      )
      .subscribe();

    // Configurar sincronização para faturas
    const invoicesChannel = supabaseClient
      .channel('invoices-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'invoices',
        },
        (payload) => {
          console.log('Invoice change received:', payload);
          queryClientRef.current.invalidateQueries({ queryKey: ['supabase-invoices'] });
          queryClientRef.current.invalidateQueries({ queryKey: ['dashboard-stats'] });
        }
      )
      .subscribe();

    // Configurar sincronização para documentos
    const documentsChannel = supabaseClient
      .channel('documents-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'documents',
        },
        (payload) => {
          console.log('Document change received:', payload);
          queryClientRef.current.invalidateQueries({ queryKey: ['supabase-documents'] });
        }
      )
      .subscribe();

    // Cleanup function
    return () => {
      supabaseClient.removeChannel(auctionsChannel);
      supabaseClient.removeChannel(biddersChannel);
      supabaseClient.removeChannel(lotsChannel);
      supabaseClient.removeChannel(merchandiseChannel);
      supabaseClient.removeChannel(invoicesChannel);
      supabaseClient.removeChannel(documentsChannel);
    };
  }, []); // 🔒 FIX MEMORY LEAK: Array vazio - channels criados apenas uma vez

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
