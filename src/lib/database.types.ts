export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      auctions: {
        Row: {
          arquivado: boolean | null
          created_at: string | null
          custos_numerico: number | null
          custos_texto: string | null
          data_encerramento: string | null
          data_entrada: string | null
          data_inicio: string
          data_vencimento_vista: string | null
          detalhe_custos: Json | null
          detalhe_patrocinios: Json | null
          dia_entrada: number | null
          dia_vencimento_padrao: number | null
          endereco: string | null
          historico_notas: string[] | null
          id: string
          identificacao: string | null
          local: Database["public"]["Enums"]["location_type"]
          lotes: Json | null
          mes_inicio_pagamento: string | null
          nome: string
          parcelas_padrao: number | null
          patrocinios_total: number | null
          percentual_comissao_leiloeiro: number | null
          percentual_comissao_venda: number | null
          status: Database["public"]["Enums"]["auction_status"] | null
          tipo_pagamento: string | null
          updated_at: string | null
        }
        Insert: {
          arquivado?: boolean | null
          created_at?: string | null
          custos_numerico?: number | null
          custos_texto?: string | null
          data_encerramento?: string | null
          data_entrada?: string | null
          data_inicio: string
          data_vencimento_vista?: string | null
          detalhe_custos?: Json | null
          detalhe_patrocinios?: Json | null
          dia_entrada?: number | null
          dia_vencimento_padrao?: number | null
          endereco?: string | null
          historico_notas?: string[] | null
          id?: string
          identificacao?: string | null
          local?: Database["public"]["Enums"]["location_type"]
          lotes?: Json | null
          mes_inicio_pagamento?: string | null
          nome: string
          parcelas_padrao?: number | null
          patrocinios_total?: number | null
          percentual_comissao_leiloeiro?: number | null
          percentual_comissao_venda?: number | null
          status?: Database["public"]["Enums"]["auction_status"] | null
          tipo_pagamento?: string | null
          updated_at?: string | null
        }
        Update: {
          arquivado?: boolean | null
          created_at?: string | null
          custos_numerico?: number | null
          custos_texto?: string | null
          data_encerramento?: string | null
          data_entrada?: string | null
          data_inicio?: string
          data_vencimento_vista?: string | null
          detalhe_custos?: Json | null
          detalhe_patrocinios?: Json | null
          dia_entrada?: number | null
          dia_vencimento_padrao?: number | null
          endereco?: string | null
          historico_notas?: string[] | null
          id?: string
          identificacao?: string | null
          local?: Database["public"]["Enums"]["location_type"]
          lotes?: Json | null
          mes_inicio_pagamento?: string | null
          nome?: string
          parcelas_padrao?: number | null
          patrocinios_total?: number | null
          percentual_comissao_leiloeiro?: number | null
          percentual_comissao_venda?: number | null
          status?: Database["public"]["Enums"]["auction_status"] | null
          tipo_pagamento?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      bidders: {
        Row: {
          arquivado: boolean | null
          auction_id: string | null
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          created_at: string | null
          data_entrada: string | null
          data_vencimento_vista: string | null
          dia_vencimento_mensal: number | null
          documento: string | null
          email: string | null
          endereco: string | null
          estado: string | null
          fator_multiplicador: number | null
          foto: string | null
          guest_lot_id: string | null
          id: string
          lote_id: string | null
          mercadoria_id: string | null
          mes_inicio_pagamento: string | null
          nome: string
          numero: string | null
          observacoes: string | null
          pago: boolean | null
          parcelas_duplas: number | null
          parcelas_especificas_pagas: string | null
          parcelas_pagas: number | null
          parcelas_simples: number | null
          parcelas_triplas: number | null
          percentual_juros_atraso: number | null
          quantidade_parcelas: number | null
          rua: string | null
          telefone: string | null
          tipo_juros_atraso: string | null
          tipo_pagamento: string | null
          updated_at: string | null
          usa_fator_multiplicador: boolean | null
          valor_entrada_numerico: number | null
          valor_entrada_texto: string | null
          valor_lance: number | null
          valor_pagar_numerico: number | null
          valor_pagar_texto: string | null
        }
        Insert: {
          arquivado?: boolean | null
          auction_id?: string | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          created_at?: string | null
          data_entrada?: string | null
          data_vencimento_vista?: string | null
          dia_vencimento_mensal?: number | null
          documento?: string | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          fator_multiplicador?: number | null
          foto?: string | null
          guest_lot_id?: string | null
          id?: string
          lote_id?: string | null
          mercadoria_id?: string | null
          mes_inicio_pagamento?: string | null
          nome: string
          numero?: string | null
          observacoes?: string | null
          pago?: boolean | null
          parcelas_duplas?: number | null
          parcelas_especificas_pagas?: string | null
          parcelas_pagas?: number | null
          parcelas_simples?: number | null
          parcelas_triplas?: number | null
          percentual_juros_atraso?: number | null
          quantidade_parcelas?: number | null
          rua?: string | null
          telefone?: string | null
          tipo_juros_atraso?: string | null
          tipo_pagamento?: string | null
          updated_at?: string | null
          usa_fator_multiplicador?: boolean | null
          valor_entrada_numerico?: number | null
          valor_entrada_texto?: string | null
          valor_lance?: number | null
          valor_pagar_numerico?: number | null
          valor_pagar_texto?: string | null
        }
        Update: {
          arquivado?: boolean | null
          auction_id?: string | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          created_at?: string | null
          data_entrada?: string | null
          data_vencimento_vista?: string | null
          dia_vencimento_mensal?: number | null
          documento?: string | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          fator_multiplicador?: number | null
          foto?: string | null
          guest_lot_id?: string | null
          id?: string
          lote_id?: string | null
          mercadoria_id?: string | null
          mes_inicio_pagamento?: string | null
          nome?: string
          numero?: string | null
          observacoes?: string | null
          pago?: boolean | null
          parcelas_duplas?: number | null
          parcelas_especificas_pagas?: string | null
          parcelas_pagas?: number | null
          parcelas_simples?: number | null
          parcelas_triplas?: number | null
          percentual_juros_atraso?: number | null
          quantidade_parcelas?: number | null
          rua?: string | null
          telefone?: string | null
          tipo_juros_atraso?: string | null
          tipo_pagamento?: string | null
          updated_at?: string | null
          usa_fator_multiplicador?: boolean | null
          valor_entrada_numerico?: number | null
          valor_entrada_texto?: string | null
          valor_lance?: number | null
          valor_pagar_numerico?: number | null
          valor_pagar_texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bidders_auction_id_fkey"
            columns: ["auction_id"]
            isOneToOne: false
            referencedRelation: "auctions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bidders_auction_id_fkey"
            columns: ["auction_id"]
            isOneToOne: false
            referencedRelation: "auctions_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bidders_guest_lot_id_fkey"
            columns: ["guest_lot_id"]
            isOneToOne: false
            referencedRelation: "guest_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          arquivado: boolean | null
          auction_id: string | null
          bidder_id: string | null
          categoria: Database["public"]["Enums"]["document_category"]
          created_at: string | null
          data_upload: string | null
          descricao: string | null
          id: string
          invoice_id: string | null
          lot_id: string | null
          merchandise_id: string | null
          nome: string
          storage_path: string | null
          tamanho: number | null
          tipo: Database["public"]["Enums"]["document_type"]
          updated_at: string | null
          url: string | null
        }
        Insert: {
          arquivado?: boolean | null
          auction_id?: string | null
          bidder_id?: string | null
          categoria?: Database["public"]["Enums"]["document_category"]
          created_at?: string | null
          data_upload?: string | null
          descricao?: string | null
          id?: string
          invoice_id?: string | null
          lot_id?: string | null
          merchandise_id?: string | null
          nome: string
          storage_path?: string | null
          tamanho?: number | null
          tipo: Database["public"]["Enums"]["document_type"]
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          arquivado?: boolean | null
          auction_id?: string | null
          bidder_id?: string | null
          categoria?: Database["public"]["Enums"]["document_category"]
          created_at?: string | null
          data_upload?: string | null
          descricao?: string | null
          id?: string
          invoice_id?: string | null
          lot_id?: string | null
          merchandise_id?: string | null
          nome?: string
          storage_path?: string | null
          tamanho?: number | null
          tipo?: Database["public"]["Enums"]["document_type"]
          updated_at?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_auction_id_fkey"
            columns: ["auction_id"]
            isOneToOne: false
            referencedRelation: "auctions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_auction_id_fkey"
            columns: ["auction_id"]
            isOneToOne: false
            referencedRelation: "auctions_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_bidder_id_fkey"
            columns: ["bidder_id"]
            isOneToOne: false
            referencedRelation: "bidders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_bidder_id_fkey"
            columns: ["bidder_id"]
            isOneToOne: false
            referencedRelation: "bidders_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_bidder_id_fkey"
            columns: ["bidder_id"]
            isOneToOne: false
            referencedRelation: "bidders_with_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_merchandise_id_fkey"
            columns: ["merchandise_id"]
            isOneToOne: false
            referencedRelation: "merchandise"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          arrematante_nome: string
          auction_id: string
          created_at: string | null
          data_envio: string | null
          email_destinatario: string
          erro: string | null
          id: string
          sucesso: boolean | null
          tipo_email: string
          updated_at: string | null
        }
        Insert: {
          arrematante_nome: string
          auction_id: string
          created_at?: string | null
          data_envio?: string | null
          email_destinatario: string
          erro?: string | null
          id?: string
          sucesso?: boolean | null
          tipo_email: string
          updated_at?: string | null
        }
        Update: {
          arrematante_nome?: string
          auction_id?: string
          created_at?: string | null
          data_envio?: string | null
          email_destinatario?: string
          erro?: string | null
          id?: string
          sucesso?: boolean | null
          tipo_email?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      guest_lot_merchandise: {
        Row: {
          created_at: string | null
          descricao: string
          guest_lot_id: string
          id: string
          nome: string
          quantidade: number
          updated_at: string | null
          valor_estimado: number | null
        }
        Insert: {
          created_at?: string | null
          descricao: string
          guest_lot_id: string
          id?: string
          nome: string
          quantidade?: number
          updated_at?: string | null
          valor_estimado?: number | null
        }
        Update: {
          created_at?: string | null
          descricao?: string
          guest_lot_id?: string
          id?: string
          nome?: string
          quantidade?: number
          updated_at?: string | null
          valor_estimado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_lot_merchandise_guest_lot_id_fkey"
            columns: ["guest_lot_id"]
            isOneToOne: false
            referencedRelation: "guest_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_lots: {
        Row: {
          arquivado: boolean | null
          celular_proprietario: string
          codigo_pais: string
          created_at: string | null
          descricao: string
          documentos: Json | null
          email_proprietario: string
          id: string
          imagens: Json | null
          leilao_id: string | null
          numero: string
          observacoes: string | null
          proprietario: string
          status: Database["public"]["Enums"]["guest_lot_status"] | null
          updated_at: string | null
        }
        Insert: {
          arquivado?: boolean | null
          celular_proprietario: string
          codigo_pais?: string
          created_at?: string | null
          descricao: string
          documentos?: Json | null
          email_proprietario: string
          id?: string
          imagens?: Json | null
          leilao_id?: string | null
          numero: string
          observacoes?: string | null
          proprietario: string
          status?: Database["public"]["Enums"]["guest_lot_status"] | null
          updated_at?: string | null
        }
        Update: {
          arquivado?: boolean | null
          celular_proprietario?: string
          codigo_pais?: string
          created_at?: string | null
          descricao?: string
          documentos?: Json | null
          email_proprietario?: string
          id?: string
          imagens?: Json | null
          leilao_id?: string | null
          numero?: string
          observacoes?: string | null
          proprietario?: string
          status?: Database["public"]["Enums"]["guest_lot_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guest_lots_leilao_id_fkey"
            columns: ["leilao_id"]
            isOneToOne: false
            referencedRelation: "auctions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_lots_leilao_id_fkey"
            columns: ["leilao_id"]
            isOneToOne: false
            referencedRelation: "auctions_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          arquivado: boolean | null
          auction_id: string
          bidder_id: string
          comissao: number | null
          created_at: string | null
          custos_adicionais: number | null
          data_pagamento: string | null
          data_vencimento: string
          id: string
          lot_id: string | null
          metodo_pagamento: string | null
          numero_fatura: string
          observacoes: string | null
          pdf_path: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          updated_at: string | null
          valor_arremate: number
          valor_liquido: number
        }
        Insert: {
          arquivado?: boolean | null
          auction_id: string
          bidder_id: string
          comissao?: number | null
          created_at?: string | null
          custos_adicionais?: number | null
          data_pagamento?: string | null
          data_vencimento: string
          id?: string
          lot_id?: string | null
          metodo_pagamento?: string | null
          numero_fatura: string
          observacoes?: string | null
          pdf_path?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          updated_at?: string | null
          valor_arremate: number
          valor_liquido: number
        }
        Update: {
          arquivado?: boolean | null
          auction_id?: string
          bidder_id?: string
          comissao?: number | null
          created_at?: string | null
          custos_adicionais?: number | null
          data_pagamento?: string | null
          data_vencimento?: string
          id?: string
          lot_id?: string | null
          metodo_pagamento?: string | null
          numero_fatura?: string
          observacoes?: string | null
          pdf_path?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          updated_at?: string | null
          valor_arremate?: number
          valor_liquido?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_auction_id_fkey"
            columns: ["auction_id"]
            isOneToOne: false
            referencedRelation: "auctions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_auction_id_fkey"
            columns: ["auction_id"]
            isOneToOne: false
            referencedRelation: "auctions_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_bidder_id_fkey"
            columns: ["bidder_id"]
            isOneToOne: false
            referencedRelation: "bidders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_bidder_id_fkey"
            columns: ["bidder_id"]
            isOneToOne: false
            referencedRelation: "bidders_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_bidder_id_fkey"
            columns: ["bidder_id"]
            isOneToOne: false
            referencedRelation: "bidders_with_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
        ]
      }
      lots: {
        Row: {
          arquivado: boolean | null
          auction_id: string
          bidder_id: string | null
          created_at: string | null
          descricao: string
          id: string
          incremento_lance: number | null
          merchandise_id: string | null
          numero: string
          observacoes: string | null
          status: string | null
          updated_at: string | null
          valor_arremate: number | null
          valor_inicial: number
        }
        Insert: {
          arquivado?: boolean | null
          auction_id: string
          bidder_id?: string | null
          created_at?: string | null
          descricao: string
          id?: string
          incremento_lance?: number | null
          merchandise_id?: string | null
          numero: string
          observacoes?: string | null
          status?: string | null
          updated_at?: string | null
          valor_arremate?: number | null
          valor_inicial: number
        }
        Update: {
          arquivado?: boolean | null
          auction_id?: string
          bidder_id?: string | null
          created_at?: string | null
          descricao?: string
          id?: string
          incremento_lance?: number | null
          merchandise_id?: string | null
          numero?: string
          observacoes?: string | null
          status?: string | null
          updated_at?: string | null
          valor_arremate?: number | null
          valor_inicial?: number
        }
        Relationships: [
          {
            foreignKeyName: "lots_auction_id_fkey"
            columns: ["auction_id"]
            isOneToOne: false
            referencedRelation: "auctions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_auction_id_fkey"
            columns: ["auction_id"]
            isOneToOne: false
            referencedRelation: "auctions_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_bidder_id_fkey"
            columns: ["bidder_id"]
            isOneToOne: false
            referencedRelation: "bidders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_bidder_id_fkey"
            columns: ["bidder_id"]
            isOneToOne: false
            referencedRelation: "bidders_complete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_bidder_id_fkey"
            columns: ["bidder_id"]
            isOneToOne: false
            referencedRelation: "bidders_with_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_merchandise_id_fkey"
            columns: ["merchandise_id"]
            isOneToOne: false
            referencedRelation: "merchandise"
            referencedColumns: ["id"]
          },
        ]
      }
      merchandise: {
        Row: {
          arquivado: boolean | null
          auction_id: string
          created_at: string | null
          descricao: string
          id: string
          numero_lote: string | null
          observacoes: string | null
          status: string | null
          tipo: string
          updated_at: string | null
          valor_numerico: number | null
          valor_texto: string | null
        }
        Insert: {
          arquivado?: boolean | null
          auction_id: string
          created_at?: string | null
          descricao: string
          id?: string
          numero_lote?: string | null
          observacoes?: string | null
          status?: string | null
          tipo: string
          updated_at?: string | null
          valor_numerico?: number | null
          valor_texto?: string | null
        }
        Update: {
          arquivado?: boolean | null
          auction_id?: string
          created_at?: string | null
          descricao?: string
          id?: string
          numero_lote?: string | null
          observacoes?: string | null
          status?: string | null
          tipo?: string
          updated_at?: string | null
          valor_numerico?: number | null
          valor_texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchandise_auction_id_fkey"
            columns: ["auction_id"]
            isOneToOne: false
            referencedRelation: "auctions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchandise_auction_id_fkey"
            columns: ["auction_id"]
            isOneToOne: false
            referencedRelation: "auctions_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      user_actions: {
        Row: {
          action_description: string
          action_type: string
          created_at: string | null
          id: string
          ip_address: unknown
          metadata: Json | null
          target_id: string | null
          target_type: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action_description: string
          action_type: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action_description?: string
          action_type?: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_logs: {
        Row: {
          activity_type: string
          created_at: string | null
          description: string | null
          id: string
          ip_address: unknown
          metadata: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string | null
          description?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string | null
          description?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_credentials: {
        Row: {
          created_at: string | null
          id: string
          password_hash: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          password_hash: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          password_hash?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_credentials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar: string | null
          can_create: boolean | null
          can_create_backup: boolean | null
          can_delete: boolean | null
          can_delete_backup: boolean | null
          can_edit: boolean | null
          can_edit_backup: boolean | null
          can_manage_users: boolean | null
          can_manage_users_backup: boolean | null
          created_at: string | null
          deactivated_at: string | null
          deactivated_by: string | null
          deactivation_reason: string | null
          display_name: string | null
          email: string
          first_login_at: string | null
          full_name: string | null
          id: string
          is_active: boolean | null
          is_online: boolean | null
          last_activity_at: string | null
          last_ip_address: unknown
          last_login_at: string | null
          last_user_agent: string | null
          login_count: number | null
          name: string
          phone: string | null
          registration_date: string | null
          role: string | null
          session_count: number | null
          updated_at: string | null
        }
        Insert: {
          avatar?: string | null
          can_create?: boolean | null
          can_create_backup?: boolean | null
          can_delete?: boolean | null
          can_delete_backup?: boolean | null
          can_edit?: boolean | null
          can_edit_backup?: boolean | null
          can_manage_users?: boolean | null
          can_manage_users_backup?: boolean | null
          created_at?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          display_name?: string | null
          email: string
          first_login_at?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          is_online?: boolean | null
          last_activity_at?: string | null
          last_ip_address?: unknown
          last_login_at?: string | null
          last_user_agent?: string | null
          login_count?: number | null
          name: string
          phone?: string | null
          registration_date?: string | null
          role?: string | null
          session_count?: number | null
          updated_at?: string | null
        }
        Update: {
          avatar?: string | null
          can_create?: boolean | null
          can_create_backup?: boolean | null
          can_delete?: boolean | null
          can_delete_backup?: boolean | null
          can_edit?: boolean | null
          can_edit_backup?: boolean | null
          can_manage_users?: boolean | null
          can_manage_users_backup?: boolean | null
          created_at?: string | null
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          display_name?: string | null
          email?: string
          first_login_at?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          is_online?: boolean | null
          last_activity_at?: string | null
          last_ip_address?: unknown
          last_login_at?: string | null
          last_user_agent?: string | null
          login_count?: number | null
          name?: string
          phone?: string | null
          registration_date?: string | null
          role?: string | null
          session_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_deactivated_by_fkey"
            columns: ["deactivated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      auctions_complete: {
        Row: {
          arquivado: boolean | null
          created_at: string | null
          custos_numerico: number | null
          custos_texto: string | null
          data_encerramento: string | null
          data_entrada: string | null
          data_inicio: string | null
          data_vencimento_vista: string | null
          detalhe_custos: Json | null
          detalhe_patrocinios: Json | null
          dia_entrada: number | null
          dia_vencimento_padrao: number | null
          endereco: string | null
          historico_notas: string[] | null
          id: string | null
          identificacao: string | null
          local: Database["public"]["Enums"]["location_type"] | null
          lotes: Json | null
          mes_inicio_pagamento: string | null
          nome: string | null
          parcelas_padrao: number | null
          patrocinios_total: number | null
          status: Database["public"]["Enums"]["auction_status"] | null
          tipo_pagamento: string | null
          total_arrecadado: number | null
          total_arrematantes: number | null
          total_lotes: number | null
          updated_at: string | null
        }
        Relationships: []
      }
      bidders_complete: {
        Row: {
          arquivado: boolean | null
          auction_id: string | null
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          created_at: string | null
          data_entrada: string | null
          data_vencimento_vista: string | null
          dia_vencimento_mensal: number | null
          documento: string | null
          email: string | null
          endereco: string | null
          estado: string | null
          fator_multiplicador: number | null
          foto: string | null
          id: string | null
          leilao_data_inicio: string | null
          leilao_nome: string | null
          lote_id: string | null
          mercadoria_id: string | null
          mes_inicio_pagamento: string | null
          nome: string | null
          numero: string | null
          observacoes: string | null
          pago: boolean | null
          parcelas_duplas: number | null
          parcelas_especificas_pagas: string | null
          parcelas_pagas: number | null
          parcelas_simples: number | null
          parcelas_triplas: number | null
          percentual_juros_atraso: number | null
          quantidade_parcelas: number | null
          rua: string | null
          telefone: string | null
          tipo_juros_atraso: string | null
          tipo_pagamento: string | null
          total_documentos: number | null
          updated_at: string | null
          usa_fator_multiplicador: boolean | null
          valor_entrada_numerico: number | null
          valor_entrada_texto: string | null
          valor_lance: number | null
          valor_pagar_numerico: number | null
          valor_pagar_texto: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bidders_auction_id_fkey"
            columns: ["auction_id"]
            isOneToOne: false
            referencedRelation: "auctions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bidders_auction_id_fkey"
            columns: ["auction_id"]
            isOneToOne: false
            referencedRelation: "auctions_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      bidders_with_status: {
        Row: {
          arquivado: boolean | null
          auction_id: string | null
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          created_at: string | null
          data_entrada: string | null
          data_vencimento_vista: string | null
          dia_vencimento_mensal: number | null
          documento: string | null
          email: string | null
          endereco: string | null
          estado: string | null
          fator_multiplicador: number | null
          foto: string | null
          id: string | null
          leilao_nome: string | null
          leilao_status: Database["public"]["Enums"]["auction_status"] | null
          lote_id: string | null
          mercadoria_id: string | null
          mes_inicio_pagamento: string | null
          nome: string | null
          numero: string | null
          observacoes: string | null
          pago: boolean | null
          parcelas_duplas: number | null
          parcelas_especificas_pagas: string | null
          parcelas_pagas: number | null
          parcelas_simples: number | null
          parcelas_triplas: number | null
          percentual_juros_atraso: number | null
          quantidade_parcelas: number | null
          rua: string | null
          saldo_restante: number | null
          status_pagamento: string | null
          telefone: string | null
          tipo_juros_atraso: string | null
          tipo_pagamento: string | null
          updated_at: string | null
          usa_fator_multiplicador: boolean | null
          valor_entrada_numerico: number | null
          valor_entrada_texto: string | null
          valor_lance: number | null
          valor_pagar_numerico: number | null
          valor_pagar_texto: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bidders_auction_id_fkey"
            columns: ["auction_id"]
            isOneToOne: false
            referencedRelation: "auctions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bidders_auction_id_fkey"
            columns: ["auction_id"]
            isOneToOne: false
            referencedRelation: "auctions_complete"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_stats: {
        Row: {
          arrematantes_pendentes: number | null
          faturas_atrasadas: number | null
          leiloes_ativos: number | null
          total_a_receber: number | null
          total_arrematantes: number | null
          total_custos: number | null
          total_leiloes: number | null
          total_recebido: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      calculate_auction_status: {
        Args: { data_encerramento: string; data_inicio: string }
        Returns: Database["public"]["Enums"]["auction_status"]
      }
      calculate_invoice_status: {
        Args: { data_pagamento: string; data_vencimento: string }
        Returns: Database["public"]["Enums"]["invoice_status"]
      }
      create_user_credentials: {
        Args: { user_email: string; user_password: string }
        Returns: string
      }
      create_user_password: {
        Args: { user_email: string; user_password: string }
        Returns: undefined
      }
      get_auctions_with_stats: {
        Args: never
        Returns: {
          arquivado: boolean
          created_at: string
          custos_numerico: number
          custos_texto: string
          data_encerramento: string
          data_inicio: string
          dia_vencimento_padrao: number
          endereco: string
          historico_notas: string
          id: string
          identificacao: string
          local: string
          mes_inicio_pagamento: number
          nome: string
          parcelas_padrao: number
          status: Database["public"]["Enums"]["auction_status"]
          total_arrematantes: number
          total_documentos: number
          total_lotes: number
          updated_at: string
          valor_total_arrecadado: number
        }[]
      }
      is_mercadoria_arrematada: {
        Args: {
          p_auction_id: string
          p_exclude_bidder_id?: string
          p_mercadoria_id: string
        }
        Returns: boolean
      }
      mark_user_offline: { Args: { user_email: string }; Returns: undefined }
      update_user_password: {
        Args: { new_password: string; user_email: string }
        Returns: boolean
      }
      verify_password: {
        Args: { user_email: string; user_password: string }
        Returns: boolean
      }
    }
    Enums: {
      auction_status: "agendado" | "em_andamento" | "finalizado"
      document_category:
        | "leilao_geral"
        | "leilao_fotos_mercadoria"
        | "arrematante_documentos"
        | "mercadoria_fotos"
        | "mercadoria_documentos"
        | "lote_fotos"
        | "lote_documentos"
        | "lote_certificados"
        | "fatura_pdf"
        | "outros"
      document_type:
        | "pdf"
        | "doc"
        | "docx"
        | "jpg"
        | "jpeg"
        | "png"
        | "gif"
        | "xlsx"
        | "xls"
        | "txt"
        | "outros"
      guest_lot_status: "disponivel" | "arrematado" | "arquivado"
      invoice_status: "em_aberto" | "pago" | "atrasado" | "cancelado"
      location_type: "presencial" | "online" | "hibrido"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      auction_status: ["agendado", "em_andamento", "finalizado"],
      document_category: [
        "leilao_geral",
        "leilao_fotos_mercadoria",
        "arrematante_documentos",
        "mercadoria_fotos",
        "mercadoria_documentos",
        "lote_fotos",
        "lote_documentos",
        "lote_certificados",
        "fatura_pdf",
        "outros",
      ],
      document_type: [
        "pdf",
        "doc",
        "docx",
        "jpg",
        "jpeg",
        "png",
        "gif",
        "xlsx",
        "xls",
        "txt",
        "outros",
      ],
      guest_lot_status: ["disponivel", "arrematado", "arquivado"],
      invoice_status: ["em_aberto", "pago", "atrasado", "cancelado"],
      location_type: ["presencial", "online", "hibrido"],
    },
  },
} as const
