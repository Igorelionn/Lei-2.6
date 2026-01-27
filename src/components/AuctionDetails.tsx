import { Auction, ArrematanteInfo } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { supabaseClient } from "@/lib/supabase-client";
import { logger } from "@/lib/logger";
import { useEffect, useState } from "react";
import { ImageWithFallback } from "@/components/ImageWithFallback"; // 🔒 SEGURANÇA: Componente seguro sem innerHTML
import { 
  Calendar, 
  MapPin, 
  DollarSign, 
  FileText, 
  Building,
  Globe,
  Users,
  CreditCard,
  User,
  FileImage,
  Eye,
  Info,
  Image,
  ChevronDown
} from "lucide-react";

interface AuctionDetailsProps {
  auction: Auction;
}

interface LoteDocument {
  id: string;
  nome: string;
  tipo: string;
  tamanho: number;
  data_upload: string;
  url: string | null;
  descricao?: string; // Descrição opcional do documento/imagem
}

function LoteImages({ loteId, loteNumero, auctionId }: { loteId: string; loteNumero: string; auctionId: string }) {
  const [images, setImages] = useState<LoteDocument[]>([]);
  const [loading, setLoading] = useState(true);

  // Log quando o componente é montado
  useEffect(() => {
    logger.debug('🏗️ LoteImages montado:', { loteId, loteNumero, auctionId });
    return () => {
      logger.debug('🔥 LoteImages desmontado:', { loteId, loteNumero, auctionId });
    };
  }, [loteId, loteNumero, auctionId]);

  useEffect(() => {
    // Reset do estado quando os parâmetros mudam
    setLoading(true);
    setImages([]);

    const fetchImages = async () => {
      logger.debug('🔍 Buscando imagens do lote:', {
        auctionId,
        loteId,
        loteNumero,
        searchPattern: `Lote ${loteNumero} - %`,
        timestamp: new Date().toISOString()
      });
      
      try {
        // Buscar com multiple padrões para maior compatibilidade
        const searchPatterns = [
          `Lote ${loteNumero} - ${loteId}`,
          `Lote ${loteNumero} - %`,
          `%${loteId}%`,
          `%Lote ${loteNumero}%`
        ];

        logger.debug('🔍 Tentando múltiplos padrões de busca:', searchPatterns);

        let allData: LoteDocument[] = [];

        // Tentar cada padrão sequencialmente
        for (const pattern of searchPatterns) {
          const { data, error } = await supabaseClient
            .from('documents')
            .select('id, nome, tipo, tamanho, data_upload, url, descricao')
            .eq('auction_id', auctionId)
            .eq('categoria', 'lote_fotos')
            .like('descricao', pattern)
            .order('data_upload', { ascending: false });

          if (!error && data && data.length > 0) {
            logger.debug(`✅ Padrão "${pattern}" encontrou ${data.length} imagens:`, 
              data.map(d => ({ nome: d.nome, descricao: d.descricao })));
            
            // Adicionar apenas se não existir ainda (evitar duplicatas)
            data.forEach(item => {
              if (!allData.find(existing => existing.id === item.id)) {
                allData.push({
                  ...item,
                  tamanho: item.tamanho || 0,
                  data_upload: item.data_upload || '',
                  url: item.url || '',
                  descricao: item.descricao || ''
                });
              }
            });
          } else if (error) {
            logger.warn(`⚠️ Erro com padrão "${pattern}":`, error);
          } else {
            logger.debug(`📭 Padrão "${pattern}" não retornou resultados`);
          }
        }

        // Se não encontrou nada com padrões específicos, buscar todas as imagens do leilão desta categoria
        if (allData.length === 0) {
          logger.debug('🔍 Buscando todas as imagens lote_fotos do leilão para debug...');
          const { data: allLoteImages, error: allError } = await supabaseClient
            .from('documents')
            .select('id, nome, tipo, tamanho, data_upload, url, descricao')
            .eq('auction_id', auctionId)
            .eq('categoria', 'lote_fotos')
            .order('data_upload', { ascending: false });

          if (!allError && allLoteImages) {
            logger.debug('📊 Todas as imagens lote_fotos encontradas:', 
              allLoteImages.map(img => ({ 
                nome: img.nome, 
                descricao: img.descricao, 
                matchesLote: img.descricao?.includes(`Lote ${loteNumero}`)
              })));
            
            // Filtrar manualmente por loteNumero na descrição
            allData = allLoteImages
              .map(img => ({
                ...img,
                tamanho: img.tamanho || 0,
                data_upload: img.data_upload || '',
                url: img.url || '',
                descricao: img.descricao || ''
              }))
              .filter(img => 
                img.descricao && (
                  img.descricao.includes(`Lote ${loteNumero}`) || 
                  img.descricao.includes(loteId)
                )
              );
          }
        }

        logger.debug('📋 Resultado final da busca:', { 
          totalFound: allData.length,
          images: allData.map(d => ({ nome: d.nome, descricao: d.descricao })),
          timestamp: new Date().toISOString()
        });

        setImages(allData);
      } catch (error) {
        logger.error('❌ Erro ao buscar imagens do lote:', error);
        setImages([]);
      } finally {
        setLoading(false);
      }
    };

    if (loteId && loteNumero && auctionId) {
      // Pequeno delay para evitar chamadas muito rápidas
      const timer = setTimeout(() => {
        fetchImages();
      }, 100);

      return () => clearTimeout(timer);
    } else {
      setLoading(false);
    }
  }, [loteId, loteNumero, auctionId]);

  if (loading) {
    return (
      <div className="mt-4 p-3 bg-gray-50 rounded border border-gray-200">
        <p className="text-sm text-gray-500">Carregando imagens...</p>
      </div>
    );
  }

  if (images.length === 0) {
    logger.debug('🚫 Nenhuma imagem encontrada, ocultando componente');
    return null; // Não mostrar nada se não há imagens
  }
  
  logger.debug('✅ Renderizando componente com imagens:', images);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  };

  return (
    <div className="mt-4 p-3 bg-gray-50 rounded border border-gray-200">
      <h5 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
        <Image className="h-4 w-4" />
        Imagens do Lote ({images.length})
      </h5>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {images.map((image) => (
          <div 
            key={image.id} 
            className="bg-white rounded-lg border border-gray-200 overflow-hidden cursor-pointer hover:shadow-lg hover:border-gray-300 transition-all"
            onClick={() => {
              if (image.url) {
                // Abrir imagem em nova aba para visualização
                const newWindow = window.open('', '_blank');
                if (newWindow) {
                  newWindow.document.write(`
                    <html>
                      <head>
                        <title>${image.nome}</title>
                        <style>
                          body { 
                            margin: 0; 
                            padding: 0; 
                            display: flex; 
                            justify-content: center; 
                            align-items: center; 
                            min-height: 100vh; 
                            background: #000;
                          }
                          img { 
                            max-width: 100%; 
                            max-height: 100vh; 
                            object-fit: contain;
                          }
                        </style>
                      </head>
                      <body>
                        <img src="${image.url}" alt="${image.nome}" />
                      </body>
                    </html>
                  `);
                  newWindow.document.close();
                }
              }
            }}
            title="Clique para visualizar"
          >
            {/* 🔒 SEGURANÇA: Usando componente seguro sem innerHTML */}
            <div className="h-32 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center overflow-hidden relative group">
              {image.url ? (
                <>
                <ImageWithFallback
                  src={image.url}
                  alt={image.nome}
                  className="w-full h-full object-cover"
                  containerClassName="w-full h-full"
                  showZoomOverlay={false}
                />
                  {/* Overlay de hover */}
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"></path>
                      </svg>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center">
                  <Image className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-xs text-gray-500 font-medium">Imagem Salva</p>
                  <p className="text-xs text-gray-400">{image.tipo.toUpperCase()}</p>
                </div>
              )}
            </div>
            
            {/* Informações da Imagem */}
            <div className="p-3">
              <p className="text-sm font-medium text-gray-900 truncate mb-2">{image.nome}</p>
              <div className="flex justify-between text-xs text-gray-500">
                <span>{formatFileSize(image.tamanho)}</span>
                <span>{formatDate(image.data_upload)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AuctionDetails({ auction }: AuctionDetailsProps) {
  // Estados para gerenciar arrematantes
  const [arrematanteSelecionadoIndex, setArrematanteSelecionadoIndex] = useState(0);
  const [isSelectOpen, setIsSelectOpen] = useState(false);
  
  // Calcular todos os arrematantes (compatibilidade com formato antigo e novo)
  const todosArrematantes = auction.arrematantes && auction.arrematantes.length > 0 
    ? auction.arrematantes 
    : (auction.arrematante ? [auction.arrematante] : []);
  
  const formatCurrency = (value: number | undefined) => {
    if (!value) return "R$ 0,00";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    // Adiciona o horário UTC para evitar problemas de fuso horário
    const date = new Date(dateString + 'T12:00:00.000Z');
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit", 
      year: "numeric",
      timeZone: "UTC"
    });
  };

  const _formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      agendado: "secondary",
      em_andamento: "default", 
      finalizado: "outline"
    } as const;
    
    const labels = {
      agendado: "Agendado",
      em_andamento: "Em Andamento",
      finalizado: "Finalizado"
    };

    return (
      <Badge variant={variants[status as keyof typeof variants] || "secondary"} 
             className={getStatusBadgeColor(status)}>
        {labels[status as keyof typeof labels] || status}
      </Badge>
    );
  };

  const getLocalIcon = (local: string) => {
    switch (local) {
      case "presencial": return <Building className="h-4 w-4 text-gray-600" />;
      case "online": return <Globe className="h-4 w-4 text-gray-600" />;
      case "hibrido": return <Users className="h-4 w-4 text-gray-600" />;
      default: return <MapPin className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusBadgeColor = (status: string) => {
    const colors = {
      agendado: "text-gray-700 bg-gray-100 hover:bg-gray-100",
      em_andamento: "text-green-700 bg-green-100 hover:bg-green-100",
      finalizado: "text-gray-800 bg-gray-200 hover:bg-gray-200"
    };

    return colors[status as keyof typeof colors] || "text-gray-700 bg-gray-100 hover:bg-gray-100";
  };

  const _formatMonthYear = (monthString: string) => {
    if (!monthString || monthString.length < 2) return "Não definido";
    
    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    
    const monthIndex = parseInt(monthString) - 1;
    const currentYear = new Date().getFullYear();
    
    return monthIndex >= 0 && monthIndex <= 11 
      ? `${monthNames[monthIndex]} ${currentYear}`
      : "Mês inválido";
  };

  return (
    <div className="space-y-10">
      {/* ==================== CABEÇALHO ==================== */}
      <div className="bg-gray-50 rounded-lg px-6 py-6 border border-gray-200">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">{auction.nome}</h1>
            {auction.identificacao && (
              <p className="text-sm text-gray-500 font-mono">#{auction.identificacao}</p>
            )}
          </div>
          {getStatusBadge(auction.status)}
        </div>
        
        <div className="flex items-center gap-6 text-sm text-gray-600 mt-4">
          <span>Cadastrado em {formatDate(auction.dataInicio)}</span>
          {auction.arquivado && (
            <span className="text-amber-600">• Arquivado</span>
        )}
      </div>
      </div>

      {/* ==================== INFORMAÇÕES BÁSICAS ==================== */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6 pb-3 border-b border-gray-200">
          Informações Básicas
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              {getLocalIcon(auction.local)}
              Local do Evento
            </h3>
            <p className="text-gray-900 capitalize mb-2">{auction.local}</p>
            {auction.endereco && (
              <p className="text-sm text-gray-600 leading-relaxed">{auction.endereco}</p>
            )}
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Investimento Total
            </h3>
            <p className="text-2xl font-light text-gray-900 mb-3 tracking-tight">
              {(() => {
                // Priorizar custosNumerico se disponível
                if (auction.custosNumerico && auction.custosNumerico > 0) {
                  return formatCurrency(auction.custosNumerico);
                }
                
                // Fallback para custos como string
                if (auction.custos && auction.custos.trim() !== "") {
                  if (typeof auction.custos === 'string') {
                    return auction.custos.startsWith('R$') ? auction.custos : `R$ ${auction.custos}`;
                  } else {
                    return formatCurrency(auction.custos);
                  }
                }
                
                return "R$ 0,00";
              })()}
            </p>
            
            {/* Detalhamento dos Custos */}
            {auction.detalheCustos && auction.detalheCustos.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h4 className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-3">
                  Especificação dos Gastos
                </h4>
                <div className="space-y-2">
                  {auction.detalheCustos.map((item, index) => (
                    <div key={item.id || index} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-md border border-gray-200">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center w-6 h-6 rounded bg-gray-200 text-xs font-semibold text-gray-700">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="text-sm text-gray-700">
                          {item.descricao || 'Item de custo'}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-gray-900">
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
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Patrocínios Recebidos
              </h3>
              <p className="text-2xl font-light text-gray-900 mb-3 tracking-tight">
                {formatCurrency(auction.patrociniosTotal || 0)}
              </p>
              
              {/* Lista de Patrocinadores */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h4 className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-3">
                  Patrocinadores
                </h4>
                <div className="space-y-2">
                  {auction.detalhePatrocinios.map((item, index) => (
                    <div key={item.id || index} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-md border border-gray-200">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center w-6 h-6 rounded bg-gray-200 text-xs font-semibold text-gray-700">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="text-sm text-gray-700">
                          {item.nomePatrocinador || 'Patrocinador'}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {formatCurrency(item.valorNumerico)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Resumo do Saldo Líquido */}
              {auction.custosNumerico && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Custos Totais:</span>
                      <span className="font-medium text-gray-900">
                        {formatCurrency(auction.custosNumerico)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Patrocínios:</span>
                      <span className="font-medium text-gray-700">
                        {formatCurrency(auction.patrociniosTotal || 0)}
                      </span>
                    </div>
                    <div className="border-t border-gray-300 pt-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-gray-900">
                          {(auction.patrociniosTotal || 0) > auction.custosNumerico ? 'Superávit:' : 'Saldo Líquido:'}
                        </span>
                        <span className="text-lg font-light text-gray-900 tracking-tight">
                          {(() => {
                            const saldo = auction.custosNumerico - (auction.patrociniosTotal || 0);
                            return formatCurrency(Math.abs(saldo));
                          })()}
                        </span>
                      </div>
                      {(auction.patrociniosTotal || 0) > auction.custosNumerico && (
                        <p className="text-xs text-gray-500 mt-1 text-right">
                          Superávit de patrocínios
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ==================== RESUMO DO PAGAMENTO ==================== */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6 pb-3 border-b border-gray-200 flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Resumo do Pagamento
        </h2>
        
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Configuração específica por mercadoria</p>
            {(() => {
              // Verificar se há pelo menos um arrematante com configuração de pagamento
              const temPagamentos = auction.arrematantes && auction.arrematantes.length > 0 && 
                auction.arrematantes.some(arr => arr.tipoPagamento);
              
              if (!temPagamentos) {
                return (
                  <div className="py-8 text-center bg-gray-50 rounded-lg border border-gray-200">
                    <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-700 mb-1">Nenhum pagamento configurado</p>
                    <p className="text-xs text-gray-500">Ainda não há arrematantes com configuração de pagamento para este leilão</p>
                  </div>
                );
              }
              
              // Mapear mercadorias com seus arrematantes
              const mercadoriasComPagamento: Array<{
                loteNumero: string;
                mercadoriaTitulo: string;
                arrematante: ArrematanteInfo;
              }> = [];
              
              auction.lotes?.forEach(lote => {
                lote.mercadorias?.forEach(mercadoria => {
                  const arrematante = auction.arrematantes?.find(
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
                  <div className="py-8 text-center bg-gray-50 rounded-lg border border-gray-200">
                    <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-700 mb-1">Nenhum pagamento configurado</p>
                    <p className="text-xs text-gray-500">Ainda não há arrematantes com configuração de pagamento para este leilão</p>
                  </div>
                );
              }
              
              return (
              <div className="space-y-3">
                  {mercadoriasComPagamento.map((item, index) => {
                    const arr = item.arrematante;
                  return (
                      <div key={arr.id || index} className="py-3 px-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-semibold text-gray-900">Lote {item.loteNumero}</p>
                            <span className="text-gray-400">•</span>
                            <p className="text-sm text-gray-600">{item.mercadoriaTitulo}</p>
                          </div>
                          <p className="text-xs text-gray-500 mb-2">Arrematante: {arr.nome}</p>
                          
                        <div className="text-sm text-gray-600">
                            {arr.tipoPagamento === 'a_vista' && (
                            <div>
                              <p className="font-medium">Pagamento à vista</p>
                                {arr.dataVencimentoVista && (
                                  <p className="text-xs text-gray-500 mt-1">Vencimento: {formatDate(arr.dataVencimentoVista)}</p>
                              )}
                            </div>
                          )}
                            {arr.tipoPagamento === 'parcelamento' && (
                            <div>
                                <p className="font-medium">Parcelamento em {arr.quantidadeParcelas || 12} parcelas</p>
                                {arr.mesInicioPagamento && arr.diaVencimentoMensal && (
                                    <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                                      <p>• Primeira parcela: {(() => {
                                        const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                                      const [ano, mes] = arr.mesInicioPagamento.split('-');
                                          const mesNumero = parseInt(mes);
                                          return `${meses[mesNumero - 1]}/${ano}`;
                                      })()}</p>
                                    <p>• Vencimento mensal: todo dia {arr.diaVencimentoMensal} de cada mês</p>
                                    <p>• Total de parcelas: {arr.quantidadeParcelas}</p>
                                    </div>
                                )}
                            </div>
                          )}
                            {arr.tipoPagamento === 'entrada_parcelamento' && (
                            <div>
                                <p className="font-medium">Entrada + Parcelamento em {arr.quantidadeParcelas || 12} parcelas</p>
                              <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                                  {arr.dataEntrada && (
                                    <p>• Data da entrada: {formatDate(arr.dataEntrada)}</p>
                                )}
                                  {arr.mesInicioPagamento && arr.diaVencimentoMensal && (
                                      <>
                                        <p>• Primeira parcela: {(() => {
                                          const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                                        const [ano, mes] = arr.mesInicioPagamento.split('-');
                                            const mesNumero = parseInt(mes);
                                            return `${meses[mesNumero - 1]}/${ano}`;
                                        })()}</p>
                                      <p>• Vencimento mensal: todo dia {arr.diaVencimentoMensal} de cada mês</p>
                                      <p>• Total de parcelas: {arr.quantidadeParcelas}</p>
                                      </>
                                  )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              );
            })()}
          </div>
        </div>
      </div>
      {/* ==================== CRONOGRAMA ==================== */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6 pb-3 border-b border-gray-200 flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Cronograma do Evento
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Data de Início</p>
            <p className="text-gray-900 font-medium">{formatDate(auction.dataInicio)}</p>
          </div>
          
          {auction.status === 'em_andamento' && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Em Andamento</p>
              <p className="text-gray-900 font-medium">{formatDate(auction.dataInicio)}</p>
              </div>
            )}
          
          {auction.dataEncerramento && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Encerramento</p>
              <p className="text-gray-900 font-medium">{formatDate(auction.dataEncerramento)}</p>
          </div>
          )}
        </div>
      </div>



      {/* ==================== ARREMATANTES ==================== */}
      {todosArrematantes.length > 0 && (() => {
        // Arrematante atualmente selecionado
        const arrematanteAtual = todosArrematantes[arrematanteSelecionadoIndex];
        
              return (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-6 pb-3 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <User className="h-5 w-5" />
                Informações do{todosArrematantes.length > 1 ? 's' : ''} Arrematante{todosArrematantes.length > 1 ? 's' : ''}
                {todosArrematantes.length > 1 && (
                  <span className="text-sm font-normal text-gray-500">
                    ({todosArrematantes.length} cadastrado{todosArrematantes.length > 1 ? 's' : ''})
                  </span>
                    )}
          </h2>

              {/* Seletor de Arrematante */}
              {todosArrematantes.length > 1 && (
                <>
                  <style>{`
                    .arrematante-selector {
                      position: relative;
                      display: inline-block;
                    }
                    
                    .arrematante-selector select {
                      appearance: none;
                      -webkit-appearance: none;
                      -moz-appearance: none;
                      padding: 0.5rem 2.5rem 0.5rem 1rem;
                      border: 1px solid #e5e7eb;
                      border-radius: 0.5rem;
                      font-size: 0.875rem;
                      color: #374151;
                      background-color: white;
                      cursor: pointer;
                      transition: all 0.2s;
                      outline: none;
                      min-width: 280px;
                    }
                    
                    .arrematante-selector select:hover {
                      background-color: #f9fafb;
                      border-color: #d1d5db;
                    }
                    
                    .arrematante-selector select:focus {
                      border-color: #9ca3af;
                      box-shadow: none;
                      outline: none;
                    }
                    
                    .arrematante-selector select option {
                      background-color: white !important;
                      color: #374151 !important;
                      padding: 8px !important;
                    }
                    
                    .arrematante-selector select option:hover {
                      background-color: #f3f4f6 !important;
                      color: #111827 !important;
                    }
                    
                    .arrematante-selector select option:checked {
                      background-color: #e5e7eb !important;
                      color: #111827 !important;
                      font-weight: 500;
                    }
                    
                    .arrematante-selector-icon {
                      position: absolute;
                      right: 0.75rem;
                      top: 50%;
                      pointer-events: none;
                      color: #6b7280;
                    }
                    
                    .arrematante-selector select::-webkit-scrollbar {
                      width: 8px;
                    }
                    
                    .arrematante-selector select::-webkit-scrollbar-track {
                      background: #f3f4f6;
                    }
                    
                    .arrematante-selector select::-webkit-scrollbar-thumb {
                      background: #d1d5db;
                      border-radius: 4px;
                    }
                    
                    .arrematante-selector select::-webkit-scrollbar-thumb:hover {
                      background: #9ca3af;
                    }
                  `}</style>
        
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-gray-600">Visualizar:</label>
                    <div className="arrematante-selector">
                      <select
                        value={arrematanteSelecionadoIndex}
                        onChange={(e) => {
                          setArrematanteSelecionadoIndex(Number(e.target.value));
                          setIsSelectOpen(false);
                        }}
                        onClick={(e) => {
                          const _target = e.target as HTMLSelectElement;
                          // Toggle apenas se clicar no select fechado ou clicar na mesma opção
                          setIsSelectOpen(!isSelectOpen);
                        }}
                        onBlur={() => setIsSelectOpen(false)}
                      >
                        {todosArrematantes.map((arr, idx) => {
                          const lote = (auction.lotes || []).find(l => l.id === arr.loteId);
                          const mercadoria = lote?.mercadorias?.find(m => m.id === arr.mercadoriaId);
                          const mercadoriaNome = mercadoria?.titulo || mercadoria?.tipo || 'Mercadoria';
                          
                          return (
                            <option 
                              key={arr.id || idx} 
                              value={idx}
                            >
                              {mercadoriaNome} - {arr.nome}
                            </option>
                          );
                        })}
                      </select>
                      <ChevronDown 
                        className="arrematante-selector-icon" 
                        size={16}
                        style={{
                          transform: `translateY(-50%) rotate(${isSelectOpen ? '180deg' : '0deg'})`,
                          transition: 'transform 0.2s ease'
                        }}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Nome Completo</p>
                <p className="text-gray-900 font-medium">{arrematanteAtual.nome}</p>
            </div>
            
              {arrematanteAtual.documento && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Documento</p>
                  <p className="text-gray-900 font-mono">{arrematanteAtual.documento}</p>
              </div>
        )}
      </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Valor Total</p>
              <p className="text-xl font-semibold text-gray-900">
                  {formatCurrency(
                    typeof arrematanteAtual.valorPagar === 'string'
                      ? parseFloat(arrematanteAtual.valorPagar.replace(/[^\d,.-]/g, '').replace(',', '.'))
                      : arrematanteAtual.valorPagar
                  )}
              </p>
      </div>

              <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Situação do Pagamento</p>
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${
                    arrematanteAtual.pago ? 'bg-gray-600' : 'bg-amber-500'
                }`}></div>
                <span className="text-gray-900 font-medium">
                    {arrematanteAtual.pago ? 'Quitado' : 'Pendente'}
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                  {arrematanteAtual.parcelasPagas || 0} de {arrematanteAtual.quantidadeParcelas} parcelas pagas
              </p>
              </div>
            </div>
            
            {/* Mercadoria e Lote Arrematado */}
            {arrematanteAtual.mercadoriaId && (
            <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="text-sm font-medium text-gray-700 mb-3">Mercadoria Arrematada</p>
                {(() => {
                  const lote = (auction.lotes || []).find(l => l.id === arrematanteAtual.loteId);
                  const mercadoria = lote?.mercadorias?.find(m => m.id === arrematanteAtual.mercadoriaId);
                  
                  return (
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      {mercadoria ? (
                        <>
                          <p className="text-gray-900 font-semibold text-base mb-2">
                            {mercadoria.titulo || mercadoria.tipo || 'Mercadoria'}
                          </p>
                          {mercadoria.descricao && (
                            <p className="text-gray-600 text-sm mb-3">
                              {mercadoria.descricao}
                            </p>
                          )}
                          {mercadoria.quantidade && (
                            <p className="text-gray-500 text-sm mb-3">
                              Quantidade: <span className="font-medium text-gray-700">{mercadoria.quantidade}</span>
                            </p>
                          )}
                          {lote && (
                            <div className="pt-3 mt-3 border-t border-gray-200">
                              <p className="text-xs text-gray-500 mb-1">Pertence ao:</p>
                              <p className="text-gray-800 font-medium text-sm">
                                Lote {lote.numero} - {lote.descricao}
              </p>
            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-gray-500 text-sm">Mercadoria não encontrada</p>
          )}
                    </div>
                  );
                })()}
        </div>
      )}
          </div>
        );
      })()}

      {/* ==================== LOTES ==================== */}
      {auction.lotes && auction.lotes.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6 pb-3 border-b border-gray-200">
            Lotes do Leilão ({auction.lotes.length})
          </h2>
          
          <div className="space-y-4">
            {auction.lotes.map((lote, index) => {
              return (
                <div key={lote.id || index} className="p-4 border border-gray-200 rounded-lg">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">Lote {lote.numero}</h4>
                      <p className="text-gray-700">{lote.descricao}</p>
                    </div>
                  </div>

                  {/* Mercadorias */}
                  {lote.mercadorias && lote.mercadorias.length > 0 && (
                    <div className="mb-4">
                      <h5 className="text-sm font-medium text-gray-700 mb-2">Mercadorias:</h5>
                      <div className="space-y-1">
                        {lote.mercadorias.map((mercadoria, mercIndex) => (
                          <div key={mercadoria.id || mercIndex} className="text-sm text-gray-600">
                            • {mercadoria.titulo || mercadoria.tipo || 'Mercadoria'} - {mercadoria.descricao}
                            {mercadoria.quantidade && (
                              <span className="text-gray-500"> (Qtd: {mercadoria.quantidade})</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Configurações de Pagamento do Lote */}
                  {lote.tipoPagamento && (
                    <div className="border-t border-gray-100 pt-3 mt-3">
                      <h5 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                        <span className="inline-block w-2 h-2 bg-gray-500 rounded-full"></span>
                        Pagamento Específico deste Lote
                      </h5>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                        {/* Tipo de Pagamento */}
                        <div className="bg-gray-50 p-2 rounded border border-gray-300">
                          <span className="text-gray-600 font-medium block">Tipo:</span>
                          <span className="text-gray-800">
                            {lote.tipoPagamento === 'a_vista' ? 'À vista' :
                             lote.tipoPagamento === 'parcelamento' ? 'Parcelamento' :
                             'Entrada + Parcelamento'}
                          </span>
                        </div>

                        {/* Data à Vista */}
                        {lote.tipoPagamento === 'a_vista' && lote.dataVencimentoVista && (
                          <div className="bg-gray-100 p-2 rounded border border-gray-300">
                            <span className="text-gray-600 font-medium block">Data de Pagamento:</span>
                            <span className="text-gray-800">
                              {new Date(lote.dataVencimentoVista + 'T00:00:00').toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                        )}

                        {/* Data da Entrada */}
                        {lote.tipoPagamento === 'entrada_parcelamento' && lote.dataEntrada && (
                          <div className="bg-gray-100 p-2 rounded border border-gray-300">
                            <span className="text-gray-600 font-medium block">Data da Entrada:</span>
                            <span className="text-gray-800">
                              {new Date(lote.dataEntrada + 'T00:00:00').toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                        )}

                        {/* Configurações de Parcelamento */}
                        {(lote.tipoPagamento === 'parcelamento' || lote.tipoPagamento === 'entrada_parcelamento') && (
                          <>
                            {lote.mesInicioPagamento && (
                              <div className="bg-gray-100 p-2 rounded border border-gray-300">
                                <span className="text-gray-600 font-medium block">Mês de Início:</span>
                                <span className="text-gray-800">
                                  {(() => {
                                    const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                                                  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                                    return meses[parseInt(lote.mesInicioPagamento) - 1] || 'N/A';
                                  })()}
                                </span>
                              </div>
                            )}
                            
                            {lote.diaVencimentoPadrao && (
                              <div className="bg-gray-100 p-2 rounded border border-gray-300">
                                <span className="text-gray-600 font-medium block">Dia do Vencimento:</span>
                                <span className="text-gray-800">Dia {lote.diaVencimentoPadrao}</span>
                              </div>
                            )}
                            
                            {lote.parcelasPadrao && (
                              <div className="bg-gray-100 p-2 rounded border border-gray-300">
                                <span className="text-gray-600 font-medium block">Parcelas:</span>
                                <span className="text-gray-800">
                                  {lote.parcelasPadrao}x{lote.tipoPagamento === 'entrada_parcelamento' ? ' (após entrada)' : ''}
                                </span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Imagens do Lote */}
                  <LoteImages 
                    key={`${lote.id}-${lote.numero}-${auction.id}`} 
                    loteId={lote.id} 
                    loteNumero={lote.numero} 
                    auctionId={auction.id} 
                  />
                </div>
              );
            })}
                </div>
              </div>
            )}
            
      {/* ==================== ANEXOS ==================== */}
      {((auction.documentos && auction.documentos.length > 0) || 
        (auction.fotosMercadoria && auction.fotosMercadoria.length > 0)) && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6 pb-3 border-b border-gray-200">
            Anexos e Documentos
          </h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {auction.documentos && auction.documentos.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-4 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Documentos ({auction.documentos.length})
                </h3>
                <div className="space-y-3">
                  {auction.documentos.map((doc, index) => (
                    <div key={doc.id || index} 
                         className="flex items-center gap-3 p-3 bg-gray-50 rounded cursor-pointer hover:bg-gray-100 transition-colors"
                         onClick={() => {
                           if (doc.url) {
                             // Se é PDF ou documento com base64, abrir em nova aba
                             if (doc.url.startsWith('data:')) {
                               const newWindow = window.open();
                               if (newWindow) {
                                 newWindow.document.write(`
                                   <html>
                                     <head><title>${doc.nome}</title></head>
                                     <body style="margin:0; display:flex; justify-content:center; align-items:center; min-height:100vh; background:#f0f0f0;">
                                       ${doc.url.includes('pdf') ? 
                                         `<embed src="${doc.url}" width="100%" height="100%" type="application/pdf" />` :
                                         `<img src="${doc.url}" style="max-width:100%; max-height:100%; object-fit:contain;" alt="${doc.nome}" />`
                                       }
                                     </body>
                                   </html>
                                 `);
                               }
                             } else {
                               // Para outros tipos, tentar abrir ou baixar
                               window.open(doc.url, '_blank');
                             }
                           } else {
                             // Se não tem URL, mostrar alerta
                             alert('Este documento não está disponível para visualização.');
                           }
                         }}
                         title="Clique para abrir o documento"
                    >
                      <FileText className="h-4 w-4 text-gray-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{doc.nome}</p>
                        <p className="text-xs text-gray-500">
                          {doc.tamanho ? `${(doc.tamanho / 1024).toFixed(1)} KB` : 'N/A'}{(() => {
                            if (!doc.dataUpload) return '';
                            try {
                              const date = new Date(doc.dataUpload);
                              if (isNaN(date.getTime())) return '';
                              return ` • ${date.toLocaleDateString('pt-BR')}`;
                            } catch {
                              return '';
                            }
                          })()}
                        </p>
                      </div>
                      {doc.url && (
                        <div className="flex items-center">
                          <Eye className="h-4 w-4 text-gray-500" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {auction.fotosMercadoria && auction.fotosMercadoria.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-4 flex items-center gap-2">
                  <FileImage className="h-4 w-4" />
                  Fotos da Mercadoria ({auction.fotosMercadoria.length})
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  {auction.fotosMercadoria.map((foto, index) => (
                    <div key={foto.id || index} 
                         className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden border border-gray-200 cursor-pointer hover:border-blue-300 transition-colors group"
                         onClick={() => {
                           if (foto.url) {
                             // Abrir imagem em nova aba para visualização ampliada
                             const newWindow = window.open();
                             if (newWindow) {
                               newWindow.document.write(`
                                 <html>
                                   <head>
                                     <title>${foto.nome}</title>
                                     <style>
                                       body { margin:0; background:#000; display:flex; justify-content:center; align-items:center; min-height:100vh; }
                                       img { max-width:100%; max-height:100vh; object-fit:contain; }
                                     </style>
                                   </head>
                                   <body>
                                     <img src="${foto.url}" alt="${foto.nome}" />
                                   </body>
                                 </html>
                               `);
                             }
                           }
                         }}
                         title="Clique para ampliar a imagem"
                    >
                      {foto.url ? (
                        <>
                          <img 
                            src={foto.url} 
                            alt={foto.nome}
                            className="w-full h-full object-cover"
                          />
                          {/* Overlay de hover */}
                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all flex items-center justify-center">
                            <Eye className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Eye className="h-6 w-6 text-gray-400" />
                        </div>
                      )}
                    </div>
                  ))}
              </div>
              </div>
            )}
            </div>
          </div>
      )}

      {/* ==================== OBSERVAÇÕES ==================== */}
      {auction.historicoNotas && auction.historicoNotas.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6 pb-3 border-b border-gray-200 flex items-center gap-2">
            <Info className="h-5 w-5" />
              Histórico de Observações ({auction.historicoNotas.length})
          </h2>
          
          <div className="space-y-4 max-h-80 overflow-y-auto">
              {auction.historicoNotas.map((note, index) => (
              <div key={index} className="bg-gray-50 rounded-lg p-4 border-l-4 border-gray-300">
                <p className="text-gray-700 leading-relaxed mb-2">{note}</p>
                <p className="text-xs text-gray-500 font-medium">
                  Observação #{String(index + 1).padStart(2, '0')}
                </p>
                </div>
              ))}
            </div>
        </div>
      )}
    </div>
  );
}
