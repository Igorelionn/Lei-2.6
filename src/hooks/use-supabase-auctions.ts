import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseClient } from "@/lib/supabase-client";
import { Auction, AuctionStatus, ItemCustoInfo, ItemPatrocinioInfo, LoteInfo } from "@/lib/types";
import { Database } from "@/lib/database.types";

type AuctionRow = Database['public']['Tables']['auctions']['Row'];
type AuctionInsert = Database['public']['Tables']['auctions']['Insert'];
type AuctionUpdate = Database['public']['Tables']['auctions']['Update'];

// Tipos auxiliares para substituir 'any'
interface DocumentRow {
  id: string | number;
  nome: string;
  tipo: string;
  tamanho: number;
  data_upload: string;
  url: string | null;
  categoria?: string;
  descricao?: string;
}

interface BidderRow {
  id?: string;
  nome: string;
  documento?: string;
  endereco?: string;
  cep?: string;
  rua?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  telefone?: string;
  email?: string;
  tipo_pagamento?: string;
  parcelas?: number;
  entrada_percentual?: number;
  entrada_valor?: number;
  juros_mensal?: number;
  multa_atraso?: number;
  tipo_juros_atraso?: string;
  valor_lance?: number;
  fator_multiplicador?: number;
  usa_fator_multiplicador?: boolean;
  // ✅ CORREÇÃO: Esses campos são INTEGER no banco, não arrays
  parcelas_triplas?: number;
  parcelas_duplas?: number;
  parcelas_simples?: number;
  data_entrada?: string;
  data_vencimento_vista?: string;
  pago?: boolean;
  mes_inicio_pagamento?: string;
  dia_vencimento_mensal?: number;
  lote_id?: string;
  mercadoria_id?: string;
  created_at?: string;
  valor_pagar_texto?: string;
  valor_pagar_numerico?: number;
  valor_entrada_texto?: string;
  quantidade_parcelas?: number;
  parcelas_pagas?: number;
  percentual_juros_atraso?: number;
}

// Tipos estendidos para incluir campos que não estão no schema gerado
interface ExtendedAuctionRow extends AuctionRow {
  detalhe_custos?: ItemCustoInfo[] | null;
  detalhe_patrocinios?: ItemPatrocinioInfo[] | null;
  patrocinios_total?: number | null;
  percentual_comissao_leiloeiro?: number | null;
  documents?: DocumentRow[];
  bidders?: BidderRow[];
}

interface ExtendedAuctionInsert extends AuctionInsert {
  detalhe_custos?: ItemCustoInfo[] | null;
  detalhe_patrocinios?: ItemPatrocinioInfo[] | null;
  patrocinios_total?: number | null;
  percentual_comissao_leiloeiro?: number | null;
}

interface ExtendedAuctionUpdate extends AuctionUpdate {
  detalhe_custos?: ItemCustoInfo[] | null;
  detalhe_patrocinios?: ItemPatrocinioInfo[] | null;
  patrocinios_total?: number | null;
  percentual_comissao_leiloeiro?: number | null;
}

interface BidderInsert {
  id?: string;
  auction_id: string;
  lote_id?: string | null;
  mercadoria_id?: string | null;
  nome: string;
  documento?: string | null;
  endereco?: string | null;
  cep?: string | null;
  rua?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  telefone?: string | null;
  email?: string | null;
  tipo_pagamento?: string | null;
  parcelas?: number | null;
  entrada_percentual?: number | null;
  entrada_valor?: number | null;
  juros_mensal?: number | null;
  multa_atraso?: number | null;
  tipo_juros_atraso?: string | null;
  valor_lance?: number | null;
  fator_multiplicador?: number | null;
  usa_fator_multiplicador?: boolean | null;
  // ✅ CORREÇÃO: Esses campos são INTEGER no banco, não arrays
  parcelas_triplas?: number | null;
  parcelas_duplas?: number | null;
  parcelas_simples?: number | null;
  data_entrada?: string | null;
  data_vencimento_vista?: string | null;
  pago?: boolean | null;
  mes_inicio_pagamento?: string | null;
  dia_vencimento_mensal?: number | null;
  valor_pagar_texto?: string | null;
  valor_pagar_numerico?: number | null;
  valor_entrada_texto?: string | null;
  quantidade_parcelas?: number | null;
  parcelas_pagas?: number | null;
  percentual_juros_atraso?: number | null;
}

const AUCTIONS_KEY = ["supabase-auctions"] as const;

// Função para calcular status automaticamente baseado nas datas
function calculateAuctionStatus(dataInicio: string, dataEncerramento?: string): AuctionStatus {
  // Criar datas usando apenas YYYY-MM-DD para evitar problemas de timezone
  const hoje = new Date();
  const hojeStr = hoje.getFullYear() + '-' + 
                 String(hoje.getMonth() + 1).padStart(2, '0') + '-' + 
                 String(hoje.getDate()).padStart(2, '0');
  
  // Normalizar as datas de entrada para formato YYYY-MM-DD
  const inicioNormalizado = dataInicio.length === 10 ? dataInicio : 
                           dataInicio.split('/').reverse().join('-');
  
  const encerramentoNormalizado = dataEncerramento ? 
    (dataEncerramento.length === 10 ? dataEncerramento : 
     dataEncerramento.split('/').reverse().join('-')) : null;
  
  // Comparação simples de strings no formato YYYY-MM-DD
  if (hojeStr < inicioNormalizado) {
    return "agendado";
  } else if (encerramentoNormalizado && hojeStr > encerramentoNormalizado) {
    return "finalizado";
  } else {
    return "em_andamento";
  }
}

// Função para converter dados do Supabase para o formato do app
function mapSupabaseAuctionToApp(auction: ExtendedAuctionRow): Auction {
  // Calcular status correto baseado nas datas
  const statusCalculado = calculateAuctionStatus(auction.data_inicio, auction.data_encerramento || undefined);
  
  return {
    id: auction.id,
    nome: auction.nome,
    identificacao: auction.identificacao || undefined,
    local: auction.local as Auction['local'],
    endereco: auction.endereco || undefined,
    dataInicio: auction.data_inicio,
    dataEncerramento: auction.data_encerramento || undefined,
    tipoPagamento: auction.tipo_pagamento as Auction['tipoPagamento'] || undefined,
    mesInicioPagamento: auction.mes_inicio_pagamento || undefined,
    diaVencimentoPadrao: auction.dia_vencimento_padrao || undefined,
    dataEntrada: auction.data_entrada || undefined,
    dataVencimentoVista: auction.data_vencimento_vista || undefined,
    parcelasPadrao: auction.parcelas_padrao || undefined,
    status: statusCalculado, // Usar status calculado em vez do status salvo
    custos: auction.custos_texto || undefined,
    custosNumerico: auction.custos_numerico ? Number(auction.custos_numerico) : undefined,
    detalheCustos: auction.detalhe_custos || undefined,
    detalhePatrocinios: auction.detalhe_patrocinios || undefined,
    patrociniosTotal: auction.patrocinios_total ? Number(auction.patrocinios_total) : undefined,
    percentualComissaoLeiloeiro: auction.percentual_comissao_leiloeiro ? Number(auction.percentual_comissao_leiloeiro) : undefined,
    lotes: (auction.lotes as unknown as LoteInfo[]) || [],
    fotosMercadoria: auction.documents?.filter((doc) => doc.categoria === 'leilao_fotos_mercadoria').map((doc) => ({
      id: doc.id.toString(),
      nome: doc.nome,
      tipo: doc.tipo,
      tamanho: doc.tamanho,
      dataUpload: doc.data_upload,
      url: doc.url || undefined // Usar URL salva no banco (base64)
    })) || [],
    documentos: auction.documents?.filter((doc) => doc.categoria === 'leilao_geral').map((doc) => ({
      id: doc.id.toString(),
      nome: doc.nome,
      tipo: doc.tipo,
      tamanho: doc.tamanho,
      dataUpload: doc.data_upload,
      url: doc.url || undefined // Usar URL salva no banco (base64 ou null para documentos)
    })) || [],
    historicoNotas: auction.historico_notas || undefined,
    arquivado: auction.arquivado || false,
  };
}

// Função para converter dados do app para o formato do Supabase
function mapAppAuctionToSupabase(auction: Omit<Auction, "id">): ExtendedAuctionInsert {
  return {
    nome: auction.nome,
    identificacao: auction.identificacao,
    local: auction.local as Database['public']['Enums']['location_type'],
    endereco: auction.endereco,
    data_inicio: auction.dataInicio,
    data_encerramento: auction.dataEncerramento,
    tipo_pagamento: auction.tipoPagamento,
    mes_inicio_pagamento: auction.mesInicioPagamento,
    dia_vencimento_padrao: auction.diaVencimentoPadrao,
    data_entrada: auction.dataEntrada,
    data_vencimento_vista: auction.dataVencimentoVista,
    parcelas_padrao: auction.parcelasPadrao,
    status: auction.status as Database['public']['Enums']['auction_status'],
    custos_texto: auction.custos,
    custos_numerico: auction.custosNumerico,
    detalhe_custos: auction.detalheCustos || undefined,
    detalhe_patrocinios: auction.detalhePatrocinios || undefined,
    patrocinios_total: auction.patrociniosTotal,
    percentual_comissao_leiloeiro: auction.percentualComissaoLeiloeiro,
    lotes: (auction.lotes as unknown as Database['public']['Tables']['auctions']['Insert']['lotes']) || undefined,
    historico_notas: auction.historicoNotas,
    arquivado: auction.arquivado,
  };
}

export function useSupabaseAuctions() {
  const queryClient = useQueryClient();

  // Query para listar leilões com arrematantes
  const listQuery = useQuery({
    queryKey: AUCTIONS_KEY,
    staleTime: 0, // Sempre considerar dados como "velhos" para forçar refetch
    gcTime: 0, // NÃO manter em cache - forçar busca fresca sempre
    refetchOnWindowFocus: true, // Refazer query ao focar na janela
    refetchOnMount: 'always', // SEMPRE refazer query ao montar componente
    refetchInterval: false, // Não usar polling automático
    queryFn: async () => {
      const { data, error } = await supabaseClient
        .from('auctions')
        .select(`
          id,
          nome,
          identificacao,
          local,
          endereco,
          data_inicio,
          data_encerramento,
          tipo_pagamento,
          mes_inicio_pagamento,
          dia_vencimento_padrao,
          data_entrada,
          data_vencimento_vista,
          parcelas_padrao,
          status,
          custos_texto,
          custos_numerico,
          detalhe_custos,
          detalhe_patrocinios,
          patrocinios_total,
          percentual_comissao_leiloeiro,
          lotes,
          historico_notas,
          arquivado,
          created_at,
          updated_at,
          bidders (
            id,
            nome,
            valor_pagar_texto,
            valor_pagar_numerico,
            valor_entrada_texto,
            dia_vencimento_mensal,
            quantidade_parcelas,
            parcelas_pagas,
            mes_inicio_pagamento,
            observacoes,
            documento,
            endereco,
            cep,
            rua,
            numero,
            complemento,
            bairro,
            cidade,
            estado,
            email,
            telefone,
            lote_id,
            mercadoria_id,
            created_at,
            pago,
            percentual_juros_atraso,
            tipo_juros_atraso,
            valor_lance,
            fator_multiplicador,
            usa_fator_multiplicador,
            parcelas_triplas,
            parcelas_duplas,
            parcelas_simples,
            data_entrada,
            data_vencimento_vista,
            tipo_pagamento
          ),
          documents (
            id,
            nome,
            tipo,
            categoria,
            tamanho,
            data_upload,
            url,
            descricao
          )
        `)
        .order('data_inicio', { ascending: false });

      if (error) throw error;
      
      return data.map(auction => {
        const mappedAuction = mapSupabaseAuctionToApp(auction as unknown as ExtendedAuctionRow);
        
        // Adicionar arrematantes (suporta múltiplos)
        if (auction.bidders && auction.bidders.length > 0) {
          // Mapear TODOS os bidders para array de arrematantes
          mappedAuction.arrematantes = (auction.bidders as unknown as BidderRow[]).map((bidder) => {
            // Buscar documentos específicos deste arrematante
          const arrematanteDocumentos = auction.documents 
              ? auction.documents.filter((doc) => 
                  doc.categoria === 'arrematante_documentos' && 
                  doc.descricao?.includes(bidder.nome)
                )
            : [];

            const mappedBidder = {
              id: bidder.id || undefined,
            nome: bidder.nome,
            documento: bidder.documento || undefined,
            endereco: bidder.endereco || undefined,
            // ✅ Campos de endereço detalhados
            cep: bidder.cep || undefined,
            rua: bidder.rua || undefined,
            numero: bidder.numero || undefined,
            complemento: bidder.complemento || undefined,
            bairro: bidder.bairro || undefined,
            cidade: bidder.cidade || undefined,
            estado: bidder.estado || undefined,
            telefone: bidder.telefone || undefined,
            email: bidder.email || undefined,
            loteId: bidder.lote_id || undefined,
            mercadoriaId: bidder.mercadoria_id || undefined,
            created_at: bidder.created_at,
            valorPagar: bidder.valor_pagar_texto || '',
            valorPagarNumerico: bidder.valor_pagar_numerico ? Number(bidder.valor_pagar_numerico) : 0,
            valorEntrada: bidder.valor_entrada_texto || undefined,
            diaVencimentoMensal: bidder.dia_vencimento_mensal || 15,
            quantidadeParcelas: bidder.quantidade_parcelas || 12,
            parcelasPagas: bidder.parcelas_pagas || 0,
            mesInicioPagamento: bidder.mes_inicio_pagamento || new Date().toISOString().slice(0, 7),
            pago: bidder.pago || false,
            percentualJurosAtraso: bidder.percentual_juros_atraso || 0,
            tipoJurosAtraso: (bidder.tipo_juros_atraso as "composto" | "simples") || "composto",
            valorLance: bidder.valor_lance,
            fatorMultiplicador: bidder.fator_multiplicador,
            usaFatorMultiplicador: bidder.usa_fator_multiplicador,
            parcelasTriplas: bidder.parcelas_triplas,
            parcelasDuplas: bidder.parcelas_duplas,
            parcelasSimples: bidder.parcelas_simples,
            dataEntrada: bidder.data_entrada,
            dataVencimentoVista: bidder.data_vencimento_vista,
            tipoPagamento: bidder.tipo_pagamento as "a_vista" | "parcelamento" | "entrada_parcelamento" | undefined,
            documentos: arrematanteDocumentos.map((doc) => ({
              id: doc.id?.toString() || Date.now().toString(),
              nome: doc.nome,
              tipo: doc.tipo === 'pdf' ? 'application/pdf' :
                   doc.tipo === 'doc' ? 'application/msword' :
                   doc.tipo === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
                   doc.tipo === 'xls' ? 'application/vnd.ms-excel' :
                   doc.tipo === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' :
                   doc.tipo === 'jpg' ? 'image/jpeg' :
                   doc.tipo === 'png' ? 'image/png' : 'application/octet-stream',
              tamanho: doc.tamanho || 0,
              dataUpload: doc.data_upload || new Date().toISOString(),
              url: doc.url || undefined
            }))
          };

          return mappedBidder;
          });
          
          // Ordenar por data de criação (mais recente primeiro)
          mappedAuction.arrematantes.sort((a, b) => {
            if (!a.created_at || !b.created_at) return 0;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
          
          // Manter compatibilidade: arrematante = mais recente
          mappedAuction.arrematante = mappedAuction.arrematantes[0];
        }
        
        return mappedAuction;
      });
    },
  });

  // Mutation para criar leilão
  const createMutation = useMutation({
    mutationFn: async (data: Omit<Auction, "id">) => {
      // Separar campos de documentos dos demais dados
      const { fotosMercadoria, documentos, ...sanitizedData } = data;
      
      
      const { data: created, error } = await supabaseClient
        .from('auctions')
        .insert(mapAppAuctionToSupabase(sanitizedData as Omit<Auction, "id">))
        .select()
        .single();

      if (error) throw error;

      // Salvar imagens dos lotes (se houver)
      if (data.lotes && data.lotes.length > 0) {
        for (const lote of data.lotes) {
          if (lote.imagens && lote.imagens.length > 0) {
            const imagensLoteParaInserir = lote.imagens.map((imagemUrl: string, index: number) => ({
              auction_id: created.id,
              nome: `Lote ${lote.numero} - Imagem ${index + 1}`,
              categoria: 'lote_fotos' as const,
              tipo: 'jpg' as const, // Assumir JPG por padrão, já que são base64
              tamanho: Math.round(imagemUrl.length * 0.75), // Estimativa do tamanho
              data_upload: new Date().toISOString(),
              url: imagemUrl, // A imagem já está em base64
              storage_path: `lote-${lote.numero}-img-${index + 1}`,
              descricao: `Lote ${lote.numero} - ${lote.id}`
            }));

            const { error: loteImgError } = await supabaseClient
              .from('documents')
              .insert(imagensLoteParaInserir);
            
            if (loteImgError) {
              console.error(`❌ Erro ao salvar imagens do lote ${lote.numero}:`, loteImgError);
            }
          }
        }
      }

      // Salvar fotos da mercadoria (se houver)
      if (fotosMercadoria && fotosMercadoria.length > 0) {
        
        const documentosParaInserir = await Promise.all(
          fotosMercadoria.map(async (foto, index) => {
            let base64Data = null;
            
            // Se a foto tem uma URL, processar
            if (foto.url) {
              if (foto.url.startsWith('blob:')) {
                // URL blob: converter para base64
                try {
                  const response = await fetch(foto.url);
                  const blob = await response.blob();
                  const base64 = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                  });
                  base64Data = base64;
                  
                  // Verificar se o base64 não é muito grande (limite de ~5MB em base64)
                  if (base64Data && base64Data.length > 7000000) {
                    console.warn(`⚠️ Foto ${foto.nome} muito grande (${base64Data.length} chars)`);
                  }
                } catch (error) {
                  console.error(`❌ Erro ao converter ${foto.nome} para base64:`, error);
                }
              } else if (foto.url.startsWith('data:')) {
                // Já está em base64: manter
                base64Data = foto.url;
              } else {
                console.warn(`⚠️ Foto ${foto.nome} tem URL não reconhecida: ${foto.url.substring(0, 30)}`);
              }
            }

            return {
              auction_id: created.id,
              nome: foto.nome,
              categoria: 'leilao_fotos_mercadoria' as const,
              tipo: foto.tipo.includes('jpeg') ? 'jpeg' as const :
                    foto.tipo.includes('jpg') ? 'jpg' as const :
                    foto.tipo.includes('png') ? 'png' as const :
                    foto.tipo.includes('gif') ? 'gif' as const : 'outros' as const,
              tamanho: foto.tamanho,
              data_upload: foto.dataUpload,
              url: base64Data, // Salvar base64 da imagem
              storage_path: foto.nome,
              descricao: `Leilão ${created.identificacao || created.nome}` // Identificar o leilão
            };
          })
        );

        // Filtrar apenas documentos com URL válida
        const documentosValidos = documentosParaInserir.filter(doc => doc.url !== null);
        
        if (documentosValidos.length > 0) {
          const { error: docsError } = await supabaseClient
            .from('documents')
            .insert(documentosValidos);
            
          if (docsError) {
            console.error('❌ Erro ao salvar fotos:', {
              error: docsError,
              message: docsError.message,
              details: docsError.details,
              hint: docsError.hint,
              code: docsError.code
            });
            throw docsError;
          }
        } else {
          console.warn(`⚠️ Nenhuma foto com URL válida para salvar (total: ${fotosMercadoria.length})`);
        }
      }

      // Salvar documentos gerais (se houver)
      if (documentos && documentos.length > 0) {
        const documentosParaInserir = await Promise.all(
          documentos.map(async (doc, index) => {
            let base64Data = null;
            
            // Se o documento tem uma URL, processar
            if (doc.url) {
              if (doc.url.startsWith('blob:')) {
                // URL blob: converter para base64
                try {
                  const response = await fetch(doc.url);
                  const blob = await response.blob();
                  const base64 = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                  });
                  base64Data = base64;
                  
                  // Verificar se o base64 não é muito grande (limite de ~10MB em base64 para documentos)
                  if (base64Data && base64Data.length > 10000000) {
                    console.warn(`⚠️ Documento ${doc.nome} muito grande (${base64Data.length} chars), mas será salvo assim mesmo`);
                  }
                } catch (error) {
                  console.error(`❌ Erro ao converter ${doc.nome} para base64:`, error);
                }
              } else if (doc.url.startsWith('data:')) {
                // Já está em base64: manter
                base64Data = doc.url;
              } else {
                console.warn(`⚠️ Documento ${doc.nome} tem URL não reconhecida: ${doc.url.substring(0, 30)}`);
              }
            }

            return {
              auction_id: created.id,
              nome: doc.nome,
              categoria: 'leilao_geral' as const,
              tipo: doc.tipo.includes('pdf') ? 'pdf' as const :
                    doc.tipo.includes('doc') ? 'doc' as const :
                    doc.tipo.includes('docx') ? 'docx' as const :
                    doc.tipo.includes('txt') ? 'txt' as const : 'outros' as const,
              tamanho: doc.tamanho,
              data_upload: doc.dataUpload,
              url: base64Data, // Salvar base64 do documento
              storage_path: doc.nome,
              descricao: `Leilão ${created.identificacao || created.nome}` // Identificar o leilão
            };
          })
        );

        // Filtrar apenas documentos com URL válida
        const documentosValidos = documentosParaInserir.filter(doc => doc.url !== null);
        
        if (documentosValidos.length > 0) {
          const { error: docsError } = await supabaseClient
            .from('documents')
            .insert(documentosValidos);
            
          if (docsError) {
            console.error('❌ Erro ao salvar documentos:', {
              error: docsError,
              message: docsError.message,
              details: docsError.details,
              hint: docsError.hint,
              code: docsError.code
            });
            throw docsError;
          }
        } else {
          console.warn(`⚠️ Nenhum documento com URL válida para salvar (total: ${documentos.length})`);
        }
      }

      return mapSupabaseAuctionToApp(created);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: AUCTIONS_KEY }),
  });

  // Mutation para atualizar leilão
  const updateMutation = useMutation({
    // ❌ ATUALIZAÇÃO OTIMISTA DESABILITADA - estava causando conflito com refetch
    // Agora usamos fluxo síncrono: salvar no banco -> invalidar cache -> refetch
    mutationFn: async ({ id, data }: { id: string; data: Partial<Auction> }) => {
      // Separar campos de documentos dos demais dados
      const { fotosMercadoria, documentos, ...sanitizedData } = data;
      
      const updateData: AuctionUpdate = {};
      
      if (sanitizedData.nome !== undefined) updateData.nome = sanitizedData.nome;
      if (sanitizedData.identificacao !== undefined) updateData.identificacao = sanitizedData.identificacao;
      if (sanitizedData.local !== undefined) updateData.local = sanitizedData.local as Database['public']['Enums']['location_type'];
      if (sanitizedData.endereco !== undefined) updateData.endereco = sanitizedData.endereco;
      if (sanitizedData.dataInicio !== undefined) updateData.data_inicio = sanitizedData.dataInicio;
      if (sanitizedData.dataEncerramento !== undefined) updateData.data_encerramento = sanitizedData.dataEncerramento;
      if (sanitizedData.tipoPagamento !== undefined) updateData.tipo_pagamento = sanitizedData.tipoPagamento;
      if (sanitizedData.mesInicioPagamento !== undefined) updateData.mes_inicio_pagamento = sanitizedData.mesInicioPagamento;
      if (sanitizedData.diaVencimentoPadrao !== undefined) updateData.dia_vencimento_padrao = sanitizedData.diaVencimentoPadrao;
      if (sanitizedData.dataEntrada !== undefined) updateData.data_entrada = sanitizedData.dataEntrada;
      if (sanitizedData.dataVencimentoVista !== undefined) updateData.data_vencimento_vista = sanitizedData.dataVencimentoVista;
      if (sanitizedData.parcelasPadrao !== undefined) updateData.parcelas_padrao = sanitizedData.parcelasPadrao;
      if (sanitizedData.status !== undefined) updateData.status = sanitizedData.status as Database['public']['Enums']['auction_status'];
      if (sanitizedData.custos !== undefined) updateData.custos_texto = sanitizedData.custos;
      if (sanitizedData.custosNumerico !== undefined) updateData.custos_numerico = sanitizedData.custosNumerico;
      
      // Campos estendidos (não presentes no tipo base, mas suportados pelo banco)
      const extendedUpdateData = updateData as ExtendedAuctionUpdate;
      if (sanitizedData.detalheCustos !== undefined) extendedUpdateData.detalhe_custos = sanitizedData.detalheCustos;
      if (sanitizedData.detalhePatrocinios !== undefined) extendedUpdateData.detalhe_patrocinios = sanitizedData.detalhePatrocinios;
      if (sanitizedData.patrociniosTotal !== undefined) extendedUpdateData.patrocinios_total = sanitizedData.patrociniosTotal;
      if (sanitizedData.percentualComissaoLeiloeiro !== undefined) extendedUpdateData.percentual_comissao_leiloeiro = sanitizedData.percentualComissaoLeiloeiro;
      
      if (sanitizedData.lotes !== undefined) updateData.lotes = sanitizedData.lotes as unknown as Database['public']['Tables']['auctions']['Update']['lotes'];
      if (sanitizedData.historicoNotas !== undefined) updateData.historico_notas = sanitizedData.historicoNotas;
      if (sanitizedData.arquivado !== undefined) updateData.arquivado = sanitizedData.arquivado;

      // Se tem arrematantes, precisamos lidar com isso separadamente
      if (data.arrematantes !== undefined || data.arrematante !== undefined) {
        // Priorizar arrematantes[] sobre arrematante (compatibilidade)
        const arrematantesArray = data.arrematantes || (data.arrematante ? [data.arrematante] : []);
        
        if (arrematantesArray.length > 0) {
          // ✅ NÃO deletar todos - processar individualmente
          // Primeiro, buscar os IDs existentes no banco
          const { data: existingBidders } = await supabaseClient
            .from('bidders')
            .select('id')
            .eq('auction_id', id);
          
          const existingIds = existingBidders?.map(b => b.id) || [];
          const updatingIds = arrematantesArray.filter(a => a.id).map(a => a.id);
          
          // Deletar apenas os arrematantes que não estão mais no array
          const idsToDelete = existingIds.filter(id => !updatingIds.includes(id));
          if (idsToDelete.length > 0) {
          await supabaseClient
            .from('bidders')
            .delete()
              .in('id', idsToDelete);

            // Deletar documentos dos arrematantes removidos
          await supabaseClient
            .from('documents')
            .delete()
            .eq('auction_id', id)
              .eq('categoria', 'arrematante_documentos')
              .in('bidder_id', idsToDelete);
          }

          // Processar cada arrematante (INSERT ou UPDATE)
          for (const arrematante of arrematantesArray) {
            const bidderData: BidderInsert = {
              auction_id: id,
              nome: arrematante.nome,
              documento: arrematante.documento || null,
              endereco: arrematante.endereco || null,
              // ✅ Campos de endereço detalhados
              cep: arrematante.cep || null,
              rua: arrematante.rua || null,
              numero: arrematante.numero || null,
              complemento: arrematante.complemento || null,
              bairro: arrematante.bairro || null,
              cidade: arrematante.cidade || null,
              estado: arrematante.estado || null,
              telefone: arrematante.telefone,
              email: arrematante.email,
              lote_id: arrematante.loteId,
              mercadoria_id: arrematante.mercadoriaId || null,
              valor_pagar_texto: arrematante.valorPagar,
              valor_pagar_numerico: arrematante.valorPagarNumerico,
              valor_entrada_texto: arrematante.valorEntrada || null,
              dia_vencimento_mensal: arrematante.diaVencimentoMensal,
              quantidade_parcelas: arrematante.quantidadeParcelas,
              parcelas_pagas: arrematante.parcelasPagas,
              mes_inicio_pagamento: arrematante.mesInicioPagamento,
              pago: arrematante.pago || false,
              percentual_juros_atraso: arrematante.percentualJurosAtraso || 0,
              tipo_juros_atraso: arrematante.tipoJurosAtraso || 'composto',
              valor_lance: arrematante.valorLance || null,
              fator_multiplicador: arrematante.fatorMultiplicador || null,
              usa_fator_multiplicador: arrematante.usaFatorMultiplicador || false,
              // ✅ CORREÇÃO: Esses campos são INTEGER no banco, não arrays
              parcelas_triplas: typeof arrematante.parcelasTriplas === 'number' ? arrematante.parcelasTriplas : null,
              parcelas_duplas: typeof arrematante.parcelasDuplas === 'number' ? arrematante.parcelasDuplas : null,
              parcelas_simples: typeof arrematante.parcelasSimples === 'number' ? arrematante.parcelasSimples : null,
              data_entrada: arrematante.dataEntrada || null,
              data_vencimento_vista: arrematante.dataVencimentoVista || null,
              tipo_pagamento: arrematante.tipoPagamento || null,
            };

            console.log('🗄️ CONDIÇÕES DE PAGAMENTO - bidderData:', {
              valor_lance: bidderData.valor_lance,
              fator_multiplicador: bidderData.fator_multiplicador,
              usa_fator_multiplicador: bidderData.usa_fator_multiplicador,
              parcelas_triplas: bidderData.parcelas_triplas,
              parcelas_duplas: bidderData.parcelas_duplas,
              parcelas_simples: bidderData.parcelas_simples,
              data_entrada: bidderData.data_entrada,
              data_vencimento_vista: bidderData.data_vencimento_vista
            });

            // ✅ CORREÇÃO: Verificar se é INSERT (novo) ou UPDATE (edição)
            if (arrematante.id) {
              // MODO EDIÇÃO: Atualizar arrematante existente
              console.log('🔄 MODO EDIÇÃO: Atualizando arrematante ID:', arrematante.id);
              
              // ✅ DELETAR DOCUMENTOS ANTIGOS DESTE ARREMATANTE ANTES DE ATUALIZAR
              // Estratégia dupla: primeiro por ID, depois por nome (para documentos antigos)
              
              // 1. Deletar por ID do arrematante (sistema novo)
              const { error: deleteDocsError, count: deletedByIdCount } = await supabaseClient
                .from('documents')
                .delete({ count: 'exact' })
                .eq('auction_id', id)
                .eq('categoria', 'arrematante_documentos')
                .ilike('descricao', `%bidder_id:${arrematante.id}%`);

              if (deleteDocsError) {
                console.warn('⚠️ Aviso ao deletar documentos por ID:', deleteDocsError);
              } else {
                console.log(`🗑️ Documentos deletados por ID: ${deletedByIdCount || 0}`);
              }
              
              // 2. Deletar por nome (para documentos antigos sem ID na descrição)
              const { error: deleteByNameError, count: deletedByNameCount } = await supabaseClient
                .from('documents')
                .delete({ count: 'exact' })
                .eq('auction_id', id)
                .eq('categoria', 'arrematante_documentos')
                .ilike('descricao', `Arrematante ${arrematante.nome}`)
                .not('descricao', 'ilike', '%bidder_id:%'); // Apenas docs sem ID

              if (deleteByNameError) {
                console.warn('⚠️ Aviso ao deletar documentos por nome:', deleteByNameError);
              } else {
                console.log(`🗑️ Documentos antigos deletados por nome: ${deletedByNameCount || 0}`);
              }
              
              const totalDeleted = (deletedByIdCount || 0) + (deletedByNameCount || 0);
              console.log(`✅ Total de documentos deletados: ${totalDeleted}`);
              
              const { error: bidderError } = await supabaseClient
                .from('bidders')
                .update(bidderData)
                .eq('id', arrematante.id);

              if (bidderError) {
                console.error('❌ Erro ao atualizar arrematante:', bidderError);
                throw bidderError;
              }
            } else {
              // MODO CRIAÇÃO: Inserir novo arrematante
              console.log('➕ MODO CRIAÇÃO: Inserindo novo arrematante');
              
              // ✅ VALIDAÇÃO REMOVIDA: Agora permitimos múltiplos arrematantes por mercadoria
              // Isso é necessário para o recurso de "Divisão de Mercadoria"
              // onde vários arrematantes podem compartilhar a mesma mercadoria

              // ✅ INSERT e obter o ID retornado para usar nos documentos
              const { data: insertedBidder, error: bidderError } = await supabaseClient
                .from('bidders')
                .insert(bidderData)
                .select('id')
                .maybeSingle();

              if (bidderError) {
                console.error('❌ Erro ao inserir arrematante:', bidderError);
                throw bidderError;
              }
              
              // ✅ Atribuir o ID retornado para usar nos documentos
              if (insertedBidder?.id) {
                arrematante.id = insertedBidder.id;
                console.log('✅ Novo arrematante criado com ID:', insertedBidder.id);
              }
            }

          // Salvar documentos do arrematante na tabela documents
            if (arrematante.documentos && arrematante.documentos.length > 0) {
            // ✅ Garantir que temos um ID para o arrematante (necessário para identificação única)
            const bidderId = arrematante.id;
            
            if (!bidderId) {
              console.error('❌ ERRO: Tentando salvar documentos sem ID de arrematante!');
              throw new Error('ID do arrematante não disponível para salvar documentos');
            }
            
            console.log('📄 DOCUMENTOS - Salvando documentos do arrematante:', {
              bidderId: bidderId,
              nome: arrematante.nome,
              quantidadeDocumentos: arrematante.documentos.length,
              documentos: arrematante.documentos.map(d => ({ nome: d.nome, tipo: d.tipo }))
            });
            const documentosParaInserir = await Promise.all(
                arrematante.documentos.map(async (doc, index) => {
                let base64Data = null;
                
                // Se o documento tem uma URL (blob ou base64), processar
                if (doc.url) {
                  if (doc.url.startsWith('blob:')) {
                    try {
                      const response = await fetch(doc.url);
                      const blob = await response.blob();
                      base64Data = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.onerror = () => reject(new Error('Erro no FileReader'));
                        reader.readAsDataURL(blob);
                      });
                    } catch (error) {
                      console.error(`❌ Erro ao converter ${doc.nome} para base64:`, error);
                    }
                  } else if (doc.url.startsWith('data:')) {
                    base64Data = doc.url;
                  }
                }

                return {
                  auction_id: id,
                  nome: doc.nome,
                  categoria: 'arrematante_documentos' as const,
                  tipo: doc.tipo.includes('pdf') ? 'pdf' as const :
                        doc.tipo.includes('doc') ? 'doc' as const :
                        doc.tipo.includes('docx') ? 'docx' as const :
                        doc.tipo.includes('xls') ? 'xls' as const :
                        doc.tipo.includes('xlsx') ? 'xlsx' as const :
                        doc.tipo.includes('jpeg') || doc.tipo.includes('jpg') ? 'jpg' as const :
                        doc.tipo.includes('png') ? 'png' as const : 'outros' as const,
                  tamanho: doc.tamanho,
                  data_upload: doc.dataUpload,
                    url: base64Data,
                  storage_path: doc.nome,
                    // ✅ CORREÇÃO: Usar ID único para identificação, não nome
                    descricao: `Arrematante ${arrematante.nome} [bidder_id:${bidderId}]`
                };
              })
            );

            const { error: docsError } = await supabaseClient
              .from('documents')
              .insert(documentosParaInserir);
              
            if (docsError) {
              console.error('❌ Erro ao salvar documentos do arrematante:', {
                error: docsError,
                message: docsError.message,
                details: docsError.details,
                hint: docsError.hint,
                code: docsError.code
              });
              throw docsError;
            } else {
              console.log('✅ DOCUMENTOS - Documentos salvos com sucesso!', {
                quantidade: documentosParaInserir.length,
                documentos: documentosParaInserir.map(d => ({ nome: d.nome, categoria: d.categoria, descricao: d.descricao }))
              });
            }
            }
          }
        } else {
          // Remover todos os arrematantes e seus documentos
          await supabaseClient
            .from('bidders')
            .delete()
            .eq('auction_id', id);

          // Remover documentos dos arrematantes
          const { error: deleteDocsError } = await supabaseClient
            .from('documents')
            .delete()
            .eq('auction_id', id)
            .eq('categoria', 'arrematante_documentos');

          if (deleteDocsError) throw deleteDocsError;
        }
      }

      // Salvar imagens dos lotes (se houver mudanças nos lotes)
      if (sanitizedData.lotes !== undefined) {
        // Primeiro, remover todas as imagens antigas dos lotes deste leilão
        const { error: deleteOldImagesError } = await supabaseClient
          .from('documents')
          .delete()
          .eq('auction_id', id)
          .eq('categoria', 'lote_fotos');
        
        if (deleteOldImagesError) {
          console.error('❌ Erro ao remover imagens antigas dos lotes:', deleteOldImagesError);
        }

        // Agora, salvar as novas imagens de cada lote
        for (const lote of sanitizedData.lotes) {
          if (lote.imagens && lote.imagens.length > 0) {
            console.log(`🖼️ Processando ${lote.imagens.length} imagens do lote ${lote.numero}`);
            
            const imagensLoteParaInserir = lote.imagens.map((imagemUrl: string, index: number) => ({
              auction_id: id,
              nome: `Lote ${lote.numero} - Imagem ${index + 1}`,
              categoria: 'lote_fotos' as const,
              tipo: 'jpg' as const, // Assumir JPG por padrão, já que são base64
              tamanho: Math.round(imagemUrl.length * 0.75), // Estimativa do tamanho
              data_upload: new Date().toISOString(),
              url: imagemUrl, // A imagem já está em base64
              storage_path: `lote-${lote.numero}-img-${index + 1}`,
              descricao: `Lote ${lote.numero} - ${lote.id}`
            }));

            const { error: loteImgError } = await supabaseClient
              .from('documents')
              .insert(imagensLoteParaInserir);
            
            if (loteImgError) {
              console.error(`❌ Erro ao salvar imagens do lote ${lote.numero}:`, loteImgError);
            }
          }
        }
      }

      // Salvar fotos da mercadoria (sempre processar, mesmo que array vazio)
      if (fotosMercadoria !== undefined) {
        // Remover documentos existentes de fotos da mercadoria
        await supabaseClient
          .from('documents')
          .delete()
          .eq('auction_id', id)
          .eq('categoria', 'leilao_fotos_mercadoria');

        // Inserir novos documentos de fotos (se houver)
        if (fotosMercadoria.length > 0) {
          const documentosParaInserir = await Promise.all(
            fotosMercadoria.map(async (foto, index) => {
              let base64Data = null;
              
              // Se a foto tem uma URL blob, converter para base64
              if (foto.url && foto.url.startsWith('blob:')) {
                try {
                  const response = await fetch(foto.url);
                  const blob = await response.blob();
                  const base64 = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                  });
                  base64Data = base64;
                  
                  if (base64Data && base64Data.length > 7000000) {
                    console.warn(`⚠️ Foto ${foto.nome} muito grande (${base64Data.length} chars)`);
                  }
                } catch (error) {
                  console.error(`❌ Erro ao converter ${foto.nome} para base64:`, error);
                }
              } else if (foto.url && foto.url.startsWith('data:')) {
                // Se já é base64, manter
                base64Data = foto.url;
              }

              return {
                auction_id: id,
                nome: foto.nome,
                categoria: 'leilao_fotos_mercadoria' as const,
                tipo: foto.tipo.includes('jpeg') ? 'jpeg' as const :
                      foto.tipo.includes('jpg') ? 'jpg' as const :
                      foto.tipo.includes('png') ? 'png' as const :
                      foto.tipo.includes('gif') ? 'gif' as const : 'outros' as const,
                tamanho: foto.tamanho,
                data_upload: foto.dataUpload,
                url: base64Data, // Salvar base64 da imagem
                storage_path: foto.nome,
                descricao: `Leilão ${id}` // Identificar o leilão
              };
            })
          );

          const { error: docsError } = await supabaseClient
            .from('documents')
            .insert(documentosParaInserir);

          if (docsError) {
            console.error('❌ Erro ao salvar fotos na atualização:', docsError);
            throw docsError;
          }
        }
      }

      // Salvar documentos gerais (sempre processar, mesmo que array vazio)
      if (documentos !== undefined) {
        // Remover documentos existentes gerais
        await supabaseClient
          .from('documents')
          .delete()
          .eq('auction_id', id)
          .eq('categoria', 'leilao_geral');

        // Inserir novos documentos gerais (se houver)
        if (documentos.length > 0) {
          const documentosParaInserir = await Promise.all(
            documentos.map(async (doc, index) => {
              let base64Data = null;
              
              // Se o documento tem uma URL blob, converter para base64
              if (doc.url && doc.url.startsWith('blob:')) {
                try {
                  const response = await fetch(doc.url);
                  const blob = await response.blob();
                  const base64 = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                  });
                  base64Data = base64;
                  
                  if (base64Data && base64Data.length > 10000000) {
                    console.warn(`⚠️ Documento ${doc.nome} muito grande (${base64Data.length} chars)`);
                  }
                } catch (error) {
                  console.error(`❌ Erro ao converter ${doc.nome} para base64:`, error);
                }
              } else if (doc.url && doc.url.startsWith('data:')) {
                // Se já é base64, manter
                base64Data = doc.url;
              }

              return {
                auction_id: id,
                nome: doc.nome,
                categoria: 'leilao_geral' as const,
                tipo: doc.tipo.includes('pdf') ? 'pdf' as const :
                      doc.tipo.includes('doc') ? 'doc' as const :
                      doc.tipo.includes('docx') ? 'docx' as const :
                      doc.tipo.includes('txt') ? 'txt' as const : 'outros' as const,
                tamanho: doc.tamanho,
                data_upload: doc.dataUpload,
                url: base64Data, // Salvar base64 do documento
                storage_path: doc.nome,
                descricao: `Leilão ${id}` // Identificar o leilão
              };
            })
          );

          const { error: docsError } = await supabaseClient
            .from('documents')
            .insert(documentosParaInserir);

          if (docsError) {
            console.error('❌ Erro ao salvar documentos na atualização:', docsError);
            throw docsError;
          }
        }
      }

      // Só atualizar a tabela auctions se houver dados para atualizar
      if (Object.keys(updateData).length > 0) {
        // ✅ CORREÇÃO: Usar .maybeSingle() para evitar erro 406
        const { data: updated, error } = await supabaseClient
          .from('auctions')
          .update(updateData)
          .eq('id', id)
          .select(`
            id,
            nome,
            identificacao,
            local,
            endereco,
            data_inicio,
            data_encerramento,
            tipo_pagamento,
            mes_inicio_pagamento,
            dia_vencimento_padrao,
            data_entrada,
            data_vencimento_vista,
            parcelas_padrao,
            status,
            custos_texto,
            custos_numerico,
            detalhe_custos,
            detalhe_patrocinios,
            patrocinios_total,
            percentual_comissao_leiloeiro,
            lotes,
            historico_notas,
            arquivado,
            created_at,
            updated_at
          `)
          .maybeSingle();

        if (error) throw error;
        
        // Verificar se o leilão ainda existe
        if (!updated) {
          throw new Error('Leilão não encontrado após atualização. Pode ter sido excluído.');
        }
        
        return mapSupabaseAuctionToApp(updated);
      } else {
        // Se só atualizamos o arrematante, buscar os dados atualizados do leilão
        // ✅ CORREÇÃO: Usar .maybeSingle() para evitar erro 406
        const { data: current, error } = await supabaseClient
          .from('auctions')
          .select(`
            id,
            nome,
            identificacao,
            local,
            endereco,
            data_inicio,
            data_encerramento,
            tipo_pagamento,
            mes_inicio_pagamento,
            dia_vencimento_padrao,
            data_entrada,
            data_vencimento_vista,
            parcelas_padrao,
            status,
            custos_texto,
            custos_numerico,
            detalhe_custos,
            detalhe_patrocinios,
            patrocinios_total,
            percentual_comissao_leiloeiro,
            lotes,
            historico_notas,
            arquivado,
            created_at,
            updated_at,
            bidders (
              id,
              nome,
              valor_pagar_texto,
              valor_pagar_numerico,
              valor_entrada_texto,
              dia_vencimento_mensal,
              quantidade_parcelas,
              parcelas_pagas,
              mes_inicio_pagamento,
              observacoes,
              documento,
              endereco,
              cep,
              rua,
              numero,
              complemento,
              bairro,
              cidade,
              estado,
              email,
              telefone,
              lote_id,
              mercadoria_id,
              created_at,
              pago,
              percentual_juros_atraso,
              tipo_juros_atraso,
              valor_lance,
              fator_multiplicador,
              usa_fator_multiplicador,
              parcelas_triplas,
              parcelas_duplas,
              parcelas_simples,
              data_entrada,
              data_vencimento_vista,
              tipo_pagamento
            )
          `)
          .eq('id', id)
          .maybeSingle();

        if (error) throw error;
        
        // Verificar se o leilão ainda existe
        if (!current) {
          throw new Error('Leilão não encontrado. Pode ter sido excluído.');
        }
        
        const mappedAuction = mapSupabaseAuctionToApp(current as unknown as ExtendedAuctionRow);
        
        // Adicionar arrematantes atualizados se existirem
        if (current.bidders && current.bidders.length > 0) {
          mappedAuction.arrematantes = (current.bidders as unknown as BidderRow[]).map((bidder) => {
            return {
            id: bidder.id || undefined,
            nome: bidder.nome,
            documento: bidder.documento || undefined,
            endereco: bidder.endereco || undefined,
            // ✅ Campos de endereço detalhados
            cep: bidder.cep || undefined,
            rua: bidder.rua || undefined,
            numero: bidder.numero || undefined,
            complemento: bidder.complemento || undefined,
            bairro: bidder.bairro || undefined,
            cidade: bidder.cidade || undefined,
            estado: bidder.estado || undefined,
            telefone: bidder.telefone || undefined,
            email: bidder.email || undefined,
            loteId: bidder.lote_id || undefined,
            mercadoriaId: bidder.mercadoria_id || undefined,
            created_at: bidder.created_at,
            valorPagar: bidder.valor_pagar_texto || '',
            valorPagarNumerico: bidder.valor_pagar_numerico ? Number(bidder.valor_pagar_numerico) : 0,
            valorEntrada: bidder.valor_entrada_texto || undefined,
            diaVencimentoMensal: bidder.dia_vencimento_mensal || 15,
            quantidadeParcelas: bidder.quantidade_parcelas || 12,
            parcelasPagas: bidder.parcelas_pagas || 0,
            mesInicioPagamento: bidder.mes_inicio_pagamento || new Date().toISOString().slice(0, 7),
            pago: bidder.pago || false,
            percentualJurosAtraso: bidder.percentual_juros_atraso || 0,
            tipoJurosAtraso: (bidder.tipo_juros_atraso as "composto" | "simples") || "composto",
            valorLance: bidder.valor_lance,
            fatorMultiplicador: bidder.fator_multiplicador,
            usaFatorMultiplicador: bidder.usa_fator_multiplicador,
            parcelasTriplas: bidder.parcelas_triplas,
            parcelasDuplas: bidder.parcelas_duplas,
            parcelasSimples: bidder.parcelas_simples,
            dataEntrada: bidder.data_entrada,
            dataVencimentoVista: bidder.data_vencimento_vista,
            tipoPagamento: bidder.tipo_pagamento as "a_vista" | "parcelamento" | "entrada_parcelamento" | undefined,
            documentos: [],
          };
          });
          
          // Ordenar por data de criação (mais recente primeiro)
          mappedAuction.arrematantes.sort((a, b) => {
            if (!a.created_at || !b.created_at) return 0;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
          
          // Compatibilidade: arrematante = mais recente
          mappedAuction.arrematante = mappedAuction.arrematantes[0];
        }
        
        return mappedAuction;
      }
    },
    // Invalidar queries após atualização
    onSuccess: () => {
      // Invalidar queries para próxima montagem do componente (após reload)
      queryClient.invalidateQueries({ queryKey: AUCTIONS_KEY });
    }
  });

  // Mutation para deletar leilão
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabaseClient
        .from('auctions')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: AUCTIONS_KEY }),
  });

  // Mutation para arquivar leilão
  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      
      const { data, error } = await supabaseClient
        .from('auctions')
        .update({ arquivado: true })
        .eq('id', id)
        .select('id, arquivado');

      if (error) {
        console.error('❌ Erro ao arquivar leilão:', error);
        throw error;
      }
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: AUCTIONS_KEY });
    },
  });

  // Mutation para desarquivar leilão
  const unarchiveMutation = useMutation({
    mutationFn: async (id: string) => {
      // Primeiro verificar o estado atual
      // ✅ CORREÇÃO: Usar .maybeSingle() para evitar erro 406
      const { data: current, error: fetchError } = await supabaseClient
        .from('auctions')
        .select('id, arquivado')
        .eq('id', id)
        .maybeSingle();
      
      if (fetchError) {
        console.error('❌ Erro ao buscar leilão atual:', fetchError);
        throw fetchError;
      }
      
      if (!current) {
        throw new Error('Leilão não encontrado. Pode ter sido excluído.');
      }
      
      // Fazer a atualização
      const { data, error } = await supabaseClient
        .from('auctions')
        .update({ 
          arquivado: false,
          updated_at: new Date().toISOString() // Forçar atualização do timestamp
        })
        .eq('id', id)
        .select('id, arquivado, updated_at');

      if (error) {
        console.error('❌ Erro ao desarquivar leilão:', error);
        throw error;
      }
      
      // Aguardar um momento para garantir que a alteração foi persistida
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Verificar se a alteração foi realmente salva
      // ✅ CORREÇÃO: Usar .maybeSingle() para evitar erro 406
      const { data: verification, error: verifyError } = await supabaseClient
        .from('auctions')
        .select('id, arquivado, updated_at')
        .eq('id', id)
        .maybeSingle();
        
      if (verifyError) {
        console.error('❌ Erro na verificação:', verifyError);
      }
      
      if (!verification) {
        console.warn('⚠️ Não foi possível verificar o desarquivamento');
      }
      
      return data;
    },
    onSuccess: (data) => {
      // Limpar cache específico do leilão
      queryClient.removeQueries({ queryKey: AUCTIONS_KEY });
      
      // Forçar refetch imediato
      queryClient.invalidateQueries({ queryKey: AUCTIONS_KEY });
      queryClient.refetchQueries({ queryKey: AUCTIONS_KEY });
    },
  });

  // Mutation para duplicar leilão
  const duplicateMutation = useMutation({
    mutationFn: async (auction: Auction) => {
      const { id, ...auctionData } = auction;
      const duplicatedAuction = {
        ...auctionData,
        nome: `${auction.nome} (Cópia)`,
        identificacao: auction.identificacao ? `${auction.identificacao}-COPY` : undefined,
        arquivado: false
      };

      const { data: created, error } = await supabaseClient
        .from('auctions')
        .insert(mapAppAuctionToSupabase(duplicatedAuction))
        .select()
        .single();

      if (error) throw error;
      return mapSupabaseAuctionToApp(created);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: AUCTIONS_KEY }),
  });

  // Processar leilões: ordenar por prioridade
  const processedAuctions = useMemo(() => {
    if (!listQuery.data) return [];
    
    return [...listQuery.data].sort((a, b) => {
      // Prioridade por status: em_andamento > agendado > finalizado
      const statusPriority = {
        em_andamento: 3,
        agendado: 2,
        finalizado: 1
      };
      
      const priorityA = statusPriority[a.status];
      const priorityB = statusPriority[b.status];
      
      if (priorityA !== priorityB) {
        return priorityB - priorityA; // Maior prioridade primeiro
      }
      
      // Se mesmo status, ordenar por data de início (mais próxima primeiro)
      const dateA = new Date(a.dataInicio + 'T00:00:00.000Z');
      const dateB = new Date(b.dataInicio + 'T00:00:00.000Z');
      
      return dateA.getTime() - dateB.getTime();
    });
  }, [listQuery.data]);

  return useMemo(() => ({
    auctions: processedAuctions,
    isLoading: listQuery.isLoading,
    isFetching: listQuery.isFetching,
    error: listQuery.error,
    createAuction: createMutation.mutateAsync,
    updateAuction: updateMutation.mutateAsync,
    deleteAuction: deleteMutation.mutateAsync,
    archiveAuction: archiveMutation.mutateAsync,
    unarchiveAuction: unarchiveMutation.mutateAsync,
    duplicateAuction: duplicateMutation.mutateAsync,
  }), [
    processedAuctions, 
    listQuery.isLoading, 
    listQuery.isFetching, 
    listQuery.error,
    createMutation.mutateAsync, 
    updateMutation.mutateAsync, 
    deleteMutation.mutateAsync, 
    archiveMutation.mutateAsync, 
    unarchiveMutation.mutateAsync, 
    duplicateMutation.mutateAsync
  ]);
}
