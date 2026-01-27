import React, { useEffect, useState } from 'react';
import { Auction } from '@/lib/types';
import { supabaseClient } from '@/lib/supabase-client';
import { calcularEstruturaParcelas } from '@/lib/parcelamento-calculator';

interface PdfReportProps {
  auction: Auction;
}

interface LoteImage {
  id: string;
  nome: string;
  tipo: string;
  url: string | null;
}

export const PdfReport: React.FC<PdfReportProps> = ({ auction }) => {
  const formatCurrency = (value: number | string | undefined) => {
    if (!value && value !== 0) return "R$ 0,00";
    
    if (typeof value === 'number') {
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL"
      }).format(value);
    }
    
    if (typeof value === 'string') {
      const cleaned = value.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
      const num = parseFloat(cleaned);
      if (!isNaN(num)) {
        return new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL"
        }).format(num);
      }
    }
    
    return "R$ 0,00";
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T12:00:00.000Z');
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit", 
      year: "numeric",
      timeZone: "UTC"
    });
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      agendado: "Agendado",
      em_andamento: "Em Andamento",
      finalizado: "Finalizado"
    };
    return labels[status as keyof typeof labels] || status;
  };

  const getStatusColor = (status: string) => {
    if (status === 'em_andamento') return { bg: '#dcfce7', color: '#15803d', border: '#86efac' };
    if (status === 'finalizado') return { bg: '#e5e7eb', color: '#1f2937', border: '#9ca3af' };
    return { bg: '#f3f4f6', color: '#374151', border: '#d1d5db' }; // agendado
  };

  const getLocalLabel = (local: string) => {
    const labels = {
      presencial: "Presencial",
      online: "Online",
      hibrido: "Híbrido"
    };
    return labels[local as keyof typeof labels] || local;
  };

  const todosArrematantes = auction.arrematantes && auction.arrematantes.length > 0 
    ? auction.arrematantes 
    : (auction.arrematante ? [auction.arrematante] : []);

  const statusColors = getStatusColor(auction.status);
    
  // Hook para buscar imagens dos lotes
  const [lotesComImagens, setLotesComImagens] = useState<Record<string, LoteImage[]>>({});

  useEffect(() => {
    const fetchAllLoteImages = async () => {
      if (!auction.lotes || auction.lotes.length === 0) return;

      const imagesMap: Record<string, LoteImage[]> = {};

      for (const lote of auction.lotes) {
        try {
          const { data, error } = await supabaseClient
            .from('documents')
            .select('id, nome, tipo, url')
            .eq('auction_id', auction.id)
            .eq('categoria', 'lote_fotos')
            .like('descricao', `%Lote ${lote.numero}%`)
            .order('data_upload', { ascending: false })
            .limit(4); // Limitar a 4 imagens por lote para PDF

          if (!error && data && data.length > 0) {
            imagesMap[lote.id] = data as LoteImage[];
        }
      } catch (error) {
          logger.error(`Erro ao buscar imagens do lote ${lote.numero}:`, error);
      }
    }
    
      setLotesComImagens(imagesMap);
    };

    fetchAllLoteImages();
  }, [auction.id, auction.lotes]);

  return (
    <div id="pdf-content" className="space-y-10" style={{ 
      background: 'white', 
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      padding: '40px',
      fontSize: '14px',
      lineHeight: '1.5',
      color: '#111827'
    }}>
      
      {/* ==================== CABEÇALHO ==================== */}
      <div className="bg-gray-50 rounded-lg px-6 py-6 border border-gray-200" style={{ 
        background: '#f9fafb', 
        borderRadius: '8px', 
        padding: '24px', 
        border: '1px solid #e5e7eb',
        marginBottom: '40px',
        pageBreakInside: 'avoid'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
    <div>
            <h1 style={{ fontSize: '24px', fontWeight: '600', color: '#111827', margin: '0 0 8px 0' }}>
              {auction.nome}
              </h1>
            {auction.identificacao && (
              <p style={{ fontSize: '14px', color: '#6b7280', fontFamily: 'monospace', margin: 0 }}>
                #{auction.identificacao}
              </p>
            )}
          </div>
          <span style={{ 
            padding: '6px 12px', 
            borderRadius: '6px', 
            fontSize: '14px', 
            fontWeight: '500',
            background: statusColors.bg,
            color: statusColors.color,
            border: `1px solid ${statusColors.border}`,
            display: 'inline-block'
          }}>
            {getStatusLabel(auction.status)}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '24px', fontSize: '14px', color: '#6b7280' }}>
          <span>Cadastrado em {formatDate(auction.dataInicio)}</span>
          {auction.arquivado && (
            <span style={{ color: '#d97706' }}>• Arquivado</span>
          )}
         </div>
       </div>

      {/* ==================== INFORMAÇÕES BÁSICAS ==================== */}
      <div className="bg-white border border-gray-200 rounded-lg p-6" style={{ 
        background: 'white', 
        border: '1px solid #e5e7eb', 
        borderRadius: '8px', 
        padding: '24px',
        marginBottom: '40px',
        pageBreakInside: 'avoid'
      }}>
        <h2 style={{ 
          fontSize: '18px', 
          fontWeight: '600', 
          color: '#111827', 
          marginTop: 0,
          marginBottom: '24px', 
          paddingBottom: '12px', 
          borderBottom: '1px solid #e5e7eb'
        }}>
          Informações Básicas
        </h2>
        
        <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
          {/* Local do Evento */}
          <div style={{ flex: '1 1 200px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '500', color: '#374151', marginTop: 0, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
              Local do Evento
            </h3>
            <p style={{ color: '#111827', textTransform: 'capitalize', margin: '0 0 8px 0' }}>
              {getLocalLabel(auction.local)}
            </p>
            {auction.endereco && (
              <p style={{ fontSize: '14px', color: '#6b7280', lineHeight: '1.6', margin: 0 }}>{auction.endereco}</p>
          )}
      </div>

          {/* Investimento Total */}
          <div style={{ flex: '1 1 200px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '500', color: '#374151', marginTop: 0, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23"></line>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
              </svg>
              Investimento Total
            </h3>
            <p style={{ fontSize: '24px', fontWeight: '300', color: '#111827', margin: '0 0 12px 0' }}>
              {(() => {
                if (auction.custosNumerico && auction.custosNumerico > 0) {
                  return formatCurrency(auction.custosNumerico);
                }
                if (auction.custos && auction.custos.toString().trim() !== "") {
                  return formatCurrency(auction.custos);
                  }
                return "R$ 0,00";
              })()}
            </p>

            {/* Detalhamento dos Custos */}
      {auction.detalheCustos && auction.detalheCustos.length > 0 && (
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
                <h4 style={{ 
                  fontSize: '10px', 
                  fontWeight: '500', 
                  color: '#9ca3af', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.05em', 
                  marginTop: 0,
                  marginBottom: '12px' 
                }}>
            Especificação dos Gastos
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {auction.detalheCustos.map((item, index) => (
                    <div key={item.id || index} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      padding: '8px 12px', 
                      background: '#f9fafb', 
                      borderRadius: '6px', 
                      border: '1px solid #e5e7eb' 
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          width: '24px', 
                          height: '24px', 
                          borderRadius: '4px', 
                          background: '#e5e7eb', 
                          fontSize: '12px', 
                          fontWeight: '600', 
                          color: '#374151' 
                        }}>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                        <span style={{ fontSize: '14px', color: '#374151' }}>
                      {item.descricao || 'Item de custo'}
                    </span>
                  </div>
                      <span style={{ fontSize: '14px', fontWeight: '500', color: '#111827' }}>
                    {formatCurrency(item.valorNumerico)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
          </div>

          {/* Patrocínios */}
      {auction.detalhePatrocinios && auction.detalhePatrocinios.length > 0 && (
            <div style={{ flex: '1 1 200px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '500', color: '#374151', marginTop: 0, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
            Patrocínios Recebidos
              </h3>
              <p style={{ fontSize: '24px', fontWeight: '300', color: '#111827', margin: '0 0 12px 0' }}>
                  {formatCurrency(auction.patrociniosTotal || 0)}
              </p>

            {/* Lista de Patrocinadores */}
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
                <h4 style={{ 
                  fontSize: '10px', 
                  fontWeight: '500', 
                  color: '#9ca3af', 
                  textTransform: 'uppercase', 
                  letterSpacing: '0.05em', 
                  marginTop: 0,
                  marginBottom: '12px' 
                }}>
                  Patrocinadores
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {auction.detalhePatrocinios.map((item, index) => (
                    <div key={item.id || index} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      padding: '8px 12px', 
                      background: '#f9fafb', 
                      borderRadius: '6px', 
                      border: '1px solid #e5e7eb' 
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          width: '24px', 
                          height: '24px', 
                          borderRadius: '4px', 
                          background: '#e5e7eb', 
                          fontSize: '12px', 
                          fontWeight: '600', 
                          color: '#374151' 
                        }}>
                        {String(index + 1).padStart(2, '0')}
                      </span>
                        <span style={{ fontSize: '14px', color: '#374151' }}>
                        {item.nomePatrocinador || 'Patrocinador'}
                      </span>
                    </div>
                      <span style={{ fontSize: '14px', fontWeight: '500', color: '#111827' }}>
                      {formatCurrency(item.valorNumerico)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

              {/* Resumo do Saldo Líquido */}
              {auction.custosNumerico && (
                <div style={{ 
                  marginTop: '16px', 
                  padding: '16px', 
                  background: '#f9fafb', 
                  borderRadius: '8px', 
                  border: '1px solid #e5e7eb' 
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px' }}>
                      <span style={{ color: '#6b7280' }}>Custos Totais:</span>
                      <span style={{ fontWeight: '500', color: '#111827' }}>
                        {formatCurrency(auction.custosNumerico)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px' }}>
                      <span style={{ color: '#6b7280' }}>Patrocínios:</span>
                      <span style={{ fontWeight: '500', color: '#374151' }}>
                        {formatCurrency(auction.patrociniosTotal || 0)}
                      </span>
                    </div>
                    <div style={{ borderTop: '1px solid #d1d5db', paddingTop: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>
                          {(auction.patrociniosTotal || 0) > auction.custosNumerico ? 'Superávit:' : 'Saldo Líquido:'}
                        </span>
                        <span style={{ fontSize: '18px', fontWeight: '300', color: '#111827' }}>
                          {formatCurrency(auction.custosNumerico - (auction.patrociniosTotal || 0))}
                        </span>
                      </div>
                    </div>
          </div>
        </div>
      )}
            </div>
          )}
        </div>
      </div>

      {/* ==================== RESUMO DO PAGAMENTO ==================== */}
      {(() => {
        const totalArrecadado = todosArrematantes.reduce((sum, arr) => {
          const valor = typeof arr.valorPagar === 'string' 
            ? parseFloat(arr.valorPagar.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0
            : arr.valorPagar || 0;
          return sum + valor;
        }, 0);
        
        const totalPago = todosArrematantes.reduce((sum, arr) => {
          // Se totalmente pago, somar valor total
          if (arr.pago) {
            const valor = typeof arr.valorPagar === 'string' 
              ? parseFloat(arr.valorPagar.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0
              : arr.valorPagar || 0;
            return sum + valor;
          }
          
          // Se parcialmente pago, calcular valor das parcelas pagas com base na estrutura real
          const parcelasPagas = arr.parcelasPagas || 0;
          if (parcelasPagas > 0) {
            const valorBase = typeof arr.valorPagar === 'string' 
              ? parseFloat(arr.valorPagar.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0
              : arr.valorPagar || 0;
            
            // Buscar o lote do arrematante para verificar tipo de pagamento
            const loteArrematado = arr.loteId 
              ? auction.lotes?.find(lote => lote.id === arr.loteId)
              : null;
            const tipoPagamento = loteArrematado?.tipoPagamento || auction.tipoPagamento;
            
            if (tipoPagamento === 'entrada_parcelamento') {
              // Entrada + Parcelamento
              if (parcelasPagas === 1) {
                // Só a entrada foi paga
                const valorEntrada = arr.valorEntrada ? 
                  (typeof arr.valorEntrada === 'string' ? 
                    parseFloat(arr.valorEntrada.replace(/[^\d,.-]/g, '').replace(',', '.')) : 
                    arr.valorEntrada) : 
                  valorBase * 0.3;
                return sum + valorEntrada;
              } else {
                // Entrada + algumas parcelas foram pagas
                const valorEntrada = arr.valorEntrada ? 
                  (typeof arr.valorEntrada === 'string' ? 
                    parseFloat(arr.valorEntrada.replace(/[^\d,.-]/g, '').replace(',', '.')) : 
                    arr.valorEntrada) : 
                  valorBase * 0.3;
                
                // Calcular estrutura de parcelas
                const estruturaParcelas = calcularEstruturaParcelas(
                  valorBase,
                  arr.parcelasTriplas || 0,
                  arr.parcelasDuplas || 0,
                  arr.parcelasSimples || 0
                );
                
                // Somar entrada + parcelas pagas (parcelasPagas - 1 porque parcelasPagas inclui entrada)
                let valorParcelasPagas = valorEntrada;
                const numParcelasParcelamento = parcelasPagas - 1;
                for (let i = 0; i < numParcelasParcelamento && i < estruturaParcelas.length; i++) {
                  valorParcelasPagas += estruturaParcelas[i]?.valor || 0;
                }
                return sum + valorParcelasPagas;
              }
            } else if (tipoPagamento === 'parcelamento') {
              // Parcelamento simples
              const estruturaParcelas = calcularEstruturaParcelas(
                valorBase,
                arr.parcelasTriplas || 0,
                arr.parcelasDuplas || 0,
                arr.parcelasSimples || 0
              );
              
              // Somar apenas as parcelas que foram pagas
              let valorParcelasPagas = 0;
              for (let i = 0; i < parcelasPagas && i < estruturaParcelas.length; i++) {
                valorParcelasPagas += estruturaParcelas[i]?.valor || 0;
              }
              return sum + valorParcelasPagas;
            }
          }
          
          return sum;
        }, 0);
        
        const totalPendente = totalArrecadado - totalPago;
        
        if (todosArrematantes.length === 0) return null;
        
                return (
          <div className="bg-white border border-gray-200 rounded-lg p-6" style={{ 
            background: 'white', 
            border: '1px solid #e5e7eb', 
            borderRadius: '8px', 
            padding: '24px',
            marginBottom: '40px',
            pageBreakInside: 'avoid'
          }}>
            <h2 style={{ 
              fontSize: '18px', 
              fontWeight: '600', 
              color: '#111827', 
              marginTop: 0,
              marginBottom: '24px', 
              paddingBottom: '12px', 
              borderBottom: '1px solid #e5e7eb'
            }}>
              Resumo do Pagamento
            </h2>
            
            <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', marginBottom: '24px' }}>
              <div style={{ flex: '1 1 200px' }}>
                <p style={{ fontSize: '12px', fontWeight: '500', color: '#6b7280', marginTop: 0, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Total Arrecadado
                </p>
                <p style={{ fontSize: '20px', fontWeight: '400', color: '#374151', margin: 0 }}>
                  {formatCurrency(totalArrecadado)}
                </p>
                    </div>
              
              <div style={{ flex: '1 1 200px' }}>
                <p style={{ fontSize: '12px', fontWeight: '500', color: '#6b7280', marginTop: 0, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Total Recebido
                </p>
                <p style={{ fontSize: '20px', fontWeight: '400', color: '#374151', margin: 0 }}>
                  {formatCurrency(totalPago)}
                      </p>
                    </div>
              
              <div style={{ flex: '1 1 200px' }}>
                <p style={{ fontSize: '12px', fontWeight: '500', color: '#6b7280', marginTop: 0, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Total Pendente
                </p>
                <p style={{ fontSize: '20px', fontWeight: '400', color: '#374151', margin: 0 }}>
                  {formatCurrency(totalPendente)}
                </p>
                  </div>
            </div>

            {/* Configuração específica por mercadoria */}
            <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #e5e7eb' }}>
              <p style={{ fontSize: '14px', fontWeight: '500', color: '#374151', marginTop: 0, marginBottom: '12px' }}>
                Configuração específica por mercadoria
              </p>
              
              {(() => {
                // Verificar se há pagamentos configurados
                const temPagamentos = todosArrematantes.some(arr => arr.tipoPagamento);
                
                if (!temPagamentos) {
              return (
                    <div style={{ 
                      padding: '32px 16px', 
                      textAlign: 'center', 
                      background: '#f9fafb', 
                      borderRadius: '8px', 
                      border: '1px solid #e5e7eb' 
                    }}>
                      <p style={{ fontSize: '14px', fontWeight: '500', color: '#374151', margin: '0 0 4px 0' }}>
                        Nenhum pagamento configurado
                      </p>
                      <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>
                        Ainda não há arrematantes com configuração de pagamento para este leilão
                      </p>
                  </div>
                  );
                }
                
                // Mapear mercadorias com seus arrematantes
                const mercadoriasComPagamento: Array<{
                  loteNumero: string;
                  mercadoriaTitulo: string;
                  arrematante: typeof todosArrematantes[0];
                }> = [];
                
                auction.lotes?.forEach(lote => {
                  lote.mercadorias?.forEach(mercadoria => {
                    const arrematante = todosArrematantes.find(
                      arr => arr.mercadoriaId === mercadoria.id && arr.tipoPagamento
                    );
                    if (arrematante) {
                      mercadoriasComPagamento.push({
                        loteNumero: lote.numero,
                        mercadoriaTitulo: mercadoria.titulo || mercadoria.tipo || 'Mercadoria',
                        arrematante
                      });
                    }
                  });
                });
                
                if (mercadoriasComPagamento.length === 0) {
                      return (
                    <div style={{ 
                      padding: '32px 16px', 
                      textAlign: 'center', 
                      background: '#f9fafb', 
                      borderRadius: '8px', 
                      border: '1px solid #e5e7eb' 
                    }}>
                      <p style={{ fontSize: '14px', fontWeight: '500', color: '#374151', margin: '0 0 4px 0' }}>
                        Nenhum pagamento configurado
                      </p>
                      <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>
                        Ainda não há arrematantes com configuração de pagamento para este leilão
                      </p>
                          </div>
                  );
                }
                
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {mercadoriasComPagamento.map((item, index) => {
                      const arr = item.arrematante;
                      return (
                        <div key={arr.id || index} style={{ 
                          padding: '12px 16px', 
                          background: '#f9fafb', 
                          borderRadius: '8px', 
                          border: '1px solid #e5e7eb',
                          pageBreakInside: 'avoid'
                        }}>
                          <div style={{ marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <p style={{ fontSize: '14px', fontWeight: '600', color: '#111827', margin: 0 }}>
                                Lote {item.loteNumero}
                              </p>
                              <span style={{ color: '#9ca3af' }}>•</span>
                              <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>{item.mercadoriaTitulo}</p>
                                  </div>
                            <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>
                              Arrematante: {arr.nome}
                            </p>
                                    </div>

                          <div style={{ fontSize: '14px', color: '#6b7280' }}>
                            {arr.tipoPagamento === 'a_vista' && (
                                    <div>
                                <p style={{ fontWeight: '500', color: '#111827', margin: '0 0 4px 0' }}>
                                  Pagamento à vista
                                </p>
                                {arr.dataVencimentoVista && (
                                  <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>
                                    Vencimento: {formatDate(arr.dataVencimentoVista)}
                                  </p>
                                )}
                                    </div>
                                  )}

                            {arr.tipoPagamento === 'parcelamento' && (
                                        <div>
                                <p style={{ fontWeight: '500', color: '#111827', margin: '0 0 4px 0' }}>
                                  Parcelamento em {arr.quantidadeParcelas || 12} parcelas
                                </p>
                                {arr.mesInicioPagamento && arr.diaVencimentoMensal && (
                                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                    <p style={{ margin: '2px 0' }}>
                                      • Primeira parcela: {(() => {
                                        const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                                        const [ano, mes] = arr.mesInicioPagamento.split('-');
                                        const mesNumero = parseInt(mes);
                                        return `${meses[mesNumero - 1]}/${ano}`;
                                            })()}
                                    </p>
                                    <p style={{ margin: '2px 0' }}>
                                      • Vencimento mensal: todo dia {arr.diaVencimentoMensal} de cada mês
                                    </p>
                                    <p style={{ margin: '2px 0' }}>
                                      • Total de parcelas: {arr.quantidadeParcelas}
                                    </p>
                                        </div>
                                      )}
                                        </div>
                                      )}
                                      
                            {arr.tipoPagamento === 'entrada_parcelamento' && (
                                        <div>
                                <p style={{ fontWeight: '500', color: '#111827', margin: '0 0 4px 0' }}>
                                  Entrada + Parcelamento em {arr.quantidadeParcelas || 12} parcelas
                                </p>
                                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                  {arr.dataEntrada && (
                                    <p style={{ margin: '2px 0' }}>
                                      • Data da entrada: {formatDate(arr.dataEntrada)}
                                    </p>
                                  )}
                                  {arr.mesInicioPagamento && arr.diaVencimentoMensal && (
                                    <>
                                      <p style={{ margin: '2px 0' }}>
                                        • Primeira parcela: {(() => {
                                          const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                                          const [ano, mes] = arr.mesInicioPagamento.split('-');
                                          const mesNumero = parseInt(mes);
                                          return `${meses[mesNumero - 1]}/${ano}`;
                                        })()}
                                      </p>
                                      <p style={{ margin: '2px 0' }}>
                                        • Vencimento mensal: todo dia {arr.diaVencimentoMensal} de cada mês
                                      </p>
                                      <p style={{ margin: '2px 0' }}>
                                        • Total de parcelas: {arr.quantidadeParcelas}
                                      </p>
                                    </>
                                  )}
                                </div>
                            </div>
                          )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              );
              })()}
          </div>
          </div>
        );
      })()}

      {/* ==================== CRONOGRAMA ==================== */}
      <div className="bg-white border border-gray-200 rounded-lg p-6" style={{ 
        background: 'white', 
        border: '1px solid #e5e7eb', 
        borderRadius: '8px', 
        padding: '24px',
        marginBottom: '40px',
        pageBreakInside: 'avoid'
      }}>
        <h2 style={{ 
          fontSize: '18px', 
          fontWeight: '600', 
          color: '#111827', 
          marginTop: 0,
          marginBottom: '24px', 
          paddingBottom: '12px', 
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          Cronograma do Evento
           </h2>

        <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <p style={{ fontSize: '14px', fontWeight: '500', color: '#374151', marginTop: 0, marginBottom: '8px' }}>
              Data de Início
            </p>
            <p style={{ color: '#111827', fontWeight: '500', margin: 0 }}>{formatDate(auction.dataInicio)}</p>
           </div>

          {auction.status === 'em_andamento' && (
            <div style={{ flex: '1 1 200px' }}>
              <p style={{ fontSize: '14px', fontWeight: '500', color: '#374151', marginTop: 0, marginBottom: '8px' }}>
                Em Andamento
              </p>
              <p style={{ color: '#111827', fontWeight: '500', margin: 0 }}>{formatDate(auction.dataInicio)}</p>
               </div>
          )}
          
          {auction.dataEncerramento && (
            <div style={{ flex: '1 1 200px' }}>
              <p style={{ fontSize: '14px', fontWeight: '500', color: '#374151', marginTop: 0, marginBottom: '8px' }}>
                Encerramento
              </p>
              <p style={{ color: '#111827', fontWeight: '500', margin: 0 }}>{formatDate(auction.dataEncerramento)}</p>
                    </div>
          )}
             </div>
           </div>

      {/* ==================== ARREMATANTES ==================== */}
      {todosArrematantes.length > 0 && todosArrematantes.map((arrematanteAtual, arrIndex) => {
        const lote = (auction.lotes || []).find(l => l.id === arrematanteAtual.loteId);
        const mercadoria = lote?.mercadorias?.find(m => m.id === arrematanteAtual.mercadoriaId);
        
                return (
          <div key={arrematanteAtual.id || arrIndex} className="bg-white border border-gray-200 rounded-lg p-6" style={{ 
            background: 'white', 
            border: '1px solid #e5e7eb', 
            borderRadius: '8px', 
            padding: '24px',
            marginBottom: '40px',
            pageBreakInside: 'avoid'
          }}>
            <div style={{ marginBottom: '24px', paddingBottom: '12px', borderBottom: '1px solid #e5e7eb' }}>
              <h2 style={{ 
                fontSize: '18px', 
                fontWeight: '600', 
                color: '#111827',
                marginTop: 0,
                marginBottom: todosArrematantes.length > 1 && mercadoria ? '4px' : 0,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                Informações do{todosArrematantes.length > 1 ? 's' : ''} Arrematante{todosArrematantes.length > 1 ? 's' : ''}
                {todosArrematantes.length > 1 && ` ${arrIndex + 1}`}
              </h2>
              {todosArrematantes.length > 1 && mercadoria && (
                <p style={{ fontSize: '14px', color: '#6b7280', margin: 0 }}>
                  {mercadoria.titulo || mercadoria.tipo || 'Mercadoria'}
                </p>
                    )}
                  </div>
            
            <div style={{ display: 'flex', gap: '32px', marginBottom: '24px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px' }}>
                <p style={{ fontSize: '14px', fontWeight: '500', color: '#374151', marginTop: 0, marginBottom: '8px' }}>
                  Nome Completo
                </p>
                <p style={{ color: '#111827', fontWeight: '500', margin: 0 }}>{arrematanteAtual.nome}</p>
                    </div>
                    
              {arrematanteAtual.documento && (
                <div style={{ flex: '1 1 200px' }}>
                  <p style={{ fontSize: '14px', fontWeight: '500', color: '#374151', marginTop: 0, marginBottom: '8px' }}>
                    CPF/CNPJ
                  </p>
                  <p style={{ color: '#111827', fontFamily: 'monospace', margin: 0 }}>{arrematanteAtual.documento}</p>
                            </div>
                          )}
                        </div>

            <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px' }}>
                <p style={{ fontSize: '14px', fontWeight: '500', color: '#374151', marginTop: 0, marginBottom: '8px' }}>
                  Valor Total
                </p>
                <p style={{ fontSize: '20px', fontWeight: '600', color: '#111827', margin: 0 }}>
                  {formatCurrency(
                    typeof arrematanteAtual.valorPagar === 'string'
                      ? parseFloat(arrematanteAtual.valorPagar.replace(/[^\d,.-]/g, '').replace(',', '.'))
                      : arrematanteAtual.valorPagar
                  )}
                </p>
              </div>

              <div style={{ flex: '1 1 200px' }}>
                <p style={{ fontSize: '14px', fontWeight: '500', color: '#374151', marginTop: 0, marginBottom: '8px' }}>
                  Situação do Pagamento
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ 
                    width: '12px', 
                    height: '12px', 
                    borderRadius: '50%', 
                    background: arrematanteAtual.pago ? '#4b5563' : '#f59e0b' 
                  }}></div>
                  <span style={{ color: '#111827', fontWeight: '500' }}>
                    {arrematanteAtual.pago ? 'Quitado' : 'Pendente'}
                  </span>
                        </div>
                        </div>
                        </div>

            {/* Informações de contato */}
            {(arrematanteAtual.email || arrematanteAtual.telefone || arrematanteAtual.endereco) && (
              <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #e5e7eb' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginTop: 0, marginBottom: '16px' }}>
                  Informações de Contato
                </h3>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  {arrematanteAtual.email && (
                    <div style={{ flex: '1 1 200px' }}>
                      <p style={{ fontSize: '12px', color: '#6b7280', marginTop: 0, marginBottom: '4px' }}>Email</p>
                      <p style={{ fontSize: '14px', color: '#111827', margin: 0 }}>{arrematanteAtual.email}</p>
                  </div>
                  )}
                  {arrematanteAtual.telefone && (
                    <div style={{ flex: '1 1 200px' }}>
                      <p style={{ fontSize: '12px', color: '#6b7280', marginTop: 0, marginBottom: '4px' }}>Telefone</p>
                      <p style={{ fontSize: '14px', color: '#111827', margin: 0 }}>{arrematanteAtual.telefone}</p>
                  </div>
                  )}
                  {arrematanteAtual.endereco && (
                    <div style={{ flex: '1 1 100%' }}>
                      <p style={{ fontSize: '12px', color: '#6b7280', marginTop: 0, marginBottom: '4px' }}>Endereço</p>
                      <p style={{ fontSize: '14px', color: '#111827', margin: 0 }}>{arrematanteAtual.endereco}</p>
                  </div>
                  )}
                  </div>
                  </div>
            )}

            {/* Informações de parcelamento */}
            {arrematanteAtual.quantidadeParcelas && arrematanteAtual.quantidadeParcelas > 1 && (
              <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #e5e7eb' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', marginTop: 0, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                    <line x1="1" y1="10" x2="23" y2="10"></line>
                  </svg>
                  Informações de Parcelamento
               </h3>
                <div style={{ background: '#f9fafb', borderRadius: '8px', padding: '16px', border: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', gap: '16px', fontSize: '14px', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 150px' }}>
                      <p style={{ color: '#6b7280', marginTop: 0, marginBottom: '4px' }}>Parcelas:</p>
                      <p style={{ fontWeight: '500', color: '#111827', margin: 0 }}>{arrematanteAtual.quantidadeParcelas}x</p>
                       </div>
                    {arrematanteAtual.mesInicioPagamento && (
                      <div style={{ flex: '1 1 150px' }}>
                        <p style={{ color: '#6b7280', marginTop: 0, marginBottom: '4px' }}>Primeira parcela:</p>
                        <p style={{ fontWeight: '500', color: '#111827', margin: 0 }}>
                          {(() => {
                            // mesInicioPagamento pode ser "YYYY-MM" ou "YYYY-MM-DD"
                            const mesInicio = arrematanteAtual.mesInicioPagamento;
                            const [ano, mes] = mesInicio.split('-');
                            const data = new Date(parseInt(ano), parseInt(mes) - 1);
                            return data.toLocaleDateString('pt-BR', { 
                              month: 'long', 
                              year: 'numeric' 
                            }).replace(/^\w/, c => c.toUpperCase());
                          })()}
                        </p>
                           </div>
                    )}
                    {arrematanteAtual.diaVencimentoMensal && (
                      <div style={{ flex: '1 1 150px' }}>
                        <p style={{ color: '#6b7280', marginTop: 0, marginBottom: '4px' }}>Vencimento mensal:</p>
                        <p style={{ fontWeight: '500', color: '#111827', margin: 0 }}>
                          Todo dia {arrematanteAtual.diaVencimentoMensal}
                        </p>
                           </div>
                    )}
                         </div>
               </div>
             </div>
           )}
         </div>
        );
      })}

      {/* ==================== LOTES ==================== */}
       {auction.lotes && auction.lotes.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6" style={{ 
          background: 'white', 
          border: '1px solid #e5e7eb', 
          borderRadius: '8px', 
          padding: '24px',
          marginBottom: '40px',
          pageBreakInside: 'avoid'
        }}>
          <h2 style={{ 
            fontSize: '18px', 
            fontWeight: '600', 
            color: '#111827', 
            marginTop: 0,
            marginBottom: '24px', 
            paddingBottom: '12px', 
            borderBottom: '1px solid #e5e7eb'
          }}>
             Lotes do Leilão ({auction.lotes.length})
           </h2>
           
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
             {auction.lotes.map((lote, index) => (
              <div key={lote.id || index} style={{ 
                padding: '16px', 
                border: '1px solid #e5e7eb', 
                borderRadius: '8px',
                pageBreakInside: 'avoid'
              }}>
                <div style={{ marginBottom: '12px' }}>
                  <h4 style={{ fontWeight: '600', color: '#111827', marginTop: 0, marginBottom: '4px' }}>
                    Lote {lote.numero}
                  </h4>
                  <p style={{ color: '#374151', margin: 0 }}>{lote.descricao}</p>
                 </div>

                {/* Mercadorias */}
                   {lote.mercadorias && lote.mercadorias.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <h5 style={{ fontSize: '14px', fontWeight: '500', color: '#374151', marginTop: 0, marginBottom: '8px' }}>
                      Mercadorias:
                                 </h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {lote.mercadorias.map((mercadoria, mercIndex) => (
                        <div key={mercadoria.id || mercIndex} style={{ fontSize: '14px', color: '#6b7280' }}>
                          • {mercadoria.titulo || mercadoria.tipo || 'Mercadoria'} - {mercadoria.descricao}
                          {mercadoria.quantidade && (
                            <span style={{ color: '#9ca3af' }}> (Qtd: {mercadoria.quantidade})</span>
                             )}
                           </div>
                         ))}
                       </div>
                  </div>
                )}

                {/* Imagens do Lote */}
                {lotesComImagens[lote.id] && lotesComImagens[lote.id].length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <h5 style={{ fontSize: '14px', fontWeight: '500', color: '#374151', marginTop: 0, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                        <polyline points="21 15 16 10 5 21"></polyline>
                      </svg>
                      Imagens do Lote ({lotesComImagens[lote.id].length})
                    </h5>
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: 'repeat(2, 1fr)', 
                      gap: '12px',
                      marginBottom: '12px'
                    }}>
                      {lotesComImagens[lote.id].slice(0, 4).map((image, imgIndex) => (
                        <div key={image.id || imgIndex} style={{ 
                          border: '1px solid #e5e7eb', 
                          borderRadius: '6px',
                          overflow: 'hidden',
                          background: '#f9fafb'
                        }}>
                          {image.url ? (
                            <img 
                              src={image.url} 
                              alt={image.nome}
                              style={{ 
                                width: '100%', 
                                height: '150px', 
                                objectFit: 'cover',
                                display: 'block'
                              }}
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                              }}
                            />
                          ) : (
                            <div style={{ 
                              width: '100%', 
                              height: '150px', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)'
                            }}>
                              <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>Imagem não disponível</p>
                     </div>
                   )}
                          <div style={{ padding: '8px' }}>
                            <p style={{ fontSize: '11px', color: '#6b7280', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {image.nome}
                            </p>
                 </div>
               </div>
             ))}
           </div>
         </div>
       )}

                {/* Configurações de Pagamento do Lote */}
                {lote.tipoPagamento && (
                  <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '12px', marginTop: '12px' }}>
                    <h5 style={{ 
                      fontSize: '14px', 
                      fontWeight: '600', 
                      color: '#374151', 
                      marginTop: 0,
                      marginBottom: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <span style={{ 
                        display: 'inline-block', 
                        width: '8px', 
                        height: '8px', 
                        background: '#6b7280', 
                        borderRadius: '50%' 
                      }}></span>
                      Pagamento Específico deste Lote
                    </h5>
                    
                    <div style={{ 
                      display: 'flex', 
                      gap: '12px', 
                      fontSize: '12px',
                      flexWrap: 'wrap'
                    }}>
                      {/* Tipo de Pagamento */}
                      <div style={{ background: '#f9fafb', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db', flex: '1 1 150px' }}>
                        <span style={{ color: '#6b7280', fontWeight: '500', display: 'block', marginBottom: '2px' }}>
                          Tipo:
                        </span>
                        <span style={{ color: '#1f2937' }}>
                          {lote.tipoPagamento === 'a_vista' ? 'À vista' :
                           lote.tipoPagamento === 'parcelamento' ? 'Parcelamento' :
                           'Entrada + Parcelamento'}
                        </span>
                      </div>

                      {/* Data à Vista */}
                      {lote.tipoPagamento === 'a_vista' && lote.dataVencimentoVista && (
                        <div style={{ background: '#f3f4f6', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db', flex: '1 1 150px' }}>
                          <span style={{ color: '#6b7280', fontWeight: '500', display: 'block', marginBottom: '2px' }}>
                            Data de Pagamento:
                          </span>
                          <span style={{ color: '#1f2937' }}>
                            {formatDate(lote.dataVencimentoVista)}
                          </span>
                        </div>
                      )}

                      {/* Data da Entrada */}
                      {lote.tipoPagamento === 'entrada_parcelamento' && lote.dataEntrada && (
                        <div style={{ background: '#f3f4f6', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db', flex: '1 1 150px' }}>
                          <span style={{ color: '#6b7280', fontWeight: '500', display: 'block', marginBottom: '2px' }}>
                            Data da Entrada:
                          </span>
                          <span style={{ color: '#1f2937' }}>
                            {formatDate(lote.dataEntrada)}
                          </span>
                      </div>
                      )}

                      {/* Configurações de Parcelamento */}
                      {(lote.tipoPagamento === 'parcelamento' || lote.tipoPagamento === 'entrada_parcelamento') && (
                        <>
                          {lote.mesInicioPagamento && (
                            <div style={{ background: '#f3f4f6', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db', flex: '1 1 150px' }}>
                              <span style={{ color: '#6b7280', fontWeight: '500', display: 'block', marginBottom: '2px' }}>
                                Mês de Início:
                              </span>
                              <span style={{ color: '#1f2937' }}>
                                {(() => {
                                  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                                                'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                                  return meses[parseInt(lote.mesInicioPagamento) - 1] || 'N/A';
                                })()}
                              </span>
                          </div>
                          )}
                          
                          {lote.diaVencimentoPadrao && (
                            <div style={{ background: '#f3f4f6', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db', flex: '1 1 150px' }}>
                              <span style={{ color: '#6b7280', fontWeight: '500', display: 'block', marginBottom: '2px' }}>
                                Dia do Vencimento:
                              </span>
                              <span style={{ color: '#1f2937' }}>Dia {lote.diaVencimentoPadrao}</span>
            </div>
          )}

                          {lote.parcelasPadrao && (
                            <div style={{ background: '#f3f4f6', padding: '8px', borderRadius: '4px', border: '1px solid #d1d5db', flex: '1 1 150px' }}>
                              <span style={{ color: '#6b7280', fontWeight: '500', display: 'block', marginBottom: '2px' }}>
                                Parcelas:
                              </span>
                              <span style={{ color: '#1f2937' }}>
                                {lote.parcelasPadrao}x{lote.tipoPagamento === 'entrada_parcelamento' ? ' (após entrada)' : ''}
                              </span>
                                  </div>
                          )}
                        </>
                      )}
                        </div>
                        </div>
                      )}
                          </div>
            ))}
              </div>
            </div>
          )}

      {/* ==================== ANEXOS ==================== */}
      {((auction.documentos && auction.documentos.length > 0) || 
        (auction.fotosMercadoria && auction.fotosMercadoria.length > 0)) && (
        <div className="bg-white border border-gray-200 rounded-lg p-6" style={{ 
          background: 'white', 
          border: '1px solid #e5e7eb', 
          borderRadius: '8px', 
          padding: '24px',
          marginBottom: '40px',
          pageBreakInside: 'avoid'
        }}>
          <h2 style={{ 
            fontSize: '18px', 
            fontWeight: '600', 
            color: '#111827', 
            marginTop: 0,
            marginBottom: '24px', 
            paddingBottom: '12px', 
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
            </svg>
            Anexos e Documentação
          </h2>

          <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px' }}>
              <p style={{ fontWeight: '600', color: '#374151', marginTop: 0, marginBottom: '4px' }}>Total de Documentos:</p>
              <p style={{ fontSize: '24px', color: '#111827', margin: 0 }}>{auction.documentos?.length || 0}</p>
               </div>
            <div style={{ flex: '1 1 200px' }}>
              <p style={{ fontWeight: '600', color: '#374151', marginTop: 0, marginBottom: '4px' }}>Total de Fotos:</p>
              <p style={{ fontSize: '24px', color: '#111827', margin: 0 }}>{auction.fotosMercadoria?.length || 0}</p>
             </div>
           </div>
         </div>
       )}

      {/* ==================== OBSERVAÇÕES ==================== */}
      {auction.historicoNotas && auction.historicoNotas.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6" style={{ 
          background: 'white', 
          border: '1px solid #e5e7eb', 
          borderRadius: '8px', 
          padding: '24px',
          marginBottom: '40px',
          pageBreakInside: 'avoid'
        }}>
          <h2 style={{ 
            fontSize: '18px', 
            fontWeight: '600', 
            color: '#111827', 
            marginTop: 0,
            marginBottom: '24px', 
            paddingBottom: '12px', 
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            Observações
          </h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {auction.historicoNotas.map((nota, index) => (
              <div key={index} style={{ 
                borderLeft: '4px solid #d1d5db', 
                paddingLeft: '16px',
                pageBreakInside: 'avoid'
              }}>
                <p style={{ color: '#374151', lineHeight: '1.6', margin: 0 }}>{nota}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================== RODAPÉ ==================== */}
      <div style={{ 
        marginTop: '48px', 
        paddingTop: '24px', 
        borderTop: '1px solid #e5e7eb',
        textAlign: 'center',
        pageBreakInside: 'avoid'
      }}>
        <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0 0 16px 0' }}>
            Este documento foi gerado automaticamente pelo sistema de gestão de leilões.<br />
            Informações atualizadas em {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.
          </p>
      </div>
    </div>
  );
};
