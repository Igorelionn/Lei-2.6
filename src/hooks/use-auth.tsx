import { createContext, useCallback, useContext, useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { dismiss } from "@/hooks/use-toast";
import { logger } from '@/lib/logger';

type UserRole = "admin";

// Helper para acessar tabelas e funções não tipadas do Supabase
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untypedSupabase = supabase as any;

// Tipo para dados do usuário vindos do banco de dados
interface DatabaseUser {
  id: string;
  name: string;
  email: string;
  role: string;
  full_name?: string | null;
  can_edit?: boolean;
  can_create?: boolean;
  can_delete?: boolean;
  can_manage_users?: boolean;
  is_active?: boolean;
  last_login_at?: string;
  session_count?: number;
  first_login_at?: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  full_name?: string;
  permissions?: {
    can_edit: boolean;
    can_create: boolean;
    can_delete: boolean;
    can_manage_users: boolean;
  };
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (params: { email: string; password: string }) => Promise<void>;
  logout: () => void;
  updateFullName: (fullName: string) => void;
  updatePermissions: (permissions: { can_edit: boolean; can_create: boolean; can_delete: boolean; can_manage_users: boolean; }) => void;
  logUserAction: (actionType: string, description: string, targetType?: string, targetId?: string, metadata?: Record<string, unknown>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = "auction-usher.auth";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const isActiveRef = useRef<boolean>(true);
  const isOnlineRef = useRef<boolean>(true);
  const lastToastTimeRef = useRef<number>(0);
  const offlineToastIdRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { user: AuthUser };
        if (parsed?.user) {
          // Verificar se o usuário tem permissões carregadas
          // Se não tiver, limpar o storage e forçar novo login
          if (!parsed.user.permissions) {
            localStorage.removeItem(STORAGE_KEY);
            setIsLoading(false);
            return;
          }
          
          setUser(parsed.user);
        }
      }
    } catch (_) {
      // ignore corrupted storage
    } finally {
      setIsLoading(false);
    }
  }, []);

  const persist = useCallback((nextUser: AuthUser | null) => {
    if (nextUser) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: nextUser }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const login = useCallback(async ({ email, password }: { email: string; password: string }) => {
    // Limpar espaços em branco do email/usuário e senha
    const cleanEmail = email.trim();
    const cleanPassword = password.trim();
    
    logger.info('Iniciando processo de login', { 
      originalEmail: email, 
      cleanEmail, 
      hasSpaces: email !== cleanEmail 
    });
    
    // Garantir que não há estado residual de autenticação
    if (user) {
      logger.debug('Limpando estado de usuário anterior');
      setUser(null);
      persist(null);
    }
    
    await new Promise((r) => setTimeout(r, 500)); // Simular tempo de requisição
    
    if (!cleanEmail || !cleanPassword) {
      throw new Error("Usuário e senha são obrigatórios");
    }

    try {
      // Primeiro buscar o usuário por email
      logger.debug('Buscando usuário com email', { email: cleanEmail });
      let { data: users, error: userError } = await supabase
        .from('users')
        .select('id, name, email, role, full_name, can_edit, can_create, can_delete, can_manage_users, is_active')
        .eq('email', cleanEmail);

      // Se não encontrar por email, buscar por nome
      if (!users || users.length === 0) {
        logger.debug('Não encontrado por email, buscando por nome', { nome: cleanEmail });
        const { data: usersByName, error: nameError} = await supabase
          .from('users')
          .select('id, name, email, role, full_name, can_edit, can_create, can_delete, can_manage_users, is_active')
          .eq('name', cleanEmail);
        
        users = usersByName;
        userError = nameError;
      }

      if (userError) {
        logger.error('Erro ao buscar usuário', { error: userError });
        throw new Error("Usuário ou senha incorretos");
      }

      if (!users || users.length === 0) {
        logger.warn('Usuário não encontrado', { email: cleanEmail });
        throw new Error("Usuário ou senha incorretos");
      }

      const user = users[0] as unknown as DatabaseUser;
      logger.info('Usuário encontrado', { 
        id: user.id, 
        name: user.name,
        email: user.email,
        isActive: user.is_active
      });

      // Verificar se o usuário está ativo
      if (!user.is_active) {
        logger.warn('Usuário está desativado', { userId: user.id });
        throw new Error("Usuário desativado. Entre em contato com o administrador.");
      }

      // 🔒 SEGURANÇA: Não buscar credenciais diretamente (bloqueado por RLS)
      // Usar função verify_password que é SECURITY DEFINER e ignora RLS
      
      const { data: passwordMatch, error: verifyError } = await untypedSupabase
        .rpc('verify_password', {
          user_email: user.email, // Usar o email do banco, não o digitado
          user_password: cleanPassword
        });

      if (verifyError) {
        // 🔒 SEGURANÇA: Não logar detalhes de erro de autenticação em produção
        logger.error('Erro na verificação de senha', { error: verifyError });
        throw new Error("Usuário ou senha incorretos");
      }

      if (!passwordMatch) {
        logger.warn('Senha não confere');
        throw new Error("Usuário ou senha incorretos");
      }

      logger.info('Senha verificada com sucesso');

      const permissions = {
        can_edit: user.can_edit || false,
        can_create: user.can_create || false,
        can_delete: user.can_delete || false,
        can_manage_users: user.can_manage_users || false, // Buscar do banco
      };

      const authenticatedUser: AuthUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: (user.role as UserRole) || "admin",
        full_name: user.full_name || undefined,
        permissions,
      };
      
      // Atualizar dados de login no banco
      try {
        const { error: updateError } = await untypedSupabase
          .from('users')
          .update({
            last_login_at: new Date().toISOString(),
            session_count: (user.session_count || 0) + 1,
            first_login_at: user.first_login_at || new Date().toISOString(),
            is_active: true
          })
          .eq('id', user.id);

        if (updateError) {
          logger.error('Erro ao atualizar dados de login', { error: updateError });
        }

        // Registrar ação de login
        await untypedSupabase.from('user_actions').insert({
          user_id: user.id,
          action_type: 'login',
          action_description: 'Fez login no sistema (autenticação bem-sucedida)',
          target_type: 'auth',
          metadata: { login_method: 'credentials' }
        });
      } catch (error) {
        logger.error('Erro na sincronização de login', { error });
      }
      
      logger.info('Autenticação concluída com sucesso', { userId: user.id, userName: user.name });
      setUser(authenticatedUser);
      persist(authenticatedUser);
    } catch (error: unknown) {
      logger.error('Erro durante o login', { error });
      const errorMessage = error instanceof Error ? error.message : "Usuário ou senha incorretos";
      throw new Error(errorMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist]); // 'user' não é incluído intencionalmente: login busca usuário do banco, não depende do state

  const logout = useCallback(async () => {
    logger.info('Iniciando logout', { userId: user?.id });
    
    if (user && heartbeatIntervalRef.current) {
      // Registrar ação de logout antes de limpar
      try {
        await untypedSupabase.from('user_actions').insert({
          user_id: user.id,
          action_type: 'logout',
          action_description: 'Fez logout do sistema',
          target_type: 'auth',
          metadata: { logout_method: 'manual' }
        });
      } catch { /* silenciar erro de log */ }
      // Marcar usuário como offline no banco antes de fazer logout
      try {
        await untypedSupabase
          .from('users')
          .update({ 
            last_login_at: new Date(Date.now() - 10 * 60 * 1000).toISOString()
          })
          .eq('id', user.id);
      } catch (error) {
        logger.error('Erro ao marcar usuário como offline', { error });
      }
      
      // Limpar heartbeat
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    
    // Limpar todos os dados de autenticação
    setUser(null);
    persist(null);
    
    // Limpar outros estados relacionados
    lastActivityRef.current = Date.now();
    isActiveRef.current = true;
    
    // Forçar limpeza de qualquer cache do Supabase
    try {
      // Limpar possível cache de sessão do Supabase
      await supabase.auth.signOut();
    } catch (error) {
      // Ignorar erros de signOut pois não usamos auth nativo do Supabase
    }
    
    logger.info('Logout concluído com sucesso');
  }, [user, persist]);

  const updateFullName = useCallback((fullName: string) => {
    if (user) {
      const updatedUser = { ...user, full_name: fullName };
      setUser(updatedUser);
      persist(updatedUser);
    }
  }, [user, persist]);

  const updatePermissions = useCallback((permissions: { can_edit: boolean; can_create: boolean; can_delete: boolean; can_manage_users: boolean; }) => {
    if (user) {
      const updatedUser = { 
        ...user, 
        permissions: {
          ...user.permissions,
          ...permissions
        }
      };
      setUser(updatedUser);
      persist(updatedUser);
    }
  }, [user, persist]);

  const logUserAction = useCallback(async (
    actionType: string,
    description: string,
    targetType?: string,
    targetId?: string,
    metadata?: Record<string, unknown>
  ) => {
    if (!user) {
      logger.warn('Tentativa de registrar ação sem usuário logado');
      return;
    }

    try {
      await untypedSupabase.from('user_actions').insert({
        user_id: user.id,
        action_type: actionType,
        action_description: description,
        target_type: targetType,
        target_id: targetId,
        metadata: metadata
      });
    } catch (error) {
      logger.error('Erro ao registrar ação do usuário', { error });
    }
  }, [user]);

  // Sistema de heartbeat para status online/offline real e sincronização de permissões
  const updateHeartbeat = useCallback(async () => {
    if (!user || !isActiveRef.current) return;
    
    try {
      // Atualizar heartbeat e buscar status + permissões atuais
      const { data: userData, error: updateError } = await untypedSupabase
        .from('users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', user.id)
        .select('is_active, can_edit, can_create, can_delete, can_manage_users')
        .single();

      if (updateError) {
        // Se erro 406 (PGRST116), provavelmente usuário foi excluído
        if (updateError.code === 'PGRST116' || updateError.message?.includes('No rows found')) {
          logger.warn('Usuário foi excluído - fazendo logout automático');
          
          // Salvar mensagem de exclusão no localStorage
          localStorage.setItem('deletion-message', 'Sua conta foi excluída por um administrador.');
          
          // Fazer logout imediato
          logout();
          return;
        }
        
        logger.error('Erro ao atualizar heartbeat', { error: updateError });
        
        // ✅ Detectar erros de conexão
        const now = Date.now();
        const timeSinceLastToast = now - lastToastTimeRef.current;
        const shouldShowToast = timeSinceLastToast > 30000; // 30 segundos
        
        if (shouldShowToast && isOnlineRef.current) {
          isOnlineRef.current = false;
          lastToastTimeRef.current = now;
        }
        
        return;
      }
      
      // ✅ Se chegou aqui, conexão foi restabelecida
      if (!isOnlineRef.current) {
        isOnlineRef.current = true;
        
        // Limpar notificação de "Sem conexão" se existir
        if (offlineToastIdRef.current) {
          dismiss(offlineToastIdRef.current);
          offlineToastIdRef.current = null;
        }
      }

      // Se o usuário foi desativado, fazer logout automático
      const dbUserData = userData as DatabaseUser;
      if (userData && !dbUserData.is_active) {
        logger.warn('Usuário foi desativado - fazendo logout automático');
        
        // Salvar mensagem de desativação no localStorage
        localStorage.setItem('deactivation-message', 'Sua conta foi desativada por um administrador.');
        
        // Fazer logout imediato
        logout();
        return;
      }

      // Sincronizar permissões se houver mudanças
      if (userData) {
        const currentPermissions = user.permissions || {
          can_edit: false,
          can_create: false,
          can_delete: false,
          can_manage_users: false
        };
        const dbUserData = userData as DatabaseUser;
        const newPermissions = {
          can_edit: dbUserData.can_edit || false,
          can_create: dbUserData.can_create || false,
          can_delete: dbUserData.can_delete || false,
          can_manage_users: dbUserData.can_manage_users || false,
        };

        // Verificar se houve mudanças nas permissões
        const permissionsChanged = 
          currentPermissions.can_edit !== newPermissions.can_edit ||
          currentPermissions.can_create !== newPermissions.can_create ||
          currentPermissions.can_delete !== newPermissions.can_delete ||
          currentPermissions.can_manage_users !== newPermissions.can_manage_users;

        if (permissionsChanged) {
          logger.info('Permissões alteradas - sincronizando automaticamente', {
            old: currentPermissions,
            new: newPermissions
          });
          
          // Atualizar contexto com novas permissões
          updatePermissions(newPermissions);
          
          // Disparar evento personalizado para notificar outros componentes
          window.dispatchEvent(new CustomEvent('permissions-updated', { 
            detail: { 
              oldPermissions: currentPermissions, 
              newPermissions: newPermissions 
            } 
          }));
        }
      }
    } catch (error: unknown) {
      logger.error('Erro ao atualizar heartbeat', { error });
      
      // Verificar se é erro de usuário não encontrado (excluído)
      const isSupabaseError = error && typeof error === 'object' && 'code' in error;
      const errorCode = isSupabaseError ? (error as { code?: string }).code : undefined;
      const errorMessage = isSupabaseError ? (error as { message?: string }).message : undefined;
      
      if (errorCode === 'PGRST116' || errorMessage?.includes('No rows found')) {
        logger.warn('Usuário foi excluído - fazendo logout automático');
        
        // Salvar mensagem de exclusão no localStorage
        localStorage.setItem('deletion-message', 'Sua conta foi excluída por um administrador.');
        
        // Fazer logout imediato
        logout();
        return;
      }
      
      // ✅ Detectar erros de rede (TypeError: Failed to fetch, NetworkError, etc.)
      const errorStr = error instanceof Error ? error.message : String(error);
      const isNetworkError = 
        errorStr.includes('Failed to fetch') || 
        errorStr.includes('NetworkError') ||
        errorStr.includes('Network request failed') ||
        errorStr.includes('ERR_INTERNET_DISCONNECTED') ||
        errorStr.includes('ERR_CONNECTION_REFUSED') ||
        errorStr.includes('fetch failed');
      
      if (isNetworkError) {
        const now = Date.now();
        const timeSinceLastToast = now - lastToastTimeRef.current;
        const shouldShowToast = timeSinceLastToast > 30000; // 30 segundos
        
        if (shouldShowToast && isOnlineRef.current) {
          isOnlineRef.current = false;
          lastToastTimeRef.current = now;
        }
      }
    }
  }, [user, logout, updatePermissions]);

  const handleUserActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    isActiveRef.current = true;
  }, []);

  const checkUserActivity = useCallback(() => {
    const now = Date.now();
    const timeSinceLastActivity = now - lastActivityRef.current;
    
    // Considera usuário inativo após 5 minutos sem atividade
    if (timeSinceLastActivity > 5 * 60 * 1000) {
      isActiveRef.current = false;
    }
  }, []);

  // Configurar listeners de atividade e heartbeat
  useEffect(() => {
    if (!user) return;

    // Eventos que indicam atividade do usuário
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    activityEvents.forEach(event => {
      document.addEventListener(event, handleUserActivity, true);
    });

    // ✅ Detectar mudanças no status de conexão do navegador
    const handleOnline = () => {
      logger.info('Navegador detectou conexão online');
      if (!isOnlineRef.current) {
        isOnlineRef.current = true;
        
        // Limpar notificação de "Sem conexão" se existir
        if (offlineToastIdRef.current) {
          dismiss(offlineToastIdRef.current);
          offlineToastIdRef.current = null;
        }
        
        // Forçar atualização imediata do heartbeat
        updateHeartbeat();
      }
    };

    const handleOffline = () => {
      logger.warn('Navegador detectou perda de conexão');
      if (isOnlineRef.current) {
        isOnlineRef.current = false;
        lastToastTimeRef.current = Date.now();
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Detectar quando a janela ganha/perde foco
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Janela perdeu foco - pausar heartbeat
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
      } else {
        // Janela ganhou foco - retomar heartbeat e atualizar imediatamente
        handleUserActivity();
        updateHeartbeat();
        
        heartbeatIntervalRef.current = setInterval(() => {
          checkUserActivity();
          updateHeartbeat();
        }, 2 * 60 * 1000);
      }
    };

    const handleWindowFocus = () => {
      handleUserActivity();
      updateHeartbeat();
    };

    // Listeners para visibilidade e foco
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);

    // Heartbeat inicial a cada 2 minutos quando ativo
    heartbeatIntervalRef.current = setInterval(() => {
      checkUserActivity();
      updateHeartbeat();
    }, 2 * 60 * 1000);

    // Cleanup
    return () => {
      activityEvents.forEach(event => {
        document.removeEventListener(event, handleUserActivity, true);
      });
      
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, [user, handleUserActivity, checkUserActivity, updateHeartbeat]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isAuthenticated: Boolean(user),
    login,
    logout,
    updateFullName,
    updatePermissions,
    logUserAction,
  }), [user, login, logout, updateFullName, updatePermissions, logUserAction]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-lg text-gray-600">Carregando...</div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider");
  }
  return ctx;
}