import { useState, useEffect, useRef, useCallback } from "react";
import { Auction, AuctionStatus, DocumentoInfo, MercadoriaInfo, LoteInfo, ItemCustoInfo, ItemPatrocinioInfo } from "@/lib/types";
import { parseCurrencyToNumber, openDocumentSafely } from "@/lib/utils";
import { useActivityLogger } from "@/hooks/use-activity-logger";
import { logger } from "@/lib/logger";
import { calcularEstruturaParcelas } from "@/lib/parcelamento-calculator";
import { calcularValorTotal } from "@/lib/parcelamento-calculator";
import { ParcelamentoPreview } from "@/components/ParcelamentoPreview";
import { ProprietarioWizard } from "@/components/ProprietarioWizard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { StringDatePicker } from "@/components/ui/date-picker";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Calendar, 
  MapPin, 
  DollarSign, 
  FileText, 
  Clock,
  Building,
  Globe,
  Users,
  Upload,
  File,
  X,
  Paperclip,
  Trash,
  Eye,
  Image,
  FileSpreadsheet,
  Plus,
  Pencil,
  CreditCard,
  List,
  Calculator
} from "lucide-react";

export interface AuctionFormValues extends Omit<Auction, "id"> {
  id?: string; // ID opcional: presente ao editar, ausente ao criar
}

export function AuctionForm({
  initial,
  onSubmit,
  onCancel,
  onChange,
}: {
  initial: AuctionFormValues;
  onSubmit: (values: AuctionFormValues) => Promise<void> | void;
  onCancel?: () => void;
  onChange?: (values: AuctionFormValues, changedField?: keyof AuctionFormValues) => void;
}) {
  const [values, setValues] = useState<AuctionFormValues>(initial);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { logDocumentAction } = useActivityLogger();
  const [newNote, setNewNote] = useState("");
  const [editingMercadoria, setEditingMercadoria] = useState<string | null>(null);
  const [tempMercadoriaNome, setTempMercadoriaNome] = useState("");
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [hasUserChanges, setHasUserChanges] = useState(false);
  
  // Estado para o wizard de proprietário
  const [proprietarioWizardOpen, setProprietarioWizardOpen] = useState(false);
  const [loteParaProprietario, setLoteParaProprietario] = useState<LoteInfo | null>(null);
  
  // Set para rastrear URLs blob temporárias que precisam ser limpas
  const tempBlobUrlsRef = useRef(new Set<string>());

  // Função para calcular total pago pelos arrematantes
  const calcularTotalPagoArrematantes = () => {
    const todosArrematantes = values.arrematantes || [];
    return todosArrematantes.reduce((sum, arr) => {
      if (arr.pago) {
        const valor = typeof arr.valorPagar === 'string'
          ? parseFloat(arr.valorPagar.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0
          : arr.valorPagarNumerico || 0;
        return sum + valor;
      }
      const parcelasPagas = arr.parcelasPagas || 0;
      if (parcelasPagas > 0) {
        const valorBase = typeof arr.valorPagar === 'string'
          ? parseFloat(arr.valorPagar.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0
          : arr.valorPagarNumerico || 0;
        const loteArrematado = arr.loteId ? values.lotes?.find(lote => lote.id === arr.loteId) : null;
        const tipoPagamento = loteArrematado?.tipoPagamento || values.tipoPagamento;

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
  };

  // Atualizar o estado quando as props initial mudarem, mas apenas se o usuário não fez alterações
  useEffect(() => {
    if (!hasUserChanges) {
      setValues(initial);
    }
  }, [initial, hasUserChanges]);

  // 🔄 SINCRONIZAÇÃO: Escutar mudanças de lotes vindas da página de Lotes
  useEffect(() => {
    const handleLoteChanged = (event: CustomEvent) => {
      const { auctionId, loteId, lote, action, allLotes } = event.detail;
      
      
      // Verificar se o lote pertence ao leilão atual
      if (initial.id && auctionId === initial.id) {
        
        // Atualizar os lotes do formulário com os dados mais recentes
        const newValues = { ...values, lotes: allLotes };
        setValues(newValues);
        
        // Não marcar como mudança do usuário, pois é uma sincronização externa
        // setHasUserChanges permanece como estava
        
        // Notificar o onChange se fornecido
        if (onChange) {
          onChange(newValues, 'lotes');
        }
        
      }
    };

    window.addEventListener('loteChanged', handleLoteChanged as EventListener);
    
    return () => {
      window.removeEventListener('loteChanged', handleLoteChanged as EventListener);
    };
  }, [initial.id, values, onChange]);

  // Limpar blob URLs quando componente desmontar
  useEffect(() => {
    // Capturar o valor atual do ref no corpo do efeito, não no cleanup
    const currentBlobUrls = tempBlobUrlsRef.current;
    
    return () => {
      // Limpar todas as URLs blob temporárias usando a captura
      currentBlobUrls.forEach(url => {
        URL.revokeObjectURL(url);
      });
      currentBlobUrls.clear();
    };
  }, []);

  function update<K extends keyof AuctionFormValues>(key: K, val: AuctionFormValues[K]) {
    const newValues = { ...values, [key]: val };
    setValues(newValues);
    setHasUserChanges(true); // Marcar que o usuário fez alterações
    
    // 🔄 SINCRONIZAÇÃO: Emitir evento quando lotes forem modificados
    if (key === 'lotes' && initial.id) {
      
      window.dispatchEvent(new CustomEvent('loteChangedFromForm', {
        detail: {
          auctionId: initial.id,
          lotes: val,
          allValues: newValues
        }
      }));
    }
    
    // Chamar callback onChange se fornecido
    if (onChange) {
      onChange(newValues, key);
    }
  }

  // Função para validar campos obrigatórios
  function validateRequiredFields(): string[] {
    const missing: string[] = [];

    // Campos básicos obrigatórios
    if (!values.nome?.trim()) missing.push("Nome do Evento");
    if (!values.identificacao?.trim()) missing.push("Código de Identificação");
    if (!values.dataInicio) missing.push("Data de Início");
    if (!values.dataEncerramento) missing.push("Data de Encerramento");
    
    // Nota: Validações de condições de pagamento agora são feitas no nível dos lotes individuais

    // Validar se há pelo menos um lote
    if (!values.lotes || values.lotes.length === 0) {
      missing.push("Pelo menos um Lote");
    } else {
      // Validar lotes
      values.lotes.forEach((lote, index) => {
        const lotePrefix = `Lote ${lote.numero || index + 1}`;
        
        if (!lote.numero?.trim()) missing.push(`Número do Lote ${index + 1}`);
        if (!lote.descricao?.trim()) missing.push(`Descrição do Lote ${index + 1}`);
        
        // Validar se o lote tem pelo menos uma mercadoria
        if (!lote.mercadorias || lote.mercadorias.length === 0) {
          missing.push(`Pelo menos uma Mercadoria no Lote ${index + 1}`);
        } else {
          // Validar mercadorias
          lote.mercadorias.forEach((mercadoria, mercIndex) => {
            if (!mercadoria.tipo?.trim()) missing.push(`Tipo da Mercadoria ${mercIndex + 1} do Lote ${index + 1}`);
            if (!mercadoria.valor?.trim()) missing.push(`Valor da Mercadoria ${mercIndex + 1} do Lote ${index + 1}`);
          });
        }
      });
    }

    return missing;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validar campos obrigatórios
    const missing = validateRequiredFields();
    
    if (missing.length > 0) {
      setMissingFields(missing);
      setShowValidationDialog(true);
      return;
    }

    // Prosseguir com o salvamento
    await performSubmit();
  };

  const performSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit(values);
      // Resetar flag após salvamento bem-sucedido para permitir sincronizações futuras
      setHasUserChanges(false);
    } catch (error) {
      logger.error("Erro ao salvar leilão:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmSubmit = async () => {
    setShowValidationDialog(false);
    await performSubmit();
  };

  const addNote = () => {
    if (newNote.trim()) {
      const timestamp = new Date().toLocaleString("pt-BR");
      const noteWithTimestamp = `[${timestamp}] ${newNote.trim()}`;
      update("historicoNotas", [...(values.historicoNotas || []), noteWithTimestamp]);
      setNewNote("");
    }
  };

  // Função para obter ícone baseado no tipo de arquivo
  const getFileIcon = (tipo: string) => {
    if (tipo.startsWith('image/')) return <Image className="h-4 w-4 text-blue-600" />;
    if (tipo.includes('spreadsheet') || tipo.includes('excel')) return <FileSpreadsheet className="h-4 w-4 text-green-600" />;
    if (tipo.includes('pdf')) return <FileText className="h-4 w-4 text-red-600" />;
    return <File className="h-4 w-4 text-gray-600" />;
  };

  // Função para formatar tamanho do arquivo
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };


  // Função para lidar com upload de arquivo
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, tipo: 'documentos' | 'fotosMercadoria' = 'documentos') => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const maxFiles = 20;
    if (files.length > maxFiles) {
      event.target.value = '';
      return;
    }
    
    const novosDocumentos: DocumentoInfo[] = [];
    const erros: string[] = [];
    
    for (const file of Array.from(files)) {
      try {
        // 🔒 VALIDAÇÃO
        const maxSize = tipo === 'fotosMercadoria' ? 10 * 1024 * 1024 : 20 * 1024 * 1024;
        if (file.size > maxSize) throw new Error(`Muito grande (máx. ${tipo === 'fotosMercadoria' ? '10MB' : '20MB'})`);
        if (file.size === 0) throw new Error(`Arquivo vazio`);

        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_').replace(/\.{2,}/g, '_').substring(0, 255);
        const blobUrl = URL.createObjectURL(file);
        
        const novoDocumento: DocumentoInfo = {
          id: crypto.randomUUID(),
          nome: safeName,
          tipo: file.type,
          tamanho: file.size,
          dataUpload: new Date().toISOString(),
          url: blobUrl
        };
        
        tempBlobUrlsRef.current.add(blobUrl);
        novosDocumentos.push(novoDocumento);
        
      } catch (error) {
        erros.push(`${file.name}: ${error instanceof Error ? error.message : 'Erro'}`);
        logger.error(`❌ Erro ao processar arquivo ${file.name}:`, error);
      }
    }

    if (novosDocumentos.length > 0) {
      if (tipo === 'fotosMercadoria') {
        const atualizados = [...(values.fotosMercadoria || []), ...novosDocumentos];
        update("fotosMercadoria", atualizados);
      } else {
        const atualizados = [...(values.documentos || []), ...novosDocumentos];
        update("documentos", atualizados);
      }

    }

    if (erros.length > 0) {
      logger.warn('Alguns arquivos foram rejeitados:', erros);
    }

    event.target.value = '';
  };

  const removeDocument = (id: string) => {
    // Encontrar e limpar a blob URL do documento que será removido
    const docToRemove = (values.documentos || []).find(doc => doc.id === id);
    if (docToRemove?.url && docToRemove.url.startsWith('blob:') && tempBlobUrlsRef.current.has(docToRemove.url)) {
      URL.revokeObjectURL(docToRemove.url);
      tempBlobUrlsRef.current.delete(docToRemove.url);
    }
    
    const updatedDocuments = (values.documentos || []).filter(doc => doc.id !== id);
    update("documentos", updatedDocuments);
  };

  // Função para lidar com drag & drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent, tipo: 'documentos' | 'fotosMercadoria' = 'documentos') => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files);
    
    for (const file of files) {
      try {
        const blobUrl = URL.createObjectURL(file);
        
        const novoDocumento: DocumentoInfo = {
          id: crypto.randomUUID(), // 🔒 SEGURANÇA: ID criptograficamente seguro
          nome: file.name,
          tipo: file.type,
          tamanho: file.size,
          dataUpload: new Date().toISOString(),
          url: blobUrl // Usar sempre blob URL para preview local
        };
        
        // Adicionar blob URL ao set de URLs temporárias
        tempBlobUrlsRef.current.add(blobUrl);

        if (tipo === 'fotosMercadoria') {
          update("fotosMercadoria", [...(values.fotosMercadoria || []), novoDocumento]);
        } else {
          update("documentos", [...(values.documentos || []), novoDocumento]);
        }
      } catch (error) {
        logger.error("Erro ao processar arquivo:", error);
      }
    }
  };

  const removeNote = (index: number) => {
    const updatedNotes = [...(values.historicoNotas || [])];
    updatedNotes.splice(index, 1);
    update("historicoNotas", updatedNotes);
  };

  const getLocalIcon = (local: string) => {
    switch (local) {
      case "presencial": return <Building className="h-4 w-4" />;
      case "online": return <Globe className="h-4 w-4" />;
      case "hibrido": return <Users className="h-4 w-4" />;
      default: return <MapPin className="h-4 w-4" />;
    }
  };

  // Estado para controlar o valor digitado no campo de custos - SIMPLIFICADO
  const [costInputValue, setCostInputValue] = useState(() => {
    // Inicialização simples: prioriza texto, depois numérico formatado
    if (initial.custos) return initial.custos;
    if (initial.custosNumerico && initial.custosNumerico > 0) {
      return initial.custosNumerico.toLocaleString('pt-BR', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      });
    }
    return "";
  });

  // Estados para detalhamento de custos
  const [isCostDetailDialogOpen, setIsCostDetailDialogOpen] = useState(false);
  const [costItems, setCostItems] = useState<ItemCustoInfo[]>(initial.detalheCustos || []);
  
  // Sincronizar costItems quando o initial mudar (ao carregar leilão para edição)
  useEffect(() => {
    if (!hasUserChanges && initial.detalheCustos) {
      setCostItems(initial.detalheCustos);
    }
  }, [initial.detalheCustos, hasUserChanges]);
  
  // Sincronizar costItems quando o dialog abrir ou quando detalheCustos mudar
  useEffect(() => {
    if (isCostDetailDialogOpen) {
      setCostItems(values.detalheCustos || []);
    }
  }, [isCostDetailDialogOpen, values.detalheCustos]);

  // Função para atualizar os itens de custo e recalcular o total
  const updateCostItems = (items: ItemCustoInfo[]) => {
    setCostItems(items);
    
    // Atualizar values de forma síncrona
    const newValues = { ...values, detalheCustos: items };
    setValues(newValues);
    setHasUserChanges(true);
    
    // Notificar onChange se existir
    if (onChange) {
      onChange(newValues, "detalheCustos");
    }
  };

  // Estados para detalhamento de patrocínios
  const [isSponsorDetailDialogOpen, setIsSponsorDetailDialogOpen] = useState(false);
  const [sponsorItems, setSponsorItems] = useState<ItemPatrocinioInfo[]>(initial.detalhePatrocinios || []);
  
  // Sincronizar sponsorItems quando o initial mudar (ao carregar leilão para edição)
  useEffect(() => {
    if (!hasUserChanges && initial.detalhePatrocinios) {
      setSponsorItems(initial.detalhePatrocinios);
    }
  }, [initial.detalhePatrocinios, hasUserChanges]);
  
  
  // Sincronizar sponsorItems quando o dialog abrir ou quando detalhePatrocinios mudar
  useEffect(() => {
    if (isSponsorDetailDialogOpen) {
      setSponsorItems(values.detalhePatrocinios || []);
    }
  }, [isSponsorDetailDialogOpen, values.detalhePatrocinios]);
  
  // Função para calcular e atualizar o total baseado nos itens
  const calcularEAtualizarTotal = (items: ItemCustoInfo[]) => {
    const total = items.reduce((sum, item) => sum + item.valorNumerico, 0);
    
    const totalFormatado = total.toLocaleString('pt-BR', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
    
    setCostInputValue(totalFormatado);
    update("custos", totalFormatado);
    update("custosNumerico", total);
  };

  // Função para atualizar status automaticamente baseado na data
  const updateStatusBasedOnDate = useCallback((dataInicio: string, dataEncerramento?: string) => {
    if (!dataInicio) return;
    
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
    
    let novoStatus: AuctionStatus;
    
    // Comparação simples de strings no formato YYYY-MM-DD
    if (hojeStr < inicioNormalizado) {
      novoStatus = "agendado";
    } else if (encerramentoNormalizado && hojeStr > encerramentoNormalizado) {
      novoStatus = "finalizado";
    } else {
      novoStatus = "em_andamento";
    }
    
    // Só atualiza se o status mudou - usando callback para acessar o valor atual
    setValues(currentValues => {
      if (currentValues.status !== novoStatus) {
        const updatedValues = { ...currentValues, status: novoStatus };
        // Notificar componente pai sobre a mudança
        setTimeout(() => onChange?.(updatedValues, 'status'), 0);
        return updatedValues;
      }
      return currentValues;
    });
  }, [onChange]);

  // Atualizar status automaticamente quando as datas mudarem ou componente for montado
  useEffect(() => {
    updateStatusBasedOnDate(values.dataInicio, values.dataEncerramento);
  }, [values.dataInicio, values.dataEncerramento, updateStatusBasedOnDate]);


  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="space-y-6">
          {/* Informações Básicas */}
          <Card className="border-0 shadow-sm bg-gray-50/50">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-lg font-semibold text-gray-800">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <FileText className="h-5 w-5 text-gray-600" />
            </div>
                Informações Básicas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
            
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="nome" className="text-sm font-medium text-gray-700">
                    Nome do Evento
                </Label>
                <Input 
                  id="nome"
                  value={values.nome} 
                  onChange={(e) => update("nome", e.target.value)} 
                  placeholder="Ex: Leilão de Gados 2024"
                  required 
                    className="h-11 border-gray-300 focus:border-black focus:ring-0 focus-visible:ring-0 bg-white"
                />
              </div>
              
                <div className="space-y-2">
                  <Label htmlFor="identificacao" className="text-sm font-medium text-gray-700">
                  Código de Identificação
                </Label>
                <Input 
                  id="identificacao"
                  value={values.identificacao || ""} 
                  onChange={(e) => update("identificacao", e.target.value)} 
                  placeholder="Ex: LEI-2024-001"
                    className="h-11 border-gray-300 focus:border-black focus:ring-0 focus-visible:ring-0 bg-white"
                />
              </div>
            </div>
            </CardContent>
          </Card>

          {/* Local e Endereço */}
          <Card className="border-0 shadow-sm bg-gray-50/50">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-lg font-semibold text-gray-800">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <MapPin className="h-5 w-5 text-gray-600" />
            </div>
                Local do Evento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
            
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="local" className="text-sm font-medium text-gray-700">
                    Modalidade do Evento
                </Label>
                <Select value={String(values.local)} onValueChange={(v) => update("local", v)}>
                    <SelectTrigger className="h-11 border-gray-300 focus:border-black focus:ring-0 focus-visible:ring-0 bg-white">
                    <SelectValue placeholder="Selecione a modalidade" />
                  </SelectTrigger>
                  <SelectContent side="bottom">
                      <SelectItem value="presencial">
                        <div className="flex items-center gap-2">
                          <Building className="h-4 w-4" />
                          Presencial
                        </div>
                      </SelectItem>
                      <SelectItem value="online">
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4" />
                          Online
                        </div>
                      </SelectItem>
                      <SelectItem value="hibrido">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Híbrido
                        </div>
                      </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
                <div className="space-y-2">
                  <Label htmlFor="endereco" className="text-sm font-medium text-gray-700">
                  Endereço Completo
                </Label>
                <Input 
                  id="endereco"
                  value={values.endereco || ""} 
                  onChange={(e) => update("endereco", e.target.value)} 
                  placeholder="Rua, número, bairro, cidade - CEP"
                  disabled={values.local === "online"}
                    className="h-11 border-gray-300 focus:border-black focus:ring-0 focus-visible:ring-0 bg-white disabled:bg-gray-100 disabled:text-gray-500"
                />
                {values.local === "online" && (
                  <p className="text-xs text-gray-500 italic">
                    Endereço não necessário para leilões online
                  </p>
                )}
              </div>
            </div>
            </CardContent>
          </Card>

          {/* Cronograma */}
          <Card className="border-0 shadow-sm bg-gray-50/50">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-lg font-semibold text-gray-800">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <Calendar className="h-5 w-5 text-gray-600" />
            </div>
                Cronograma
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
            
            
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="dataInicio" className="text-sm font-medium text-gray-700">
                    Data de Início
                </Label>
                  <StringDatePicker
                  id="dataInicio"
                  value={values.dataInicio} 
                    onChange={(value) => {
                      update("dataInicio", value);
                      // Atualizar status automaticamente baseado na data
                      updateStatusBasedOnDate(value, values.dataEncerramento);
                    }}
                    placeholder="Selecione a data de início"
                  required 
                />
              </div>
              
                <div className="space-y-2">
                  <Label htmlFor="dataEncerramento" className="text-sm font-medium text-gray-700">
                  Data de Encerramento
                </Label>
                  <StringDatePicker
                  id="dataEncerramento"
                  value={values.dataEncerramento || ""} 
                    onChange={(value) => {
                      update("dataEncerramento", value);
                      // Atualizar status automaticamente baseado na data
                      updateStatusBasedOnDate(values.dataInicio, value);
                    }}
                    placeholder="Selecione a data de encerramento"
                />
              </div>
              
            </div>
            </CardContent>
          </Card>

          {/* Status e Financeiro */}
          <Card className="border-0 shadow-sm bg-gray-50/50">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-lg font-semibold text-gray-800">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <DollarSign className="h-5 w-5 text-gray-600" />
            </div>
                Status e Financeiro
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
            
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="status" className="text-sm font-medium text-gray-700">
                    Status do Leilão
                </Label>
                <Select value={values.status as AuctionStatus} onValueChange={(v) => update("status", v as AuctionStatus)}>
                    <SelectTrigger className="h-11 border-gray-300 focus:border-black focus:ring-0 focus-visible:ring-0 bg-white">
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent side="bottom">
                      <SelectItem value="agendado" className="hover:bg-blue-600 hover:text-white focus:bg-blue-600 focus:text-white data-[highlighted]:bg-blue-600 data-[highlighted]:text-white">
                        Agendado
                      </SelectItem>
                      <SelectItem value="em_andamento" className="hover:bg-blue-600 hover:text-white focus:bg-blue-600 focus:text-white data-[highlighted]:bg-blue-600 data-[highlighted]:text-white">
                        Em Andamento
                      </SelectItem>
                      <SelectItem value="finalizado" className="hover:bg-blue-600 hover:text-white focus:bg-blue-600 focus:text-white data-[highlighted]:bg-blue-600 data-[highlighted]:text-white">
                        Finalizado
                      </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
                <div className="space-y-2">
                  <Label htmlFor="custos" className="text-sm font-medium text-gray-700">
                  Custos Estimados (R$)
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-sm font-medium text-gray-500">
                        R$
                      </span>
                    <Input 
                      id="custos"
                        type="text" 
                        value={costInputValue} 
                        onChange={(e) => {
                          const value = e.target.value;
                          // Permite digitação livre de números, pontos, vírgulas OU campo vazio
                          if (value === "" || /^[\d.,]*$/.test(value)) {
                            setCostInputValue(value);
                            setHasUserChanges(true);
                          }
                        }}
                        onBlur={() => {
                          // Salva exatamente o que está no campo
                          const finalValue = costInputValue;
                          const numericValue = parseCurrencyToNumber(finalValue);
                          update("custos", finalValue);
                          update("custosNumerico", numericValue);
                        }}
                        onFocus={() => {
                          // Focus event handler - pode ser usado para formatação futura
                        }}
                        className="h-11 pl-12 border-gray-300 focus:border-black focus:ring-0 focus-visible:ring-0 bg-white"
                      placeholder="0,00"
                    />
                  </div>
                  
                  <Dialog open={isCostDetailDialogOpen} onOpenChange={setIsCostDetailDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 px-3 border-gray-300 hover:bg-gray-100 hover:border-gray-400 text-gray-700 hover:text-gray-700"
                      >
                        <List className="h-4 w-4 mr-2" />
                        Detalhar
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col bg-white">
                      {/* Header Clean */}
                      <DialogHeader className="px-10 pt-8 pb-6 border-b">
                        <DialogTitle className="text-2xl font-semibold text-gray-900">
                          Especificação de Custos
                        </DialogTitle>
                        <DialogDescription className="text-sm text-gray-600 mt-2">
                          Discrimine cada item de custo para compor o orçamento total do leilão
                        </DialogDescription>
                      </DialogHeader>
                      
                      {/* Tabela de Itens */}
                      <div className="flex-1 overflow-y-auto px-10 py-6">
                        {/* Cabeçalho da Tabela */}
                        {costItems.length > 0 && (
                          <div className="grid grid-cols-12 gap-4 px-4 pb-3 mb-3 border-b">
                            <div className="col-span-1 text-xs font-semibold text-gray-500 uppercase">Nº</div>
                            <div className="col-span-6 text-xs font-semibold text-gray-500 uppercase">Descrição</div>
                            <div className="col-span-4 text-xs font-semibold text-gray-500 uppercase">Valor</div>
                            <div className="col-span-1"></div>
                          </div>
                        )}
                        
                        <div className="space-y-2">
                          {costItems.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center">
                              <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center mb-4">
                                <DollarSign className="h-8 w-8 text-gray-400" />
                              </div>
                              <p className="text-base font-medium text-gray-900 mb-1">Nenhum item de custo cadastrado</p>
                              <p className="text-sm text-gray-500">
                                Adicione itens para especificar os custos do leilão
                              </p>
                            </div>
                          ) : (
                            costItems.map((item, index) => (
                              <div 
                                key={item.id} 
                                className="group grid grid-cols-12 gap-4 items-center px-4 py-3 hover:bg-gray-50 border border-transparent hover:border-gray-200 rounded-lg transition-all"
                              >
                                {/* Número */}
                                <div className="col-span-1">
                                  <span className="inline-flex items-center justify-center w-8 h-8 rounded bg-gray-100 text-sm font-semibold text-gray-700">
                                    {String(index + 1).padStart(2, '0')}
                                  </span>
                                </div>
                                
                                {/* Descrição */}
                                <div className="col-span-6">
                                  <Input
                                    placeholder="Descrição do item de custo"
                                    value={item.descricao}
                                    onChange={(e) => {
                                      const newItems = [...costItems];
                                      newItems[index].descricao = e.target.value;
                                      setCostItems(newItems);
                                    }}
                                    className="h-10 bg-white border-gray-300 focus:border-gray-900 focus:ring-0 focus-visible:ring-0"
                                  />
                                </div>
                                
                                {/* Valor */}
                                <div className="col-span-4">
                                  <div className="relative">
                                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-sm font-medium text-gray-500">
                                      R$
                                    </span>
                                    <Input
                                      type="text"
                                      placeholder="0,00"
                                      value={item.valor}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        if (value === "" || /^[\d.,]*$/.test(value)) {
                                          const numericValue = parseCurrencyToNumber(value);
                                          const newItems = [...costItems];
                                          newItems[index].valor = value;
                                          newItems[index].valorNumerico = numericValue;
                                          setCostItems(newItems);
                                        }
                                      }}
                                      className="h-10 pl-10 bg-white border-gray-300 focus:border-gray-900 focus:ring-0 focus-visible:ring-0 font-medium"
                                    />
                                  </div>
                                </div>
                                
                                {/* Botão Remover */}
                                <div className="col-span-1 flex justify-center">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      const newItems = costItems.filter((_, i) => i !== index);
                                      setCostItems(newItems);
                                    }}
                                    className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))
                          )}
                          
                          {/* Botão Adicionar */}
                          <div className="pt-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                const novoItem: ItemCustoInfo = {
                                  id: crypto.randomUUID(), // 🔒 SEGURANÇA: ID criptograficamente seguro
                                  descricao: "",
                                  valor: "",
                                  valorNumerico: 0
                                };
                                setCostItems([...costItems, novoItem]);
                              }}
                              className="w-full h-11 border border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-700 hover:text-gray-700 font-medium"
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Adicionar Item
                            </Button>
                          </div>
                        </div>
                      </div>
                      
                      {/* Footer Formal */}
                      <div className="border-t bg-white px-10 py-6">
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Resumo</p>
                            <p className="text-sm text-gray-600">
                              {costItems.length} {costItems.length === 1 ? 'item cadastrado' : 'itens cadastrados'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">Valor Total</p>
                            <span className="text-2xl font-light text-gray-900 tracking-tight">
                              {(() => {
                                const total = costItems.reduce((sum, item) => sum + item.valorNumerico, 0);
                                return total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                              })()}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsCostDetailDialogOpen(false)}
                            className="flex-1 h-11 border-gray-300 text-gray-700 hover:text-gray-900 hover:bg-gray-50 font-medium"
                          >
                            Cancelar
                          </Button>
                          <Button
                            type="button"
                            onClick={() => {
                              
                              // Calcular total
                              const total = costItems.reduce((sum, item) => sum + item.valorNumerico, 0);
                              const totalFormatado = total.toLocaleString('pt-BR', { 
                                minimumFractionDigits: 2, 
                                maximumFractionDigits: 2 
                              });
                              
                              // Atualizar tudo de uma vez (atômico)
                              const newValues = {
                                ...values,
                                detalheCustos: costItems,
                                custos: totalFormatado,
                                custosNumerico: total
                              };
                              
                              
                              setValues(newValues);
                              setCostInputValue(totalFormatado);
                              setHasUserChanges(true);
                              
                              // Notificar onChange
                              if (onChange) {
                                onChange(newValues, "detalheCustos");
                              }
                              
                              // Fechar modal
                              setIsCostDetailDialogOpen(false);
                            }}
                            className="flex-1 h-11 bg-gray-900 hover:bg-gray-800 text-white font-medium"
                          >
                            Confirmar
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </div>

            {/* Patrocínios */}
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium text-gray-700 mb-2">Patrocínios</Label>
                <p className="text-xs text-gray-500 mb-4">
                  Registre os patrocínios recebidos. Os valores serão descontados dos custos totais.
                </p>
                
                <Dialog open={isSponsorDetailDialogOpen} onOpenChange={setIsSponsorDetailDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full border-dashed border-gray-300 text-gray-700 hover:text-gray-700 hover:bg-gray-50 hover:border-gray-400"
                    >
                      <Users className="h-4 w-4 mr-2" />
                      {sponsorItems.length > 0 
                        ? `${sponsorItems.length} Patrocinador${sponsorItems.length > 1 ? 'es' : ''} Cadastrado${sponsorItems.length > 1 ? 's' : ''}`
                        : 'Adicionar Patrocinadores'
                      }
                    </Button>
                  </DialogTrigger>
                  
                  <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col bg-white">
                    {/* Header */}
                    <DialogHeader className="px-10 pt-8 pb-6 border-b">
                      <DialogTitle className="text-2xl font-semibold text-gray-900">
                        Registro de Patrocínios
                      </DialogTitle>
                      <DialogDescription className="text-sm text-gray-600 mt-2">
                        Cadastre os patrocinadores e valores recebidos para o leilão
                      </DialogDescription>
                    </DialogHeader>
                    
                    {/* Tabela de Patrocinadores */}
                    <div className="flex-1 overflow-y-auto px-10 py-6">
                      {/* Cabeçalho da Tabela */}
                      {sponsorItems.length > 0 && (
                        <div className="grid grid-cols-12 gap-4 px-4 pb-3 mb-3 border-b">
                          <div className="col-span-1 text-xs font-semibold text-gray-500 uppercase">Nº</div>
                          <div className="col-span-6 text-xs font-semibold text-gray-500 uppercase">Patrocinador</div>
                          <div className="col-span-4 text-xs font-semibold text-gray-500 uppercase">Valor</div>
                          <div className="col-span-1"></div>
                        </div>
                      )}
                      
                      <div className="space-y-2">
                        {sponsorItems.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center mb-4">
                              <Users className="h-8 w-8 text-gray-400" />
                            </div>
                            <p className="text-base font-medium text-gray-900 mb-1">Nenhum patrocinador cadastrado</p>
                            <p className="text-sm text-gray-500">
                              Adicione patrocinadores para registrar apoios recebidos
                            </p>
                          </div>
                        ) : (
                          sponsorItems.map((item, index) => (
                            <div 
                              key={item.id} 
                              className="group grid grid-cols-12 gap-4 items-center px-4 py-3 hover:bg-gray-50 border border-transparent hover:border-gray-200 rounded-lg transition-all"
                            >
                              {/* Número */}
                              <div className="col-span-1">
                                <span className="inline-flex items-center justify-center w-8 h-8 rounded bg-gray-100 text-sm font-semibold text-gray-700">
                                  {String(index + 1).padStart(2, '0')}
                                </span>
                              </div>
                              
                              {/* Nome do Patrocinador */}
                              <div className="col-span-6">
                                <Input
                                  placeholder="Nome do patrocinador"
                                  value={item.nomePatrocinador}
                                  onChange={(e) => {
                                    const newItems = [...sponsorItems];
                                    newItems[index].nomePatrocinador = e.target.value;
                                    setSponsorItems(newItems);
                                  }}
                                  className="h-10 bg-white border-gray-300 focus:border-gray-900 focus:ring-0 focus-visible:ring-0"
                                />
                              </div>
                              
                              {/* Valor */}
                              <div className="col-span-4">
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-sm font-medium text-gray-500">
                                    R$
                                  </span>
                                  <Input
                                    type="text"
                                    placeholder="0,00"
                                    value={item.valor}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      if (value === "" || /^[\d.,]*$/.test(value)) {
                                        const numericValue = parseCurrencyToNumber(value);
                                        const newItems = [...sponsorItems];
                                        newItems[index].valor = value;
                                        newItems[index].valorNumerico = numericValue;
                                        setSponsorItems(newItems);
                                      }
                                    }}
                                    className="h-10 pl-10 bg-white border-gray-300 focus:border-gray-900 focus:ring-0 focus-visible:ring-0 font-medium"
                                  />
                                </div>
                              </div>
                              
                              {/* Botão Remover */}
                              <div className="col-span-1 flex justify-center">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const newItems = sponsorItems.filter((_, i) => i !== index);
                                    setSponsorItems(newItems);
                                  }}
                                  className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                        
                        {/* Botão Adicionar */}
                        <div className="pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              const novoItem: ItemPatrocinioInfo = {
                                id: crypto.randomUUID(), // 🔒 SEGURANÇA: ID criptograficamente seguro
                                nomePatrocinador: "",
                                valor: "",
                                valorNumerico: 0,
                                formaPagamento: 'a_vista' // Define À Vista como padrão
                              };
                              setSponsorItems([...sponsorItems, novoItem]);
                            }}
                            className="w-full h-11 border border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-700 hover:text-gray-700 font-medium"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Adicionar Patrocinador
                          </Button>
                        </div>
                      </div>
                    </div>
                    
                    {/* Footer */}
                    <div className="border-t bg-white px-10 py-6">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1.5">Resumo</p>
                          <p className="text-sm text-gray-600">
                            {sponsorItems.length} {sponsorItems.length === 1 ? 'patrocinador cadastrado' : 'patrocinadores cadastrados'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">Total de Patrocínios</p>
                          <span className="text-2xl font-light text-gray-900 tracking-tight">
                            {(() => {
                              const total = sponsorItems.reduce((sum, item) => sum + item.valorNumerico, 0);
                              return total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                            })()}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsSponsorDetailDialogOpen(false)}
                          className="flex-1 h-11 border-gray-300 text-gray-700 hover:text-gray-900 hover:bg-gray-50 font-medium"
                        >
                          Cancelar
                        </Button>
                        <Button
                          type="button"
                          onClick={() => {
                            const total = sponsorItems.reduce((sum, item) => sum + item.valorNumerico, 0);
                            
                            const newValues = {
                              ...values,
                              detalhePatrocinios: sponsorItems,
                              patrociniosTotal: total
                            };
                            
                            setValues(newValues);
                            setHasUserChanges(true);
                            
                            if (onChange) {
                              onChange(newValues, "detalhePatrocinios");
                            }
                            
                            setIsSponsorDetailDialogOpen(false);
                          }}
                          className="flex-1 h-11 bg-gray-900 hover:bg-gray-800 text-white font-medium"
                        >
                          Confirmar
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                
                {/* Resumo Visual do Impacto dos Patrocínios */}
                {(values.custosNumerico || sponsorItems.length > 0) && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-600">Custos Totais:</span>
                        <span className="font-medium text-gray-900">
                          {(values.custosNumerico || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-600">Patrocínios Recebidos:</span>
                        <span className="font-medium text-gray-700">
                          - {(values.patrociniosTotal || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                      
                      <div className="border-t border-gray-300 pt-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-semibold text-gray-900">
                            {(values.patrociniosTotal || 0) > (values.custosNumerico || 0) ? 'Valor Recebido:' : 'Saldo Líquido:'}
                          </span>
                          <span className={`text-lg font-light tracking-tight ${
                            (values.patrociniosTotal || 0) > (values.custosNumerico || 0) 
                              ? 'text-gray-900' 
                              : 'text-gray-900'
                          }`}>
                            {(() => {
                              const totalPagoArrematantes = calcularTotalPagoArrematantes();
                              const saldo = (values.patrociniosTotal || 0) + totalPagoArrematantes - (values.custosNumerico || 0);
                              return saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                            })()}
                          </span>
                        </div>
                        {(values.patrociniosTotal || 0) > (values.custosNumerico || 0) && (
                          <p className="text-xs text-gray-500 mt-1 text-right">
                            Superávit de patrocínios
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Separator className="my-6" />

            {/* Comissão de Compra */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="percentualComissaoLeiloeiro" className="text-sm font-medium text-gray-700">
                  Comissão de Compra
                </Label>
                <p className="text-xs text-gray-500 mt-1 mb-3">
                  Percentual adicional que cada arrematante pagará sobre o valor do lote arrematado. Este valor vai para a leiloeira e é repartido entre o assessor, o leiloeiro, etc.
                </p>
                <div className="relative max-w-md">
                  <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm font-medium text-gray-500">
                    %
                  </span>
                  <Input 
                    id="percentualComissaoLeiloeiro"
                    type="text" 
                    value={values.percentualComissaoLeiloeiro?.toString() || ""} 
                    onChange={(e) => {
                      const value = e.target.value;
                      // Permite apenas números e vírgula/ponto decimal
                      if (value === "" || /^[\d.,]*$/.test(value)) {
                        // Converte vírgula para ponto e parseia
                        const numericValue = value === "" ? undefined : parseFloat(value.replace(",", "."));
                        // Limita entre 0 e 100
                        if (numericValue === undefined || (numericValue >= 0 && numericValue <= 100)) {
                          update("percentualComissaoLeiloeiro", numericValue);
                          setHasUserChanges(true);
                        }
                      }
                    }}
                    className="h-11 pr-12 border-gray-300 focus:border-black focus:ring-0 focus-visible:ring-0 bg-white"
                    placeholder="Ex: 5"
                  />
                </div>
                {values.percentualComissaoLeiloeiro && values.percentualComissaoLeiloeiro > 0 && (
                  <p className="text-xs text-gray-500 mt-2">
                    Cada arrematante pagará {values.percentualComissaoLeiloeiro}% a mais sobre o valor do lote arrematado
                  </p>
                )}
              </div>
            </div>

            <Separator className="my-6" />

            {/* Comissão de Venda */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="percentualComissaoVenda" className="text-sm font-medium text-gray-700">
                  Comissão de Venda
                </Label>
                <p className="text-xs text-gray-500 mt-1 mb-3">
                  A comissão de venda é aquela comissão que o dono do leilão ganha a mais por estar vendendo o lote de cada convidado.
                </p>
                <div className="relative max-w-md">
                  <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm font-medium text-gray-500">
                    %
                  </span>
                  <Input 
                    id="percentualComissaoVenda"
                    type="text" 
                    value={values.percentualComissaoVenda?.toString() || ""} 
                    onChange={(e) => {
                      const value = e.target.value;
                      // Permite apenas números e vírgula/ponto decimal
                      if (value === "" || /^[\d.,]*$/.test(value)) {
                        // Converte vírgula para ponto e parseia
                        const numericValue = value === "" ? undefined : parseFloat(value.replace(",", "."));
                        // Limita entre 0 e 100
                        if (numericValue === undefined || (numericValue >= 0 && numericValue <= 100)) {
                          update("percentualComissaoVenda", numericValue);
                          setHasUserChanges(true);
                        }
                      }
                    }}
                    className="h-11 pr-12 border-gray-300 focus:border-black focus:ring-0 focus-visible:ring-0 bg-white"
                    placeholder="Ex: 5"
                  />
                </div>
                {values.percentualComissaoVenda && values.percentualComissaoVenda > 0 && (
                  <p className="text-xs text-gray-500 mt-2">
                    O dono do leilão receberá {values.percentualComissaoVenda}% sobre o valor de cada lote vendido do convidado
                  </p>
                )}
              </div>
            </div>
            </CardContent>
          </Card>

          {/* Configuração de Lotes */}
          <Card className="border-0 shadow-sm bg-gray-50/50">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-lg font-semibold text-gray-800">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <List className="h-5 w-5 text-gray-600" />
                </div>
                Configuração de Lotes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">

              {/* Lotes do Leilão */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Lotes do Leilão</Label>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const novoLote: LoteInfo = {
                        id: crypto.randomUUID(), // 🔒 SEGURANÇA: ID criptograficamente seguro
                        numero: String((values.lotes || []).length + 1).padStart(3, '0'),
                        descricao: "",
                        mercadorias: [],
                        status: 'disponivel'
                      };
                      update("lotes", [...(values.lotes || []), novoLote]);
                    }}
                    className="h-8 px-3 text-xs bg-black hover:bg-gray-800 text-white border-0"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Adicionar Lote
                  </Button>
                </div>

                {(values.lotes || []).length === 0 && (
                  <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
                    <p className="text-sm text-gray-500 mb-3">Nenhum lote adicionado</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const primeiroLote: LoteInfo = {
                          id: crypto.randomUUID(), // 🔒 SEGURANÇA: ID criptograficamente seguro
                          numero: "001",
                          descricao: "",
                          mercadorias: [],
                          status: 'disponivel'
                        };
                        update("lotes", [primeiroLote]);
                      }}
                      className="border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-700"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar Primeiro Lote
                    </Button>
                  </div>
                )}

                {(values.lotes || []).map((lote, loteIndex) => (
                  <div 
                    key={lote.id} 
                    className="p-4 border border-gray-200 rounded-lg bg-white space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium text-gray-900">Lote {lote.numero}</h4>
                        {lote.isConvidado && lote.guestLotId && (
                          <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                            ✓ Salvo em Lotes Convidados
                          </Badge>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const updatedLotes = (values.lotes || []).filter(l => l.id !== lote.id);
                          update("lotes", updatedLotes);
                        }}
                        className="h-8 w-8 p-0 text-red-500 hover:bg-red-50 hover:text-red-500"
                        title="Remover lote"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-gray-700">Número do Lote</Label>
                        <Input 
                          type="text" 
                          value={lote.numero} 
                          onChange={(e) => {
                            const updatedLotes = (values.lotes || []).map(l => 
                              l.id === lote.id ? { ...l, numero: e.target.value } : l
                            );
                            update("lotes", updatedLotes);
                          }}
                          className="h-11 border-gray-300 focus:border-black focus:ring-0 focus-visible:ring-0 bg-white"
                          placeholder="Ex: 001, 002..."
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-gray-700">Descrição do Lote</Label>
                        <Input 
                          type="text" 
                          value={lote.descricao} 
                          onChange={(e) => {
                            const updatedLotes = (values.lotes || []).map(l => 
                              l.id === lote.id ? { ...l, descricao: e.target.value } : l
                            );
                            update("lotes", updatedLotes);
                          }}
                          className="h-11 border-gray-300 focus:border-black focus:ring-0 focus-visible:ring-0 bg-white"
                          placeholder="Ex: Lote de Gado Nelore"
                        />
                      </div>
                    </div>

                    {/* Tipo de Lote */}
                    <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          const updatedLotes = (values.lotes || []).map(l => 
                            l.id === lote.id ? { ...l, isConvidado: false } : l
                          );
                          update("lotes", updatedLotes);
                        }}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${
                          !lote.isConvidado
                            ? "bg-white text-gray-900 shadow-sm"
                            : "text-gray-600 hover:text-gray-900"
                        }`}
                      >
                        Anfitrião
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          // Sempre abrir o wizard ao clicar em Convidado
                          setLoteParaProprietario(lote);
                          setProprietarioWizardOpen(true);
                        }}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${
                          lote.isConvidado
                            ? "bg-white text-gray-900 shadow-sm"
                            : "text-gray-600 hover:text-gray-900"
                        }`}
                      >
                        Convidado
                      </button>
                    </div>

                    {/* Mercadorias do Lote */}
                    <div className="space-y-3 pl-4 border-l-2 border-gray-100">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium text-gray-600">Mercadorias do Lote</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const novaMercadoria: MercadoriaInfo = {
                              id: crypto.randomUUID(), // 🔒 SEGURANÇA: ID criptograficamente seguro
                              tipo: "",
                              descricao: "",
                              quantidade: undefined,
                              valor: "",
                              valorNumerico: 0
                            };
                            const updatedLotes = (values.lotes || []).map(l => 
                              l.id === lote.id ? { ...l, mercadorias: [...l.mercadorias, novaMercadoria] } : l
                            );
                            update("lotes", updatedLotes);
                          }}
                          className="h-7 px-2 text-xs bg-black hover:bg-gray-800 text-white border-0"
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Adicionar Mercadoria
                        </Button>
                      </div>

                      {lote.mercadorias.length === 0 && (
                        <div className="text-center py-4 border border-dashed border-gray-200 rounded bg-gray-50">
                          <p className="text-xs text-gray-500 mb-2">Nenhuma mercadoria adicionada a este lote</p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const primeiraMercadoria: MercadoriaInfo = {
                                id: crypto.randomUUID(), // 🔒 SEGURANÇA: ID criptograficamente seguro
                                tipo: "",
                                descricao: "",
                                quantidade: undefined,
                                valor: "",
                                valorNumerico: 0
                              };
                              const updatedLotes = (values.lotes || []).map(l => 
                                l.id === lote.id ? { ...l, mercadorias: [primeiraMercadoria] } : l
                              );
                              update("lotes", updatedLotes);
                            }}
                            className="h-7 px-2 text-xs bg-transparent hover:bg-blue-600 hover:text-white text-gray-700 border border-gray-300"
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Adicionar Primeira Mercadoria
                          </Button>
                        </div>
                      )}

                      {lote.mercadorias.map((mercadoria, mercadoriaIndex) => (
                        <div key={mercadoria.id} className="p-3 border border-gray-200 rounded bg-gray-50/50 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {editingMercadoria === mercadoria.id ? (
                                <Input
                                  type="text"
                                  value={tempMercadoriaNome}
                                  onChange={(e) => setTempMercadoriaNome(e.target.value)}
                                  onBlur={() => {
                                    // Salvar o nome personalizado
                                    const updatedLotes = (values.lotes || []).map(l => 
                                      l.id === lote.id ? {
                                        ...l,
                                        mercadorias: l.mercadorias.map(m => 
                                          m.id === mercadoria.id ? { 
                                            ...m, 
                                            nome: tempMercadoriaNome.trim() || undefined 
                                          } : m
                                        )
                                      } : l
                                    );
                                    update("lotes", updatedLotes);
                                    setEditingMercadoria(null);
                                    setTempMercadoriaNome("");
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      // Salvar o nome personalizado
                                      const updatedLotes = (values.lotes || []).map(l => 
                                        l.id === lote.id ? {
                                          ...l,
                                          mercadorias: l.mercadorias.map(m => 
                                            m.id === mercadoria.id ? { 
                                              ...m, 
                                              nome: tempMercadoriaNome.trim() || undefined 
                                            } : m
                                          )
                                        } : l
                                      );
                                      update("lotes", updatedLotes);
                                      setEditingMercadoria(null);
                                      setTempMercadoriaNome("");
                                    }
                                    if (e.key === 'Escape') {
                                      setEditingMercadoria(null);
                                      setTempMercadoriaNome("");
                                    }
                                  }}
                                  className="h-6 text-xs font-medium text-gray-700 bg-white border-b border-black border-t-0 border-l-0 border-r-0 rounded-none px-0 focus:border-black focus:ring-0 focus-visible:ring-0"
                                  autoFocus
                                />
                              ) : (
                                <>
                                  <h5 className="text-xs font-medium text-gray-700">
                                    {mercadoria.titulo || mercadoria.nome || `Mercadoria ${mercadoriaIndex + 1}`}
                                  </h5>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setEditingMercadoria(mercadoria.id);
                                      setTempMercadoriaNome(mercadoria.titulo || mercadoria.nome || `Mercadoria ${mercadoriaIndex + 1}`);
                                    }}
                                    className="h-5 w-5 p-0 text-gray-600 hover:text-gray-800 hover:bg-gray-100"
                                    title="Editar nome da mercadoria"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                </>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const updatedLotes = (values.lotes || []).map(l => 
                                  l.id === lote.id ? {
                                    ...l,
                                    mercadorias: l.mercadorias.filter(m => m.id !== mercadoria.id)
                                  } : l
                                );
                                update("lotes", updatedLotes);
                              }}
                              className="h-6 w-6 p-0 text-red-500 hover:bg-red-50 hover:text-red-500"
                              title="Remover mercadoria"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs font-medium text-gray-600">Tipo de Mercadoria</Label>
                              <Input 
                                type="text" 
                                value={mercadoria.tipo} 
                                onChange={(e) => {
                                  const updatedLotes = (values.lotes || []).map(l => 
                                    l.id === lote.id ? {
                                      ...l,
                                      mercadorias: l.mercadorias.map(m => 
                                        m.id === mercadoria.id ? { ...m, tipo: e.target.value } : m
                                      )
                                    } : l
                                  );
                                  update("lotes", updatedLotes);
                                }}
                                className="h-9 border-gray-300 focus:border-black focus:ring-0 focus-visible:ring-0 bg-white text-xs"
                                placeholder="Ex: Gado Nelore"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs font-medium text-gray-600">Quantidade</Label>
                              <Input 
                                type="number"
                                min="1"
                                value={mercadoria.quantidade || ""} 
                                onChange={(e) => {
                                  const value = e.target.value;
                                  const quantidade = value === "" ? undefined : parseInt(value);
                                  const updatedLotes = (values.lotes || []).map(l => 
                                    l.id === lote.id ? {
                                      ...l,
                                      mercadorias: l.mercadorias.map(m => 
                                        m.id === mercadoria.id ? { ...m, quantidade } : m
                                      )
                                    } : l
                                  );
                                  update("lotes", updatedLotes);
                                }}
                                className="h-9 border-gray-300 focus:border-black focus:ring-0 focus-visible:ring-0 bg-white text-xs"
                                placeholder="Ex: 10"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs font-medium text-gray-600">Valor (R$)</Label>
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-xs font-medium text-gray-500">
                                  R$
                                </span>
                                <Input 
                                  type="text" 
                                  value={mercadoria.valor} 
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    if (/^[\d.,]*$/.test(value)) {
                                      const numericValue = parseCurrencyToNumber(value);
                                      const updatedLotes = (values.lotes || []).map(l => 
                                        l.id === lote.id ? {
                                          ...l,
                                          mercadorias: l.mercadorias.map(m => 
                                            m.id === mercadoria.id ? { ...m, valor: value, valorNumerico: numericValue } : m
                                          )
                                        } : l
                                      );
                                      update("lotes", updatedLotes);
                                    }
                                  }}
                                  className="h-9 pl-8 border-gray-300 focus:border-black focus:ring-0 focus-visible:ring-0 bg-white text-xs"
                                  placeholder="0,00"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs font-medium text-gray-600">Descrição da Mercadoria</Label>
                            <Textarea 
                              value={mercadoria.descricao} 
                              onChange={(e) => {
                                const updatedLotes = (values.lotes || []).map(l => 
                                  l.id === lote.id ? {
                                    ...l,
                                    mercadorias: l.mercadorias.map(m => 
                                      m.id === mercadoria.id ? { ...m, descricao: e.target.value } : m
                                    )
                                  } : l
                                );
                                update("lotes", updatedLotes);
                              }}
                              className="border-gray-300 focus:border-black focus:ring-0 focus-visible:ring-0 bg-white resize-none text-xs"
                              placeholder="Descreva a mercadoria..."
                              rows={2}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Configurações de Pagamento do Lote */}
                    <div className="space-y-4 pl-4 border-l-2 border-gray-200 bg-gray-50/50 p-4 rounded-lg">
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Fotos da Mercadoria */}
          <Card className="border-0 shadow-sm bg-gray-50/50">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-lg font-semibold text-gray-800">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <Image className="h-5 w-5 text-gray-600" />
                </div>
                Fotos da Mercadoria
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {(values.fotosMercadoria || []).length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4 bg-white border border-gray-200 rounded-lg max-h-60 overflow-y-auto">
                  {(values.fotosMercadoria || []).map((foto) => (
                    <div key={foto.id} className="relative group">
                      <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden border">
                        {foto.url && (foto.url.startsWith('blob:') || foto.url.startsWith('data:')) ? (
                          <img
                            src={foto.url}
                            alt={foto.nome}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Se a imagem não carregar, mostrar placeholder
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const placeholder = target.parentElement?.querySelector('.image-placeholder') as HTMLElement;
                              if (placeholder) {
                                placeholder.style.display = 'flex';
                              }
                            }}
                          />
                        ) : null}
                        <div 
                          className="image-placeholder w-full h-full flex flex-col items-center justify-center text-gray-500"
                          style={{ display: (foto.url && (foto.url.startsWith('blob:') || foto.url.startsWith('data:'))) ? 'none' : 'flex' }}
                        >
                          <Image className="h-8 w-8 text-gray-400 mb-2" />
                          <span className="text-xs text-center px-2">
                            {foto.url ? 'Imagem salva' : 'Preview não disponível'}
                          </span>
                        </div>
                      </div>
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            // Limpar blob URL da foto que será removida
                            if (foto.url && foto.url.startsWith('blob:') && tempBlobUrlsRef.current.has(foto.url)) {
                              URL.revokeObjectURL(foto.url);
                              tempBlobUrlsRef.current.delete(foto.url);
                            }
                            
                            const updatedFotos = (values.fotosMercadoria || []).filter(f => f.id !== foto.id);
                            update("fotosMercadoria", updatedFotos);
                          }}
                          className="h-6 w-6 p-0 bg-red-500 hover:bg-red-600 text-white rounded-full"
                          title="Remover foto"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="mt-2 text-xs text-gray-600 truncate">{foto.nome}</p>
                    </div>
                  ))}
                </div>
              )}
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 hover:border-gray-400 transition-colors"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, 'fotosMercadoria')}
              >
                <div className="text-center">
                  <Image className="mx-auto h-10 w-10 text-gray-400 mb-3" />
                  <p className="text-base font-medium text-gray-900 mb-2">Adicionar fotos da mercadoria</p>
                  <p className="text-sm text-gray-500 mb-4">
                    Imagens que representem o produto ou mercadoria do leilão
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById('file-upload-fotos-mercadoria')?.click()}
                      className="h-11 px-6 border-gray-300 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Selecionar Fotos
                    </Button>
                  </div>
                  <input
                    id="file-upload-fotos-mercadoria"
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e, 'fotosMercadoria')}
                    className="hidden"
                  />
                  <p className="text-xs text-gray-400 mt-3">
                    Formatos aceitos: JPG, PNG, GIF (máx. 10MB cada)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Histórico de Observações */}
          <Card className="border-0 shadow-sm bg-gray-50/50">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-lg font-semibold text-gray-800">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <Clock className="h-5 w-5 text-gray-600" />
            </div>
                Histórico de Observações
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
            
            <div className="space-y-4">
                <div className="space-y-3">
                <Label htmlFor="newNote" className="text-sm font-medium text-gray-700">
                  Adicionar Nova Observação
                </Label>
                  <div className="space-y-3">
                  <Textarea
                    id="newNote"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Digite uma observação sobre o leilão..."
                      className="min-h-[100px] border-gray-300 focus:border-black focus:ring-0 focus-visible:ring-0 bg-white resize-none"
                  />
                    <div className="flex justify-end">
                  <Button 
                    type="button" 
                    onClick={addNote}
                    disabled={!newNote.trim()}
                        className="bg-black hover:bg-gray-800 text-white px-6 border-0"
                  >
                    Adicionar
                  </Button>
                    </div>
                </div>
              </div>
              
              {values.historicoNotas && values.historicoNotas.length > 0 && (
                  <div className="space-y-3">
                  <Label className="text-sm font-medium text-gray-700">
                    Observações Registradas ({values.historicoNotas.length})
                  </Label>
                    <div className="max-h-48 overflow-y-auto space-y-2 border rounded-lg p-4 bg-white">
                    {values.historicoNotas.map((note, index) => (
                        <div key={index} className="flex items-start justify-between gap-3 p-3 bg-gray-50 rounded-lg border">
                          <p className="text-sm flex-1 leading-relaxed">{note}</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeNote(index)}
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full"
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            </CardContent>
          </Card>

          {/* Documentos */}
          <Card className="border-0 shadow-sm bg-gray-50/50">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-3 text-lg font-semibold text-gray-800">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <FileText className="h-5 w-5 text-gray-600" />
          </div>
                Documentos do Leilão
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              
              <div className="space-y-4">
                {/* Lista de documentos */}
                {(values.documentos || []).length > 0 && (
                  <div className="space-y-2 p-4 bg-white border border-gray-200 rounded-lg max-h-60 overflow-y-auto">
                    {(values.documentos || []).map((doc) => (
                      <div key={doc.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-md border">
                        {getFileIcon(doc.tipo)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{doc.nome}</p>
                          <p className="text-xs text-gray-500">
                            {formatFileSize(doc.tamanho)}{(() => {
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
                        <div className="flex gap-1">
                          {doc.url && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                try { logDocumentAction('view', doc.nome || 'documento', 'auction', initial?.nome || '', initial?.id || ''); } catch { /* */ }
                                if (doc.url) {
                                  openDocumentSafely(doc.url, doc.nome || 'Documento');
                                }
                              }}
                              className="h-8 w-8 p-0 text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                              title="Visualizar arquivo"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeDocument(doc.id)}
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                            title="Remover arquivo"
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Área de upload */}
                <div 
                  className="border-2 border-dashed border-gray-300 rounded-lg p-8 hover:border-gray-400 transition-colors"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, 'documentos')}
                >
                  <div className="text-center">
                    <Paperclip className="mx-auto h-10 w-10 text-gray-400 mb-3" />
                    <p className="text-base font-medium text-gray-900 mb-2">Adicionar documentos do leilão</p>
                    <p className="text-sm text-gray-500 mb-4">
                      Editais, regulamentos, laudos, certificados e outros documentos oficiais
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => document.getElementById('file-upload-leilao')?.click()}
                        className="h-11 px-6 border-gray-300 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Selecionar Arquivos
                      </Button>
                    </div>
                    <input
                      id="file-upload-leilao"
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif"
                      onChange={(e) => handleFileUpload(e, 'documentos')}
                      className="hidden"
                    />
                    <p className="text-xs text-gray-400 mt-3">
                      Formatos aceitos: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG (máx. 10MB cada)
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ações */}
          <div className="flex flex-col sm:flex-row gap-4 justify-end pt-8 pb-4">
            {onCancel && (
              <Button 
                type="button" 
                variant="outline" 
                onClick={onCancel}
                className="h-12 px-8 border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-black font-medium"
              >
                Cancelar
              </Button>
            )}
            <Button 
              type="submit" 
              disabled={isSubmitting}
              className="h-12 px-10 bg-black hover:bg-gray-800 text-white font-semibold shadow-sm btn-save-click"
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Salvando...
                </div>
              ) : (
                "Salvar Leilão"
              )}
            </Button>
          </div>
        </form>

        {/* Diálogo de Validação */}
        <AlertDialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
          <AlertDialogContent className="max-w-lg border-0 shadow-2xl bg-white">
            <AlertDialogHeader className="pb-6 border-b border-gray-100">
              <AlertDialogTitle className="text-lg font-medium text-gray-900 text-center">
                Verificação do Formulário
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-red-600 text-center mt-2 font-normal">
                Informações pendentes de preenchimento
              </AlertDialogDescription>
            </AlertDialogHeader>
            
            <div className="py-6">
              <div className="max-h-40 overflow-y-auto">
                <ul className="space-y-2">
                  {missingFields.map((field, index) => (
                    <li key={index} className="flex items-center gap-3 text-sm text-gray-700 py-1">
                      <div className="w-1 h-1 bg-gray-400 rounded-full flex-shrink-0"></div>
                      <span className="font-normal leading-snug">{field}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4 pb-2">
              <p className="text-xs text-gray-500 text-center leading-relaxed px-4">
                É possível prosseguir com o salvamento e completar as informações posteriormente.
              </p>
            </div>

            <AlertDialogFooter className="gap-2 pt-4 pb-6">
              <AlertDialogCancel className="flex-1 h-10 bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 text-sm font-medium">
                Revisar
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleConfirmSubmit}
                className="flex-1 h-10 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium border-0 btn-save-click"
              >
                Prosseguir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      {/* Wizard de Proprietário */}
      {proprietarioWizardOpen && loteParaProprietario && (
        <ProprietarioWizard
          initialData={{
            proprietario: loteParaProprietario.proprietario || "",
            codigoPais: loteParaProprietario.codigoPais || "+55",
            celularProprietario: loteParaProprietario.celularProprietario || "",
            emailProprietario: loteParaProprietario.emailProprietario || "",
            documentos: loteParaProprietario.documentos || [],
          }}
          onSubmit={(data) => {
            // Atualizar o lote com as informações do proprietário
            const updatedLotes = (values.lotes || []).map(l => 
              l.id === loteParaProprietario.id ? {
                ...l,
                isConvidado: true,
                proprietario: data.proprietario,
                codigoPais: data.codigoPais,
                celularProprietario: data.celularProprietario,
                emailProprietario: data.emailProprietario,
                documentos: data.documentos,
              } : l
            );
            update("lotes", updatedLotes);
            setProprietarioWizardOpen(false);
            setLoteParaProprietario(null);
          }}
          onCancel={() => {
            setProprietarioWizardOpen(false);
            setLoteParaProprietario(null);
          }}
        />
      )}
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function createEmptyAuctionForm(): AuctionFormValues {
  const today = new Date().toISOString().slice(0, 10);
  return {
    nome: "",
    identificacao: "",
    local: "presencial",
    endereco: "",
    dataInicio: today,
    dataEncerramento: today,
    status: "agendado",
    custos: "",
    custosNumerico: 0,
    detalheCustos: [],
    lotes: [],
    fotosMercadoria: [], // Fotos da mercadoria serão salvas no banco
    documentos: [], // Documentos do leilão serão salvos no banco
    historicoNotas: [],
    arquivado: false,
  };
}


