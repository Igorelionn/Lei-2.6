export type AuctionStatus = "agendado" | "em_andamento" | "finalizado";

export interface DocumentoInfo {
  id: string;
  nome: string;
  tipo: string; // tipo MIME do arquivo
  tamanho: number; // tamanho em bytes
  dataUpload: string; // ISO date
  url?: string; // URL do arquivo se armazenado
  categoria?: string; // categoria da foto (lote, mercadoria, etc.)
}

export interface ItemCustoInfo {
  id: string;
  descricao: string; // descrição do gasto (ex: "Transporte", "Alimentação")
  valor: string; // valor como string para preservar formatação
  valorNumerico: number; // valor numérico para cálculos
}

export interface ItemPatrocinioInfo {
  id: string;
  nomePatrocinador: string; // nome do patrocinador
  valor: string; // valor como string para preservar formatação
  valorNumerico: number; // valor numérico para cálculos
  recebido?: boolean; // indica se o patrocínio foi recebido
  formaPagamento?: 'a_vista' | 'parcelamento' | 'entrada_parcelamento'; // forma de pagamento do patrocínio
  
  // Campos para À Vista
  dataVencimentoVista?: string; // data de pagamento para À Vista
  
  // Campos para Entrada + Parcelamento
  valorEntrada?: string; // valor da entrada (como string)
  valorEntradaNumerico?: number; // valor da entrada numérico
  dataEntrada?: string; // data de pagamento da entrada
  
  // Campos para sistema de Fator Multiplicador (parcelamento e entrada_parcelamento)
  valorLance?: string; // valor do lance (como string)
  valorLanceNumerico?: number; // valor do lance numérico
  fatorMultiplicador?: number; // fator multiplicador
  parcelasTriplas?: number; // quantidade de parcelas triplas (valor × 3)
  parcelasDuplas?: number; // quantidade de parcelas duplas (valor × 2)
  parcelasSimples?: number; // quantidade de parcelas simples (valor × 1)
  mesInicioPagamento?: string; // mês de início do pagamento (YYYY-MM)
  diaVencimentoMensal?: number; // dia do mês para vencimento (1-31)
  
  // Controle de parcelas recebidas
  parcelas?: number; // total de parcelas calculadas
  parcelasRecebidas?: number; // quantidade de parcelas já recebidas
}

export interface MercadoriaInfo {
  id: string;
  titulo?: string; // título da mercadoria
  nome?: string; // nome personalizado da mercadoria (opcional)
  tipo?: string; // tipo de mercadoria (ex: Gado Nelore, Veículos)
  descricao: string; // descrição detalhada da mercadoria
  quantidade?: number; // quantidade de unidades da mercadoria
  valor?: string; // valor como string para preservar formatação (opcional para lotes de convidados)
  valorNumerico?: number; // valor numérico para cálculos (opcional para lotes de convidados)
  valorEstimado?: number; // valor estimado (para lotes de convidados)
}

export interface LoteInfo {
  id: string;
  numero: string; // número do lote (ex: "001", "002")
  descricao: string; // descrição do lote
  mercadorias: MercadoriaInfo[]; // mercadorias dentro do lote
  imagens?: string[]; // URLs ou caminhos das imagens do lote
  status?: 'disponivel' | 'arrematado' | 'arquivado'; // status do lote
  isConvidado?: boolean; // se o lote pertence a um convidado
  guestLotId?: string; // ID na tabela guest_lots (se já foi salvo como lote convidado)
  
  // Informações do proprietário (para lotes convidados)
  proprietario?: string; // Nome do proprietário
  codigoPais?: string; // Código do país (ex: '+55')
  celularProprietario?: string; // Celular do proprietário
  emailProprietario?: string; // E-mail do proprietário
  documentos?: string[]; // Documentos em base64
  
  // Configurações de pagamento específicas do lote (opcionais)
  tipoPagamento?: "a_vista" | "parcelamento" | "entrada_parcelamento"; // tipo de pagamento específico deste lote
  dataVencimentoVista?: string; // data completa para pagamento à vista (apenas para a_vista)
  dataEntrada?: string; // data completa para pagamento da entrada (apenas para entrada_parcelamento)
  mesInicioPagamento?: string; // Mês de início do pagamento (formato YYYY-MM ou MM)
  diaVencimentoMensal?: number; // dia do mês para vencimento mensal (1-31)
  diaVencimentoPadrao?: number; // dia padrão do mês para vencimentos (1-31)
  parcelasPadrao?: number; // quantidade padrão de parcelas para este lote
  quantidadeParcelas?: number; // quantidade de parcelas (compatibilidade)
  fatorMultiplicador?: number; // fator multiplicador para cálculo de valores
  percentualComissaoLeiloeiro?: number; // percentual de comissão do leiloeiro (ex: 10 para 10%)
}

export interface ArrematanteInfo {
  id?: string; // ID único do arrematante no banco de dados
  nome: string;
  documento?: string; // CPF/CNPJ do arrematante
  endereco?: string; // endereço completo do arrematante
  // Campos de endereço detalhados
  cep?: string; // CEP formatado
  rua?: string; // Nome da rua/avenida
  numero?: string; // Número do endereço
  complemento?: string; // Complemento (apto, sala, etc)
  bairro?: string; // Nome do bairro
  cidade?: string; // Nome da cidade
  estado?: string; // Sigla do estado (UF)
  email?: string; // email do arrematante
  telefone?: string; // telefone do arrematante
  loteId?: string; // ID do lote arrematado
  mercadoriaId?: string; // ID da mercadoria específica arrematada
  created_at?: string; // Data de criação do registro no banco
  tipoPagamento?: "a_vista" | "parcelamento" | "entrada_parcelamento"; // tipo de pagamento escolhido pelo arrematante
  valorPagar: string; // valor como string para preservar formatação
  valorPagarNumerico: number; // valor numérico para cálculos
  valorEntrada?: string; // valor da entrada para pagamentos com entrada + parcelamento
  diaVencimentoMensal: number; // dia do mês para vencimento (1-21)
  quantidadeParcelas: number; // número total de parcelas
  parcelasPagas?: number; // número de parcelas já pagas (padrão 0)
  mesInicioPagamento: string; // mês de início do pagamento (formato YYYY-MM)
  dataEntrada?: string; // data completa para pagamento da entrada (apenas para entrada_parcelamento)
  dataVencimentoVista?: string; // data completa para pagamento à vista (apenas para a_vista)
  pago?: boolean; // se está completamente quitado
  documentos?: DocumentoInfo[]; // informações completas dos documentos
  percentualJurosAtraso?: number; // percentual de juros por mês de atraso (0-100)
  tipoJurosAtraso?: "simples" | "composto"; // tipo de juros aplicado
  
  // Valores relacionados ao lance (apenas para parcelamento e entrada_parcelamento)
  valorLance?: number;            // Lance dado pelo arrematante
  fatorMultiplicador?: number;    // Fator usado no cálculo
  usaFatorMultiplicador?: boolean; // Se usa o sistema de fator
  
  // Configuração simplificada de parcelas
  parcelasTriplas?: number;     // Quantidade de parcelas triplas (valor × 3)
  parcelasDuplas?: number;      // Quantidade de parcelas duplas (valor × 2)
  parcelasSimples?: number;     // Quantidade de parcelas simples (valor × 1)
  
  // Comissão do leiloeiro
  percentualComissaoLeiloeiro?: number; // percentual de comissão do leiloeiro (ex: 10 para 10%)
}

export interface Auction {
  id: string;
  nome: string;
  identificacao?: string;
  local: "presencial" | "online" | "hibrido" | string;
  endereco?: string;
  dataInicio: string; // ISO date
  dataEncerramento?: string; // ISO date
  tipoPagamento?: "a_vista" | "parcelamento" | "entrada_parcelamento"; // tipo de pagamento
  mesInicioPagamento?: string; // Mês de início do pagamento (formato MM)
  diaVencimentoPadrao?: number; // dia padrão do mês para pagamentos (1-31)
  dataEntrada?: string; // data completa para pagamento da entrada (apenas para entrada_parcelamento)
  dataVencimentoVista?: string; // data completa para pagamento à vista (apenas para a_vista)
  parcelasPadrao?: number; // quantidade padrão de parcelas para novos arrematantes
  status: AuctionStatus;
  custos?: string; // custos como string para preservar formatação
  custosNumerico?: number; // custos numérico para cálculos
  detalheCustos?: ItemCustoInfo[]; // detalhamento dos custos
  detalhePatrocinios?: ItemPatrocinioInfo[]; // detalhamento dos patrocínios
  patrociniosTotal?: number; // total de patrocínios recebidos
  percentualComissaoLeiloeiro?: number; // percentual de comissão do leiloeiro (ex: 5 para 5%)
  lotes?: LoteInfo[]; // informações dos lotes do leilão
  fotosMercadoria?: DocumentoInfo[]; // fotos da mercadoria
  historicoNotas?: string[];
  arquivado?: boolean; // se o leilão foi arquivado
  arrematantes?: ArrematanteInfo[]; // array de arrematantes (suporta múltiplos por lote)
  arrematante?: ArrematanteInfo; // DEPRECATED: mantido para compatibilidade, use arrematantes[]
  documentos?: DocumentoInfo[]; // documentos do leilão
}

export interface Lot {
  id: string;
  auctionId: string;
  numero: string;
  descricao: string;
  valorInicial: number;
  incrementoLance: number;
  fotos?: string[];
  documentos?: DocumentoInfo[];
  certificados?: DocumentoInfo[];
  arrematanteId?: string; // filled após encerramento
}

export interface Bidder {
  id: string;
  nome: string;
  documento: string; // CPF/CNPJ
  telefone?: string;
  email?: string;
  endereco?: string;
}

export type InvoiceStatus = "em_aberto" | "pago" | "atrasado";

export interface Invoice {
  id: string;
  lotId: string;
  auctionId: string;
  arrematanteId: string;
  valorArremate: number;
  comissao?: number; // percentual 0-1 ou valor fixo; simplificar como valor fixo em reais
  custosAdicionais?: number; // frete, taxas, impostos
  valorLiquido: number;
  vencimento: string; // ISO date
  status: InvoiceStatus;
  pdfUrl?: string; // preenchido ao gerar PDF
}

export interface DomainState {
  auctions: Auction[];
  lots: Lot[];
  bidders: Bidder[];
  invoices: Invoice[];
}

// Interface para formulário de lotes de convidados
export interface LoteConvidadoFormData {
  id?: string; // Adicionado para edição
  numero: string;
  descricao: string;
  proprietario: string;
  codigoPais: string;
  celularProprietario: string;
  emailProprietario: string;
  mercadorias: MercadoriaInfo[];
  documentos?: string[]; // URLs ou nomes de arquivos de documentos
  imagens?: string[];
  leilaoId?: string;
  observacoes?: string;
}
