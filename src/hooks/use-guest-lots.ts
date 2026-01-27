import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@/lib/supabase-client";

// Tipos para o lote de convidado
export interface GuestLotMerchandise {
  id: string;
  guest_lot_id: string;
  nome: string;
  descricao: string;
  quantidade: number;
  valor_estimado?: number;
  created_at?: string;
  updated_at?: string;
}

export interface GuestLotArrematante {
  id: string;
  nome: string;
  email?: string;
  telefone?: string;
  pago?: boolean;
  valor_pagar_numerico?: number;
}

export interface GuestLot {
  id: string;
  numero: string;
  descricao: string;
  proprietario: string;
  codigo_pais: string;
  celular_proprietario: string;
  email_proprietario: string;
  leilao_id?: string;
  leilao_nome?: string; // Preenchido via join
  imagens?: string[];
  documentos?: string[];
  observacoes?: string;
  status: 'disponivel' | 'arrematado' | 'arquivado';
  arquivado: boolean;
  mercadorias: GuestLotMerchandise[];
  arrematantes?: GuestLotArrematante[]; // Arrematantes vinculados ao lote
  created_at: string;
  updated_at: string;
}

export interface CreateGuestLotData {
  numero: string;
  descricao: string;
  proprietario: string;
  codigo_pais: string;
  celular_proprietario: string;
  email_proprietario: string;
  leilao_id?: string;
  imagens?: string[];
  documentos?: string[];
  observacoes?: string;
  mercadorias: Array<{
    nome: string;
    descricao: string;
    quantidade: number;
    valor_estimado?: number;
  }>;
}

const GUEST_LOTS_KEY = ["guest-lots"] as const;

export function useGuestLots() {
  const queryClient = useQueryClient();

  // Query para listar lotes de convidados
  const listQuery = useQuery({
    queryKey: GUEST_LOTS_KEY,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data: lotsData, error: lotsError } = await supabaseClient
        .from('guest_lots')
        .select(`
          id,
          numero,
          descricao,
          proprietario,
          codigo_pais,
          celular_proprietario,
          email_proprietario,
          leilao_id,
          imagens,
          documentos,
          observacoes,
          status,
          arquivado,
          created_at,
          updated_at,
          auctions!guest_lots_leilao_id_fkey (
            nome
          )
        `)
        .order('created_at', { ascending: false });

      if (lotsError) throw lotsError;

      // Buscar mercadorias para cada lote
      const lotsWithMerchandise = await Promise.all(
        (lotsData || []).map(async (lot) => {
          const { data: merchandiseData, error: merchandiseError } = await supabaseClient
            .from('guest_lot_merchandise')
            .select('*')
            .eq('guest_lot_id', lot.id)
            .order('created_at', { ascending: true });

          if (merchandiseError) {
            console.error('Erro ao buscar mercadorias:', merchandiseError);
          }

          // Buscar arrematantes vinculados ao lote
          const { data: arrematantesData, error: arrematantesError } = await supabaseClient
            .from('bidders')
            .select('id, nome, email, telefone, pago, valor_pagar_numerico')
            .eq('guest_lot_id', lot.id);

          if (arrematantesError) {
            console.error('Erro ao buscar arrematantes:', arrematantesError);
          }

          return {
            id: lot.id,
            numero: lot.numero,
            descricao: lot.descricao,
            proprietario: lot.proprietario,
            codigo_pais: lot.codigo_pais,
            celular_proprietario: lot.celular_proprietario,
            email_proprietario: lot.email_proprietario,
            leilao_id: lot.leilao_id || undefined,
            leilao_nome: (lot.auctions as any)?.nome || undefined,
            imagens: (lot.imagens as any) || [],
            documentos: (lot.documentos as any) || [],
            observacoes: lot.observacoes || undefined,
            status: lot.status as 'disponivel' | 'arrematado' | 'arquivado',
            arquivado: lot.arquivado || false,
            mercadorias: merchandiseData || [],
            arrematantes: arrematantesData || [],
            created_at: lot.created_at || '',
            updated_at: lot.updated_at || '',
          } as GuestLot;
        })
      );

      return lotsWithMerchandise;
    },
  });

  // Mutation para criar lote de convidado
  const createMutation = useMutation({
    mutationFn: async (data: CreateGuestLotData) => {
      // 1. Criar o lote
      const { data: createdLot, error: lotError } = await supabaseClient
        .from('guest_lots')
        .insert({
          numero: data.numero,
          descricao: data.descricao,
          proprietario: data.proprietario,
          codigo_pais: data.codigo_pais,
          celular_proprietario: data.celular_proprietario,
          email_proprietario: data.email_proprietario,
          leilao_id: data.leilao_id || null,
          imagens: data.imagens || [],
          documentos: data.documentos || [],
          observacoes: data.observacoes || null,
          status: 'disponivel',
          arquivado: false,
        })
        .select()
        .single();

      if (lotError) throw lotError;

      // 2. Criar as mercadorias
      if (data.mercadorias && data.mercadorias.length > 0) {
        const merchandiseToInsert = data.mercadorias.map((merc) => ({
          guest_lot_id: createdLot.id,
          nome: merc.nome,
          descricao: merc.descricao,
          quantidade: merc.quantidade,
          valor_estimado: (merc.valor_estimado && merc.valor_estimado > 0) ? merc.valor_estimado : null,
        }));

        const { error: merchandiseError } = await supabaseClient
          .from('guest_lot_merchandise')
          .insert(merchandiseToInsert);

        if (merchandiseError) throw merchandiseError;
      }

      // 3. Se houver leilao_id, adicionar o lote ao array lotes do leilão
      if (data.leilao_id) {
        // Buscar o leilão atual
        const { data: auctionData, error: auctionFetchError } = await supabaseClient
          .from('auctions')
          .select('lotes')
          .eq('id', data.leilao_id)
          .single();

        if (auctionFetchError) {
          console.error('Erro ao buscar leilão:', auctionFetchError);
        } else {
          const lotesExistentes = auctionData.lotes || [];
          
          // ✅ VERIFICAR se o lote já existe no array (prevenir duplicação)
          const loteJaExiste = lotesExistentes.some((l: any) => l.guestLotId === createdLot.id);
          
          if (!loteJaExiste) {
            console.log('➕ Adicionando lote convidado ao array do leilão (não existe ainda)');
            
            // Adicionar o lote convidado ao array de lotes
            const lotesAtualizados = [...lotesExistentes, {
              id: `guest-${createdLot.id}`,
              numero: data.numero,
              descricao: data.descricao,
              isConvidado: true,
              guestLotId: createdLot.id,
              proprietario: data.proprietario,
              codigoPais: data.codigo_pais,
              celularProprietario: data.celular_proprietario,
              emailProprietario: data.email_proprietario,
              documentos: data.documentos || [],
              imagens: data.imagens || [],
              mercadorias: data.mercadorias.map((m, index) => ({
                id: `merc-${index}`,
                titulo: m.nome,
                nome: m.nome,
                tipo: m.nome,
                descricao: m.descricao,
                quantidade: m.quantidade,
                valorNumerico: m.valor_estimado || 0,
                valor: m.valor_estimado ? `R$ ${m.valor_estimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00'
              }))
            }];

            // Atualizar o leilão
            const { error: auctionUpdateError } = await supabaseClient
              .from('auctions')
              .update({ lotes: lotesAtualizados })
              .eq('id', data.leilao_id);

            if (auctionUpdateError) {
              console.error('Erro ao atualizar leilão com lote convidado:', auctionUpdateError);
            }
          } else {
            console.log('ℹ️ Lote convidado já existe no array do leilão, pulando adição para evitar duplicação');
          }
        }
      }

      return createdLot;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GUEST_LOTS_KEY });
      queryClient.invalidateQueries({ queryKey: ['auctions'] }); // Invalida também os leilões
    },
  });

  // Mutation para atualizar lote de convidado
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateGuestLotData> }) => {
      // 1. Buscar o lote antigo para comparar leilao_id
      const { data: oldLot } = await supabaseClient
        .from('guest_lots')
        .select('leilao_id, numero, descricao')
        .eq('id', id)
        .single();

      // 2. Atualizar o lote
      const updateData: any = {};
      
      if (data.numero !== undefined) updateData.numero = data.numero;
      if (data.descricao !== undefined) updateData.descricao = data.descricao;
      if (data.proprietario !== undefined) updateData.proprietario = data.proprietario;
      if (data.codigo_pais !== undefined) updateData.codigo_pais = data.codigo_pais;
      if (data.celular_proprietario !== undefined) updateData.celular_proprietario = data.celular_proprietario;
      if (data.email_proprietario !== undefined) updateData.email_proprietario = data.email_proprietario;
      if (data.leilao_id !== undefined) updateData.leilao_id = data.leilao_id || null;
      if (data.imagens !== undefined) updateData.imagens = data.imagens;
      if (data.documentos !== undefined) updateData.documentos = data.documentos;
      if (data.observacoes !== undefined) updateData.observacoes = data.observacoes;

      const { data: updatedLot, error: lotError } = await supabaseClient
        .from('guest_lots')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (lotError) throw lotError;

      // 3. Atualizar mercadorias (deletar antigas e criar novas)
      if (data.mercadorias !== undefined) {
        // Deletar mercadorias antigas
        const { error: deleteError } = await supabaseClient
          .from('guest_lot_merchandise')
          .delete()
          .eq('guest_lot_id', id);

        if (deleteError) throw deleteError;

        // Inserir novas mercadorias
        if (data.mercadorias.length > 0) {
          const merchandiseToInsert = data.mercadorias.map((merc) => ({
            guest_lot_id: id,
            nome: merc.nome,
            descricao: merc.descricao,
            quantidade: merc.quantidade,
            valor_estimado: (merc.valor_estimado && merc.valor_estimado > 0) ? merc.valor_estimado : null,
          }));

          const { error: merchandiseError } = await supabaseClient
            .from('guest_lot_merchandise')
            .insert(merchandiseToInsert);

          if (merchandiseError) throw merchandiseError;
        }
      }

      // 4. Se o leilao_id mudou, atualizar os leilões
      const newLeilaoId = data.leilao_id !== undefined ? data.leilao_id : oldLot?.leilao_id;
      const oldLeilaoId = oldLot?.leilao_id;

      // Remover do leilão antigo (se houver)
      if (oldLeilaoId && oldLeilaoId !== newLeilaoId) {
        const { data: oldAuctionData } = await supabaseClient
          .from('auctions')
          .select('lotes')
          .eq('id', oldLeilaoId)
          .single();

        if (oldAuctionData) {
          const lotesAtualizados = (oldAuctionData.lotes || []).filter(
            (l: any) => l.guestLotId !== id
          );

          await supabaseClient
            .from('auctions')
            .update({ lotes: lotesAtualizados })
            .eq('id', oldLeilaoId);
        }
      }

      // Adicionar/atualizar no novo leilão (se houver)
      if (newLeilaoId) {
        const { data: newAuctionData } = await supabaseClient
          .from('auctions')
          .select('lotes')
          .eq('id', newLeilaoId)
          .single();

        if (newAuctionData) {
          let lotesAtualizados = newAuctionData.lotes || [];
          const loteExistente = lotesAtualizados.findIndex((l: any) => l.guestLotId === id);

          const loteAtualizado = {
            id: `guest-${id}`,
            numero: data.numero || updatedLot.numero,
            descricao: data.descricao || updatedLot.descricao,
            isConvidado: true,
            guestLotId: id,
            proprietario: data.proprietario || updatedLot.proprietario,
            codigoPais: data.codigo_pais || updatedLot.codigo_pais,
            celularProprietario: data.celular_proprietario || updatedLot.celular_proprietario,
            emailProprietario: data.email_proprietario || updatedLot.email_proprietario,
            documentos: data.documentos !== undefined ? data.documentos : updatedLot.documentos || [],
            imagens: data.imagens !== undefined ? data.imagens : updatedLot.imagens || [],
            mercadorias: data.mercadorias ? data.mercadorias.map((m, index) => ({
              id: `merc-${index}`,
              titulo: m.nome,
              nome: m.nome,
              tipo: m.nome,
              descricao: m.descricao,
              quantidade: m.quantidade,
              valorNumerico: m.valor_estimado || 0,
              valor: m.valor_estimado ? `R$ ${m.valor_estimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00'
            })) : []
          };

          if (loteExistente >= 0) {
            // ✅ Atualizar lote existente (previne duplicação)
            console.log('🔄 Atualizando lote convidado existente no array');
            lotesAtualizados[loteExistente] = loteAtualizado;
          } else {
            // ✅ Adicionar novo lote apenas se não existir
            console.log('➕ Adicionando novo lote convidado ao array');
            lotesAtualizados.push(loteAtualizado);
          }

          await supabaseClient
            .from('auctions')
            .update({ lotes: lotesAtualizados })
            .eq('id', newLeilaoId);
        }
      }

      return updatedLot;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GUEST_LOTS_KEY });
      queryClient.invalidateQueries({ queryKey: ['auctions'] }); // Invalida também os leilões
    },
  });

  // Mutation para deletar lote de convidado
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // 1. Buscar o lote para obter o leilao_id
      const { data: lot } = await supabaseClient
        .from('guest_lots')
        .select('leilao_id')
        .eq('id', id)
        .single();

      // 2. Deletar arrematantes vinculados a este lote de convidado (guest_lot_id)
      const { error: biddersError } = await supabaseClient
        .from('bidders')
        .delete()
        .eq('guest_lot_id', id);

      if (biddersError) {
        console.error('Erro ao deletar arrematantes do lote:', biddersError);
        // Continuar com a exclusão do lote mesmo se houver erro
      }

      // 3. Se o lote está vinculado a um leilão, deletar arrematantes do array do leilão também
      if (lot?.leilao_id) {
        const { data: auctionData } = await supabaseClient
          .from('auctions')
          .select('lotes, arrematantes')
          .eq('id', lot.leilao_id)
          .single();

        if (auctionData) {
          // Encontrar o lote no array para pegar seu lote_id interno
          const loteNoArray = (auctionData.lotes || []).find(
            (l: any) => l.guestLotId === id
          );

          if (loteNoArray) {
            const loteIdInterno = loteNoArray.id;

            // Deletar arrematantes da tabela que têm esse lote_id e estão vinculados ao leilão
            const { error: auctionBiddersError } = await supabaseClient
              .from('bidders')
              .delete()
              .eq('auction_id', lot.leilao_id)
              .eq('lote_id', loteIdInterno);

            if (auctionBiddersError) {
              console.error('Erro ao deletar arrematantes do leilão:', auctionBiddersError);
            }

            // Remover arrematantes do array de arrematantes do leilão
            const arrematantesAtualizados = (auctionData.arrematantes || []).filter(
              (a: any) => a.loteId !== loteIdInterno
            );

            // Remover lote do array de lotes
            const lotesAtualizados = (auctionData.lotes || []).filter(
              (l: any) => l.guestLotId !== id
            );

            // Atualizar o leilão removendo o lote e os arrematantes
            await supabaseClient
              .from('auctions')
              .update({ 
                lotes: lotesAtualizados,
                arrematantes: arrematantesAtualizados
              })
              .eq('id', lot.leilao_id);
          } else {
            // Se não encontrou o lote no array, apenas remover do array de lotes
            const lotesAtualizados = (auctionData.lotes || []).filter(
              (l: any) => l.guestLotId !== id
            );

            await supabaseClient
              .from('auctions')
              .update({ lotes: lotesAtualizados })
              .eq('id', lot.leilao_id);
          }
        }
      }

      // 4. Deletar o lote (cascata deletará mercadorias)
      const { error } = await supabaseClient
        .from('guest_lots')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GUEST_LOTS_KEY });
      queryClient.invalidateQueries({ queryKey: ['auctions'] }); // Invalida também os leilões
    },
  });

  // Mutation para arquivar lote de convidado
  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabaseClient
        .from('guest_lots')
        .update({ arquivado: true })
        .eq('id', id)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GUEST_LOTS_KEY }),
  });

  // Mutation para desarquivar lote de convidado
  const unarchiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabaseClient
        .from('guest_lots')
        .update({ arquivado: false })
        .eq('id', id)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GUEST_LOTS_KEY }),
  });

  // Mutation para atualizar status do lote
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'disponivel' | 'arrematado' | 'arquivado' }) => {
      const { data, error } = await supabaseClient
        .from('guest_lots')
        .update({ status })
        .eq('id', id)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GUEST_LOTS_KEY }),
  });

  return useMemo(() => ({
    guestLots: listQuery.data || [],
    isLoading: listQuery.isLoading,
    isFetching: listQuery.isFetching,
    error: listQuery.error,
    createGuestLot: createMutation.mutateAsync,
    updateGuestLot: updateMutation.mutateAsync,
    deleteGuestLot: deleteMutation.mutateAsync,
    archiveGuestLot: archiveMutation.mutateAsync,
    unarchiveGuestLot: unarchiveMutation.mutateAsync,
    updateGuestLotStatus: updateStatusMutation.mutateAsync,
  }), [
    listQuery.data,
    listQuery.isLoading,
    listQuery.isFetching,
    listQuery.error,
    createMutation.mutateAsync,
    updateMutation.mutateAsync,
    deleteMutation.mutateAsync,
    archiveMutation.mutateAsync,
    unarchiveMutation.mutateAsync,
    updateStatusMutation.mutateAsync,
  ]);
}
