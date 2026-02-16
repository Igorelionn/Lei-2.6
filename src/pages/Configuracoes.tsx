import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { logger } from "@/lib/logger";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { 
  Settings, 
  User, 
  Mail, 
  Shield, 
  Database, 
  Info,
  Download,
  Upload,
  Trash2,
  Key,
  Phone,
  Camera,
  RefreshCw,
  ArrowUp,
  Users,
  Clock,
  Activity,
  Edit,
  History,
  UserMinus,
  UserPlus,
  Eye,
  Crown,
  ArrowDown,
  MoreVertical,
  Lock,
  Plus,
  Archive,
  Copy,
  DollarSign,
  CreditCard,
  FileText,
  UserCheck,
  Handshake
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";

// Interfaces de tipos para dados do banco
interface TeamUser {
  id: string;
  name: string;
  full_name?: string | null;
  email: string;
  role: string;
  avatar?: string | null;
  phone?: string | null;
  registration_date?: string;
  created_at?: string;
  first_login_at?: string | null;
  last_login_at?: string | null;
  session_count?: number;
  is_active?: boolean;
  can_edit?: boolean;
  can_create?: boolean;
  can_delete?: boolean;
  can_manage_users?: boolean;
  can_edit_backup?: boolean;
  can_create_backup?: boolean;
  can_delete_backup?: boolean;
  can_manage_users_backup?: boolean;
  deactivated_at?: string | null;
}

interface UserActivity {
  id?: string;
  user_id: string;
  action_type: string;
  action_description: string;
  target_type?: string;
  target_id?: string;
  created_at?: string;
}

// Bypass controlado para tabelas não no schema gerado
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untypedSupabase = supabase as any;

export default function Configuracoes() {
  const { user, updateFullName, logUserAction } = useAuth();
  const navigate = useNavigate();
  
  // Estados para configurações
  const [profile, setProfile] = useState({
    name: "", // Nome completo (não afeta o usuário de login)
    email: user?.email || "",
    phone: "",
    avatar: null, // Sem imagem inicialmente
    password: "••••••••" // Senha mascarada por padrão
  });

  // Estados para o sistema de salvamento
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [originalData, setOriginalData] = useState({
    name: "",
    phone: "",
    avatar: null
  });

  // Estados para senha
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showModalPassword, setShowModalPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  // Senha será buscada do banco de dados
  const [_actualPassword, setActualPassword] = useState("");

  // Estados para administração da equipe
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [selectedMemberActions, setSelectedMemberActions] = useState<TeamUser | null>(null);
  const [userActivities, setUserActivities] = useState<UserActivity[]>([]);
  const [showActionsModal, setShowActionsModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [selectedUserForAction, setSelectedUserForAction] = useState<TeamUser | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [activitiesPage, setActivitiesPage] = useState(1);
  const [totalActivities, setTotalActivities] = useState(0);
  const [showClearHistoryModal, setShowClearHistoryModal] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    fullName: '',
    email: '',
    phone: '',
    password: '',
    isAdmin: false
  });
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);
  const [showPromotionModal, setShowPromotionModal] = useState(false);
  const [isProcessingPromotion, setIsProcessingPromotion] = useState(false);
  const [selectedUserForPromotion, setSelectedUserForPromotion] = useState<TeamUser | null>(null);
  const [promotionAction, setPromotionAction] = useState<'promote' | 'demote'>('promote');
  
  // Estados para alteração de senha de usuários
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [showAdminPasswordConfirmModal, setShowAdminPasswordConfirmModal] = useState(false);
  const [selectedUserForPasswordChange, setSelectedUserForPasswordChange] = useState<TeamUser | null>(null);
  const [adminPasswordForConfirm, setAdminPasswordForConfirm] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [confirmNewUserPassword, setConfirmNewUserPassword] = useState("");
  const [showNewPasswordFields, setShowNewPasswordFields] = useState(false);
  const [showConfirmNewPasswordFields, setShowConfirmNewPasswordFields] = useState(false);
  const [isVerifyingAdminPassword, setIsVerifyingAdminPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showAdminPasswordField, setShowAdminPasswordField] = useState(false);
  
  const ACTIVITIES_PER_PAGE = 10;

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Componente de avatar padrão
  const DefaultAvatar = () => (
    <div className="w-full h-full bg-gray-100 flex items-center justify-center">
      <svg
        className="w-16 h-16 text-gray-400"
        fill="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
      </svg>
    </div>
  );


  const [_system, setSystem] = useState({
    autoBackup: true,
    backupFrequency: "daily",
    dataRetention: "1year",
    timezone: "America/Sao_Paulo",
    currency: "BRL",
    dateFormat: "dd/MM/yyyy"
  });

  const [_security, setSecurity] = useState({
    twoFactorAuth: false,
    sessionTimeout: "30min",
    passwordExpiry: "90days",
    loginAttempts: "5"
  });

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validar tipo de arquivo
      if (!file.type.startsWith('image/')) {
        return;
      }
      
      // Validar tamanho (máximo 5MB)
      if (file.size > 5 * 1024 * 1024) {
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const imageUrl = e.target?.result as string;
        handleInputChange('profile', 'avatar', imageUrl);
      };
      reader.readAsDataURL(file);
    }
  };


  const handleInputChange = (section: string, field: string, value: unknown) => {
    switch (section) {
      case 'profile':
        setProfile(prev => ({ ...prev, [field]: value }));
        checkForChanges({ ...profile, [field]: value });
        break;
      case 'system':
        setSystem(prev => ({ ...prev, [field]: value }));
        break;
      case 'security':
        setSecurity(prev => ({ ...prev, [field]: value }));
        break;
    }
  };

  const checkForChanges = (currentProfile: { name: string; phone: string; avatar: string | null }) => {
    const hasProfileChanges = 
      currentProfile.name !== originalData.name ||
      currentProfile.phone !== originalData.phone ||
      currentProfile.avatar !== originalData.avatar;
    
    setHasChanges(hasProfileChanges);
  };

  const handleSaveChanges = async () => {
    setIsLoading(true);
    setIsSaving(true);
    try {
      // Salvar no banco de dados
      // IMPORTANTE: full_name é salvo com o valor do campo "Nome Completo"
      // O campo "name" (usuário para login) NUNCA é alterado
      const { error } = await untypedSupabase
        .from('users')
        .update({
          full_name: profile.name, // Este é o "Nome Completo" da interface
          phone: profile.phone,
          avatar: profile.avatar,
          updated_at: new Date().toISOString()
        })
        .eq('id', user?.id);

      if (error) {
        logger.error('Erro ao salvar no banco', { error });
        throw error;
      }
      
      // Atualizar os dados originais
      setOriginalData({
        name: profile.name,
        phone: profile.phone,
        avatar: profile.avatar
      });
      
      setHasChanges(false);
      
      // Registrar ações específicas que foram realizadas
      const changedFields = [];
      const changedFieldsDescriptions = [];
      
      if (profile.name !== originalData.name) {
        changedFields.push('nome_completo');
        changedFieldsDescriptions.push('nome completo');
      }
      if (profile.phone !== originalData.phone) {
        changedFields.push('telefone');
        changedFieldsDescriptions.push('telefone');
      }
      if (profile.avatar !== originalData.avatar) {
        changedFields.push('avatar');
        changedFieldsDescriptions.push('foto do perfil');
      }

      if (changedFields.length > 0) {
        await logUserAction(
          'profile_update',
          `Atualizou informações do perfil (${changedFieldsDescriptions.join(', ')})`,
          'profile',
          user?.id,
          { fields_updated: changedFields }
        );
      }

      // Atualizar o nome completo no contexto de autenticação
      updateFullName(profile.name);

      // Atualizar a lista da equipe instantaneamente (sem esperar re-fetch do banco)
      setTeamUsers(prev => prev.map(member =>
        member.id === user?.id
          ? { ...member, avatar: profile.avatar, full_name: profile.name, phone: profile.phone }
          : member
      ));
      
    } catch (error) {
      logger.error('Erro no salvamento', { error });
    } finally {
      setIsLoading(false);
      // Manter a animação por um tempo adicional para feedback visual
      setTimeout(() => setIsSaving(false), 500);
    }
  };

  // Effect para carregar dados do usuário ao inicializar
  useEffect(() => {
    const loadUserProfile = async () => {
      if (!user?.id) return;
      
      try {
        const { data, error } = await untypedSupabase
          .from('users')
          .select('name, full_name, phone, avatar')
          .eq('id', user.id)
          .single();

        if (error) {
          logger.error('Erro ao carregar perfil', { error });
          return;
        }

        if (data) {
          const profileData = {
            // LÓGICA: Se full_name existir e não estiver vazio, usar ele
            // Caso contrário, usar o "name" (usuário de login) como padrão para exibir
            // Isso permite que o usuário veja seu nome de login no campo "Nome Completo"
            // mas quando alterar, salva em "full_name" sem afetar o login
            name: data.full_name || data.name || "",
            phone: data.phone || "",
            avatar: data.avatar || null
          };

          setProfile(prev => ({
            ...prev,
            ...profileData
          }));

          setOriginalData(profileData);
        }
      } catch (error) {
        logger.error('Erro ao buscar dados do usuário', { error });
      }
    };

    loadUserProfile();
    loadTeamUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  // loadTeamUsers não é memoizado - incluí-lo nas dependências causaria recriação do effect

  // Auto-refresh silencioso dos usuários da equipe a cada 5 minutos (sem animação visual)
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      // Atualização silenciosa sem mostrar loading/animação
      loadTeamUsers(false); // false = não mostrar loading
    }, 5 * 60 * 1000); // 5 minutos (300 segundos)

    return () => clearInterval(refreshInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // loadTeamUsers não é memoizado - incluí-lo nas dependências causaria recriação do effect

  // Listener para atualizar automaticamente quando permissões forem alteradas
  useEffect(() => {
    const handlePermissionsUpdate = (event: Event) => {
      logger.info('Evento de permissões recebido - atualizando lista de usuários');
      logger.debug('Detalhes do evento', { detail: (event as CustomEvent).detail });
      
      // Recarregar lista de usuários silenciosamente
      loadTeamUsers(false);
    };

    // Adicionar listener para o evento personalizado
    window.addEventListener('permissions-updated', handlePermissionsUpdate);

    // Cleanup do listener
    return () => {
      window.removeEventListener('permissions-updated', handlePermissionsUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // loadTeamUsers não é memoizado - incluí-lo nas dependências causaria recriação do effect

  // Effect para detectar mudanças quando a imagem é alterada
  useEffect(() => {
    checkForChanges(profile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);
  // checkForChanges não é memoizado - incluí-lo nas dependências causaria loops de renderização

  const handlePasswordToggle = () => {
    if (showPassword) {
      // Se já está mostrando, esconder
      setShowPassword(false);
      setProfile(prev => ({ ...prev, password: "••••••••" }));
    } else {
      // Se não está mostrando, abrir modal para verificar
      setShowPasswordModal(true);
    }
  };

  const handlePasswordVerification = async () => {
    setIsVerifying(true);
    
    try {
      if (!currentPassword.trim()) {
        return;
      }

      // Buscar as credenciais usando SQL raw para evitar problemas de tipagem
      const { data, error } = await untypedSupabase.from('user_credentials')
        .select('password_hash')
        .eq('user_id', user?.id)
        .single();

      if (error || !data) {
        logger.error('Erro ao buscar credenciais', { error });
        return;
      }

      const passwordFromDB = data.password_hash;
      
      if (!passwordFromDB) {
        return;
      }

      // Verificar se a senha corresponde usando RPC function (mesma lógica do login)
      const { data: passwordMatch, error: verifyError } = await untypedSupabase
        .rpc('verify_password', {
          user_email: user?.email,
          user_password: currentPassword
        });

      if (verifyError) {
        logger.error('Erro na verificação RPC', { error: verifyError });
        return;
      }

      if (!passwordMatch) {
        return;
      }
      
      // Se chegou até aqui, a senha está correta
      setActualPassword(currentPassword);
      setShowPassword(true);
      setProfile(prev => ({ ...prev, password: currentPassword }));
      setShowPasswordModal(false);
      setCurrentPassword("");
      
      logger.info('Senha verificada com sucesso', { userName: user?.name });
      
    } catch (error) {
      logger.error('Erro na verificação', { error });
    } finally {
      setIsVerifying(false);
    }
  };

  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setCurrentPassword("");
    setIsVerifying(false);
    setShowModalPassword(false);
  };

  const toggleModalPassword = () => {
    setShowModalPassword(!showModalPassword);
  };

  // Funções para ações dos membros
  const handleViewUserActivity = async (member: TeamUser) => {
    setSelectedMemberActions(member);
    setActivitiesPage(1);
    await loadUserActivities(member.id, 1);
    setShowActionsModal(true);
  };

  const loadUserActivities = async (userId: string, page: number = 1) => {
    try {
      // Buscar total de atividades
      const { count } = await untypedSupabase
        .from('user_actions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      setTotalActivities(count || 0);

      // Buscar atividades paginadas
      const { data, error } = await untypedSupabase
        .from('user_actions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range((page - 1) * ACTIVITIES_PER_PAGE, page * ACTIVITIES_PER_PAGE - 1);

      if (error) {
        logger.error('Erro ao buscar atividades', { error });
        setUserActivities([]);
      } else {
        setUserActivities(data || []);
      }
    } catch (error) {
      logger.error('Erro na consulta de atividades', { error });
      setUserActivities([]);
    }
  };

  const handleActivityPageChange = async (newPage: number) => {
    setActivitiesPage(newPage);
    await loadUserActivities(selectedMemberActions.id, newPage);
  };

  const handleClearHistory = () => {
    // Verificar permissões antes de prosseguir
    if (!user?.permissions?.can_manage_users) {
      return;
    }

    setShowClearHistoryModal(true);
  };

  const confirmClearHistory = async () => {
    if (!selectedMemberActions?.id) return;

    setIsClearingHistory(true);
    try {
      const { error } = await untypedSupabase
        .from('user_actions')
        .delete()
        .eq('user_id', selectedMemberActions.id);

      if (error) throw error;

      // Log da ação de limpeza
      await logUserAction(
        'history_clear',
        `Limpou o histórico de atividades de ${selectedMemberActions.full_name || selectedMemberActions.name}`,
        'user',
        selectedMemberActions.id,
        { cleared_by: user?.id }
      );

      // Recarregar atividades
      await loadUserActivities(selectedMemberActions.id, 1);
      setActivitiesPage(1);
      setShowClearHistoryModal(false);

    } catch (error) {
      logger.error('Erro ao limpar histórico', { error });
    } finally {
      setIsClearingHistory(false);
    }
  };

  const handleAddUser = () => {
    // Verificar permissões antes de prosseguir
    if (!user?.permissions?.can_manage_users) {
      return;
    }

    setShowAddUserModal(true);
  };


  const formatPhoneNumber = (input: string) => {
    // Remove todos os caracteres não numéricos
    const numbers = input.replace(/\D/g, '');
    
    // Se não há números, retorna vazio
    if (!numbers) return '';
    
    // Limita a 11 dígitos máximo
    const digits = numbers.slice(0, 11);
    const length = digits.length;
    
    // Formatação progressiva
    if (length <= 2) {
      return digits; // "8" ou "82"
    } else if (length <= 6) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2)}`; // "(82) 9999"
    } else if (length <= 10) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`; // "(82) 9999-5180"
    } else if (length === 11) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`; // "(82) 99951-8010"
    }
    
    return digits;
  };

  const handleNewUserChange = (field: string, value: string | boolean) => {
    if (field === 'phone' && typeof value === 'string') {
      const formattedPhone = formatPhoneNumber(value);
      setNewUser(prev => ({ ...prev, [field]: formattedPhone }));
    } else {
      setNewUser(prev => ({ ...prev, [field]: value }));
    }
  };

  const clearNewUserForm = () => {
    setNewUser({
      name: '',
      fullName: '',
      email: '',
      phone: '',
      password: '',
      isAdmin: false
    });
    setShowNewUserPassword(false);
  };

  const confirmAddUser = async () => {
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password.trim()) {
      return;
    }

    setIsAddingUser(true);
    try {
      // Verificar se email já existe
      const { data: existingUsers } = await untypedSupabase
        .from('users')
        .select('email')
        .eq('email', newUser.email.trim().toLowerCase());

      if (existingUsers && existingUsers.length > 0) {
        return;
      }

      // Definir permissões baseado se é admin
      const permissions = newUser.isAdmin ? {
        can_edit: true,
        can_create: true,
        can_delete: true,
        can_manage_users: true
      } : {
        can_edit: true,
        can_create: false,
        can_delete: false,
        can_manage_users: false
      };

      // Extrair apenas números do telefone para salvar no banco
      const phoneNumbers = newUser.phone.replace(/\D/g, '');
      const cleanPhone = phoneNumbers.length >= 10 ? phoneNumbers : null;

      // Criar usuário
      const { data: userData, error: userError } = await untypedSupabase
        .from('users')
        .insert({
          name: newUser.name.trim(),
          full_name: newUser.fullName.trim() || newUser.name.trim(),
          email: newUser.email.trim().toLowerCase(),
          phone: cleanPhone,
          role: 'user',
          registration_date: new Date().toISOString(),
          created_at: new Date().toISOString(),
          is_active: true,
          ...permissions
        })
        .select('id')
        .single();

      if (userError) throw userError;

      // Criar credenciais usando RPC para hash seguro
      const { error: credError } = await untypedSupabase
        .rpc('create_user_password', {
          user_email: newUser.email,
          user_password: newUser.password
        });

      if (credError) throw credError;

      // Log da ação
      await logUserAction(
        'user_create',
        `Criou novo usuário: ${newUser.fullName || newUser.name} (${newUser.email}) - ${newUser.isAdmin ? 'Administrador' : 'Usuário'}`,
        'user',
        userData.id,
        { 
          created_by: user?.id, 
          user_name: newUser.name, 
          user_email: newUser.email,
          is_admin: newUser.isAdmin,
          permissions: permissions
        }
      );

      // Limpar formulário e fechar modal
      clearNewUserForm();
      setShowAddUserModal(false);

      // Recarregar lista de usuários
      loadTeamUsers();

    } catch (error) {
      logger.error('Erro ao criar usuário', { error });
    } finally {
      setIsAddingUser(false);
    }
  };


  const handleDeactivateUser = (member: TeamUser) => {
    // Verificar permissões antes de prosseguir
    if (!user?.permissions?.can_manage_users) {
      return;
    }

    setSelectedUserForAction(member);
    setConfirmText("");
    setShowDeactivateModal(true);
  };

  const handleDeleteUser = (member: TeamUser) => {
    // Verificar permissões antes de prosseguir
    if (!user?.permissions?.can_manage_users) {
      return;
    }

    setSelectedUserForAction(member);
    setConfirmText("");
    setShowDeleteModal(true);
  };

  const reactivateUser = async (member: TeamUser) => {
    // Verificar permissões antes de prosseguir
    if (!user?.permissions?.can_manage_users) {
      return;
    }

    // Prosseguir com a reativação...
    setIsProcessingAction(true);
    try {
      // Restaurar permissões dos campos de backup e reativar
      const { error } = await untypedSupabase
        .from('users')
        .update({ 
          is_active: true,
          can_edit: member.can_edit_backup || true,
          can_create: member.can_create_backup || false,
          can_delete: member.can_delete_backup || false,
          can_manage_users: member.can_manage_users_backup || false,
          deactivated_at: null,
          deactivated_by: null,
          deactivation_reason: null,
          can_edit_backup: null,
          can_create_backup: null,
          can_delete_backup: null,
          can_manage_users_backup: null
        })
        .eq('id', member.id);

      if (error) throw error;

      // Log da ação
      await logUserAction(
        'user_reactivate',
        `Reativou o usuário ${member.full_name || member.name} (restaurou permissões de edição)`,
        'user',
        member.id,
        { previous_status: 'inactive', new_status: 'active' }
      );

      loadTeamUsers(); // Recarregar lista
    } catch (error) {
      logger.error('Erro ao reativar usuário', { error });
    } finally {
      setIsProcessingAction(false);
    }
  };

  const confirmDeactivateUser = async () => {
    const expectedText = `Eu confirmo que quero desativar ${selectedUserForAction.full_name || selectedUserForAction.name}`;
    
    if (confirmText !== expectedText) {
      return;
    }

    setIsProcessingAction(true);
    try {
      // Salvar permissões atuais em campos de backup antes de desativar
      const { error } = await untypedSupabase
        .from('users')
        .update({ 
          is_active: false,
          can_edit_backup: selectedUserForAction.can_edit,
          can_create_backup: selectedUserForAction.can_create,
          can_delete_backup: selectedUserForAction.can_delete,
          can_manage_users_backup: selectedUserForAction.can_manage_users,
          deactivated_at: new Date().toISOString(),
          deactivated_by: user?.id,
          deactivation_reason: 'Desativado via painel administrativo'
        })
        .eq('id', selectedUserForAction.id);

      if (error) throw error;

      // Registrar ação
      await untypedSupabase.from('user_actions').insert({
        user_id: user?.id,
        action_type: 'user_deactivate',
        action_description: `Desativou o usuário ${selectedUserForAction.full_name || selectedUserForAction.name} (removeu permissões de edição)`,
        target_type: 'user',
        target_id: selectedUserForAction.id
      });

      // Atualizar lista local
      setTeamUsers(prev => prev.map(u => 
        u.id === selectedUserForAction.id ? { 
          ...u, 
          is_active: false, 
          can_edit: false, 
          can_create: false, 
          can_delete: false 
        } : u
      ));

      setShowDeactivateModal(false);
    } catch (_error) {
      logger.error('Erro ao desativar usuário', { error: _error });
    } finally {
      setIsProcessingAction(false);
    }
  };

  const confirmDeleteUser = async () => {
    const expectedText = `Eu confirmo que quero excluir ${selectedUserForAction.full_name || selectedUserForAction.name}`;
    
    if (confirmText !== expectedText) {
      return;
    }

    setIsProcessingAction(true);
    try {
      const userIdToDelete = selectedUserForAction.id;
      const userName = selectedUserForAction.full_name || selectedUserForAction.name;

      // Registrar ação antes de excluir
      await untypedSupabase.from('user_actions').insert({
        user_id: user?.id,
        action_type: 'user_delete',
        action_description: `Excluiu permanentemente o usuário ${userName} (removido do sistema)`,
        target_type: 'user',
        target_id: userIdToDelete
      });

      // 1. Excluir ações do usuário
      await untypedSupabase
        .from('user_actions')
        .delete()
        .eq('user_id', userIdToDelete);

      // 2. Excluir credenciais do usuário  
      await untypedSupabase
        .from('user_credentials')
        .delete()
        .eq('user_id', userIdToDelete);

      // 3. Excluir usuário da tabela principal
      const { error } = await untypedSupabase
        .from('users')
        .delete()
        .eq('id', userIdToDelete);

      if (error) throw error;

      // Remover da lista local
      setTeamUsers(prev => prev.filter(u => u.id !== userIdToDelete));

      setShowDeleteModal(false);
    } catch (error) {
      logger.error('Erro ao excluir usuário', { error });
    } finally {
      setIsProcessingAction(false);
    }
  };


  // Função para verificar se usuário está online (baseada no heartbeat real)
  const isUserOnline = (lastLogin: string | null) => {
    if (!lastLogin) return false;
    const lastLoginDate = new Date(lastLogin);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastLoginDate.getTime()) / (1000 * 60);
    // Considera online se teve atividade nos últimos 5 minutos (heartbeat de 2 minutos + margem)
    return diffMinutes <= 5; 
  };

  // Função para verificar se usuário é administrador
  const isUserAdmin = (member: TeamUser) => {
    // Admin é determinado apenas pela permissão can_manage_users
    return member.can_manage_users === true;
  };

  // Função para promover usuário
  const handlePromoteUser = (member: TeamUser) => {
    if (!user?.permissions?.can_manage_users) {
      return;
    }

    setSelectedUserForPromotion(member);
    setPromotionAction('promote');
    setShowPromotionModal(true);
  };

  // Função para despromover usuário
  const handleDemoteUser = (member: TeamUser) => {
    if (!user?.permissions?.can_manage_users) {
      return;
    }

    // Não permitir que admin se despromova
    if (member.id === user?.id) {
      return;
    }

    setSelectedUserForPromotion(member);
    setPromotionAction('demote');
    setShowPromotionModal(true);
  };

  // Confirmar promoção/despromoção
  const confirmPromotionChange = async () => {
    if (!selectedUserForPromotion) return;

    setIsProcessingPromotion(true);
    try {
      const isPromoting = promotionAction === 'promote';
      const userName = selectedUserForPromotion.full_name || selectedUserForPromotion.name;

      // Atualizar permissões no banco
      const updateData = {
        can_edit: true, // Sempre verdadeiro
        can_create: isPromoting,
        can_delete: isPromoting,
        can_manage_users: isPromoting,
        updated_at: new Date().toISOString()
      };

      const { data: _data, error } = await untypedSupabase
        .from('users')
        .update(updateData)
        .eq('id', selectedUserForPromotion.id)
        .select();

      if (error) {
        logger.error('Erro na atualização do banco', { error });
        throw error;
      }

      // Log da ação
      await logUserAction(
        isPromoting ? 'user_promote' : 'user_demote',
        `${isPromoting ? 'Promoveu' : 'Despromoveu'} ${userName} ${isPromoting ? 'para administrador' : 'para usuário comum'}`,
        'user',
        selectedUserForPromotion.id,
        { 
          action_by: user?.id,
          new_permissions: {
            can_edit: true,
            can_create: isPromoting,
            can_delete: isPromoting,
            can_manage_users: isPromoting
          }
        }
      );

      // Atualizar lista local imediatamente para responsividade
      setTeamUsers(prev => prev.map(u => 
        u.id === selectedUserForPromotion.id 
          ? { ...u, can_edit: true, can_create: isPromoting, can_delete: isPromoting, can_manage_users: isPromoting }
          : u
      ));

      // A sincronização automática das permissões será feita pelo heartbeat
      // Recarregar a lista para garantir sincronização completa
      await loadTeamUsers();

      setShowPromotionModal(false);
    } catch (error) {
      logger.error('Erro ao alterar permissões', {
        error,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
    } finally {
      setIsProcessingPromotion(false);
    }
  };

  // Função para formatar o último acesso com validação
  const formatLastAccess = (lastLogin: string | null, firstLogin: string | null) => {
    // Se nunca fez login, retornar "Nunca acessou"
    if (!firstLogin || !lastLogin) {
      return {
        date: 'Nunca acessou',
        relative: 'Primeiro acesso pendente'
      };
    }

    // Se fez login, formatar as datas
    const relativeText = formatRelativeDate(lastLogin);
    // Capitalizar primeira letra para o contexto de "último acesso"
    const capitalizedRelative = relativeText.charAt(0).toUpperCase() + relativeText.slice(1);
    
    return {
      date: new Date(lastLogin).toLocaleDateString('pt-BR'),
      relative: capitalizedRelative
    };
  };

  // Função para formatar a data de entrada com validação
  const formatRegistrationDate = (registrationDate: string | null, createdAt: string | null) => {
    // Usar registration_date se disponível, senão usar created_at
    const dateToUse = registrationDate || createdAt;
    
    if (!dateToUse) {
      return {
        date: 'Data não disponível',
        relative: 'Informação pendente'
      };
    }

    try {
      const date = new Date(dateToUse);
      // Verificar se a data é válida
      if (isNaN(date.getTime())) {
        return {
          date: 'Data inválida',
          relative: 'Erro nos dados'
        };
      }

      return {
        date: date.toLocaleDateString('pt-BR'),
        relative: formatRegistrationRelativeDate(dateToUse)
      };
    } catch (_error) {
      return {
        date: 'Erro ao processar data',
        relative: 'Dados corrompidos'
      };
    }
  };

  // Função para carregar todos os usuários da equipe
  const loadTeamUsers = async (showLoading: boolean = true) => {
    if (showLoading) {
      setLoadingTeam(true);
    }
    try {
      const { data, error } = await untypedSupabase
        .from('users')
        .select('id, name, full_name, email, role, avatar, phone, registration_date, created_at, first_login_at, last_login_at, session_count, is_active, can_edit, can_create, can_delete, can_manage_users, can_edit_backup, can_create_backup, can_delete_backup, can_manage_users_backup, deactivated_at')
        .order('registration_date', { ascending: false, nullsFirst: false });

      if (error) {
        logger.error('Erro ao carregar equipe', { error });
        return;
      }


      // Validar e corrigir dados inconsistentes
      const validatedData = (data || []).map((user: TeamUser) => {
        // Se first_login_at é null, last_login_at também deve ser null
        if (!user.first_login_at && user.last_login_at) {
          return { ...user, last_login_at: null };
        }
        return user;
      });

      // Ordenar: primeiro o próprio usuário, depois ativos online, depois por completude de dados, depois alfabética
      const sortedData = validatedData.sort((a: TeamUser, b: TeamUser) => {
        const aIsCurrentUser = a.id === user?.id;
        const bIsCurrentUser = b.id === user?.id;
        
        // Primeiro critério: usuário atual sempre primeiro
        if (aIsCurrentUser && !bIsCurrentUser) return -1;
        if (!aIsCurrentUser && bIsCurrentUser) return 1;
        
        // Segundo critério: usuários online primeiro  
        const aOnline = isUserOnline(a.last_login_at);
        const bOnline = isUserOnline(b.last_login_at);
        
        if (aOnline && !bOnline) return -1;
        if (!aOnline && bOnline) return 1;
        
        // Terceiro critério: completude de informações (nome completo, telefone)
        const aComplete = (a.full_name || a.name) && a.phone;
        const bComplete = (b.full_name || b.name) && b.phone;
        
        if (aComplete && !bComplete) return -1;
        if (!aComplete && bComplete) return 1;
        
        // Quarto critério: ordem alfabética
        const aName = a.full_name || a.name || '';
        const bName = b.full_name || b.name || '';
        return aName.localeCompare(bName);
      });

      setTeamUsers(sortedData);
    } catch (error) {
      logger.error('Erro na consulta da equipe', { error });
    } finally {
      if (showLoading) {
        setLoadingTeam(false);
      }
    }
  };

  // Função para formatar data relativa
  const formatRelativeDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'hoje';
    if (diffDays === 1) return 'ontem';
    if (diffDays < 7) {
      return diffDays === 1 ? '1 dia atrás' : `${diffDays} dias atrás`;
    }
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return weeks === 1 ? '1 semana atrás' : `${weeks} semanas atrás`;
    }
    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return months === 1 ? '1 mês atrás' : `${months} meses atrás`;
    }
    const years = Math.floor(diffDays / 365);
    return years === 1 ? '1 ano atrás' : `${years} anos atrás`;
  };

  // Função específica para formatar data de registro (gramaticalmente correta)
  const formatRegistrationRelativeDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Registrado hoje';
    if (diffDays === 1) return 'Registrado ontem';
    if (diffDays < 7) {
      return diffDays === 1 ? 'Registrado há 1 dia' : `Registrado há ${diffDays} dias`;
    }
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return weeks === 1 ? 'Registrado há 1 semana' : `Registrado há ${weeks} semanas`;
    }
    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return months === 1 ? 'Registrado há 1 mês' : `Registrado há ${months} meses`;
    }
    const years = Math.floor(diffDays / 365);
    return years === 1 ? 'Registrado há 1 ano' : `Registrado há ${years} anos`;
  };

  // Funções para alteração de senha de usuários
  const handleChangeUserPassword = (member: TeamUser) => {
    // Verificar se é administrador
    if (!user?.permissions?.can_manage_users) {
      return;
    }

    // Não permitir alterar própria senha por aqui
    if (member.id === user?.id) {
      return;
    }

    setSelectedUserForPasswordChange(member);
    setAdminPasswordForConfirm("");
    setNewUserPassword("");
    setConfirmNewUserPassword("");
    setShowNewPasswordFields(false);
    setShowConfirmNewPasswordFields(false);
    setShowAdminPasswordConfirmModal(true);
  };

  const handleAdminPasswordConfirmation = async () => {
    setIsVerifyingAdminPassword(true);
    
    try {
      if (!adminPasswordForConfirm.trim()) {
        return;
      }

      // Buscar credenciais do administrador
      const { data, error } = await untypedSupabase.from('user_credentials')
        .select('password_hash')
        .eq('user_id', user?.id)
        .single();

      if (error || !data) {
        logger.error('Erro ao buscar credenciais do admin', { error });
        return;
      }

      // Verificar senha do administrador
      const { data: passwordMatch, error: verifyError } = await untypedSupabase
        .rpc('verify_password', {
          user_email: user?.email,
          user_password: adminPasswordForConfirm
        });

      if (verifyError) {
        logger.error('Erro na verificação RPC', { error: verifyError });
        return;
      }

      if (!passwordMatch) {
        return;
      }

      // Senha confirmada - prosseguir para definir nova senha
      setShowAdminPasswordConfirmModal(false);
      setShowChangePasswordModal(true);

    } catch (error) {
      logger.error('Erro na verificação', { error });
    } finally {
      setIsVerifyingAdminPassword(false);
    }
  };

  const handleConfirmPasswordChange = async () => {
    // Validações
    if (!newUserPassword.trim() || !confirmNewUserPassword.trim()) {
      return;
    }

    if (newUserPassword !== confirmNewUserPassword) {
      return;
    }


    setIsChangingPassword(true);
    
    try {
      // Primeiro deletar credenciais existentes
      const { error: deleteError } = await untypedSupabase
        .from('user_credentials')
        .delete()
        .eq('user_id', selectedUserForPasswordChange.id);

      if (deleteError) {
        logger.error('Erro ao deletar credenciais antigas', { error: deleteError });
        throw deleteError;
      }

      // Criar nova credencial com nova senha usando RPC function
      const { error: createError } = await untypedSupabase
        .rpc('create_user_password', {
          user_email: selectedUserForPasswordChange.email,
          user_password: newUserPassword
        });

      if (createError) {
        logger.error('Erro ao criar nova senha', { error: createError });
        throw createError;
      }

      // Log da ação
      await logUserAction(
        'password_change',
        `Alterou a senha do usuário ${selectedUserForPasswordChange.full_name || selectedUserForPasswordChange.name}`,
        'user',
        selectedUserForPasswordChange.id,
        { 
          changed_by: user?.id,
          target_user: selectedUserForPasswordChange.name,
          target_email: selectedUserForPasswordChange.email
        }
      );

      // Fechar modal e limpar estados
      setShowChangePasswordModal(false);
      setSelectedUserForPasswordChange(null);
      setAdminPasswordForConfirm("");
      setNewUserPassword("");
      setConfirmNewUserPassword("");

    } catch (error) {
      logger.error('Erro ao alterar senha', { error });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const closePasswordChangeModals = () => {
    setShowAdminPasswordConfirmModal(false);
    setShowChangePasswordModal(false);
    setSelectedUserForPasswordChange(null);
    setAdminPasswordForConfirm("");
    setNewUserPassword("");
    setConfirmNewUserPassword("");
    setShowNewPasswordFields(false);
    setShowConfirmNewPasswordFields(false);
    setShowAdminPasswordField(false);
    setIsVerifyingAdminPassword(false);
    setIsChangingPassword(false);
  };

  return (
    <>
      <style>{`
        /* Remove todos os contornos e sombras azuis */
        *, *:focus, *:focus-visible {
          outline: none !important;
          box-shadow: none !important;
          --tw-ring-shadow: 0 0 #0000 !important;
          --tw-ring-color: transparent !important;
        }
        
        /* Inputs específicos */
        input, input:focus, input:focus-visible, input:active {
          outline: none !important;
          box-shadow: none !important;
          --tw-ring-shadow: 0 0 #0000 !important;
          --tw-ring-color: transparent !important;
          --tw-ring-offset-shadow: 0 0 #0000 !important;
        }
        
        /* Campos com foco - borda mais escura */
        input[type="text"]:focus, input[type="email"]:focus, input[type="tel"]:focus,
        input:focus {
          border-color: rgb(75 85 99) !important;
          outline: none !important;
          box-shadow: none !important;
          --tw-ring-shadow: 0 0 #0000 !important;
          transition: border-color 0.15s ease-in-out !important;
        }
        
        /* Estado normal dos inputs */
        input[type="text"], input[type="email"], input[type="tel"], input {
          border-color: rgb(209 213 219) !important;
          transition: border-color 0.15s ease-in-out !important;
        }
        
        /* Botões */
        button, button:focus, button:focus-visible, button:active {
          outline: none !important;
          box-shadow: none !important;
          --tw-ring-shadow: 0 0 #0000 !important;
          --tw-ring-color: transparent !important;
        }
        
        /* Seletores específicos do shadcn-ui */
        .relative input {
          outline: none !important;
          box-shadow: none !important;
          --tw-ring-shadow: 0 0 #0000 !important;
          border-color: rgb(209 213 219) !important;
          transition: border-color 0.15s ease-in-out !important;
        }
        
        .relative input:focus {
          outline: none !important;
          box-shadow: none !important;
          --tw-ring-shadow: 0 0 #0000 !important;
          border-color: rgb(75 85 99) !important;
        }
        
        /* Remove ring do Tailwind */
        .ring-0, .focus\\:ring-0, .focus-visible\\:ring-0 {
          --tw-ring-shadow: 0 0 #0000 !important;
        }
        
        /* Remove outline */
        .outline-none, .focus\\:outline-none, .focus-visible\\:outline-none {
          outline: none !important;
        }

        /* Animação da seta para cima (upload) - ativa ao clicar */
        @keyframes arrowUpBounce {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-6px);
          }
        }

        .arrow-up-animate {
          animation: arrowUpBounce 0.8s ease-in-out infinite;
        }

        .arrow-up-hover {
          transition: transform 0.2s ease-in-out;
        }

        .arrow-up-hover:hover {
          transform: translateY(-2px);
        }
      `}</style>
      <div className="space-y-4 sm:space-y-6 lg:space-y-8 pt-6 blur-fade">
      {/* Header com botão Salvar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Configurações</h1>
          <p className="text-muted-foreground">
            Gerencie suas preferências e configurações do sistema
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hasChanges && (
            <Badge variant="secondary" className="bg-orange-100 text-orange-800 border-orange-200">
              <Info className="w-3 h-3 mr-1" />
              Alterações não salvas
            </Badge>
          )}
          <Button 
            onClick={handleSaveChanges}
            disabled={!hasChanges || isLoading}
            className="bg-gray-800 hover:bg-gray-900 text-white disabled:bg-gray-300 disabled:text-gray-500 btn-save-click"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <ArrowUp 
                  className={`w-4 h-4 mr-2 arrow-up-hover ${isSaving ? 'arrow-up-animate' : ''}`} 
                />
            <span className="hidden sm:inline">Salvar Alterações</span><span className="sm:hidden">Salvar</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Imagem de Perfil Centralizada */}
      <div className="flex flex-col items-center space-y-4 mb-4 sm:mb-6 lg:mb-8">
        <div className="relative group cursor-pointer">
          <div 
            className="w-28 h-28 rounded-full overflow-hidden border-3 border-gray-200 shadow-md focus:outline-none focus:ring-0"
            onClick={() => fileInputRef.current?.click()}
          >
            {profile.avatar ? (
              <img
                src={profile.avatar}
                alt="Foto de perfil"
                className="w-full h-full object-cover"
              />
            ) : (
              <DefaultAvatar />
            )}
          </div>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 w-28 h-28 rounded-full bg-black bg-opacity-0 hover:bg-opacity-40 flex items-center justify-center transition-all duration-200 group-hover:bg-opacity-30 focus:outline-none focus:ring-0"
          >
            <Camera className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden focus:outline-none"
        />
      </div>

      <Tabs defaultValue="profile" className="space-y-4 sm:space-y-6">
        <TabsContent value="profile" className="space-y-4 sm:space-y-6">
          <div className="space-y-4 sm:space-y-6">
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <User className="h-5 w-5" />
                Informações Pessoais
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome Completo</Label>
                  <Input
                    id="name"
                    value={profile.name}
                    onChange={(e) => handleInputChange('profile', 'name', e.target.value)}
                    className=""
                    style={{ outline: 'none', boxShadow: 'none' }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      id="phone"
                      value={profile.phone}
                      onChange={(e) => handleInputChange('profile', 'phone', e.target.value)}
                      className="pl-10"
                      placeholder="(11) 99999-9999"
                      style={{ outline: 'none', boxShadow: 'none' }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 -mt-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                  <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={profile.password}
                      readOnly
                      className="pr-10"
                      style={{ outline: 'none', boxShadow: 'none' }}
                    />
                  <button
                    type="button"
                    onClick={handlePasswordToggle}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-all duration-200 ease-in-out focus:outline-none"
                  >
                    <div className="relative w-4 h-4">
                      {/* Olho Aberto - quando senha está visível */}
                      <svg 
                        className={`h-4 w-4 absolute inset-0 transition-all duration-300 ease-in-out ${
                          showPassword 
                            ? 'opacity-100 scale-100 rotate-0' 
                            : 'opacity-0 scale-75 rotate-12'
                        }`}
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                      
                      {/* Olho Fechado - quando senha está oculta */}
                      <svg 
                        className={`h-4 w-4 absolute inset-0 transition-all duration-300 ease-in-out ${
                          showPassword 
                            ? 'opacity-0 scale-75 rotate-12' 
                            : 'opacity-100 scale-100 rotate-0'
                        }`}
                        xmlns="http://www.w3.org/2000/svg" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                      >
                        <path d="m15 18-.722-3.25"/>
                        <path d="M2 8a10.645 10.645 0 0 0 20 0"/>
                        <path d="m20 15-1.726-2.05"/>
                        <path d="m4 15 1.726-2.05"/>
                        <path d="m9 18 .722-3.25"/>
                      </svg>
                </div>
                  </button>
              </div>
                  <p className="text-xs text-gray-500">
                    {showPassword 
                      ? "Clique no ícone do olho para ocultar sua senha" 
                      : "Clique no ícone do olho para revelar sua senha atual"
                    }
                  </p>
                </div>
              </div>
            </div>

            {/* Seção Administração da Equipe */}
            <div className="space-y-4 mt-4 sm:mt-6 lg:mt-8 pt-4 sm:pt-6 lg:pt-8 border-t border-gray-200">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-4">
                  <h3 className="text-lg font-medium flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Administração da Equipe
                  </h3>
                </div>

                <div className="flex items-center gap-3">
                  {/* Botão Configurações de Email */}
                  <Button 
                    onClick={() => navigate('/email')}
                    variant="outline"
                    className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-700 hover:border-gray-300 font-medium"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Configurações de Email
                  </Button>

                  {/* Botão Adicionar Usuário - Apenas para administradores */}
                  {user?.permissions?.can_manage_users && (
                    <Button 
                      onClick={handleAddUser}
                      className="bg-black hover:bg-gray-800 text-white"
                    >
                      <UserPlus className="w-4 h-4 mr-2" />
                      Adicionar Membro
                    </Button>
                  )}

                </div>
              </div>
              
              {loadingTeam ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="w-6 h-6 animate-spin mr-2" />
                  <span>Carregando membros da equipe...</span>
                </div>
              ) : (
                <div className="bg-white">
                  {/* Cabeçalho da tabela */}
                  <div className="px-4 py-3 border-b border-gray-200">
                    <div className="grid grid-cols-12 gap-3 sm:gap-4 lg:gap-6 text-sm font-medium text-gray-600">
                      <div className="col-span-7 sm:col-span-3">Membro</div>
                      <div className="hidden sm:block col-span-2">Último Acesso</div>
                      <div className="hidden sm:block col-span-2">Data de Entrada</div>
                      <div className="hidden sm:block col-span-2">Contato</div>
                      <div className="hidden sm:block col-span-1">Status</div>
                      <div className="col-span-5 sm:col-span-2">Ações</div>
                    </div>
                  </div>

                  {/* Corpo da tabela */}
                  <div className="divide-y divide-gray-200">
                    {teamUsers.map((member) => (
                      <div key={member.id} className="px-4 py-4 hover:bg-gray-50 transition-colors">
                        <div className="grid grid-cols-12 gap-3 sm:gap-4 lg:gap-6 items-center">
                          {/* Membro */}
                          <div className="col-span-7 sm:col-span-3">
                            <div className="flex items-center gap-3">
                              {/* Avatar real ou ícone padrão */}
                              <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
                                {member.avatar ? (
                                  <img
                                    src={member.avatar}
                                    alt={member.full_name || member.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                                    <svg
                                      className="w-5 h-5 text-gray-400"
                                      fill="currentColor"
                                      viewBox="0 0 24 24"
                                      xmlns="http://www.w3.org/2000/svg"
                                    >
                                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                                    </svg>
                </div>
                                )}
              </div>
                              <div>
                                <div className="font-medium text-gray-900 text-sm flex items-center gap-2">
                                  {member.full_name || member.name}
                                  {member.id === user?.id && (
                                    <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs">
                                      Você
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-xs text-gray-600">
                                  {member.email}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Último Acesso */}
                          <div className="col-span-2">
                            <div className="text-sm text-gray-900">
                              {formatLastAccess(member.last_login_at, member.first_login_at).date}
                            </div>
                            <div className="text-xs text-gray-500">
                              {formatLastAccess(member.last_login_at, member.first_login_at).relative}
                            </div>
                          </div>

                          {/* Data de Entrada */}
                          <div className="col-span-2">
                            <div className="text-sm text-gray-900">
                              {formatRegistrationDate(member.registration_date, member.created_at).date}
                            </div>
                            <div className="text-xs text-gray-500">
                              {formatRegistrationDate(member.registration_date, member.created_at).relative}
                            </div>
                          </div>

                          {/* Contato */}
                          <div className="hidden sm:block col-span-2">
                            {member.phone ? (
                              <div className="text-sm text-gray-900">
                                {member.phone}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-500">
                                Telefone não informado
                              </div>
                            )}
                          </div>

                          {/* Status */}
                          <div className="hidden sm:block col-span-1">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${isUserOnline(member.last_login_at) ? 'bg-green-500' : 'bg-gray-400'}`} />
                              <span className={`text-xs ${isUserOnline(member.last_login_at) ? 'text-green-600' : 'text-gray-600'}`}>
                                {isUserOnline(member.last_login_at) ? 'Online' : 'Offline'}
                              </span>
                            </div>
                          </div>

                          {/* Ações */}
                          <div className="col-span-5 sm:col-span-2">
                            <div className="flex items-center gap-1">
                              {/* Botão Ver Atividades - Sempre visível */}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleViewUserActivity(member)}
                                className="px-2 py-1 h-8 w-8 text-gray-600 hover:text-gray-700 hover:bg-gray-100"
                                title="Ver todas as alterações e atividades"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>

                              {/* Botão Ativar/Desativar Usuário */}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => member.is_active ? handleDeactivateUser(member) : reactivateUser(member)}
                                className={`px-2 py-1 h-8 w-8 hover:bg-gray-100 ${
                                  member.is_active 
                                    ? 'text-red-500 hover:text-red-600' 
                                    : 'text-green-600 hover:text-green-700'
                                }`}
                                title={member.is_active ? "Desativar usuário (bloquear ações)" : "Reativar usuário"}
                                disabled={member.id === user?.id}
                              >
                                {member.is_active ? (
                                  <UserMinus className="w-4 h-4" />
                                ) : (
                                  <UserPlus className="w-4 h-4" />
                                )}
                              </Button>

                              {/* Botão Promover/Despromover - Só para administradores */}
                              {user?.permissions?.can_manage_users && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => isUserAdmin(member) ? handleDemoteUser(member) : handlePromoteUser(member)}
                                  className="px-2 py-1 h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-gray-100"
                                  title={isUserAdmin(member) ? "Despromover para usuário comum" : "Promover para administrador"}
                                  disabled={member.id === user?.id && isUserAdmin(member)}
                                >
                                  {isUserAdmin(member) ? (
                                    <ArrowDown className="w-4 h-4" />
                                  ) : (
                                    <Crown className="w-4 h-4" />
                                  )}
                                </Button>
                              )}

                              {/* Menu Dropdown com Três Pontos - Apenas Alterar Senha e Excluir */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="px-2 py-1 h-8 w-8 text-gray-600 hover:text-gray-700 hover:bg-gray-100"
                                    title="Mais opções"
                                  >
                                    <MoreVertical className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  {/* Alterar Senha - Só para administradores */}
                                  {user?.permissions?.can_manage_users && (
                                    <DropdownMenuItem
                                      onClick={() => handleChangeUserPassword(member)}
                                      disabled={member.id === user?.id}
                                      className="flex items-center gap-2 hover:bg-gray-50 focus:bg-gray-50"
                                    >
                                      <Lock className="w-4 h-4 text-gray-600" />
                                      <span className="text-gray-700">Alterar senha</span>
                                    </DropdownMenuItem>
                                  )}

                                  {/* Excluir Usuário */}
                                  <DropdownMenuItem
                                    onClick={() => handleDeleteUser(member)}
                                    disabled={member.id === user?.id}
                                    className="flex items-center gap-2 hover:bg-gray-50 focus:bg-gray-50"
                                  >
                                    <Trash2 className="w-4 h-4 text-red-600" />
                                    <span className="text-red-600">Excluir usuário</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>
        </TabsContent>


      </Tabs>

      {/* Modal de Verificação de Senha */}
      <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
        <DialogContent className="max-w-[95vw] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Verificar Senha Atual</DialogTitle>
            <DialogDescription>
              Para revelar sua senha, digite sua senha atual para confirmação.
              Use a mesma senha que utiliza para fazer login.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
              <div className="space-y-2">
              <Label htmlFor="current-password">Senha Atual</Label>
                <div className="relative">
                <Input
                  id="current-password"
                  type={showModalPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Digite sua senha atual"
                  className="border-gray-300 pr-10"
                  style={{ outline: 'none', boxShadow: 'none' }}
                  onKeyPress={(e) => e.key === 'Enter' && !isVerifying && handlePasswordVerification()}
                />
                <button
                  type="button"
                  onClick={toggleModalPassword}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-all duration-200 ease-in-out focus:outline-none"
                >
                  <div className="relative w-4 h-4">
                    {/* Olho Aberto - quando senha está visível */}
                    <svg 
                      className={`h-4 w-4 absolute inset-0 transition-all duration-300 ease-in-out ${
                        showModalPassword 
                          ? 'opacity-100 scale-100 rotate-0' 
                          : 'opacity-0 scale-75 rotate-12'
                      }`}
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                    
                    {/* Olho Fechado - quando senha está oculta */}
                    <svg 
                      className={`h-4 w-4 absolute inset-0 transition-all duration-300 ease-in-out ${
                        showModalPassword 
                          ? 'opacity-0 scale-75 rotate-12' 
                          : 'opacity-100 scale-100 rotate-0'
                      }`}
                      xmlns="http://www.w3.org/2000/svg" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"
                    >
                      <path d="m15 18-.722-3.25"/>
                      <path d="M2 8a10.645 10.645 0 0 0 20 0"/>
                      <path d="m20 15-1.726-2.05"/>
                      <path d="m4 15 1.726-2.05"/>
                      <path d="m9 18 .722-3.25"/>
                    </svg>
                </div>
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline" 
              onClick={closePasswordModal}
              disabled={isVerifying}
              className="bg-white text-black border-gray-300 hover:bg-gray-100 hover:text-black"
            >
              Cancelar
            </Button>
            <Button 
              onClick={handlePasswordVerification}
              disabled={!currentPassword || isVerifying}
              className="bg-black text-white hover:bg-gray-800"
            >
              {isVerifying ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Verificando...
                </>
              ) : (
                'Verificar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Atividades do Usuário */}
      <Dialog open={showActionsModal} onOpenChange={setShowActionsModal}>
        <DialogContent className="max-w-[95vw] sm:max-w-[700px] max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Histórico de Atividades
            </DialogTitle>
            <DialogDescription>
              {selectedMemberActions?.full_name || selectedMemberActions?.name} - Todas as ações realizadas no sistema
            </DialogDescription>
          </DialogHeader>

              <div className="space-y-4">
            {/* Lista de atividades */}
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {userActivities.length > 0 ? (
                userActivities.map((activity, index) => {
                  const getActivityIcon = (type: string) => {
                    switch (type) {
                      case 'login': return <Activity className="w-4 h-4 text-gray-500" />;
                      case 'profile_update': return <Edit className="w-4 h-4 text-gray-500" />;
                      
                      // Leilões
                      case 'auction_create': return <Plus className="w-4 h-4 text-gray-500" />;
                      case 'auction_update': return <Edit className="w-4 h-4 text-gray-500" />;
                      case 'auction_delete': return <Trash2 className="w-4 h-4 text-red-500" />;
                      case 'auction_archive': return <Archive className="w-4 h-4 text-gray-500" />;
                      case 'auction_unarchive': return <RefreshCw className="w-4 h-4 text-gray-500" />;
                      case 'auction_duplicate': return <Copy className="w-4 h-4 text-gray-500" />;
                      case 'auction_view': return <Eye className="w-4 h-4 text-blue-500" />;
                      case 'auction_export_pdf': return <Download className="w-4 h-4 text-gray-500" />;
                      case 'auction_open_edit': return <Edit className="w-4 h-4 text-amber-500" />;
                      
                      // Arrematantes
                      case 'bidder_create': return <UserPlus className="w-4 h-4 text-gray-500" />;
                      case 'bidder_update': return <Users className="w-4 h-4 text-gray-500" />;
                      case 'bidder_delete': return <UserMinus className="w-4 h-4 text-red-500" />;
                      case 'bidder_add': return <Users className="w-4 h-4 text-gray-500" />;
                      
                      // Pagamentos (novos)
                      case 'pagamento_marcar_pago': return <DollarSign className="w-4 h-4 text-gray-500" />;
                      case 'pagamento_marcar_nao_pago': return <DollarSign className="w-4 h-4 text-gray-500" />;
                      case 'pagamento_atualizar_parcelas': return <CreditCard className="w-4 h-4 text-gray-500" />;
                      
                      // Pagamentos (antigos - compatibilidade)
                      case 'payment_mark_paid': return <DollarSign className="w-4 h-4 text-gray-500" />;
                      case 'payment_mark_unpaid': return <DollarSign className="w-4 h-4 text-gray-500" />;
                      case 'payment_update_installments': return <CreditCard className="w-4 h-4 text-gray-500" />;
                      
                      // Documentos
                      case 'document_upload': return <Upload className="w-4 h-4 text-gray-500" />;
                      case 'document_delete': return <Trash2 className="w-4 h-4 text-red-500" />;
                      case 'document_view': return <Eye className="w-4 h-4 text-gray-500" />;
                      
                      // Lotes e Mercadorias
                      case 'lot_create': return <Plus className="w-4 h-4 text-gray-500" />;
                      case 'lot_update': return <Edit className="w-4 h-4 text-gray-500" />;
                      case 'lot_delete': return <Trash2 className="w-4 h-4 text-red-500" />;
                      case 'lot_view': return <Eye className="w-4 h-4 text-blue-500" />;
                      case 'lot_open_edit': return <Edit className="w-4 h-4 text-amber-500" />;
                      case 'merchandise_create': return <Plus className="w-4 h-4 text-gray-500" />;
                      case 'merchandise_update': return <Edit className="w-4 h-4 text-gray-500" />;
                      case 'merchandise_delete': return <Trash2 className="w-4 h-4 text-red-500" />;
                      
                      // Patrocinadores
                      case 'sponsor_view': return <Eye className="w-4 h-4 text-blue-500" />;
                      case 'sponsor_open_edit': return <Edit className="w-4 h-4 text-amber-500" />;
                      case 'sponsor_payment_update': return <DollarSign className="w-4 h-4 text-green-500" />;
                      case 'sponsor_payment_modal_open': return <Handshake className="w-4 h-4 text-gray-500" />;
                      case 'sponsor_new_flow_start': return <Plus className="w-4 h-4 text-gray-500" />;
                      case 'sponsor_select_auction': return <Handshake className="w-4 h-4 text-gray-500" />;
                      case 'sponsor_view_in_auction': return <Eye className="w-4 h-4 text-gray-500" />;
                      case 'sponsor_create': return <Plus className="w-4 h-4 text-gray-500" />;
                      case 'sponsor_update': return <Edit className="w-4 h-4 text-gray-500" />;
                      case 'sponsor_delete': return <Trash2 className="w-4 h-4 text-red-500" />;
                      case 'sponsor_archive': return <Archive className="w-4 h-4 text-gray-500" />;
                      case 'sponsor_unarchive': return <RefreshCw className="w-4 h-4 text-gray-500" />;
                      
                      // Relatórios
                      case 'report_generate': return <FileText className="w-4 h-4 text-gray-500" />;
                      case 'report_export': return <Download className="w-4 h-4 text-gray-500" />;
                      case 'report_view': return <Eye className="w-4 h-4 text-gray-500" />;
                      
                      // Usuários
                      case 'user_create': return <UserPlus className="w-4 h-4 text-gray-500" />;
                      case 'user_delete': return <Trash2 className="w-4 h-4 text-red-500" />;
                      case 'user_deactivate': return <UserMinus className="w-4 h-4 text-gray-500" />;
                      case 'user_reactivate': return <UserPlus className="w-4 h-4 text-gray-500" />;
                      case 'user_promote': return <UserCheck className="w-4 h-4 text-gray-500" />;
                      case 'user_demote': return <UserMinus className="w-4 h-4 text-gray-500" />;
                      case 'password_change': return <Key className="w-4 h-4 text-gray-500" />;
                      
                      // Configurações
                      case 'config_update': return <Settings className="w-4 h-4 text-gray-500" />;
                      case 'config_backup': return <Database className="w-4 h-4 text-gray-500" />;
                      case 'config_restore': return <RefreshCw className="w-4 h-4 text-gray-500" />;
                      case 'history_clear': return <Trash2 className="w-4 h-4 text-red-500" />;
                      
                      default: return <Activity className="w-4 h-4 text-gray-500" />;
                    }
                  };

                  // Separar título e subtítulo
                  const getActivityTitle = (description: string) => {
                    // Extrair a ação principal (verbo + objeto principal)
                    if (description.includes('"')) {
                      // Para ações com nomes entre aspas: "Criou o leilão" + detalhes
                      const beforeQuote = description.split('"')[0].trim();
                      return beforeQuote;
                    } else if (description.includes(' - ')) {
                      // Para ações com traço: "Marcou parcela como paga para" + detalhes
                      const beforeDash = description.split(' - ')[0];
                      if (beforeDash.includes(' para ')) {
                        return beforeDash.split(' para ')[0].trim();
                      }
                      return beforeDash.trim();
                    }
                    return description;
                  };

                  const getActivitySubtitle = (description: string) => {
                    // Extrair os detalhes (nome do item, valores, etc.)
                    if (description.includes('"')) {
                      // Pegar tudo a partir das aspas
                      const fromQuote = description.substring(description.indexOf('"'));
                      return fromQuote;
                    } else if (description.includes(' - ')) {
                      // Pegar detalhes após o traço
                      const afterDash = description.split(' - ')[1];
                      return afterDash || null;
                    } else if (description.includes(' para ')) {
                      // Pegar detalhes após "para"
                      const afterPara = description.substring(description.indexOf(' para ') + 6);
                      return afterPara || null;
                    }
                    return null;
                  };

                  return (
                    <div key={activity.id || index} className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className="flex-shrink-0 mt-1">
                        {getActivityIcon(activity.action_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-gray-900 leading-tight">
                              {getActivityTitle(activity.action_description)}
                            </p>
                            {getActivitySubtitle(activity.action_description) && (
                              <p className="text-sm text-gray-500 mt-1">
                                {getActivitySubtitle(activity.action_description)}
                              </p>
                            )}
                  </div>
                          <span className="text-xs text-gray-500 whitespace-nowrap sm:ml-2">
                            {new Date(activity.created_at).toLocaleDateString('pt-BR')} às{' '}
                            {new Date(activity.created_at).toLocaleTimeString('pt-BR', { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </span>
                </div>
                        {activity.target_type && (
                          <Badge variant="outline" className="mt-2 text-xs">
                            {activity.target_type === 'auction' && 'Leilão'}
                            {activity.target_type === 'bidder' && 'Arrematante'}
                            {activity.target_type === 'user' && 'Usuário'}
                            {activity.target_type === 'profile' && 'Perfil'}
                            {activity.target_type === 'auth' && 'Autenticação'}
                            {activity.target_type === 'payment' && 'Pagamento'}
                            {activity.target_type === 'pagamento' && 'Pagamento'}
                            {activity.target_type === 'document' && 'Documento'}
                            {activity.target_type === 'lot' && 'Lote'}
                            {activity.target_type === 'merchandise' && 'Mercadoria'}
                            {activity.target_type === 'report' && 'Relatório'}
                            {activity.target_type === 'config' && 'Configuração'}
                            {activity.target_type === 'sponsor' && 'Patrocinador'}
                            {!['auction', 'bidder', 'user', 'profile', 'auth', 'payment', 'pagamento', 'document', 'lot', 'merchandise', 'report', 'config', 'sponsor'].includes(activity.target_type) && activity.target_type}
                          </Badge>
                        )}
                  </div>
                </div>
                  );
                })
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <History className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">Nenhuma atividade registrada</p>
                  <p className="text-sm">Este usuário ainda não realizou ações no sistema</p>
                  </div>
              )}
                </div>

            {/* Paginação */}
            {totalActivities > ACTIVITIES_PER_PAGE && (
              <div className="flex items-center justify-center border-t pt-4">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleActivityPageChange(activitiesPage - 1)}
                    disabled={activitiesPage === 1}
                    className="px-3 text-black hover:bg-gray-100 hover:text-black"
                  >
                    ←
              </Button>
                  
                  <span className="text-sm text-gray-700 px-4">
                    Página {activitiesPage} de {Math.ceil(totalActivities / ACTIVITIES_PER_PAGE)}
                  </span>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleActivityPageChange(activitiesPage + 1)}
                    disabled={activitiesPage >= Math.ceil(totalActivities / ACTIVITIES_PER_PAGE)}
                    className="px-3 text-black hover:bg-gray-100 hover:text-black"
                  >
                    →
                  </Button>
                  </div>
                </div>
            )}
                  </div>

          <DialogFooter className="flex justify-center relative">
             {/* Botão Limpar Histórico - Apenas para administradores */}
             {user?.permissions?.can_manage_users && (
               <Button 
                 variant="ghost" 
                 size="sm"
                 onClick={handleClearHistory}
                 className="absolute left-0 text-red-600 hover:bg-red-50 hover:text-red-600 px-3 py-2"
                 title="Limpar histórico de atividades"
               >
                 <Trash2 className="w-4 h-4" />
               </Button>
             )}
            
            <Button 
              variant="outline" 
              size="lg"
              onClick={() => setShowActionsModal(false)}
              className="hover:bg-gray-100 hover:text-black text-black border-gray-300 px-6"
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Desativação */}
      <Dialog open={showDeactivateModal} onOpenChange={setShowDeactivateModal}>
        <DialogContent className="max-w-[95vw] sm:max-w-[550px]">
          <DialogHeader className="text-center pb-4">
            <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <UserMinus className="w-6 h-6 text-red-600" />
                </div>
            <DialogTitle className="text-xl text-gray-900">
              Desativar Usuário
            </DialogTitle>
            <DialogDescription className="text-gray-500">
              Esta ação irá desativar <strong>{selectedUserForAction?.full_name || selectedUserForAction?.name}</strong>.
              O usuário não poderá mais editar ou criar conteúdo. Esta ação pode ser revertida.
            </DialogDescription>
          </DialogHeader>
          
              <div className="space-y-4">

            <div className="space-y-2">
              <Label htmlFor="confirm-deactivate" className="text-sm font-medium">
                Para confirmar, digite a frase exata:
              </Label>
              <div className="py-2">
                <p className="text-sm font-mono text-red-600 select-all">
                  "Eu confirmo que quero desativar {selectedUserForAction?.full_name || selectedUserForAction?.name}"
                    </p>
                  </div>
              <Input
                id="confirm-deactivate"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Digite aqui..."
                className="font-mono text-sm"
                style={{ outline: 'none', boxShadow: 'none' }}
                  />
                </div>
          </div>

          <DialogFooter className="pt-6">
            <Button
              variant="outline"
              onClick={() => {
                setShowDeactivateModal(false);
                setConfirmText("");
              }}
              disabled={isProcessingAction}
              className="hover:bg-gray-100 hover:text-black text-black"
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmDeactivateUser}
              disabled={
                isProcessingAction || 
                confirmText !== `Eu confirmo que quero desativar ${selectedUserForAction?.full_name || selectedUserForAction?.name}`
              }
              className="bg-red-600 hover:bg-red-700 text-white min-w-0 sm:min-w-[120px]"
            >
              {isProcessingAction ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Desativando...
                </>
              ) : (
                'Desativar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Exclusão */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="max-w-[95vw] sm:max-w-[550px]">
          <DialogHeader className="text-center pb-4">
            <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <DialogTitle className="text-xl text-gray-900">
              Excluir Permanentemente
            </DialogTitle>
            <DialogDescription className="text-gray-500">
              Esta ação irá excluir permanentemente <strong>{selectedUserForAction?.full_name || selectedUserForAction?.name}</strong>{' '}
              do sistema. Todos os dados serão perdidos e esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">

            <div className="space-y-2">
              <Label htmlFor="confirm-delete" className="text-sm font-medium">
                Para confirmar, digite a frase exata:
              </Label>
              <div className="py-2">
                <p className="text-sm font-mono text-red-600 select-all">
                  "Eu confirmo que quero excluir {selectedUserForAction?.full_name || selectedUserForAction?.name}"
                    </p>
                  </div>
              <Input
                id="confirm-delete"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Digite aqui..."
                className="font-mono text-sm border-red-200"
                style={{ outline: 'none', boxShadow: 'none' }}
                  />
                </div>
              </div>

          <DialogFooter className="pt-6">
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteModal(false);
                setConfirmText("");
              }}
              disabled={isProcessingAction}
              className="hover:bg-gray-100 hover:text-black text-black"
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmDeleteUser}
              disabled={
                isProcessingAction || 
                confirmText !== `Eu confirmo que quero excluir ${selectedUserForAction?.full_name || selectedUserForAction?.name}`
              }
              className="bg-red-700 hover:bg-red-800 text-white min-w-0 sm:min-w-[120px]"
            >
              {isProcessingAction ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                'Excluir'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Limpeza de Histórico */}
      <Dialog open={showClearHistoryModal} onOpenChange={setShowClearHistoryModal}>
        <DialogContent className="max-w-[95vw] sm:max-w-[500px]">
          <DialogHeader className="text-center pb-4">
            <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <Database className="w-6 h-6 text-red-600" />
    </div>
            <DialogTitle className="text-xl text-gray-900">
              Limpar Histórico de Atividades
            </DialogTitle>
            <DialogDescription className="text-gray-500">
              Esta ação irá remover permanentemente todo o histórico de atividades de{' '}
              <strong>{selectedMemberActions?.full_name || selectedMemberActions?.name}</strong>.
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
              <p className="text-sm text-yellow-800">
                <strong>Atenção:</strong> Todas as atividades registradas deste usuário serão removidas do sistema.
                    </p>
                  </div>
          </div>

          <DialogFooter className="pt-6">
            <Button
              variant="outline"
              onClick={() => setShowClearHistoryModal(false)}
              disabled={isClearingHistory}
              className="hover:bg-gray-100 hover:text-black text-black"
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmClearHistory}
              disabled={isClearingHistory}
              className="bg-red-600 hover:bg-red-700 text-white min-w-0 sm:min-w-[140px]"
            >
              {isClearingHistory ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Limpando...
                </>
              ) : (
                'Limpar Histórico'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Adicionar Novo Usuário */}
      <Dialog open={showAddUserModal} onOpenChange={(open) => {
        setShowAddUserModal(open);
        if (!open) clearNewUserForm();
      }}>
        <DialogContent className="max-w-[95vw] sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-gray-600" />
              Adicionar Novo Membro
            </DialogTitle>
            <DialogDescription className="text-gray-500">
              Preencha as informações abaixo para adicionar um novo membro à equipe.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="user-name" className="text-sm font-medium text-gray-700">
                  Nome de Login
                </Label>
                <Input
                  id="user-name"
                  value={newUser.name}
                  onChange={(e) => handleNewUserChange('name', e.target.value)}
                  placeholder="Ex: João Silva"
                  disabled={isAddingUser}
                  className="border-gray-300 focus:border-gray-400"
                  />
                </div>
              
              <div className="space-y-2">
                <Label htmlFor="user-fullname" className="text-sm font-medium text-gray-700">
                  Nome Completo
                </Label>
                <Input
                  id="user-fullname"
                  value={newUser.fullName}
                  onChange={(e) => handleNewUserChange('fullName', e.target.value)}
                  placeholder="Ex: João da Silva Santos"
                  disabled={isAddingUser}
                  className="border-gray-300 focus:border-gray-400"
                />
                  </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-email" className="text-sm font-medium text-gray-700">
                Email
              </Label>
              <Input
                id="user-email"
                type="email"
                value={newUser.email}
                onChange={(e) => handleNewUserChange('email', e.target.value)}
                placeholder="joao.silva@arthurlira.com"
                disabled={isAddingUser}
                className="border-gray-300 focus:border-gray-400"
                  />
                </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="user-phone" className="text-sm font-medium text-gray-700">
                  Telefone
                </Label>
                <Input
                  id="user-phone"
                  value={newUser.phone}
                  onChange={(e) => handleNewUserChange('phone', e.target.value)}
                  placeholder="(82) 99999-9999"
                  disabled={isAddingUser}
                  className="border-gray-300 focus:border-gray-400"
                  maxLength={15}
                />
                  </div>

              <div className="space-y-2">
                <Label htmlFor="user-password" className="text-sm font-medium text-gray-700">
                  Senha
                </Label>
                <div className="relative">
                  <Input
                    id="user-password"
                    type={showNewUserPassword ? "text" : "password"}
                    value={newUser.password}
                    onChange={(e) => handleNewUserChange('password', e.target.value)}
                    placeholder="Senha do usuário"
                    disabled={isAddingUser}
                    className="border-gray-300 focus:border-gray-400 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewUserPassword(!showNewUserPassword)}
                    disabled={isAddingUser}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    <div className="relative w-5 h-5">
                      {/* Olho Aberto - quando senha está visível */}
                      <svg 
                        className={`h-5 w-5 absolute inset-0 transition-all duration-300 ease-in-out ${
                          showNewUserPassword 
                            ? 'opacity-100 scale-100 rotate-0' 
                            : 'opacity-0 scale-75 rotate-12'
                        }`}
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                      
                      {/* Olho Fechado - quando senha está oculta */}
                      <svg 
                        className={`h-5 w-5 absolute inset-0 transition-all duration-300 ease-in-out ${
                          showNewUserPassword 
                            ? 'opacity-0 scale-75 rotate-12' 
                            : 'opacity-100 scale-100 rotate-0'
                        }`}
                        xmlns="http://www.w3.org/2000/svg" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                      >
                        <path d="m15 18-.722-3.25"/>
                        <path d="M2 8a10.645 10.645 0 0 0 20 0"/>
                        <path d="m20 15-1.726-2.05"/>
                        <path d="m4 15 1.726-2.05"/>
                        <path d="m9 18 .722-3.25"/>
                      </svg>
                </div>
                  </button>
              </div>
              </div>
            </div>

            {/* Seção de Nível de Acesso */}
            <div className="space-y-3 pt-4 border-t border-gray-200">
              <Label className="text-sm font-medium text-gray-700">
                Nível de Acesso
              </Label>
              
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => handleNewUserChange('isAdmin', false)}
                    disabled={isAddingUser}
                    className={`w-5 h-5 rounded border-2 transition-colors ${
                      !newUser.isAdmin 
                        ? 'bg-gray-600 border-gray-600' 
                        : 'bg-white border-gray-300 hover:border-gray-400'
                    } ${isAddingUser ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    {!newUser.isAdmin && (
                      <svg className="w-3 h-3 text-white mx-auto" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <Label htmlFor="access-user" className="text-sm text-gray-700 cursor-pointer" onClick={() => !isAddingUser && handleNewUserChange('isAdmin', false)}>
                    <div>
                      <div className="font-medium">Usuário</div>
                      <div className="text-xs text-gray-500">Pode editar informações, mas não pode criar/deletar registros nem gerenciar usuários</div>
    </div>
                  </Label>
                </div>

                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => handleNewUserChange('isAdmin', true)}
                    disabled={isAddingUser}
                    className={`w-5 h-5 rounded border-2 transition-colors ${
                      newUser.isAdmin 
                        ? 'bg-gray-600 border-gray-600' 
                        : 'bg-white border-gray-300 hover:border-gray-400'
                    } ${isAddingUser ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    {newUser.isAdmin && (
                      <svg className="w-3 h-3 text-white mx-auto" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <Label htmlFor="access-admin" className="text-sm text-gray-700 cursor-pointer" onClick={() => !isAddingUser && handleNewUserChange('isAdmin', true)}>
                    <div>
                      <div className="font-medium">Administrador</div>
                      <div className="text-xs text-gray-500">Acesso completo: pode editar, criar, deletar registros e gerenciar usuários</div>
                    </div>
                  </Label>
                </div>
              </div>
            </div>

          </div>

          <DialogFooter className="pt-6">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddUserModal(false);
                clearNewUserForm();
              }}
              disabled={isAddingUser}
              className="hover:bg-gray-100 hover:text-black text-black border-gray-300"
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmAddUser}
              disabled={isAddingUser}
              className="bg-black hover:bg-gray-800 text-white min-w-0 sm:min-w-[140px]"
            >
              {isAddingUser ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                'Adicionar Membro'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Promoção/Despromoção */}
      <Dialog open={showPromotionModal} onOpenChange={setShowPromotionModal}>
        <DialogContent className="max-w-[95vw] sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {promotionAction === 'promote' ? (
                <Crown className="w-5 h-5 text-blue-600" />
              ) : (
                <ArrowDown className="w-5 h-5 text-blue-600" />
              )}
              {promotionAction === 'promote' ? 'Promover Usuário' : 'Despromover Administrador'}
            </DialogTitle>
            <DialogDescription className="text-gray-500">
              {promotionAction === 'promote' 
                ? 'Promover este usuário para administrador dará acesso completo ao sistema.'
                : 'Despromover este administrador removerá suas permissões de criação e exclusão.'
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                </div>
                <div>
                  <div className="font-medium text-gray-900">
                    {selectedUserForPromotion?.full_name || selectedUserForPromotion?.name}
                  </div>
                  <div className="text-sm text-gray-600">
                    {selectedUserForPromotion?.email}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium text-gray-900">
                {promotionAction === 'promote' ? 'Permissões que serão concedidas:' : 'Permissões que serão removidas:'}
              </h4>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                  {promotionAction === 'promote' ? 'Criar novos registros e leilões' : 'Criar novos registros e leilões (será removido)'}
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                  {promotionAction === 'promote' ? 'Excluir registros e usuários' : 'Excluir registros e usuários (será removido)'}
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                  {promotionAction === 'promote' ? 'Gerenciar outros usuários' : 'Gerenciar outros usuários (será removido)'}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-6">
            <Button
              variant="outline"
              onClick={() => setShowPromotionModal(false)}
              disabled={isProcessingPromotion}
              className="hover:bg-gray-100 hover:text-black text-black border-gray-300"
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmPromotionChange}
              disabled={isProcessingPromotion}
              className={`min-w-0 sm:min-w-[140px] ${
                promotionAction === 'promote' 
                  ? 'bg-blue-600 hover:bg-blue-700' 
                  : 'bg-blue-600 hover:bg-blue-700'
              } text-white`}
            >
              {isProcessingPromotion ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  {promotionAction === 'promote' ? 'Promovendo...' : 'Despromovendo...'}
                </>
              ) : (
                promotionAction === 'promote' ? 'Promover' : 'Despromover'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Senha do Administrador */}
      <Dialog open={showAdminPasswordConfirmModal} onOpenChange={closePasswordChangeModals}>
        <DialogContent className="max-w-[95vw] sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-600" />
              Confirmar Identidade
            </DialogTitle>
            <DialogDescription>
              Para alterar a senha de <strong>{selectedUserForPasswordChange?.full_name || selectedUserForPasswordChange?.name}</strong>, 
              confirme sua identidade digitando sua senha de administrador.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-password-confirm" className="text-sm font-medium">
                Sua Senha de Administrador
              </Label>
              <div className="relative">
                <Input
                  id="admin-password-confirm"
                  type={showAdminPasswordField ? "text" : "password"}
                  value={adminPasswordForConfirm}
                  onChange={(e) => setAdminPasswordForConfirm(e.target.value)}
                  placeholder="Digite sua senha atual"
                  className="border-gray-300 focus:border-gray-400 pr-10"
                  style={{ outline: 'none', boxShadow: 'none' }}
                  onKeyPress={(e) => e.key === 'Enter' && !isVerifyingAdminPassword && handleAdminPasswordConfirmation()}
                />
                <button
                  type="button"
                  onClick={() => setShowAdminPasswordField(!showAdminPasswordField)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  <div className="relative w-4 h-4">
                    {/* Olho Aberto - quando senha está visível */}
                    <svg 
                      className={`h-4 w-4 absolute inset-0 transition-all duration-300 ease-in-out ${
                        showAdminPasswordField 
                          ? 'opacity-100 scale-100 rotate-0' 
                          : 'opacity-0 scale-75 rotate-12'
                      }`}
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                    
                    {/* Olho Fechado - quando senha está oculta */}
                    <svg 
                      className={`h-4 w-4 absolute inset-0 transition-all duration-300 ease-in-out ${
                        showAdminPasswordField 
                          ? 'opacity-0 scale-75 rotate-12' 
                          : 'opacity-100 scale-100 rotate-0'
                      }`}
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2"
                    >
                      <path d="m15 18-.722-3.25"/>
                      <path d="M2 8a10.645 10.645 0 0 0 20 0"/>
                      <path d="m20 15-1.726-2.05"/>
                      <path d="m4 15 1.726-2.05"/>
                      <path d="m9 18 .722-3.25"/>
                    </svg>
                  </div>
                </button>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-6">
            <Button
              variant="outline"
              onClick={closePasswordChangeModals}
              disabled={isVerifyingAdminPassword}
              className="hover:bg-gray-100 hover:text-black text-black border-gray-300"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAdminPasswordConfirmation}
              disabled={!adminPasswordForConfirm || isVerifyingAdminPassword}
              className="bg-black hover:bg-gray-800 text-white min-w-0 sm:min-w-[120px] btn-save-click"
            >
              {isVerifyingAdminPassword ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Verificando...
                </>
              ) : (
                'Confirmar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Alteração de Senha */}
      <Dialog open={showChangePasswordModal} onOpenChange={closePasswordChangeModals}>
        <DialogContent className="max-w-[95vw] sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-600" />
              Alterar Senha do Usuário
            </DialogTitle>
            <DialogDescription>
              Defina uma nova senha para <strong>{selectedUserForPasswordChange?.full_name || selectedUserForPasswordChange?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                </div>
                <div>
                  <div className="font-medium text-gray-900">
                    {selectedUserForPasswordChange?.full_name || selectedUserForPasswordChange?.name}
                  </div>
                  <div className="text-sm text-gray-600">
                    {selectedUserForPasswordChange?.email}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-user-password" className="text-sm font-medium">
                  Nova Senha
                </Label>
                <div className="relative">
                  <Input
                    id="new-user-password"
                    type={showNewPasswordFields ? "text" : "password"}
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    placeholder="Digite a nova senha"
                    className="border-gray-300 focus:border-gray-400 pr-10"
                    style={{ outline: 'none', boxShadow: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPasswordFields(!showNewPasswordFields)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    <div className="relative w-4 h-4">
                      {/* Olho Aberto - quando senha está visível */}
                      <svg 
                        className={`h-4 w-4 absolute inset-0 transition-all duration-300 ease-in-out ${
                          showNewPasswordFields 
                            ? 'opacity-100 scale-100 rotate-0' 
                            : 'opacity-0 scale-75 rotate-12'
                        }`}
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                      
                      {/* Olho Fechado - quando senha está oculta */}
                      <svg 
                        className={`h-4 w-4 absolute inset-0 transition-all duration-300 ease-in-out ${
                          showNewPasswordFields 
                            ? 'opacity-0 scale-75 rotate-12' 
                            : 'opacity-100 scale-100 rotate-0'
                        }`}
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2"
                      >
                        <path d="m15 18-.722-3.25"/>
                        <path d="M2 8a10.645 10.645 0 0 0 20 0"/>
                        <path d="m20 15-1.726-2.05"/>
                        <path d="m4 15 1.726-2.05"/>
                        <path d="m9 18 .722-3.25"/>
                      </svg>
                    </div>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-new-user-password" className="text-sm font-medium">
                  Confirmar Nova Senha
                </Label>
                <div className="relative">
                  <Input
                    id="confirm-new-user-password"
                    type={showConfirmNewPasswordFields ? "text" : "password"}
                    value={confirmNewUserPassword}
                    onChange={(e) => setConfirmNewUserPassword(e.target.value)}
                    placeholder="Digite novamente a nova senha"
                    className="border-gray-300 focus:border-gray-400 pr-10"
                    style={{ outline: 'none', boxShadow: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmNewPasswordFields(!showConfirmNewPasswordFields)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    <div className="relative w-4 h-4">
                      {/* Olho Aberto - quando senha está visível */}
                      <svg 
                        className={`h-4 w-4 absolute inset-0 transition-all duration-300 ease-in-out ${
                          showConfirmNewPasswordFields 
                            ? 'opacity-100 scale-100 rotate-0' 
                            : 'opacity-0 scale-75 rotate-12'
                        }`}
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                      
                      {/* Olho Fechado - quando senha está oculta */}
                      <svg 
                        className={`h-4 w-4 absolute inset-0 transition-all duration-300 ease-in-out ${
                          showConfirmNewPasswordFields 
                            ? 'opacity-0 scale-75 rotate-12' 
                            : 'opacity-100 scale-100 rotate-0'
                        }`}
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2"
                      >
                        <path d="m15 18-.722-3.25"/>
                        <path d="M2 8a10.645 10.645 0 0 0 20 0"/>
                        <path d="m20 15-1.726-2.05"/>
                        <path d="m4 15 1.726-2.05"/>
                        <path d="m9 18 .722-3.25"/>
                      </svg>
                    </div>
                  </button>
                </div>
              </div>
            </div>

          </div>

          <DialogFooter className="pt-6">
            <Button
              variant="outline"
              onClick={closePasswordChangeModals}
              disabled={isChangingPassword}
              className="hover:bg-gray-100 hover:text-black text-black border-gray-300"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmPasswordChange}
              disabled={
                isChangingPassword || 
                !newUserPassword || 
                !confirmNewUserPassword || 
                newUserPassword !== confirmNewUserPassword
              }
              className="bg-black hover:bg-gray-800 text-white min-w-0 sm:min-w-[140px] btn-save-click"
            >
              {isChangingPassword ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Alterando...
                </>
              ) : (
                'Alterar Senha'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
    </>
  );
}
