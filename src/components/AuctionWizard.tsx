import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { AuctionFormValues } from "@/components/AuctionForm";
import { LoteInfo, MercadoriaInfo, ItemCustoInfo, ItemPatrocinioInfo } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StringDatePicker } from "@/components/ui/date-picker";
import { ProprietarioWizard } from "@/components/ProprietarioWizard";
import { ChevronLeft, ChevronRight, Check, Plus, X as XIcon, Trash2, Image as ImageIcon, AlertCircle, Save } from "lucide-react";
import { calcularValorTotal } from "@/lib/parcelamento-calculator";
import { parseCurrencyToNumber } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { validateImageFile, FileValidationError } from "@/lib/file-validation";

// Helper para converter números brasileiros (1.000,50) para número
const parseBrazilianNumber = (value: string): number | undefined => {
  if (value === "") return undefined;
  // Remove espaços
  let cleaned = value.trim();
  // Substitui vírgula por ponto (vírgula é decimal no Brasil)
  // Mas primeiro, remove pontos (separadores de milhar)
  cleaned = cleaned.replace(/\./g, '');
  cleaned = cleaned.replace(/,/g, '.');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? undefined : parsed;
};

interface AuctionWizardProps {
  initial: AuctionFormValues;
  onSubmit: (values: AuctionFormValues) => Promise<void> | void;
  onCancel?: () => void;
  initialStep?: number;
  initialLoteIndex?: number;
  isEditMode?: boolean; // Indica se está editando um leilão existente
}

const DRAFT_STORAGE_KEY = 'auction-draft';
const DRAFT_TIMESTAMP_KEY = 'auction-draft-timestamp';

export function AuctionWizard({ initial, onSubmit, onCancel, initialStep, initialLoteIndex, isEditMode }: AuctionWizardProps) {
  logger.debug('🎬 [AuctionWizard] Componente montado/atualizado:', {
    initialStep,
    initialLoteIndex,
    isEditMode,
    initialValues: {
      nome: initial.nome,
      identificacao: initial.identificacao,
      hasLotes: !!initial.lotes?.length,
      qtdLotes: initial.lotes?.length || 0
    }
  });

  // Estado para controlar modal de rascunho
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [draftData, setDraftData] = useState<{ values: AuctionFormValues; step: number } | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const draftCheckedRef = useRef(false); // Flag para verificar rascunho apenas uma vez

  const [currentStep, setCurrentStep] = useState(initialStep ?? 0);
  const [values, setValues] = useState<AuctionFormValues>(initial);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedLoteIndex, setSelectedLoteIndex] = useState(initialLoteIndex ?? 0);
  const [selectedMercadoriaIndex, setSelectedMercadoriaIndex] = useState(0);
  const [isClosing, setIsClosing] = useState(false);

  logger.debug('📊 [AuctionWizard] Estado inicial definido:', {
    currentStep,
    selectedLoteIndex,
    valuesNome: values.nome,
    valuesIdentificacao: values.identificacao,
    valuesQtdLotes: values.lotes?.length || 0
  });
  
  // Estados para custos e patrocínios
  const [costItems, setCostItems] = useState<ItemCustoInfo[]>(initial.detalheCustos || []);
  const [sponsorItems, setSponsorItems] = useState<ItemPatrocinioInfo[]>(initial.detalhePatrocinios || []);
  const [selectedCostIndex, setSelectedCostIndex] = useState(0);
  const [selectedSponsorIndex, setSelectedSponsorIndex] = useState(0);
  
  // Estado para o wizard de proprietário
  const [proprietarioWizardOpen, setProprietarioWizardOpen] = useState(false);
  const [loteParaProprietario, setLoteParaProprietario] = useState<LoteInfo | null>(null);
  
  // Estado para validação de datas
  const [dataInvalida, setDataInvalida] = useState(false);

  // 🔍 LOG: Monitorar mudanças no currentStep
  useEffect(() => {
    logger.debug('🔄 [AuctionWizard] currentStep mudou:', {
      newStep: currentStep,
      stepName: steps[currentStep]?.title,
      valuesNome: values.nome,
      valuesIdentificacao: values.identificacao,
      valuesStatus: values.status,
      valuesQtdLotes: values.lotes?.length || 0
    });
  }, [currentStep]);

  // 🔍 LOG: Monitorar mudanças nos values (nome e identificacao especificamente)
  useEffect(() => {
    logger.debug('📝 [AuctionWizard] values mudaram:', {
      currentStep,
      stepName: steps[currentStep]?.title,
      nome: values.nome,
      identificacao: values.identificacao,
      status: values.status,
      qtdLotes: values.lotes?.length || 0
    });
  }, [values.nome, values.identificacao, values.status]);

  // 🔍 LOG: Monitorar re-renderizações gerais do componente
  useEffect(() => {
    logger.debug('🔁 [AuctionWizard] Componente re-renderizou:', {
      currentStep,
      stepName: steps[currentStep]?.title,
      valuesCompletos: {
        nome: values.nome,
        identificacao: values.identificacao,
        status: values.status,
        dataInicio: values.dataInicio,
        dataEncerramento: values.dataEncerramento,
        local: values.local,
        qtdLotes: values.lotes?.length || 0
      }
    });
  });

  // Verificar se data de início é posterior à data de término
  useEffect(() => {
    if (values.dataInicio && values.dataEncerramento) {
      // Converter strings de data (formato DD/MM/YYYY ou YYYY-MM-DD) para Date
      const parseDate = (dateStr: string): Date => {
        if (dateStr.includes('/')) {
          // Formato DD/MM/YYYY
          const [dia, mes, ano] = dateStr.split('/');
          return new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
        } else {
          // Formato YYYY-MM-DD
          const [ano, mes, dia] = dateStr.split('-');
          return new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
        }
      };
      
      const dataInicio = parseDate(values.dataInicio);
      const dataFim = parseDate(values.dataEncerramento);
      
      // Verificar se data de início é posterior à data de término
      if (dataInicio > dataFim) {
        setDataInvalida(true);
      } else {
        setDataInvalida(false);
      }
    } else {
      setDataInvalida(false);
    }
  }, [values.dataInicio, values.dataEncerramento]);

  // Verificar se existe rascunho salvo ao montar o componente (apenas se não for modo edição)
  useEffect(() => {
    // Só verificar uma vez por sessão do componente
    if (isEditMode || draftCheckedRef.current) return;
    
    draftCheckedRef.current = true; // Marcar como verificado

    const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
    const savedTimestamp = localStorage.getItem(DRAFT_TIMESTAMP_KEY);
    
    if (savedDraft && savedTimestamp) {
      try {
        const parsed = JSON.parse(savedDraft);
        
        // LOG COMPLETO: Dump do rascunho
        console.log('========================================');
        console.log('🔍 RASCUNHO ENCONTRADO NO LOCALSTORAGE');
        console.log('========================================');
        console.log('Timestamp:', savedTimestamp);
        console.log('Estrutura completa:', JSON.stringify(parsed, null, 2));
        console.log('========================================');
        
        // Validação de estrutura e segurança
        if (!parsed || typeof parsed !== 'object' || !parsed.values) {
          console.log('❌ ERRO: Estrutura de rascunho inválida');
          throw new Error('Estrutura de rascunho inválida');
        }
        
        // Análise detalhada de cada campo
        console.log('📋 ANÁLISE DETALHADA:');
        console.log('values.nome:', parsed.values?.nome, '| length:', parsed.values?.nome?.trim?.()?.length || 0);
        console.log('values.identificacao:', parsed.values?.identificacao, '| length:', parsed.values?.identificacao?.trim?.()?.length || 0);
        console.log('values.local:', parsed.values?.local, '| length:', parsed.values?.local?.trim?.()?.length || 0);
        console.log('values.endereco:', parsed.values?.endereco, '| length:', parsed.values?.endereco?.trim?.()?.length || 0);
        console.log('values.lotes:', parsed.values?.lotes?.length || 0, 'itens');
        if (parsed.values?.lotes?.length > 0) {
          console.log('  → Lotes com conteúdo:', parsed.values.lotes.filter((l: any) => l.numero || l.descricao).length);
        }
        console.log('costItems:', parsed.costItems?.length || 0, 'itens');
        if (parsed.costItems?.length > 0) {
          console.log('  → Custos com descrição:', parsed.costItems.filter((c: any) => c.descricao && c.descricao.trim().length > 0).length);
        }
        console.log('sponsorItems:', parsed.sponsorItems?.length || 0, 'itens');
        if (parsed.sponsorItems?.length > 0) {
          console.log('  → Patrocínios com nome:', parsed.sponsorItems.filter((s: any) => s.nomePatrocinador && s.nomePatrocinador.trim().length > 0).length);
        }
        
        // Verificar se o rascunho tem conteúdo SIGNIFICATIVO (não apenas espaços em branco ou valores padrões)
        // Requer pelo menos 3 caracteres em algum campo de texto OU lotes/custos/patrocinios com dados
        // IMPORTANTE: Ignorar valores padrões que vêm do formulário inicial
        const checkNome = parsed.values?.nome && typeof parsed.values.nome === 'string' && parsed.values.nome.trim().length >= 3;
        const checkIdentificacao = parsed.values?.identificacao && typeof parsed.values.identificacao === 'string' && parsed.values.identificacao.trim().length >= 3;
        
        // IGNORAR "local" se for um valor padrão (presencial/online/hibrido)
        const localPadrao = ['presencial', 'online', 'hibrido', ''];
        const checkLocal = parsed.values?.local && 
          typeof parsed.values.local === 'string' && 
          parsed.values.local.trim().length >= 3 &&
          !localPadrao.includes(parsed.values.local.toLowerCase());
        
        const checkEndereco = parsed.values?.endereco && typeof parsed.values.endereco === 'string' && parsed.values.endereco.trim().length >= 10;
        const checkLotes = parsed.values?.lotes && Array.isArray(parsed.values.lotes) && parsed.values.lotes.length > 0 && 
           parsed.values.lotes.some((l: any) => l.numero || l.descricao);
        const checkCustos = parsed.costItems && Array.isArray(parsed.costItems) && parsed.costItems.length > 0 && 
           parsed.costItems.some((c: any) => c.descricao && c.descricao.trim().length > 0);
        const checkPatrocinios = parsed.sponsorItems && Array.isArray(parsed.sponsorItems) && parsed.sponsorItems.length > 0 && 
           parsed.sponsorItems.some((s: any) => s.nomePatrocinador && s.nomePatrocinador.trim().length > 0);
        
        console.log('✅ VALIDAÇÕES:');
        console.log('  Nome válido (>= 3 chars):', checkNome);
        console.log('  Identificação válida (>= 3 chars):', checkIdentificacao);
        console.log('  Local válido (>= 3 chars):', checkLocal);
        console.log('  Endereço válido (>= 10 chars):', checkEndereco);
        console.log('  Lotes válidos:', checkLotes);
        console.log('  Custos válidos:', checkCustos);
        console.log('  Patrocínios válidos:', checkPatrocinios);
        
        const hasSignificantContent = checkNome || checkIdentificacao || checkLocal || checkEndereco || checkLotes || checkCustos || checkPatrocinios;
        
        console.log('🎯 RESULTADO: hasSignificantContent =', hasSignificantContent);
        console.log('========================================');
        
        // Só mostrar modal se houver conteúdo REAL
        if (hasSignificantContent) {
          setDraftData({ values: parsed.values, step: parsed.step || 0 });
          setShowDraftModal(true);
          logger.info('✅ Rascunho encontrado com conteúdo válido - MODAL EXIBIDO');
          console.log('✅ MODAL DE RASCUNHO SERÁ EXIBIDO');
        } else {
          // Rascunho vazio ou apenas espaços, limpar
          localStorage.removeItem(DRAFT_STORAGE_KEY);
          localStorage.removeItem(DRAFT_TIMESTAMP_KEY);
          logger.debug('🗑️ Rascunho vazio removido');
          console.log('🗑️ RASCUNHO VAZIO - REMOVIDO DO LOCALSTORAGE');
        }
      } catch (error) {
        console.log('❌ ERRO ao carregar rascunho:', error);
        logger.error('Erro ao carregar rascunho', error);
        // Limpar dados corrompidos
        localStorage.removeItem(DRAFT_STORAGE_KEY);
        localStorage.removeItem(DRAFT_TIMESTAMP_KEY);
      }
    } else {
      console.log('ℹ️ Nenhum rascunho encontrado no localStorage');
    }
  }, [isEditMode]);

  // Auto-save: salvar rascunho automaticamente após mudanças (apenas se não for modo edição)
  const saveDraft = useCallback(() => {
    if (isEditMode) return; // Não salvar rascunho se estiver editando leilão existente
    
    // Verificar se há conteúdo SIGNIFICATIVO para salvar (não apenas espaços em branco ou valores padrões)
    // Requer pelo menos 3 caracteres em algum campo de texto OU lotes/custos/patrocinios com dados reais
    // IMPORTANTE: Ignorar valores padrões que vêm do formulário inicial
    const localPadrao = ['presencial', 'online', 'hibrido', ''];
    
    const hasSignificantContent = 
      (values.nome && typeof values.nome === 'string' && values.nome.trim().length >= 3) ||
      (values.identificacao && typeof values.identificacao === 'string' && values.identificacao.trim().length >= 3) ||
      (values.local && typeof values.local === 'string' && values.local.trim().length >= 3 && !localPadrao.includes(values.local.toLowerCase())) ||
      (values.endereco && typeof values.endereco === 'string' && values.endereco.trim().length >= 10) ||
      (values.lotes && Array.isArray(values.lotes) && values.lotes.length > 0 && 
       values.lotes.some(l => l.numero || l.descricao)) ||
      (costItems && Array.isArray(costItems) && costItems.length > 0 && 
       costItems.some(c => c.descricao && c.descricao.trim().length > 0)) ||
      (sponsorItems && Array.isArray(sponsorItems) && sponsorItems.length > 0 && 
       sponsorItems.some(s => s.nomePatrocinador && s.nomePatrocinador.trim().length > 0));
    
    // Só salvar se houver conteúdo REAL preenchido
    if (!hasSignificantContent) {
      console.log('⚠️ AUTO-SAVE: Não há conteúdo significativo para salvar - IGNORADO');
      return;
    }
    
    console.log('💾 AUTO-SAVE: Salvando rascunho...');
    console.log('Valores a serem salvos:', {
      nome: values.nome,
      identificacao: values.identificacao,
      local: values.local,
      qtdLotes: values.lotes?.length || 0,
      qtdCustos: costItems?.length || 0,
      qtdPatrocinios: sponsorItems?.length || 0
    });
    
    try {
      setIsSaving(true);
      const draftToSave = {
        values,
        step: currentStep,
        costItems,
        sponsorItems,
        selectedLoteIndex,
        selectedMercadoriaIndex,
        selectedCostIndex,
        selectedSponsorIndex,
        timestamp: new Date().toISOString()
      };
      
      console.log('💾 Salvando no localStorage...');
      // Salvar no localStorage (persiste mesmo fechando o navegador/app)
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftToSave));
      localStorage.setItem(DRAFT_TIMESTAMP_KEY, new Date().toISOString());
      setLastSaved(new Date());
      console.log('✅ AUTO-SAVE: Rascunho salvo com sucesso!');
      
      // Indicador aparece por apenas 800ms
      setTimeout(() => setIsSaving(false), 800);
      logger.debug('Rascunho salvo com sucesso');
    } catch (error) {
      logger.error('Erro ao salvar rascunho', error);
      setIsSaving(false);
      
      // Se erro de quota excedida, tentar limpar rascunho antigo
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        logger.warn('LocalStorage cheio, limpando rascunho antigo');
        localStorage.removeItem(DRAFT_STORAGE_KEY);
        localStorage.removeItem(DRAFT_TIMESTAMP_KEY);
      }
    }
  }, [values, currentStep, costItems, sponsorItems, selectedLoteIndex, selectedMercadoriaIndex, selectedCostIndex, selectedSponsorIndex, isEditMode]);

  // Debounce para auto-save (salvar 2 segundos após última mudança)
  useEffect(() => {
    if (isEditMode) return;
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      saveDraft();
    }, 2000);
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [values, currentStep, saveDraft, isEditMode]);

  // Limpar rascunho ao submeter com sucesso
  const clearDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    localStorage.removeItem(DRAFT_TIMESTAMP_KEY);
    setLastSaved(null);
  }, []);

  // Carregar rascunho
  const loadDraft = useCallback(() => {
    console.log('========================================');
    console.log('🔄 CARREGANDO RASCUNHO');
    console.log('========================================');
    console.log('draftData disponível:', !!draftData);
    
    if (draftData) {
      console.log('Dados do rascunho a serem carregados:');
      console.log('  nome:', draftData.values?.nome);
      console.log('  identificacao:', draftData.values?.identificacao);
      console.log('  local:', draftData.values?.local);
      console.log('  lotes:', draftData.values?.lotes?.length || 0);
      console.log('  step:', draftData.step);
      
      setValues(draftData.values);
      setCurrentStep(draftData.step);
      
      // Tentar restaurar outros estados se disponíveis
      try {
        const savedDraft = localStorage.getItem(DRAFT_STORAGE_KEY);
        if (savedDraft) {
          const parsed = JSON.parse(savedDraft);
          if (parsed.costItems) setCostItems(parsed.costItems);
          if (parsed.sponsorItems) setSponsorItems(parsed.sponsorItems);
          if (parsed.selectedLoteIndex !== undefined) setSelectedLoteIndex(parsed.selectedLoteIndex);
          if (parsed.selectedMercadoriaIndex !== undefined) setSelectedMercadoriaIndex(parsed.selectedMercadoriaIndex);
          if (parsed.selectedCostIndex !== undefined) setSelectedCostIndex(parsed.selectedCostIndex);
          if (parsed.selectedSponsorIndex !== undefined) setSelectedSponsorIndex(parsed.selectedSponsorIndex);
          
          console.log('Estados adicionais restaurados com sucesso');
        }
      } catch (error) {
        console.log('❌ Erro ao restaurar estados:', error);
        logger.error('Erro ao restaurar estados do rascunho', error);
      }
      
      console.log('✅ RASCUNHO CARREGADO - Formulário preenchido');
      console.log('========================================');
      setShowDraftModal(false);
    } else {
      console.log('⚠️ AVISO: draftData está vazio ou undefined!');
      console.log('========================================');
    }
  }, [draftData]);

  // Descartar rascunho e começar novo
  const discardDraft = useCallback(() => {
    clearDraft();
    setShowDraftModal(false);
    setDraftData(null);
  }, [clearDraft]);

  // Atualizar status automaticamente baseado nas datas
  useEffect(() => {
    if (values.dataInicio && values.dataEncerramento) {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0); // Zerar horas para comparar apenas datas
      
      // Converter strings de data (formato DD/MM/YYYY ou YYYY-MM-DD) para Date
      const parseDate = (dateStr: string): Date => {
        if (dateStr.includes('/')) {
          // Formato DD/MM/YYYY
          const [dia, mes, ano] = dateStr.split('/');
          return new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
        } else {
          // Formato YYYY-MM-DD
          const [ano, mes, dia] = dateStr.split('-');
          return new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
        }
      };
      
      const dataInicio = parseDate(values.dataInicio);
      const dataFim = parseDate(values.dataEncerramento);
      
      let novoStatus: "agendado" | "em_andamento" | "finalizado" = "agendado";
      
      if (dataFim < hoje) {
        // Se data de encerramento já passou, está finalizado
        novoStatus = "finalizado";
      } else if (dataInicio <= hoje && hoje <= dataFim) {
        // Se está entre data de início e fim, está em andamento
        novoStatus = "em_andamento";
      } else if (dataInicio > hoje) {
        // Se data de início é futura, está agendado
        novoStatus = "agendado";
      }
      
      // Atualizar status apenas se for diferente do atual
      if (values.status !== novoStatus) {
        setValues(prev => ({ ...prev, status: novoStatus }));
      }
    }
  }, [values.dataInicio, values.dataEncerramento, values.status]);

  const updateField = (field: keyof AuctionFormValues, value: AuctionFormValues[keyof AuctionFormValues]) => {
    logger.debug('🔧 [AuctionWizard] updateField chamado:', {
      field,
      value: field === 'lotes' ? `Array com ${(value as LoteInfo[])?.length || 0} lotes` : value,
      currentStep,
      stepName: steps[currentStep]?.title,
      beforeNome: values.nome,
      beforeIdentificacao: values.identificacao
    });
    
    setValues(prev => {
      const newValues = { ...prev, [field]: value };
      logger.debug('✨ [AuctionWizard] values atualizados:', {
        field,
        afterNome: newValues.nome,
        afterIdentificacao: newValues.identificacao,
        afterStatus: newValues.status
      });
      return newValues;
    });
  };

  const updateLote = <K extends keyof LoteInfo>(index: number, field: K, value: LoteInfo[K]) => {
    const updatedLotes = [...(values.lotes || [])];
    updatedLotes[index] = { ...updatedLotes[index], [field]: value };
    updateField("lotes", updatedLotes);
  };

  const addMercadoriaToLote = (loteIndex: number) => {
    const updatedLotes = [...(values.lotes || [])];
    const currentMercadorias = updatedLotes[loteIndex].mercadorias || [];
    const newMercadoria: MercadoriaInfo = {
      id: Date.now().toString(),
      titulo: "",
      descricao: "",
      valor: "0",
      valorNumerico: 0
    };
    updatedLotes[loteIndex].mercadorias = [...currentMercadorias, newMercadoria];
    updateField("lotes", updatedLotes);
    // Seta o índice para a nova mercadoria (último índice do array atualizado)
    setSelectedMercadoriaIndex(currentMercadorias.length);
  };

  const updateMercadoria = (loteIndex: number, mercadoriaIndex: number, field: keyof MercadoriaInfo, value: string | number) => {
    const updatedLotes = [...(values.lotes || [])];
    const mercadorias = [...(updatedLotes[loteIndex].mercadorias || [])];
    mercadorias[mercadoriaIndex] = { ...mercadorias[mercadoriaIndex], [field]: value };
    updatedLotes[loteIndex].mercadorias = mercadorias;
    updateField("lotes", updatedLotes);
  };

  const removeMercadoria = (loteIndex: number, mercadoriaIndex: number) => {
    const updatedLotes = [...(values.lotes || [])];
    const mercadorias = updatedLotes[loteIndex].mercadorias?.filter((_, i) => i !== mercadoriaIndex) || [];
    updatedLotes[loteIndex].mercadorias = mercadorias;
    updateField("lotes", updatedLotes);
    // Ajusta o índice selecionado após remover
    if (mercadorias.length === 0) {
      setSelectedMercadoriaIndex(0);
    } else if (mercadoriaIndex >= mercadorias.length) {
      setSelectedMercadoriaIndex(mercadorias.length - 1);
    }
  };

  const addLote = () => {
    const newLote: LoteInfo = {
      id: Date.now().toString(),
      numero: `${(values.lotes?.length || 0) + 1}`.padStart(3, '0'),
      descricao: "",
      mercadorias: [],
      status: 'disponivel'
    };
    updateField("lotes", [...(values.lotes || []), newLote]);
  };

  const validateCurrentStep = (): boolean => {
    switch (currentStep) {
      case 0: // Informações Básicas
        return !!(values.nome && values.identificacao);
      case 1: // Datas
        return !!(values.dataInicio && values.dataEncerramento) && !dataInvalida;
      case 2: // Local
        if (values.local === "presencial" || values.local === "hibrido") {
          return !!(values.local && values.endereco);
        }
        return !!values.local;
      case 3: // Status
        return !!values.status;
      case 4: // Lotes
        return (values.lotes?.length || 0) > 0;
      case 5: // Pagamento
        return true; // Opcional
      case 6: // Custos e Patrocínios
        return costItems.length > 0 && sponsorItems.length > 0;
      case 7: // Forma de Pagamento dos Patrocínios
        return true; // Opcional
      case 8: // Comissão de Compra
        return true; // Opcional
      case 9: // Comissão de Venda
        return true; // Opcional
      default:
        return true;
    }
  };

  const handleNext = () => {
    logger.debug('➡️ [AuctionWizard] handleNext chamado:', {
      currentStep,
      stepName: steps[currentStep]?.title,
      valuesNome: values.nome,
      valuesIdentificacao: values.identificacao
    });

    if (!validateCurrentStep()) {
      alert("Por favor, preencha todos os campos obrigatórios antes de avançar.");
      return;
    }
    
    // Encontrar próximo step visível
    let nextStep = currentStep + 1;
    while (nextStep < steps.length && steps[nextStep].show === false) {
      nextStep++;
    }
    
    if (nextStep < steps.length) {
      logger.debug('✅ [AuctionWizard] Avançando para step:', {
        from: currentStep,
        to: nextStep,
        stepName: steps[nextStep]?.title
      });
      setCurrentStep(nextStep);
    }
  };

  const goToStep = (stepIndex: number) => {
    logger.debug('🎯 [AuctionWizard] goToStep chamado:', {
      from: currentStep,
      to: stepIndex,
      stepName: steps[stepIndex]?.title,
      valuesNome: values.nome,
      valuesIdentificacao: values.identificacao
    });
    setCurrentStep(stepIndex);
  };

  const handleBack = () => {
    logger.debug('⬅️ [AuctionWizard] handleBack chamado:', {
      currentStep,
      stepName: steps[currentStep]?.title,
      valuesNome: values.nome,
      valuesIdentificacao: values.identificacao
    });

    // Encontrar step anterior visível
    let prevStep = currentStep - 1;
    while (prevStep >= 0 && steps[prevStep].show === false) {
      prevStep--;
    }
    
    if (prevStep >= 0) {
      logger.debug('✅ [AuctionWizard] Voltando para step:', {
        from: currentStep,
        to: prevStep,
        stepName: steps[prevStep]?.title
      });
      setCurrentStep(prevStep);
    }
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      if (onCancel) onCancel();
    }, 300); // Duração da animação de fade-out
  };

  const handleSubmit = async () => {
    // Prevenir múltiplos cliques
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      await onSubmit(values);
      clearDraft(); // Limpar rascunho após sucesso
      handleClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps = [
    {
      id: "basico",
      title: "Informações Básicas do Leilão",
      content: (() => {
        logger.debug('🎨 [AuctionWizard] Renderizando Step 0 (Informações Básicas):', {
          currentStep,
          valuesNome: values.nome,
          valuesIdentificacao: values.identificacao,
          valuesStatus: values.status,
          valuesQtdLotes: values.lotes?.length || 0
        });
        
        return (
          <div className="space-y-8">
          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">Como devemos chamar este leilão?</Label>
            <Input
              type="text"
              placeholder="Ex: Leilão Beneficente 2024"
              value={values.nome || ""}
              onChange={(e) => updateField("nome", e.target.value)}
              className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
            />
          </div>

          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">Qual o código de identificação?</Label>
            <Input
              type="text"
              placeholder="Ex: LEI-2024-001"
              value={values.identificacao || ""}
              onChange={(e) => updateField("identificacao", e.target.value)}
              className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
            />
          </div>
        </div>
        );
      })()
    },
    {
      id: "datas",
      title: "Datas do Leilão",
      content: (
        <div className="space-y-8">
          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">Quando o leilão começa?</Label>
            <StringDatePicker
              value={values.dataInicio || ""}
              onChange={(v) => updateField("dataInicio", v)}
              placeholder="Ex: 01/01/2024"
              className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent"
            />
          </div>

          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">Quando o leilão termina?</Label>
            <StringDatePicker
              value={values.dataEncerramento || ""}
              onChange={(v) => updateField("dataEncerramento", v)}
              placeholder="Ex: 31/12/2024"
              className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent"
            />
          </div>

          {dataInvalida && (
            <p className="mt-4 text-sm text-red-600">
              A data de início não pode ser posterior à data de término
            </p>
          )}
        </div>
      )
    },
    {
      id: "local",
      title: "Local e Modalidade",
      content: (
        <div className="space-y-8">
          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">Como será realizado?</Label>
            <Select
              value={values.local || ""}
              onValueChange={(v) => updateField("local", v)}
            >
              <SelectTrigger className="h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus:border-gray-800 focus-visible:ring-0 focus-visible:outline-none focus:outline-none active:outline-none outline-none ring-0 px-0 bg-transparent [&:focus]:ring-0 [&:active]:ring-0">
                <SelectValue placeholder="Ex: Presencial" />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={5} className="z-[100000]">
                <SelectItem value="presencial">Presencial</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="hibrido">Híbrido</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(values.local === "presencial" || values.local === "hibrido") && (
            <div className="space-y-3">
              <Label className="text-lg font-normal text-gray-600">Qual o endereço?</Label>
              <Input
                type="text"
                placeholder="Ex: Rua Principal, 123 - Centro"
                value={values.endereco || ""}
                onChange={(e) => updateField("endereco", e.target.value)}
                className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
              />
            </div>
          )}
        </div>
      )
    },
    {
      id: "status",
      title: "Status do Leilão",
      content: (
          <div className="space-y-3">
          <Label className="text-lg font-normal text-gray-600">Qual o status atual do leilão?</Label>
          <Select
            value={values.status || "agendado"}
            onValueChange={(v) => updateField("status", v)}
          >
            <SelectTrigger className="h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus:border-gray-800 focus-visible:ring-0 focus-visible:outline-none focus:outline-none active:outline-none outline-none ring-0 px-0 bg-transparent [&:focus]:ring-0 [&:active]:ring-0">
              <SelectValue placeholder="Ex: Agendado" />
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={5} className="z-[100000]">
              <SelectItem value="agendado">Agendado</SelectItem>
              <SelectItem value="em_andamento">Em Andamento</SelectItem>
              <SelectItem value="finalizado">Finalizado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )
    },
    {
      id: "lotes",
      title: "Configuração de Lotes",
      content: (
        <div className="space-y-6">
          {(values.lotes || []).length === 0 ? (
            <div className="space-y-4">
              <Label className="text-lg font-normal text-gray-600">
                Quantos lotes terá este leilão?
              </Label>
              <Button
                type="button"
                onClick={() => {
                  addLote();
                  setSelectedLoteIndex(0);
                }}
                variant="outline"
                className="w-full h-12 border-2 border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-700 hover:text-gray-900"
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Primeiro Lote
              </Button>
            </div>
          ) : (
            <>
              {/* Seletor de Lote */}
              <div className="space-y-3">
                <Label className="text-lg font-normal text-gray-600">Selecione o lote para editar</Label>
                <div className="flex items-center gap-3">
                  <Select
                    value={selectedLoteIndex.toString()}
                    onValueChange={(v) => {
                      setSelectedLoteIndex(parseInt(v));
                      setSelectedMercadoriaIndex(0);
                    }}
                  >
                    <SelectTrigger className="h-12 flex-1 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" sideOffset={5} className="z-[100000]">
                      {(values.lotes || []).map((lote, index) => (
                        <SelectItem key={lote.id} value={index.toString()}>
                          <div className="flex items-center gap-2">
                            <span>Lote {lote.numero} {lote.descricao ? `- ${lote.descricao.substring(0, 30)}...` : ""}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Button
                    type="button"
                    onClick={() => {
                      addLote();
                      setSelectedLoteIndex((values.lotes || []).length);
                    }}
                    variant="outline"
                    size="icon"
                    className="h-12 w-12 hover:bg-gray-100"
                  >
                    <Plus className="h-5 w-5 text-gray-900 hover:text-gray-900" />
                  </Button>
                </div>
                
                <p className="text-sm text-gray-500">
                  Total: {(values.lotes || []).length} lote(s)
                </p>
              </div>

              {/* Formulário do Lote Selecionado */}
              {values.lotes && values.lotes[selectedLoteIndex] && (
                <div className="p-6 border border-gray-200 rounded-lg space-y-6 bg-gray-50/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                    <h3 className="text-lg font-medium text-gray-900">
                      Lote {values.lotes[selectedLoteIndex].numero}
                    </h3>
                      {values.lotes[selectedLoteIndex].isConvidado && values.lotes[selectedLoteIndex].guestLotId && (
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                          ✓ Salvo em Lotes Convidados
                        </Badge>
                      )}
                    </div>
                    {(values.lotes || []).length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const updatedLotes = values.lotes?.filter((_, i) => i !== selectedLoteIndex);
                          updateField("lotes", updatedLotes);
                          setSelectedLoteIndex(Math.max(0, selectedLoteIndex - 1));
                        }}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <XIcon className="h-4 w-4 mr-1" />
                        Remover Lote
                      </Button>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-700">Número do Lote</Label>
                      <Input
                        type="text"
                        placeholder="Ex: 001"
                        value={values.lotes[selectedLoteIndex].numero || ""}
                        onChange={(e) => updateLote(selectedLoteIndex, "numero", e.target.value)}
                        className="h-12 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-black focus-visible:border-black"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-700">Descrição do Lote</Label>
                      <Textarea
                        placeholder="Ex: Touros Nelore PO"
                        value={values.lotes[selectedLoteIndex].descricao || ""}
                        onChange={(e) => updateLote(selectedLoteIndex, "descricao", e.target.value)}
                        className="min-h-[100px] focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-black focus-visible:border-black"
                      />
                    </div>

                    {/* Tipo de Lote */}
                    <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
                      <button
                        type="button"
                        onClick={() => updateLote(selectedLoteIndex, "isConvidado", false)}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${
                          !values.lotes[selectedLoteIndex].isConvidado
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
                          const currentLote = values.lotes?.[selectedLoteIndex];
                          if (currentLote) {
                            setLoteParaProprietario(currentLote);
                            setProprietarioWizardOpen(true);
                          }
                        }}
                        className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${
                          values.lotes[selectedLoteIndex].isConvidado
                            ? "bg-white text-gray-900 shadow-sm"
                            : "text-gray-600 hover:text-gray-900"
                        }`}
                      >
                        Convidado
                      </button>
                    </div>

                    {/* Seção de Imagens do Lote */}
                    <div className="space-y-4 pt-4 border-t border-gray-200">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium text-gray-700">Imagens do Lote</Label>
                        {values.lotes[selectedLoteIndex].imagens && values.lotes[selectedLoteIndex].imagens.length > 0 && (
                          <span className="text-xs text-gray-500">
                            {values.lotes[selectedLoteIndex].imagens.length} {values.lotes[selectedLoteIndex].imagens.length === 1 ? 'imagem' : 'imagens'}
                          </span>
          )}
        </div>
                      
                      {/* Upload Area */}
                      <label className="relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <ImageIcon className="w-8 h-8 mb-2 text-gray-400" />
                          <p className="text-sm text-gray-600 font-medium">Clique para adicionar imagens</p>
                          <p className="text-xs text-gray-400 mt-1">PNG, JPG ou WEBP</p>
              </div>
                        <Input
                          type="file"
                          accept="image/*"
                          multiple
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          onChange={async (e) => {
                            const files = Array.from(e.target.files || []);
                            if (files.length > 0) {
                              const currentImages = values.lotes?.[selectedLoteIndex]?.imagens || [];
                              
                              const newImages: string[] = [];
                              for (const file of files) {
                                try {
                                  await validateImageFile(file);
                                  const base64 = await new Promise<string>((resolve, reject) => {
                                    const reader = new FileReader();
                                    reader.onloadend = () => resolve(reader.result as string);
                                    reader.onerror = reject;
                                    reader.readAsDataURL(file);
                                  });
                                  newImages.push(base64);
                                } catch (error) {
                                  if (error instanceof FileValidationError) {
                                    logger.warn(`Imagem rejeitada (${file.name}):`, error.message);
                                  } else {
                                    logger.error(`Erro ao converter ${file.name}:`, error);
                                  }
                                }
                              }
                              
                              if (newImages.length > 0) {
                                updateLote(selectedLoteIndex, "imagens", [...currentImages, ...newImages]);
                              }
                            }
                          }}
                  />
                      </label>

                      {/* Preview Grid */}
                      {values.lotes[selectedLoteIndex].imagens && values.lotes[selectedLoteIndex].imagens.length > 0 && (
                        <div className="grid grid-cols-5 gap-3">
                          {values.lotes[selectedLoteIndex].imagens.map((img, imgIndex) => (
                            <div key={imgIndex} className="relative group aspect-square">
                              <img
                                src={img}
                                alt={`Imagem ${imgIndex + 1}`}
                                className="w-full h-full object-cover rounded-lg border border-gray-200"
                              />
                              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 rounded-lg transition-all" />
                              <button
                                type="button"
                                onClick={() => {
                                  const updatedImages = values.lotes?.[selectedLoteIndex]?.imagens?.filter((_, i) => i !== imgIndex) || [];
                                  updateLote(selectedLoteIndex, "imagens", updatedImages);
                        }}
                                className="absolute top-2 right-2 w-7 h-7 bg-white text-gray-700 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-50 hover:text-red-600"
                              >
                                <XIcon className="h-4 w-4" />
                              </button>
                    </div>
                          ))}
                        </div>
                      )}
                  </div>

                    {/* Seção de Mercadorias */}
                    <div className="space-y-4 pt-4 border-t border-gray-200">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium text-gray-700">Mercadorias do Lote</Label>
                        <button
                          type="button"
                          onClick={() => addMercadoriaToLote(selectedLoteIndex)}
                          className="w-8 h-8 flex items-center justify-center text-gray-900 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
                        >
                          <Plus className="h-5 w-5" />
                        </button>
                    </div>

                      {(!values.lotes[selectedLoteIndex].mercadorias || values.lotes[selectedLoteIndex].mercadorias?.length === 0) ? (
                        <p className="text-sm text-gray-400 py-4">Nenhuma mercadoria adicionada</p>
                      ) : (
                        <>
                          <div className="flex items-center gap-3">
                <Select
                              value={selectedMercadoriaIndex.toString()}
                              onValueChange={(v) => setSelectedMercadoriaIndex(parseInt(v))}
                >
                              <SelectTrigger className="h-12 flex-1 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0">
                                <SelectValue>
                                  {(() => {
                                    const merc = values.lotes[selectedLoteIndex].mercadorias?.[selectedMercadoriaIndex];
                                    const mercNum = String(selectedMercadoriaIndex + 1).padStart(3, '0');
                                    const titulo = merc?.titulo || "Nova Mercadoria";
                                    const displayText = `Mercadoria ${mercNum} - ${titulo}`;
                                    return displayText.length > 50 ? displayText.substring(0, 47) + "..." : displayText;
                                  })()}
                                </SelectValue>
                  </SelectTrigger>
                              <SelectContent position="popper" sideOffset={5} className="z-[100000]">
                                {values.lotes[selectedLoteIndex].mercadorias?.map((merc, index) => {
                                  const mercNum = String(index + 1).padStart(3, '0');
                                  const titulo = merc.titulo || "Nova Mercadoria";
                                  return (
                                    <SelectItem key={merc.id} value={index.toString()}>
                                      Mercadoria {mercNum} - {titulo}
                                    </SelectItem>
                                  );
                                })}
                  </SelectContent>
                </Select>

                            <button
                              type="button"
                              onClick={() => removeMercadoria(selectedLoteIndex, selectedMercadoriaIndex)}
                              className="w-12 h-12 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                      </div>

                          {values.lotes[selectedLoteIndex].mercadorias?.[selectedMercadoriaIndex] && (
                            <div className="space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="space-y-2">
                                <Label className="text-sm text-gray-600">Título da Mercadoria</Label>
                        <Input
                                  type="text"
                                  placeholder="Ex: Touro Nelore Registrado"
                                  value={values.lotes[selectedLoteIndex].mercadorias[selectedMercadoriaIndex].titulo || ""}
                                  onChange={(e) => updateMercadoria(selectedLoteIndex, selectedMercadoriaIndex, "titulo", e.target.value)}
                                  className="h-10 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-black focus-visible:border-black"
                      />
                      </div>

                      <div className="space-y-2">
                                <Label className="text-sm text-gray-600">Quantidade</Label>
                        <Input
                          type="number"
                                  placeholder="Ex: 10"
                                  min="1"
                                  value={values.lotes[selectedLoteIndex].mercadorias[selectedMercadoriaIndex].quantidade || ""}
                          onChange={(e) => {
                                    const valor = e.target.value === "" ? undefined : parseInt(e.target.value);
                                    updateMercadoria(selectedLoteIndex, selectedMercadoriaIndex, "quantidade", valor as number);
                          }}
                                  className="h-10 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-black focus-visible:border-black"
                        />
                                <p className="text-xs text-gray-500">Informe a quantidade de unidades desta mercadoria no lote</p>
                      </div>

                      <div className="space-y-2">
                                <Label className="text-sm text-gray-600">Descrição da Mercadoria</Label>
                                <Textarea
                                  placeholder="Ex: Touro da raça Nelore, 3 anos, peso aproximado 850kg, registro ABCZ"
                                  value={values.lotes[selectedLoteIndex].mercadorias[selectedMercadoriaIndex].descricao}
                                  onChange={(e) => updateMercadoria(selectedLoteIndex, selectedMercadoriaIndex, "descricao", e.target.value)}
                                  className="min-h-[80px] text-sm focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-black focus-visible:border-black"
                      />
                      </div>
                    </div>
                    )}
                </>
              )}
            </div>
                      </div>
                      </div>
              )}
            </>
          )}
        </div>
      )
    },
    {
      id: "custos",
      title: "Custos e Patrocínios",
      content: (
        <div className="space-y-10">
          {/* Seção de Custos */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <Label className="text-lg font-normal text-gray-600">Custos do leilão</Label>
              <button
                type="button"
                onClick={() => {
                  const newItem: ItemCustoInfo = {
                    id: Date.now().toString(),
                    descricao: "",
                    valor: "",
                    valorNumerico: 0
                  };
                  const newItems = [...costItems, newItem];
                  setCostItems(newItems);
                  updateField("detalheCustos", newItems);
                  setSelectedCostIndex(newItems.length - 1);
                }}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
            
            {costItems.length === 0 ? (
              <p className="text-sm text-gray-400 py-4">Nenhum custo adicionado</p>
            ) : (
              <>
                {/* Seletor de Custo */}
                <div className="flex items-center gap-3">
                  <Select
                    value={selectedCostIndex.toString()}
                    onValueChange={(v) => setSelectedCostIndex(parseInt(v))}
                  >
                    <SelectTrigger className="h-11 flex-1 border-gray-200 focus:ring-0 focus:outline-none focus-visible:ring-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" sideOffset={5} className="z-[100000]">
                      {costItems.map((item, index) => (
                        <SelectItem key={item.id} value={index.toString()}>
                          {item.descricao || `Custo ${index + 1}`} {item.valor ? `- R$ ${item.valor}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {costItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const newItems = costItems.filter((_, i) => i !== selectedCostIndex);
                        setCostItems(newItems);
                        updateField("detalheCustos", newItems);
                        updateField("custosNumerico", newItems.reduce((sum, i) => sum + i.valorNumerico, 0));
                        setSelectedCostIndex(Math.max(0, selectedCostIndex - 1));
                      }}
                      className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Formulário do Custo Selecionado */}
                {costItems[selectedCostIndex] && (
                  <div className="space-y-6 pt-2">
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500">Descrição</Label>
                      <Input
                        type="text"
                        placeholder="Ex: Transporte, Alimentação..."
                        value={costItems[selectedCostIndex].descricao}
                        onChange={(e) => {
                          const newItems = [...costItems];
                          newItems[selectedCostIndex].descricao = e.target.value;
                          setCostItems(newItems);
                          updateField("detalheCustos", newItems);
                        }}
                        className="wizard-input h-12 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500">Valor (R$)</Label>
                      <Input
                        type="text"
                        placeholder="Ex: 1.500,00"
                        value={costItems[selectedCostIndex].valor}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === "" || /^[\d.,]*$/.test(value)) {
                            const numericValue = parseCurrencyToNumber(value);
                            const newItems = [...costItems];
                            newItems[selectedCostIndex].valor = value;
                            newItems[selectedCostIndex].valorNumerico = numericValue;
                            setCostItems(newItems);
                            updateField("detalheCustos", newItems);
                            updateField("custosNumerico", newItems.reduce((sum, i) => sum + i.valorNumerico, 0));
                          }
                        }}
                        className="wizard-input h-12 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                      />
                    </div>
                  </div>
                )}

                {/* Total de Custos */}
                <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                  <span className="text-sm text-gray-400">{costItems.length} {costItems.length === 1 ? 'custo' : 'custos'}</span>
                  <span className="text-sm font-medium text-gray-700">
                    Total: {costItems.reduce((sum, item) => sum + item.valorNumerico, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Seção de Patrocínios */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <Label className="text-lg font-normal text-gray-600">Patrocínios do leilão</Label>
              <button
                type="button"
                onClick={() => {
                  const newItem: ItemPatrocinioInfo = {
                    id: Date.now().toString(),
                    nomePatrocinador: "",
                    valor: "",
                    valorNumerico: 0,
                    formaPagamento: 'a_vista' // Define À Vista como padrão
                  };
                  const newItems = [...sponsorItems, newItem];
                  setSponsorItems(newItems);
                  updateField("detalhePatrocinios", newItems);
                  setSelectedSponsorIndex(newItems.length - 1);
                }}
                className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
            
            {sponsorItems.length === 0 ? (
              <p className="text-sm text-gray-400 py-4">Nenhum patrocinador adicionado</p>
            ) : (
              <>
                {/* Seletor de Patrocinador */}
                <div className="flex items-center gap-3">
                  <Select
                    value={selectedSponsorIndex.toString()}
                    onValueChange={(v) => setSelectedSponsorIndex(parseInt(v))}
                  >
                    <SelectTrigger className="h-11 flex-1 border-gray-200 focus:ring-0 focus:outline-none focus-visible:ring-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" sideOffset={5} className="z-[100000]">
                      {sponsorItems.map((item, index) => (
                        <SelectItem key={item.id} value={index.toString()}>
                          {item.nomePatrocinador || `Patrocinador ${index + 1}`} {item.valor ? `- R$ ${item.valor}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {sponsorItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const newItems = sponsorItems.filter((_, i) => i !== selectedSponsorIndex);
                        setSponsorItems(newItems);
                        updateField("detalhePatrocinios", newItems);
                        updateField("patrociniosTotal", newItems.reduce((sum, i) => sum + i.valorNumerico, 0));
                        setSelectedSponsorIndex(Math.max(0, selectedSponsorIndex - 1));
                      }}
                      className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Formulário do Patrocinador Selecionado */}
                {sponsorItems[selectedSponsorIndex] && (
                  <div className="space-y-6 pt-2">
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500">Nome do patrocinador</Label>
                      <Input
                        type="text"
                        placeholder="Ex: Empresa ABC, João Silva..."
                        value={sponsorItems[selectedSponsorIndex].nomePatrocinador}
                        onChange={(e) => {
                          const newItems = [...sponsorItems];
                          newItems[selectedSponsorIndex].nomePatrocinador = e.target.value;
                          setSponsorItems(newItems);
                          updateField("detalhePatrocinios", newItems);
                        }}
                        className="wizard-input h-12 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500">Valor (R$)</Label>
                      <Input
                        type="text"
                        placeholder="Ex: 5.000,00"
                        value={sponsorItems[selectedSponsorIndex].valor}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === "" || /^[\d.,]*$/.test(value)) {
                            const numericValue = parseCurrencyToNumber(value);
                            const newItems = [...sponsorItems];
                            newItems[selectedSponsorIndex].valor = value;
                            newItems[selectedSponsorIndex].valorNumerico = numericValue;
                            setSponsorItems(newItems);
                            updateField("detalhePatrocinios", newItems);
                            updateField("patrociniosTotal", newItems.reduce((sum, i) => sum + i.valorNumerico, 0));
                          }
                        }}
                        className="wizard-input h-12 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                      />
                    </div>
                  </div>
                )}

                {/* Total de Patrocínios */}
                <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                  <span className="text-sm text-gray-400">{sponsorItems.length} {sponsorItems.length === 1 ? 'patrocinador' : 'patrocinadores'}</span>
                  <span className="text-sm font-medium text-gray-700">
                    Total: {sponsorItems.reduce((sum, item) => sum + item.valorNumerico, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )
    },
    {
      id: "pagamento-patrocinios",
      title: "Pagamento dos Patrocinadores",
      content: (
        <div className="space-y-8">
          <div className="space-y-4">
            <Label className="text-lg font-normal text-gray-600">Configure a forma de pagamento dos patrocínios</Label>
          </div>

          {/* Lista de Patrocinadores */}
          {sponsorItems.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p>Nenhum patrocinador cadastrado ainda.</p>
              <p className="text-sm mt-2">Adicione patrocinadores na etapa anterior.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Seletor de Patrocinador */}
              <div className="space-y-3">
                <Label className="text-lg font-normal text-gray-600">Selecione o Patrocinador</Label>
                <Select
                  value={selectedSponsorIndex.toString()}
                  onValueChange={(value) => setSelectedSponsorIndex(parseInt(value))}
                >
                  <SelectTrigger className="h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus:border-gray-800 focus-visible:ring-0 focus-visible:outline-none focus:outline-none active:outline-none outline-none ring-0 px-0 bg-transparent [&:focus]:ring-0 [&:active]:ring-0">
                    <SelectValue placeholder="Selecione um patrocinador" />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={5} className="bg-white z-[100000]">
                    {sponsorItems.map((sponsor, index) => (
                      <SelectItem key={sponsor.id} value={index.toString()}>
                        {sponsor.nomePatrocinador} - {sponsor.valorNumerico.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Formulário do Patrocinador Selecionado */}
              {sponsorItems[selectedSponsorIndex] && (
                <div className="space-y-8">
                  {/* Valor de referência do patrocínio */}
                  <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 flex items-center justify-between">
                    <span className="text-sm text-gray-600">Valor do patrocínio</span>
                    <span className="text-lg font-semibold text-gray-900">
                      {sponsorItems[selectedSponsorIndex].valorNumerico.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>

                  {/* Forma de Pagamento */}
                  <div className="space-y-3">
                    <Label className="text-lg font-normal text-gray-600">Como deseja pagar?</Label>
                    <Select
                      value={sponsorItems[selectedSponsorIndex].formaPagamento || 'a_vista'}
                      onValueChange={(value: 'a_vista' | 'parcelamento' | 'entrada_parcelamento') => {
                        const newItems = [...sponsorItems];
                        newItems[selectedSponsorIndex].formaPagamento = value;
                        
                        // Limpar campos ao trocar forma de pagamento
                        if (value === 'a_vista') {
                          newItems[selectedSponsorIndex].valorLance = undefined;
                          newItems[selectedSponsorIndex].valorLanceNumerico = undefined;
                          newItems[selectedSponsorIndex].fatorMultiplicador = undefined;
                          newItems[selectedSponsorIndex].parcelasTriplas = undefined;
                          newItems[selectedSponsorIndex].parcelasDuplas = undefined;
                          newItems[selectedSponsorIndex].parcelasSimples = undefined;
                          newItems[selectedSponsorIndex].valorEntrada = undefined;
                          newItems[selectedSponsorIndex].valorEntradaNumerico = undefined;
                        } else if (value === 'parcelamento') {
                          newItems[selectedSponsorIndex].valorEntrada = undefined;
                          newItems[selectedSponsorIndex].valorEntradaNumerico = undefined;
                          newItems[selectedSponsorIndex].dataEntrada = undefined;
                        }
                        
                        newItems[selectedSponsorIndex].recebido = false;
                        newItems[selectedSponsorIndex].parcelasRecebidas = 0;
                        setSponsorItems(newItems);
                        updateField("detalhePatrocinios", newItems);
                      }}
                    >
                      <SelectTrigger className="h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus:border-gray-800 focus-visible:ring-0 focus-visible:outline-none focus:outline-none active:outline-none outline-none ring-0 px-0 bg-transparent [&:focus]:ring-0 [&:active]:ring-0">
                        <SelectValue placeholder="Selecione a forma" />
                      </SelectTrigger>
                      <SelectContent position="popper" sideOffset={5} className="bg-white z-[100000]">
                        <SelectItem value="a_vista">À Vista</SelectItem>
                        <SelectItem value="parcelamento">Parcelamento</SelectItem>
                        <SelectItem value="entrada_parcelamento">Entrada + Parcelamento</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* À Vista */}
                  {(sponsorItems[selectedSponsorIndex].formaPagamento === 'a_vista' || !sponsorItems[selectedSponsorIndex].formaPagamento) && (
                    <div className="space-y-3">
                      <Label className="text-lg font-normal text-gray-600">Data de Pagamento</Label>
                      <StringDatePicker
                        value={sponsorItems[selectedSponsorIndex].dataVencimentoVista || ""}
                        onChange={(v) => {
                          const newItems = [...sponsorItems];
                          newItems[selectedSponsorIndex].dataVencimentoVista = v;
                          setSponsorItems(newItems);
                          updateField("detalhePatrocinios", newItems);
                        }}
                        placeholder="Selecione a data"
                        className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent"
                      />
                    </div>
                  )}

                  {/* Entrada + Parcelamento */}
                  {sponsorItems[selectedSponsorIndex].formaPagamento === 'entrada_parcelamento' && (
                    <>
                      <div className="space-y-3">
                        <Label className="text-lg font-normal text-gray-600">Valor da Entrada</Label>
                        <Input
                          type="text"
                          placeholder="Ex: R$ 5.000,00"
                          value={sponsorItems[selectedSponsorIndex].valorEntrada || ''}
                          onChange={(e) => {
                            const newItems = [...sponsorItems];
                            newItems[selectedSponsorIndex].valorEntrada = e.target.value;
                            newItems[selectedSponsorIndex].valorEntradaNumerico = parseBrazilianNumber(e.target.value) || 0;
                            setSponsorItems(newItems);
                            updateField("detalhePatrocinios", newItems);
                          }}
                          className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                        />
                      </div>

                      <div className="space-y-3">
                        <Label className="text-lg font-normal text-gray-600">Data de pagamento da entrada</Label>
                        <StringDatePicker
                          value={sponsorItems[selectedSponsorIndex].dataEntrada || ""}
                          onChange={(v) => {
                            const newItems = [...sponsorItems];
                            newItems[selectedSponsorIndex].dataEntrada = v;
                            setSponsorItems(newItems);
                            updateField("detalhePatrocinios", newItems);
                          }}
                          placeholder="Selecione a data"
                          className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent"
                        />
                      </div>
                    </>
                  )}

                  {/* Sistema de Fator Multiplicador - Para parcelamento e entrada_parcelamento */}
                  {(sponsorItems[selectedSponsorIndex].formaPagamento === 'parcelamento' || 
                    sponsorItems[selectedSponsorIndex].formaPagamento === 'entrada_parcelamento') && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-3">
                          <Label className="text-lg font-normal text-gray-600">Valor da Parcela (R$)</Label>
                          <Input
                            type="text"
                            placeholder="Ex: 1.000,00"
                            value={sponsorItems[selectedSponsorIndex].valorLance || ""}
                            onChange={(e) => {
                              const newItems = [...sponsorItems];
                              newItems[selectedSponsorIndex].valorLance = e.target.value;
                              newItems[selectedSponsorIndex].valorLanceNumerico = parseBrazilianNumber(e.target.value) || 0;
                              setSponsorItems(newItems);
                              updateField("detalhePatrocinios", newItems);
                            }}
                            className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                          />
                          {sponsorItems[selectedSponsorIndex].valorLance && (() => {
                            const parsed = parseBrazilianNumber(sponsorItems[selectedSponsorIndex].valorLance || '');
                            if (parsed !== undefined && parsed <= 0) {
                              return (
                                <p className="text-sm text-red-600 flex items-center gap-1">
                                  <AlertCircle className="h-4 w-4" />
                                  O valor da parcela deve ser maior que zero
                                </p>
                              );
                            }
                            return null;
                          })()}
                        </div>

                        <div className="space-y-3">
                          <Label className="text-lg font-normal text-gray-600">Fator Multiplicador</Label>
                          <Input
                            type="text"
                            placeholder="Ex: 30"
                            value={sponsorItems[selectedSponsorIndex].fatorMultiplicador || ""}
                            onChange={(e) => {
                              const newItems = [...sponsorItems];
                              newItems[selectedSponsorIndex].fatorMultiplicador = parseBrazilianNumber(e.target.value);
                              setSponsorItems(newItems);
                              updateField("detalhePatrocinios", newItems);
                            }}
                            className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                          />
                          {sponsorItems[selectedSponsorIndex].fatorMultiplicador && (() => {
                            const fator = sponsorItems[selectedSponsorIndex].fatorMultiplicador;
                            if (fator !== undefined && fator <= 0) {
                              return (
                                <p className="text-sm text-red-600 flex items-center gap-1">
                                  <AlertCircle className="h-4 w-4" />
                                  O fator multiplicador deve ser maior que zero
                                </p>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>

                      {/* Preview do Valor Total com validação contra valor do patrocínio */}
                      {sponsorItems[selectedSponsorIndex].valorLance && 
                       sponsorItems[selectedSponsorIndex].fatorMultiplicador && (() => {
                        const valorLanceParsed = parseBrazilianNumber(sponsorItems[selectedSponsorIndex].valorLance || '');
                        const fatorParsed = sponsorItems[selectedSponsorIndex].fatorMultiplicador;
                        if (valorLanceParsed && fatorParsed && valorLanceParsed > 0 && fatorParsed > 0) {
                          const valorTotalParcelas = calcularValorTotal(valorLanceParsed, fatorParsed);
                          const valorEntrada = sponsorItems[selectedSponsorIndex].valorEntradaNumerico || 0;
                          const valorTotalPagamento = valorTotalParcelas + valorEntrada;
                          const valorPatrocinio = sponsorItems[selectedSponsorIndex].valorNumerico;
                          const diferenca = Math.abs(valorTotalPagamento - valorPatrocinio);
                          const totalBate = diferenca < 0.01;
                          
                          return (
                            <div className="space-y-2 text-sm text-gray-600">
                              <div className="flex justify-between font-medium text-gray-900 pt-1">
                                <span>Total das Parcelas</span>
                                <span>
                                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valorTotalParcelas)}
                                </span>
                              </div>
                              {sponsorItems[selectedSponsorIndex].formaPagamento === 'entrada_parcelamento' && valorEntrada > 0 && (
                                <div className="flex justify-between text-gray-600">
                                  <span>Entrada</span>
                                  <span>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valorEntrada)}</span>
                                </div>
                              )}
                              <div className={`flex justify-between font-semibold pt-1 border-t ${totalBate ? 'text-green-700' : 'text-red-600'}`}>
                                <span>Total do Pagamento</span>
                                <span>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valorTotalPagamento)}</span>
                              </div>
                              {!totalBate && (
                                <p className="text-xs text-red-500 flex items-center gap-1.5">
                                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                                  {valorTotalPagamento > valorPatrocinio
                                    ? `Excede o valor do patrocínio em ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(diferenca)}`
                                    : `Faltam ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(diferenca)} para atingir o valor do patrocínio`
                                  }
                                </p>
                              )}
                              {totalBate && (
                                <p className="text-xs text-green-600 flex items-center gap-1.5">
                                  <Check className="h-3.5 w-3.5 flex-shrink-0" />
                                  Valor do pagamento confere com o patrocínio
                                </p>
                              )}
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {/* Configuração de Parcelas */}
                      <div className="space-y-4">
                        <Label className="text-lg font-normal text-gray-900">Configuração de Parcelas</Label>
                        
                        <div className="grid grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm text-gray-600">Parcelas Triplas</Label>
                            <Input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={sponsorItems[selectedSponsorIndex].parcelasTriplas || ""}
                              onChange={(e) => {
                                const newItems = [...sponsorItems];
                                const value = e.target.value === "" ? undefined : parseInt(e.target.value);
                                newItems[selectedSponsorIndex].parcelasTriplas = value;
                                
                                // Atualizar total de parcelas
                                const triplas = value || 0;
                                const duplas = newItems[selectedSponsorIndex].parcelasDuplas || 0;
                                const simples = newItems[selectedSponsorIndex].parcelasSimples || 0;
                                newItems[selectedSponsorIndex].parcelas = triplas + duplas + simples;
                                
                                setSponsorItems(newItems);
                                updateField("detalhePatrocinios", newItems);
                              }}
                              className="h-12 text-sm focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-black focus-visible:border-black"
                            />
                            <p className="text-xs text-gray-400">Valor × 3</p>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-sm text-gray-600">Parcelas Duplas</Label>
                            <Input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={sponsorItems[selectedSponsorIndex].parcelasDuplas || ""}
                              onChange={(e) => {
                                const newItems = [...sponsorItems];
                                const value = e.target.value === "" ? undefined : parseInt(e.target.value);
                                newItems[selectedSponsorIndex].parcelasDuplas = value;
                                
                                // Atualizar total de parcelas
                                const triplas = newItems[selectedSponsorIndex].parcelasTriplas || 0;
                                const duplas = value || 0;
                                const simples = newItems[selectedSponsorIndex].parcelasSimples || 0;
                                newItems[selectedSponsorIndex].parcelas = triplas + duplas + simples;
                                
                                setSponsorItems(newItems);
                                updateField("detalhePatrocinios", newItems);
                              }}
                              className="h-12 text-sm focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-black focus-visible:border-black"
                            />
                            <p className="text-xs text-gray-400">Valor × 2</p>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-sm text-gray-600">Parcelas Simples</Label>
                            <Input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={sponsorItems[selectedSponsorIndex].parcelasSimples || ""}
                              onChange={(e) => {
                                const newItems = [...sponsorItems];
                                const value = e.target.value === "" ? undefined : parseInt(e.target.value);
                                newItems[selectedSponsorIndex].parcelasSimples = value;
                                
                                // Atualizar total de parcelas
                                const triplas = newItems[selectedSponsorIndex].parcelasTriplas || 0;
                                const duplas = newItems[selectedSponsorIndex].parcelasDuplas || 0;
                                const simples = value || 0;
                                newItems[selectedSponsorIndex].parcelas = triplas + duplas + simples;
                                
                                setSponsorItems(newItems);
                                updateField("detalhePatrocinios", newItems);
                              }}
                              className="h-12 text-sm focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-black focus-visible:border-black"
                            />
                            <p className="text-xs text-gray-400">Valor × 1</p>
                          </div>
                        </div>

                        {/* Validação de compatibilidade das parcelas */}
                        {sponsorItems[selectedSponsorIndex].valorLance && 
                         sponsorItems[selectedSponsorIndex].fatorMultiplicador && (() => {
                          const fatorParsed = sponsorItems[selectedSponsorIndex].fatorMultiplicador;
                          if (!fatorParsed) return null;
                          
                          const triplas = sponsorItems[selectedSponsorIndex].parcelasTriplas || 0;
                          const duplas = sponsorItems[selectedSponsorIndex].parcelasDuplas || 0;
                          const simples = sponsorItems[selectedSponsorIndex].parcelasSimples || 0;
                          const totalParcelas = triplas + duplas + simples;
                          const somaCalculada = (triplas * 3) + (duplas * 2) + (simples * 1);
                          
                          if (totalParcelas > 0 && somaCalculada !== fatorParsed) {
                            return (
                              <p className="text-xs text-red-500 flex items-center gap-1.5">
                                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                                Soma ({somaCalculada}) ≠ fator ({fatorParsed}). Ajuste para (T×3) + (D×2) + (S×1) = {fatorParsed}
                              </p>
                            );
                          }

                          if (totalParcelas > 0 && somaCalculada === fatorParsed) {
                            return (
                              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                                <Check className="h-3.5 w-3.5 flex-shrink-0 text-green-500" />
                                {totalParcelas} {totalParcelas === 1 ? 'parcela' : 'parcelas'} — fator {fatorParsed}
                              </p>
                            );
                          }

                          return null;
                        })()}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )
    },
    {
      id: "dia-vencimento-patrocinios",
      title: "Dia do Vencimento",
      show: sponsorItems.length > 0 && sponsorItems.some(s => s.formaPagamento === 'parcelamento' || s.formaPagamento === 'entrada_parcelamento'),
      content: (
        <div className="space-y-8">
          {sponsorItems.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p>Nenhum patrocinador cadastrado ainda.</p>
            </div>
          ) : (
            <>
              {/* Seletor de Patrocinador */}
              <div className="space-y-3">
                <Label className="text-lg font-normal text-gray-600">Selecione o Patrocinador</Label>
                <Select
                  value={selectedSponsorIndex.toString()}
                  onValueChange={(value) => setSelectedSponsorIndex(parseInt(value))}
                >
                  <SelectTrigger className="h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus:border-gray-800 focus-visible:ring-0 focus-visible:outline-none focus:outline-none active:outline-none outline-none ring-0 px-0 bg-transparent [&:focus]:ring-0 [&:active]:ring-0">
                    <SelectValue placeholder="Selecione um patrocinador" />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={5} className="bg-white z-[100000]">
                    {sponsorItems
                      .filter(s => s.formaPagamento === 'parcelamento' || s.formaPagamento === 'entrada_parcelamento')
                      .map((sponsor, _index) => {
                        const originalIndex = sponsorItems.indexOf(sponsor);
                        return (
                          <SelectItem key={sponsor.id} value={originalIndex.toString()}>
                            {sponsor.nomePatrocinador}
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
              </div>

              {/* Formulário do Patrocinador Selecionado */}
              {sponsorItems[selectedSponsorIndex] && 
               (sponsorItems[selectedSponsorIndex].formaPagamento === 'parcelamento' || 
                sponsorItems[selectedSponsorIndex].formaPagamento === 'entrada_parcelamento') && (
                <div className="space-y-3">
                  <Label className="text-lg font-normal text-gray-600">Dia do vencimento mensal</Label>
                  <p className="text-sm text-gray-500 -mt-1">Este dia será usado automaticamente para o início do pagamento</p>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    placeholder="Ex: 15"
                    value={sponsorItems[selectedSponsorIndex].diaVencimentoMensal || ""}
                    onChange={(e) => {
                      const inputValue = e.target.value;
                      const newItems = [...sponsorItems];
                      
                      if (inputValue === "") {
                        newItems[selectedSponsorIndex].diaVencimentoMensal = undefined;
                        setSponsorItems(newItems);
                        updateField("detalhePatrocinios", newItems);
                        return;
                      }
                      
                      const numValue = parseInt(inputValue);
                      
                      if (!isNaN(numValue)) {
                        if (numValue < 1) {
                          newItems[selectedSponsorIndex].diaVencimentoMensal = 1;
                        } else if (numValue > 31) {
                          newItems[selectedSponsorIndex].diaVencimentoMensal = 31;
                        } else {
                          newItems[selectedSponsorIndex].diaVencimentoMensal = numValue;
                        }
                        setSponsorItems(newItems);
                        updateField("detalhePatrocinios", newItems);
                      }
                    }}
                    onBlur={(e) => {
                      if (!e.target.value || !sponsorItems[selectedSponsorIndex].diaVencimentoMensal) {
                        const newItems = [...sponsorItems];
                        newItems[selectedSponsorIndex].diaVencimentoMensal = 15;
                        setSponsorItems(newItems);
                        updateField("detalhePatrocinios", newItems);
                      }
                    }}
                    className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                  />
                  {sponsorItems[selectedSponsorIndex].diaVencimentoMensal && 
                   (sponsorItems[selectedSponsorIndex].diaVencimentoMensal < 1 || 
                    sponsorItems[selectedSponsorIndex].diaVencimentoMensal > 31) && (
                    <p className="text-sm text-red-600">
                      O dia deve estar entre 1 e 31.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )
    },
    {
      id: "data-inicio-patrocinios",
      title: "Data de Início",
      show: sponsorItems.length > 0 && sponsorItems.some(s => s.formaPagamento === 'parcelamento' || s.formaPagamento === 'entrada_parcelamento'),
      content: (
        <div className="space-y-8">
          {sponsorItems.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p>Nenhum patrocinador cadastrado ainda.</p>
            </div>
          ) : (
            <>
              {/* Seletor de Patrocinador */}
              <div className="space-y-3">
                <Label className="text-lg font-normal text-gray-600">Selecione o Patrocinador</Label>
                <Select
                  value={selectedSponsorIndex.toString()}
                  onValueChange={(value) => setSelectedSponsorIndex(parseInt(value))}
                >
                  <SelectTrigger className="h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus:border-gray-800 focus-visible:ring-0 focus-visible:outline-none focus:outline-none active:outline-none outline-none ring-0 px-0 bg-transparent [&:focus]:ring-0 [&:active]:ring-0">
                    <SelectValue placeholder="Selecione um patrocinador" />
                  </SelectTrigger>
                  <SelectContent position="popper" sideOffset={5} className="bg-white z-[100000]">
                    {sponsorItems
                      .filter(s => s.formaPagamento === 'parcelamento' || s.formaPagamento === 'entrada_parcelamento')
                      .map((sponsor, _index) => {
                        const originalIndex = sponsorItems.indexOf(sponsor);
                        return (
                          <SelectItem key={sponsor.id} value={originalIndex.toString()}>
                            {sponsor.nomePatrocinador}
                          </SelectItem>
                        );
                      })}
                  </SelectContent>
                </Select>
              </div>

              {/* Formulário do Patrocinador Selecionado */}
              {sponsorItems[selectedSponsorIndex] && 
               (sponsorItems[selectedSponsorIndex].formaPagamento === 'parcelamento' || 
                sponsorItems[selectedSponsorIndex].formaPagamento === 'entrada_parcelamento') && (
                <div className="space-y-3">
                  <Label className="text-lg font-normal text-gray-600">Quando inicia o pagamento das parcelas?</Label>
                  <StringDatePicker
                    value={sponsorItems[selectedSponsorIndex].mesInicioPagamento || ""}
                    onChange={(v) => {
                      const newItems = [...sponsorItems];
                      if (v && newItems[selectedSponsorIndex].diaVencimentoMensal) {
                        const [ano, mes, dia] = v.split('-').map(Number);
                        
                        if (dia !== newItems[selectedSponsorIndex].diaVencimentoMensal) {
                          // Data incompatível - não atualizar
                          return;
                        }
                        
                        const novaData = new Date(ano, mes - 1, newItems[selectedSponsorIndex].diaVencimentoMensal);
                        const novaDataISO = novaData.toISOString().slice(0, 10);
                        newItems[selectedSponsorIndex].mesInicioPagamento = novaDataISO;
                      } else {
                        newItems[selectedSponsorIndex].mesInicioPagamento = v;
                      }
                      setSponsorItems(newItems);
                      updateField("detalhePatrocinios", newItems);
                    }}
                    placeholder="Ex: 01/01/2024"
                    className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent"
                  />
                  {sponsorItems[selectedSponsorIndex].mesInicioPagamento && (() => {
                    const [ano, mes, dia] = sponsorItems[selectedSponsorIndex].mesInicioPagamento.split('-').map(Number);
                    const dataInicio = new Date(ano, mes - 1, dia);
                    const hoje = new Date();
                    hoje.setHours(0, 0, 0, 0);
                    
                    if (dataInicio < hoje) {
                      return (
                        <p className="text-sm text-amber-600 flex items-center gap-1">
                          <AlertCircle className="h-4 w-4" />
                          A data de início está no passado
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}
            </>
          )}
        </div>
      )
    },
    {
      id: "comissao",
      title: "Comissão de Compra",
      content: (
        <div className="space-y-6">
          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">Qual a porcentagem de comissão de compra?</Label>
            <p className="text-sm text-gray-400 mb-4">
              Percentual adicional que cada arrematante pagará sobre o valor do lote arrematado. Este valor vai para a leiloeira e é repartido entre o assessor, o leiloeiro, etc.
            </p>
            <div className="relative">
              <span className="absolute right-0 top-1/2 transform -translate-y-1/2 text-base text-gray-400">
                %
              </span>
              <Input
                type="text"
                placeholder="Ex: 5"
                value={values.percentualComissaoLeiloeiro?.toString() || ""}
                onChange={(e) => {
                  const value = e.target.value;
                  // Permite apenas números e vírgula/ponto decimal
                  if (value === "" || /^[\d.,]*$/.test(value)) {
                    // Converte vírgula para ponto e parseia
                    const numericValue = value === "" ? undefined : parseFloat(value.replace(",", "."));
                    // Limita entre 0 e 100
                    if (numericValue === undefined || (numericValue >= 0 && numericValue <= 100)) {
                      updateField("percentualComissaoLeiloeiro", numericValue);
                    }
                  }
                }}
                className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none pl-0 pr-10 bg-transparent placeholder:text-gray-400"
              />
            </div>
            
            {values.percentualComissaoLeiloeiro && values.percentualComissaoLeiloeiro > 0 && (
              <p className="text-sm text-gray-500 mt-4">
                Cada arrematante pagará {values.percentualComissaoLeiloeiro}% a mais sobre o valor do lote arrematado
              </p>
            )}
          </div>
        </div>
      )
    },
    {
      id: "comissao-venda",
      title: "Comissão de Venda",
      content: (
        <div className="space-y-6">
          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">Qual a porcentagem de comissão de venda?</Label>
            <p className="text-sm text-gray-400 mb-4">
              A comissão de venda é aquela comissão que o dono do leilão ganha a mais por estar vendendo o lote de cada convidado.
            </p>
            <div className="relative">
              <span className="absolute right-0 top-1/2 transform -translate-y-1/2 text-base text-gray-400">
                %
              </span>
              <Input
                type="text"
                placeholder="Ex: 5"
                value={values.percentualComissaoVenda?.toString() || ""}
                onChange={(e) => {
                  const value = e.target.value;
                  // Permite apenas números e vírgula/ponto decimal
                  if (value === "" || /^[\d.,]*$/.test(value)) {
                    // Converte vírgula para ponto e parseia
                    const numericValue = value === "" ? undefined : parseFloat(value.replace(",", "."));
                    // Limita entre 0 e 100
                    if (numericValue === undefined || (numericValue >= 0 && numericValue <= 100)) {
                      updateField("percentualComissaoVenda", numericValue);
                    }
                  }
                }}
                className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none pl-0 pr-10 bg-transparent placeholder:text-gray-400"
              />
            </div>
            
            {values.percentualComissaoVenda && values.percentualComissaoVenda > 0 && (
              <p className="text-sm text-gray-500 mt-4">
                O dono do leilão receberá {values.percentualComissaoVenda}% sobre o valor de cada lote vendido do convidado
              </p>
            )}
          </div>
        </div>
      )
    },
  ];

  // Garantir que currentStep sempre aponta para uma etapa visível
  useEffect(() => {
    if (steps[currentStep]?.show === false) {
      // Se a etapa atual não deve ser mostrada, encontrar a próxima visível
      let nextVisibleStep = currentStep + 1;
      while (nextVisibleStep < steps.length && steps[nextVisibleStep].show === false) {
        nextVisibleStep++;
      }
      
      if (nextVisibleStep < steps.length) {
        setCurrentStep(nextVisibleStep);
      } else {
        // Se não há próxima visível, voltar para a anterior
        let prevVisibleStep = currentStep - 1;
        while (prevVisibleStep >= 0 && steps[prevVisibleStep].show === false) {
          prevVisibleStep--;
        }
        if (prevVisibleStep >= 0) {
          setCurrentStep(prevVisibleStep);
        }
      }
    }
  }, [currentStep, sponsorItems]); // Dependência em sponsorItems para reagir a mudanças

  const currentStepData = steps[currentStep];

    return createPortal(
      <div 
        className={`fixed inset-0 top-0 left-0 right-0 bottom-0 bg-white overflow-auto transition-opacity duration-300 ${
          isClosing ? 'opacity-0' : 'opacity-100'
        }`}
        style={{ 
          animation: isClosing ? 'none' : 'wizardFadeIn 0.3s ease-out', 
          margin: 0, 
          padding: 0,
          zIndex: 99999
        }}
      >
        {/* Botão Voltar/Fechar - Canto Superior Esquerdo */}
      <div className="fixed top-8 left-8 z-20">
        <Button
          variant="ghost"
          size="icon"
          onClick={currentStep === 0 ? handleClose : handleBack}
          className="rounded-full w-12 h-12 bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-700"
        >
          {currentStep === 0 ? (
            <XIcon className="h-6 w-6" />
          ) : (
            <ChevronLeft className="h-6 w-6" />
          )}
        </Button>
      </div>

      <div className="min-h-screen flex">
        {/* Indicadores de Etapas - Lateral Esquerda */}
        <div className="hidden md:flex flex-col justify-center w-80 px-12">
          <div className="space-y-4">
            {steps
              .map((step, index) => ({ step, index }))
              .filter(({ step }) => step.show !== false)
              .map(({ step, index }) => (
              <div
                key={index}
                onClick={() => goToStep(index)}
                className={`text-lg font-normal transition-colors duration-200 cursor-pointer hover:text-gray-600 ${
                  index === currentStep
                    ? "text-gray-700"
                    : index < currentStep
                    ? "text-gray-400"
                    : "text-gray-300"
                }`}
              >
                {step.title}
              </div>
            ))}
          </div>
        </div>

        {/* Conteúdo Principal */}
        <div className="flex-1 flex items-center justify-center px-8 md:px-20 py-16">
          <div className="w-full max-w-2xl space-y-12">
            {/* Título da Etapa */}
            <div>
              <h1 className="text-3xl md:text-4xl font-normal text-gray-900 leading-tight">
                {currentStepData.title}
              </h1>
            </div>

            {/* Conteúdo da Etapa */}
            <div>{currentStepData.content}</div>

            {/* Botão de Avançar */}
            <div className="pt-4">
              {currentStep < steps.length - 1 ? (
                <Button
                  onClick={handleNext}
                  className="w-full h-14 text-base font-normal bg-gray-700 hover:bg-gray-800 text-white rounded-lg transition-all duration-200"
                  size="lg"
                >
                  Avançar
                  <ChevronRight className="h-5 w-5 ml-2" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="w-full h-14 text-base font-normal bg-gray-800 hover:bg-gray-900 text-white rounded-lg transition-all duration-200"
                  size="lg"
                >
                  {isSubmitting ? "Salvando..." : "Concluir"}
                  {!isSubmitting && <Check className="h-5 w-5 ml-2" />}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

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
            const updatedLotes = [...(values.lotes || [])];
            const loteIndex = updatedLotes.findIndex(l => l.id === loteParaProprietario.id);
            if (loteIndex !== -1) {
              updatedLotes[loteIndex] = {
                ...updatedLotes[loteIndex],
                isConvidado: true,
                proprietario: data.proprietario,
                codigoPais: data.codigoPais,
                celularProprietario: data.celularProprietario,
                emailProprietario: data.emailProprietario,
                documentos: data.documentos,
              };
              updateField("lotes", updatedLotes);
            }
            setProprietarioWizardOpen(false);
            setLoteParaProprietario(null);
          }}
          onCancel={() => {
            setProprietarioWizardOpen(false);
            setLoteParaProprietario(null);
          }}
        />
      )}

      {/* Modal de Confirmação de Rascunho - Ultra Minimalista */}
      {showDraftModal && draftData && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-md flex items-center justify-center z-[100000] p-4 animate-in fade-in duration-300">
          <div className="max-w-md w-full space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Ícone de atenção */}
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-gray-600" />
              </div>
            </div>

            {/* Conteúdo */}
            <div className="text-center space-y-5">
              <p className="text-2xl font-normal text-gray-900">
                Você tem um rascunho salvo
              </p>
              {draftData.values.nome && (
                <h3 className="text-lg text-gray-600 font-normal px-4">
                  {draftData.values.nome}
                </h3>
              )}
            </div>
            
            {/* Botões com animação de troca de cor */}
            <div className="space-y-2 group">
              <button
                onClick={loadDraft}
                className="w-full py-4 text-lg text-gray-900 transition-all duration-300 ease-out group-hover:[&:not(:hover)]:text-gray-400"
              >
                Continuar editando
              </button>
              <button
                onClick={discardDraft}
                className="w-full py-4 text-lg text-gray-400 transition-all duration-300 ease-out hover:text-gray-900"
              >
                Começar do zero
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Indicador de Auto-Save - Minimalista e discreto */}
      {!isEditMode && isSaving && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/90 backdrop-blur-sm border border-gray-200/50 shadow-sm">
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
            <span className="text-xs text-gray-600 font-medium">Salvando</span>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

// Helper para formatar tempo relativo
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  
  if (diffSec < 10) return 'agora';
  if (diffSec < 60) return `há ${diffSec}s`;
  if (diffMin === 1) return 'há 1 min';
  if (diffMin < 60) return `há ${diffMin} min`;
  
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
