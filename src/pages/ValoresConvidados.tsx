import { useState, useMemo } from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSupabaseAuctions } from "@/hooks/use-supabase-auctions";
import { useGuestLots } from "@/hooks/use-guest-lots";
import { logger } from "@/lib/logger";

export default function ValoresConvidados() {
  const navigate = useNavigate();
  const { auctions, isLoading: isLoadingAuctions } = useSupabaseAuctions();
  const { guestLots, isLoading: isLoadingLots } = useGuestLots();
  const [selectedLeilao, setSelectedLeilao] = useState<string | null>(null);


  // Agrupar lotes por leilão
  const leiloesPorId = useMemo(() => {
    const map = new Map<string, {
      nome: string;
      percentualComissao: number;
      lotes: Array<{
        id: string;
        numero: string;
        descricao: string;
        status: string;
        arrematantes: Array<{
          id: string;
          nome: string;
          valorTotal: number;
          valorComissao: number;
          valorDono: number;
          pago: boolean;
        }>;
      }>;
    }>();

    // Processar todos os lotes de convidados
    guestLots.forEach(lote => {
      // Pular lotes sem leilão vinculado
      if (!lote.leilao_id || !lote.leilao_nome) {
        logger.warn(`Lote ${lote.numero} sem leilão vinculado`);
        return;
      }

      // Encontrar o leilão correspondente
      const auction = auctions.find(a => a.id === lote.leilao_id);
      const percentualComissao = auction?.percentualComissaoVenda || 5; // Default 5% se não definido

      // 🔍 NOVA LÓGICA: Buscar arrematantes de DUAS FONTES
      let arrematantesEncontrados = lote.arrematantes || [];
      
      // Se não tem arrematantes diretos, buscar nos arrematantes do leilão
      if (arrematantesEncontrados.length === 0 && auction?.arrematantes) {
        logger.debug(`🔎 Buscando arrematantes do leilão para guest_lot ${lote.numero}`, {
          guest_lot_id: lote.id,
          guest_lot_numero: lote.numero,
          total_arrematantes_leilao: auction.arrematantes.length
        });
        
        // Buscar arrematantes do leilão que possam estar vinculados a este guest_lot
        const arrematantesDoLeilao = auction.arrematantes.filter(arr => {
          // O arr.loteId aponta para o lote no array de lotes do leilão
          // Precisamos encontrar esse lote e verificar se ele tem guestLotId ou número correspondente
          const loteDoArrematante = auction.lotes?.find(l => l.id === arr.loteId);
          
          if (loteDoArrematante) {
            const matchPorGuestLotId = loteDoArrematante.guestLotId === lote.id;
            const matchPorNumero = loteDoArrematante.numero === lote.numero && loteDoArrematante.isConvidado;
            const match = matchPorGuestLotId || matchPorNumero;
            
            logger.debug(`  Arrematante "${arr.nome}":`, {
              loteId: arr.loteId,
              lote_numero: loteDoArrematante.numero,
              lote_guestLotId: loteDoArrematante.guestLotId,
              lote_isConvidado: loteDoArrematante.isConvidado,
              matchPorGuestLotId,
              matchPorNumero,
              match
            });
            
            return match;
          }
          
          return false;
        });

        if (arrematantesDoLeilao.length > 0) {
          logger.info(`✅ Encontrados ${arrematantesDoLeilao.length} arrematantes do leilão para lote ${lote.numero}`);
          
          // Converter para o formato esperado
          arrematantesEncontrados = arrematantesDoLeilao.map(arr => ({
            id: arr.id || '',
            nome: arr.nome,
            email: arr.email,
            telefone: arr.telefone,
            pago: arr.pago || false,
            valor_pagar_numerico: arr.valorPagarNumerico
          }));
        }
      }

      // Mostrar apenas lotes que tenham arrematantes OU estejam marcados como arrematados
      const temArrematantes = arrematantesEncontrados.length > 0;
      
      if (!temArrematantes && lote.status !== 'arrematado') {
        return; // Ignorar lotes não arrematados sem arrematantes
      }

      if (!map.has(lote.leilao_id)) {
        map.set(lote.leilao_id, {
          nome: lote.leilao_nome,
          percentualComissao,
          lotes: [],
        });
      }

      const dadosLeilao = map.get(lote.leilao_id)!;

      // Processar arrematantes encontrados
      const arrematantes = arrematantesEncontrados.map(arr => {
        // Aceitar tanto o formato do guest_lot quanto do leilão
        const valorTotal = arr.valor_pagar_numerico || 0;
        const valorComissao = valorTotal * (percentualComissao / 100);
        const valorDono = valorTotal - valorComissao;

        return {
          id: arr.id || '',
          nome: arr.nome || 'Sem nome',
          valorTotal,
          valorComissao,
          valorDono,
          pago: arr.pago || false,
        };
      });

      dadosLeilao.lotes.push({
        id: lote.id,
        numero: lote.numero,
        descricao: lote.descricao,
        status: lote.status,
        arrematantes,
      });
    });

    return map;
  }, [auctions, guestLots]);

  // Calcular totais do leilão selecionado
  const totaisLeilao = useMemo(() => {
    if (!selectedLeilao) return null;
    
    const leilao = leiloesPorId.get(selectedLeilao);
    if (!leilao) return null;

    let totalReceber = 0;
    let totalComissao = 0;
    let totalDono = 0;

    leilao.lotes.forEach(lote => {
      lote.arrematantes.forEach(arr => {
        totalReceber += arr.valorTotal;
        totalComissao += arr.valorComissao;
        totalDono += arr.valorDono;
      });
    });

    return { totalReceber, totalComissao, totalDono };
  }, [selectedLeilao, leiloesPorId]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const leiloesArray = Array.from(leiloesPorId.entries());
  const leilaoSelecionado = selectedLeilao ? leiloesPorId.get(selectedLeilao) : null;

  if (isLoadingAuctions || isLoadingLots) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header fixo */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-2">
            {/* Botão de voltar estilo wizard */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => selectedLeilao ? setSelectedLeilao(null) : navigate('/lotes-convidados')}
              className="rounded-full w-10 h-10 bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-700 self-start"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl sm:text-2xl font-light text-gray-900">
              {selectedLeilao ? leilaoSelecionado?.nome : 'Detalhes dos Valores'}
            </h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-3 sm:px-4 lg:px-6 py-8">
        {/* Lista de Leilões */}
        {!selectedLeilao && (
          <div className="space-y-2">
            {leiloesArray.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-gray-500 mb-4">Nenhum lote encontrado</p>
                <div className="max-w-md mx-auto text-left space-y-2">
                  <p className="text-sm text-gray-600">Para aparecer aqui, os lotes precisam:</p>
                  <ul className="text-sm text-gray-500 space-y-1 ml-4">
                    <li>✓ Estar vinculados a um leilão</li>
                    <li>✓ Status "Arrematado" OU ter arrematantes cadastrados</li>
                  </ul>
                  <p className="text-xs text-gray-400 mt-4">
                    Total de lotes: {guestLots.length} | 
                    Com leilão: {guestLots.filter(l => l.leilao_id).length} | 
                    Arrematados: {guestLots.filter(l => l.status === 'arrematado').length} | 
                    Com arrematantes: {guestLots.filter(l => l.arrematantes && l.arrematantes.length > 0).length}
                  </p>
                </div>
              </div>
            ) : (
              leiloesArray.map(([id, leilao]) => {
                const totalLotes = leilao.lotes.length;
                const totalArrematantes = leilao.lotes.reduce((sum, l) => sum + l.arrematantes.length, 0);

                return (
                  <button
                    key={id}
                    onClick={() => setSelectedLeilao(id)}
                    className="w-full text-left px-3 sm:px-4 lg:px-6 py-4 hover:bg-gray-50 border-b border-gray-100 transition-colors group"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1">
                        <h3 className="text-base font-medium text-gray-900 mb-1">
                          {leilao.nome}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {totalLotes} {totalLotes === 1 ? 'lote' : 'lotes'} • {totalArrematantes} {totalArrematantes === 1 ? 'arrematante' : 'arrematantes'} • Comissão Anfitrião: {leilao.percentualComissao}%
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* Detalhes do Leilão */}
        {selectedLeilao && leilaoSelecionado && totaisLeilao && (
          <div className="space-y-3 sm:space-y-4 lg:space-y-6">
            {/* Lista de Lotes e Arrematantes - Design Clean */}
            <div className="space-y-4">
              {leilaoSelecionado.lotes.map((lote) => (
                <div key={lote.id} className="bg-white border border-gray-200 rounded-lg">
                  {/* Header do Lote */}
                  <div className="px-3 sm:px-4 lg:px-6 py-3 border-b border-gray-100">
                    <span className="text-sm text-gray-900">
                      <span className="font-medium">Lote #{lote.numero}</span>
                      <span className="text-gray-400 mx-2">•</span>
                      <span className="text-gray-600">{lote.descricao}</span>
                    </span>
                  </div>

                  {/* Arrematantes do Lote */}
                  <div className="divide-y divide-gray-100">
                    {lote.arrematantes.length === 0 ? (
                      <div className="px-4 sm:px-6 py-6 text-center">
                        <p className="text-sm text-gray-500 mb-2">Nenhum arrematante cadastrado</p>
                        <p className="text-xs text-gray-400">
                          Vá em <span className="font-medium">Lotes Convidados</span> → Clique no ícone 👤 para cadastrar
                        </p>
                      </div>
                    ) : (
                      lote.arrematantes.map((arr) => (
                        <div key={arr.id} className="px-3 sm:px-4 lg:px-6 py-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 sm:h-8 sm:w-8 rounded-full bg-gray-100 flex items-center justify-center">
                                <span className="text-xs font-medium text-gray-600">
                                  {arr.nome.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">{arr.nome}</p>
                                <p className="text-xs text-gray-500">
                                  {arr.pago ? 'Pago' : 'Pendente'}
                                </p>
                              </div>
                            </div>
                            <div className="text-left sm:text-right">
                              <p className="text-sm font-medium text-gray-900 mb-1">
                                {formatCurrency(arr.valorTotal)}
                              </p>
                              <div className="text-xs text-gray-500">
                                <span>Anfitrião: {formatCurrency(arr.valorComissao)}</span>
                                <span className="mx-1">•</span>
                                <span>Dono: {formatCurrency(arr.valorDono)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Resumo dos Valores - Design Clean (EMBAIXO) */}
            <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
              <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6">
                <p className="text-sm text-gray-600 mb-1">Total a Receber</p>
                <p className="text-xl sm:text-2xl font-light text-gray-900">{formatCurrency(totaisLeilao.totalReceber)}</p>
              </div>
              <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6">
                <p className="text-sm text-gray-600 mb-1">Comissão para o Anfitrião ({leilaoSelecionado.percentualComissao}%)</p>
                <p className="text-xl sm:text-2xl font-light text-gray-900">{formatCurrency(totaisLeilao.totalComissao)}</p>
              </div>
              <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6">
                <p className="text-sm text-gray-600 mb-1">Repasse ao Dono do Lote</p>
                <p className="text-xl sm:text-2xl font-light text-gray-900">{formatCurrency(totaisLeilao.totalDono)}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
