import { createClient } from '@supabase/supabase-js';
import { Database } from './database.types';

// 🔒 SEGURANÇA: Credenciais apenas de variáveis de ambiente
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ✅ Validação: garantir que as variáveis de ambiente estão configuradas
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '🚨 ERRO DE CONFIGURAÇÃO: Variáveis de ambiente do Supabase não encontradas.\n' +
    'Por favor, configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env'
  );
}

export const supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
  auth: {
    persistSession: false, // 🔒 Não persistir sessão no localStorage por padrão
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

export type SupabaseClient = typeof supabaseClient;
