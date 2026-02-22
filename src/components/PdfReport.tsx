import React, { useEffect, useState } from 'react';
import { Auction } from '@/lib/types';
import { supabaseClient } from '@/lib/supabase-client';
import { calcularEstruturaParcelas } from '@/lib/parcelamento-calculator';
import { logger } from '@/lib/logger';

interface PdfReportProps {
  auction: Auction;
}

interface LoteImage {
  id: string;
  nome: string;
  tipo: string;
  url: string | null;
}

// ── Estilos reutilizáveis ──
const styles = {
  page: {
    background: 'white',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    padding: '48px 40px',
    fontSize: '13px',
    lineHeight: '1.6',
    color: '#1a1a1a',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#999',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    margin: '0 0 16px 0',
  } as React.CSSProperties,
  separator: {
    border: 'none',
    borderTop: '1px solid #eee',
    margin: '32px 0',
  } as React.CSSProperties,
  label: {
    fontSize: '11px',
    color: '#999',
    margin: '0 0 4px 0',
    fontWeight: 500,
  } as React.CSSProperties,
  value: {
    fontSize: '14px',
    color: '#1a1a1a',
    margin: 0,
    fontWeight: 500,
  } as React.CSSProperties,
  valueLarge: {
    fontSize: '22px',
    fontWeight: 300,
    color: '#1a1a1a',
    margin: 0,
    letterSpacing: '-0.02em',
  } as React.CSSProperties,
  grid: {
    display: 'flex',
    gap: '32px',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  gridItem: {
    flex: '1 1 180px',
  } as React.CSSProperties,
  card: {
    pageBreakInside: 'avoid' as const,
  } as React.CSSProperties,
};

export const PdfReport: React.FC<PdfReportProps> = ({ auction }) => {
  const formatCurrency = (value: number | string | undefined) => {
    if (!value && value !== 0) return "R$ 0,00";
    if (typeof value === 'number') {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
    }
    if (typeof value === 'string') {
      const cleaned = value.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
      const num = parseFloat(cleaned);
      if (!isNaN(num)) {
        return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
      }
    }
    return "R$ 0,00";
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T12:00:00.000Z');
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = { agendado: "Agendado", em_andamento: "Em Andamento", finalizado: "Finalizado" };
    return labels[status] || status;
  };

  const getLocalLabel = (local: string) => {
    const labels: Record<string, string> = { presencial: "Presencial", online: "Online", hibrido: "Híbrido" };
    return labels[local] || local;
  };

  const todosArrematantes = auction.arrematantes?.length
    ? auction.arrematantes
    : (auction.arrematante ? [auction.arrematante] : []);

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
            .limit(4);
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

  // Cálculo do resumo financeiro
  const calcFinanceiro = () => {
    const totalArrecadado = todosArrematantes.reduce((sum, arr) => {
      const valor = typeof arr.valorPagar === 'string'
        ? parseFloat(arr.valorPagar.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0
        : arr.valorPagar || 0;
      return sum + valor;
    }, 0);

    const totalPago = todosArrematantes.reduce((sum, arr) => {
      if (arr.pago) {
        const valor = typeof arr.valorPagar === 'string'
          ? parseFloat(arr.valorPagar.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0
          : arr.valorPagar || 0;
        return sum + valor;
      }
      const parcelasPagas = arr.parcelasPagas || 0;
      if (parcelasPagas > 0) {
        const valorBase = typeof arr.valorPagar === 'string'
          ? parseFloat(arr.valorPagar.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0
          : arr.valorPagar || 0;
        const loteArrematado = arr.loteId ? auction.lotes?.find(lote => lote.id === arr.loteId) : null;
        const tipoPagamento = loteArrematado?.tipoPagamento || auction.tipoPagamento;

        if (tipoPagamento === 'entrada_parcelamento') {
          const valorEntrada = arr.valorEntrada
            ? (typeof arr.valorEntrada === 'string' ? parseFloat(arr.valorEntrada.replace(/[^\d,.-]/g, '').replace(',', '.')) : arr.valorEntrada)
            : valorBase * 0.3;
          if (parcelasPagas === 1) return sum + valorEntrada;
          const estrutura = calcularEstruturaParcelas(valorBase, arr.parcelasTriplas || 0, arr.parcelasDuplas || 0, arr.parcelasSimples || 0);
          let total = valorEntrada;
          for (let i = 0; i < parcelasPagas - 1 && i < estrutura.length; i++) total += estrutura[i]?.valor || 0;
          return sum + total;
        } else if (tipoPagamento === 'parcelamento') {
          const estrutura = calcularEstruturaParcelas(valorBase, arr.parcelasTriplas || 0, arr.parcelasDuplas || 0, arr.parcelasSimples || 0);
          let total = 0;
          for (let i = 0; i < parcelasPagas && i < estrutura.length; i++) total += estrutura[i]?.valor || 0;
          return sum + total;
        }
      }
      return sum;
    }, 0);

    return { totalArrecadado, totalPago, totalPendente: totalArrecadado - totalPago };
  };

  const getTipoPagamentoLabel = (tipo: string) => {
    const labels: Record<string, string> = {
      a_vista: 'À vista',
      parcelamento: 'Parcelamento',
      entrada_parcelamento: 'Entrada + Parcelamento',
    };
    return labels[tipo] || tipo;
  };

  const getMesLabel = (mesStr: string) => {
    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    if (mesStr.includes('-')) {
      const [ano, mes] = mesStr.split('-');
      return `${meses[parseInt(mes) - 1]}/${ano}`;
    }
    return meses[parseInt(mesStr) - 1] || mesStr;
  };

  return (
    <div id="pdf-content" style={styles.page}>

      {/* ── CABEÇALHO ── */}
      <div style={{ ...styles.card, marginBottom: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '26px', fontWeight: 600, color: '#1a1a1a', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>
              {auction.nome}
            </h1>
            {auction.identificacao && (
              <p style={{ fontSize: '13px', color: '#999', fontFamily: 'monospace', margin: 0 }}>
                #{auction.identificacao}
              </p>
            )}
          </div>
          <span style={{
            padding: '4px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 500,
            background: auction.status === 'em_andamento' ? '#f0fdf4' : auction.status === 'finalizado' ? '#f3f4f6' : '#fafafa',
            color: auction.status === 'em_andamento' ? '#16a34a' : '#666',
            border: `1px solid ${auction.status === 'em_andamento' ? '#bbf7d0' : '#e5e7eb'}`,
          }}>
            {getStatusLabel(auction.status)}
          </span>
        </div>
        <p style={{ fontSize: '12px', color: '#999', margin: '12px 0 0 0' }}>
          Relatório gerado em {new Date().toLocaleDateString('pt-BR')} &middot; {getLocalLabel(auction.local)}
          {auction.endereco && ` &middot; ${auction.endereco}`}
        </p>
      </div>

      <hr style={styles.separator} />

      {/* ── FINANCEIRO ── */}
      <div style={styles.card}>
        <p style={styles.sectionTitle}>Financeiro</p>
        <div style={styles.grid}>
          <div style={styles.gridItem}>
            <p style={styles.label}>Investimento Total</p>
            <p style={styles.valueLarge}>
              {(() => {
                if (auction.custosNumerico && auction.custosNumerico > 0) return formatCurrency(auction.custosNumerico);
                if (auction.custos && auction.custos.toString().trim() !== "") return formatCurrency(auction.custos);
                return "R$ 0,00";
              })()}
            </p>
          </div>
          {auction.detalhePatrocinios && auction.detalhePatrocinios.length > 0 && (
            <div style={styles.gridItem}>
              <p style={styles.label}>Patrocínios</p>
              <p style={styles.valueLarge}>{formatCurrency(auction.patrociniosTotal || 0)}</p>
            </div>
          )}
          {auction.custosNumerico && auction.detalhePatrocinios && auction.detalhePatrocinios.length > 0 && (
            <div style={styles.gridItem}>
              <p style={styles.label}>Saldo</p>
              <p style={styles.valueLarge}>
                {formatCurrency((auction.patrociniosTotal || 0) - auction.custosNumerico)}
              </p>
            </div>
          )}
        </div>

        {/* Detalhamento dos custos */}
        {auction.detalheCustos && auction.detalheCustos.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <p style={{ ...styles.label, marginBottom: '8px' }}>Especificação dos Gastos</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <tbody>
                {auction.detalheCustos.map((item, i) => (
                  <tr key={item.id || i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={{ padding: '6px 0', color: '#666' }}>{item.descricao || 'Item de custo'}</td>
                    <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 500, color: '#1a1a1a' }}>{formatCurrency(item.valorNumerico)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Detalhamento dos patrocínios */}
        {auction.detalhePatrocinios && auction.detalhePatrocinios.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <p style={{ ...styles.label, marginBottom: '8px' }}>Patrocinadores</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <tbody>
                {auction.detalhePatrocinios.map((item, i) => (
                  <tr key={item.id || i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={{ padding: '6px 0', color: '#666' }}>{item.nomePatrocinador || 'Patrocinador'}</td>
                    <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 500, color: '#1a1a1a' }}>{formatCurrency(item.valorNumerico)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── RESUMO DO PAGAMENTO ── */}
      {todosArrematantes.length > 0 && (() => {
        const { totalArrecadado, totalPago, totalPendente } = calcFinanceiro();
        return (
          <>
            <hr style={styles.separator} />
            <div style={styles.card}>
              <p style={styles.sectionTitle}>Pagamentos</p>
              <div style={styles.grid}>
                <div style={styles.gridItem}>
                  <p style={styles.label}>Arrecadado</p>
                  <p style={styles.valueLarge}>{formatCurrency(totalArrecadado)}</p>
                </div>
                <div style={styles.gridItem}>
                  <p style={styles.label}>Recebido</p>
                  <p style={styles.valueLarge}>{formatCurrency(totalPago)}</p>
                </div>
                <div style={styles.gridItem}>
                  <p style={styles.label}>Pendente</p>
                  <p style={{ ...styles.valueLarge, color: totalPendente > 0 ? '#b45309' : '#1a1a1a' }}>
                    {formatCurrency(totalPendente)}
                  </p>
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {/* ── CRONOGRAMA ── */}
      <hr style={styles.separator} />
      <div style={styles.card}>
        <p style={styles.sectionTitle}>Cronograma</p>
        <div style={styles.grid}>
          <div style={styles.gridItem}>
            <p style={styles.label}>Início</p>
            <p style={styles.value}>{formatDate(auction.dataInicio)}</p>
          </div>
          {auction.dataEncerramento && (
            <div style={styles.gridItem}>
              <p style={styles.label}>Encerramento</p>
              <p style={styles.value}>{formatDate(auction.dataEncerramento)}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── ARREMATANTES ── */}
      {todosArrematantes.length > 0 && (
        <>
          <hr style={styles.separator} />
          <div style={styles.card}>
            <p style={styles.sectionTitle}>Arrematantes ({todosArrematantes.length})</p>

            {todosArrematantes.map((arr, i) => {
              const lote = (auction.lotes || []).find(l => l.id === arr.loteId);
              const mercadoria = lote?.mercadorias?.find(m => m.id === arr.mercadoriaId);
              const valorNum = typeof arr.valorPagar === 'string'
                ? parseFloat(arr.valorPagar.replace(/[^\d,.-]/g, '').replace(',', '.'))
                : arr.valorPagar;

              return (
                <div key={arr.id || i} style={{
                  ...styles.card,
                  padding: '16px 0',
                  borderBottom: i < todosArrematantes.length - 1 ? '1px solid #f0f0f0' : 'none',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <p style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a', margin: '0 0 2px 0' }}>{arr.nome}</p>
                      {arr.documento && (
                        <p style={{ fontSize: '12px', color: '#999', fontFamily: 'monospace', margin: 0 }}>{arr.documento}</p>
                      )}
                      {mercadoria && (
                        <p style={{ fontSize: '12px', color: '#999', margin: '2px 0 0 0' }}>
                          Lote {lote?.numero} &middot; {mercadoria.titulo || mercadoria.tipo}
                        </p>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '16px', fontWeight: 500, color: '#1a1a1a', margin: '0 0 2px 0' }}>
                        {formatCurrency(valorNum)}
                      </p>
                      <p style={{
                        fontSize: '11px',
                        fontWeight: 500,
                        color: arr.pago ? '#16a34a' : '#b45309',
                        margin: 0,
                      }}>
                        {arr.pago ? 'Quitado' : 'Pendente'}
                      </p>
                    </div>
                  </div>

                  {/* Contato */}
                  {(arr.email || arr.telefone) && (
                    <div style={{ display: 'flex', gap: '24px', fontSize: '12px', color: '#999', marginTop: '4px' }}>
                      {arr.email && <span>{arr.email}</span>}
                      {arr.telefone && <span>{arr.telefone}</span>}
                    </div>
                  )}
                  {arr.endereco && (
                    <p style={{ fontSize: '12px', color: '#999', margin: '2px 0 0 0' }}>{arr.endereco}</p>
                  )}

                  {/* Parcelamento */}
                  {arr.tipoPagamento && (
                    <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
                      <span style={{ fontWeight: 500 }}>{getTipoPagamentoLabel(arr.tipoPagamento)}</span>
                      {arr.quantidadeParcelas && arr.quantidadeParcelas > 1 && (
                        <span> &middot; {arr.quantidadeParcelas} parcelas</span>
                      )}
                      {arr.mesInicioPagamento && (
                        <span> &middot; Início: {getMesLabel(arr.mesInicioPagamento)}</span>
                      )}
                      {arr.diaVencimentoMensal && (
                        <span> &middot; Venc. dia {arr.diaVencimentoMensal}</span>
                      )}
                      {arr.dataVencimentoVista && (
                        <span> &middot; Venc. {formatDate(arr.dataVencimentoVista)}</span>
                      )}
                      {arr.dataEntrada && (
                        <span> &middot; Entrada em {formatDate(arr.dataEntrada)}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── LOTES ── */}
      {auction.lotes && auction.lotes.length > 0 && (
        <>
          <hr style={styles.separator} />
          <div style={styles.card}>
            <p style={styles.sectionTitle}>Lotes ({auction.lotes.length})</p>

            {auction.lotes.map((lote, i) => (
              <div key={lote.id || i} style={{
                ...styles.card,
                padding: '16px 0',
                borderBottom: i < auction.lotes!.length - 1 ? '1px solid #f0f0f0' : 'none',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: '#1a1a1a', margin: 0 }}>
                    Lote {lote.numero}
                  </p>
                  {lote.tipoPagamento && (
                    <span style={{ fontSize: '11px', color: '#999' }}>
                      {getTipoPagamentoLabel(lote.tipoPagamento)}
                    </span>
                  )}
                </div>
                {lote.descricao && (
                  <p style={{ fontSize: '13px', color: '#666', margin: '0 0 8px 0' }}>{lote.descricao}</p>
                )}

                {/* Mercadorias */}
                {lote.mercadorias && lote.mercadorias.length > 0 && (
                  <div style={{ fontSize: '12px', color: '#999' }}>
                    {lote.mercadorias.map((m, mi) => (
                      <p key={m.id || mi} style={{ margin: '2px 0' }}>
                        {m.titulo || m.tipo || 'Mercadoria'}
                        {m.descricao && ` — ${m.descricao}`}
                        {m.quantidade && <span style={{ color: '#bbb' }}> (Qtd: {m.quantidade})</span>}
                      </p>
                    ))}
                  </div>
                )}

                {/* Imagens */}
                {lotesComImagens[lote.id] && lotesComImagens[lote.id].length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginTop: '12px' }}>
                    {lotesComImagens[lote.id].slice(0, 4).map((img, ii) => (
                      <div key={img.id || ii} style={{ borderRadius: '4px', overflow: 'hidden', border: '1px solid #eee' }}>
                        {img.url ? (
                          <img
                            src={img.url}
                            alt={img.nome}
                            style={{ width: '100%', height: '120px', objectFit: 'cover', display: 'block' }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div style={{ width: '100%', height: '120px', background: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: '11px', color: '#ccc' }}>Sem imagem</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Config de pagamento do lote */}
                {lote.tipoPagamento && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                    {lote.tipoPagamento === 'a_vista' && lote.dataVencimentoVista && (
                      <span>Vencimento: {formatDate(lote.dataVencimentoVista)}</span>
                    )}
                    {lote.tipoPagamento === 'entrada_parcelamento' && lote.dataEntrada && (
                      <span>Entrada: {formatDate(lote.dataEntrada)}</span>
                    )}
                    {(lote.tipoPagamento === 'parcelamento' || lote.tipoPagamento === 'entrada_parcelamento') && (
                      <>
                        {lote.parcelasPadrao && <span> &middot; {lote.parcelasPadrao} parcelas</span>}
                        {lote.mesInicioPagamento && <span> &middot; Início: {getMesLabel(lote.mesInicioPagamento)}</span>}
                        {lote.diaVencimentoPadrao && <span> &middot; Venc. dia {lote.diaVencimentoPadrao}</span>}
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── ANEXOS ── */}
      {((auction.documentos && auction.documentos.length > 0) ||
        (auction.fotosMercadoria && auction.fotosMercadoria.length > 0)) && (
        <>
          <hr style={styles.separator} />
          <div style={styles.card}>
            <p style={styles.sectionTitle}>Anexos</p>
            <div style={styles.grid}>
              <div style={styles.gridItem}>
                <p style={styles.label}>Documentos</p>
                <p style={styles.value}>{auction.documentos?.length || 0}</p>
              </div>
              <div style={styles.gridItem}>
                <p style={styles.label}>Fotos</p>
                <p style={styles.value}>{auction.fotosMercadoria?.length || 0}</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── OBSERVAÇÕES ── */}
      {auction.historicoNotas && auction.historicoNotas.length > 0 && (
        <>
          <hr style={styles.separator} />
          <div style={styles.card}>
            <p style={styles.sectionTitle}>Observações</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {auction.historicoNotas.map((nota, i) => (
                <p key={i} style={{ fontSize: '13px', color: '#666', margin: 0, paddingLeft: '12px', borderLeft: '2px solid #e5e7eb', lineHeight: '1.6' }}>
                  {nota}
                </p>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── RODAPÉ ── */}
      <hr style={{ ...styles.separator, marginTop: '40px' }} />
      <p style={{ fontSize: '11px', color: '#bbb', margin: 0, textAlign: 'center' }}>
        Documento gerado automaticamente em {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
      </p>
    </div>
  );
};
