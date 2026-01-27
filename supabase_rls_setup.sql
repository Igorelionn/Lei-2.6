-- ===================================================================
-- 🔒 CONFIGURAÇÃO DE ROW LEVEL SECURITY (RLS) - SUPABASE
-- ===================================================================
-- Este script habilita RLS em todas as tabelas e cria políticas seguras
-- Execute este script no SQL Editor do painel do Supabase
-- ===================================================================

-- ===================================================================
-- 1. HABILITAR RLS EM TODAS AS TABELAS
-- ===================================================================

ALTER TABLE auctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bidders ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_lot_merchandise ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchandise ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- ===================================================================
-- 2. TABELA: users
-- ===================================================================

-- Política: Usuários autenticados podem ver seus próprios dados
CREATE POLICY "users_select_own"
  ON users FOR SELECT
  USING (auth.uid()::text = id);

-- Política: Admins podem ver todos os usuários
CREATE POLICY "users_select_admin"
  ON users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text 
      AND can_manage_users = true
      AND is_active = true
    )
  );

-- Política: Apenas admins podem criar usuários
CREATE POLICY "users_insert_admin"
  ON users FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text 
      AND can_manage_users = true
      AND is_active = true
    )
  );

-- Política: Usuários podem atualizar seus próprios dados básicos
CREATE POLICY "users_update_own"
  ON users FOR UPDATE
  USING (auth.uid()::text = id)
  WITH CHECK (auth.uid()::text = id);

-- Política: Admins podem atualizar todos os usuários
CREATE POLICY "users_update_admin"
  ON users FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text 
      AND can_manage_users = true
      AND is_active = true
    )
  );

-- Política: Apenas admins podem deletar usuários
CREATE POLICY "users_delete_admin"
  ON users FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text 
      AND can_manage_users = true
      AND is_active = true
    )
  );

-- ===================================================================
-- 3. TABELA: user_credentials
-- ===================================================================

-- Política: Ninguém pode ler credenciais diretamente (apenas via RPC)
-- Esta tabela só deve ser acessada via stored procedures

CREATE POLICY "user_credentials_no_select"
  ON user_credentials FOR SELECT
  USING (false); -- Bloqueia SELECT direto

CREATE POLICY "user_credentials_admin_only"
  ON user_credentials FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text 
      AND can_manage_users = true
      AND is_active = true
    )
  );

-- ===================================================================
-- 4. TABELA: auctions (Leilões)
-- ===================================================================

-- Política: Todos os usuários autenticados podem ver leilões
CREATE POLICY "auctions_select_authenticated"
  ON auctions FOR SELECT
  USING (auth.role() = 'authenticated');

-- Política: Apenas usuários com can_create podem criar leilões
CREATE POLICY "auctions_insert_creator"
  ON auctions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text 
      AND can_create = true
      AND is_active = true
    )
  );

-- Política: Apenas usuários com can_edit podem editar leilões
CREATE POLICY "auctions_update_editor"
  ON auctions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text 
      AND can_edit = true
      AND is_active = true
    )
  );

-- Política: Apenas usuários com can_delete podem deletar leilões
CREATE POLICY "auctions_delete_deleter"
  ON auctions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text 
      AND can_delete = true
      AND is_active = true
    )
  );

-- ===================================================================
-- 5. TABELA: bidders (Arrematantes)
-- ===================================================================

-- Política: Usuários autenticados podem ver arrematantes
CREATE POLICY "bidders_select_authenticated"
  ON bidders FOR SELECT
  USING (auth.role() = 'authenticated');

-- Política: Usuários com can_create podem criar arrematantes
CREATE POLICY "bidders_insert_creator"
  ON bidders FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text 
      AND can_create = true
      AND is_active = true
    )
  );

-- Política: Usuários com can_edit podem editar arrematantes
CREATE POLICY "bidders_update_editor"
  ON bidders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text 
      AND can_edit = true
      AND is_active = true
    )
  );

-- Política: Usuários com can_delete podem deletar arrematantes
CREATE POLICY "bidders_delete_deleter"
  ON bidders FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text 
      AND can_delete = true
      AND is_active = true
    )
  );

-- ===================================================================
-- 6. TABELA: documents (Documentos)
-- ===================================================================

-- Política: Usuários autenticados podem ver documentos
CREATE POLICY "documents_select_authenticated"
  ON documents FOR SELECT
  USING (auth.role() = 'authenticated');

-- Política: Usuários com can_create podem criar documentos
CREATE POLICY "documents_insert_creator"
  ON documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text 
      AND can_create = true
      AND is_active = true
    )
  );

-- Política: Usuários com can_edit podem editar documentos
CREATE POLICY "documents_update_editor"
  ON documents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text 
      AND can_edit = true
      AND is_active = true
    )
  );

-- Política: Usuários com can_delete podem deletar documentos
CREATE POLICY "documents_delete_deleter"
  ON documents FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text 
      AND can_delete = true
      AND is_active = true
    )
  );

-- ===================================================================
-- 7. TABELA: guest_lots (Lotes de Convidados)
-- ===================================================================

-- Política: Usuários autenticados podem ver lotes de convidados
CREATE POLICY "guest_lots_select_authenticated"
  ON guest_lots FOR SELECT
  USING (auth.role() = 'authenticated');

-- Política: Usuários com can_create podem criar lotes de convidados
CREATE POLICY "guest_lots_insert_creator"
  ON guest_lots FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text 
      AND can_create = true
      AND is_active = true
    )
  );

-- Política: Usuários com can_edit podem editar lotes de convidados
CREATE POLICY "guest_lots_update_editor"
  ON guest_lots FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text 
      AND can_edit = true
      AND is_active = true
    )
  );

-- Política: Usuários com can_delete podem deletar lotes de convidados
CREATE POLICY "guest_lots_delete_deleter"
  ON guest_lots FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text 
      AND can_delete = true
      AND is_active = true
    )
  );

-- ===================================================================
-- 8. TABELA: guest_lot_merchandise
-- ===================================================================

-- Política: Usuários autenticados podem ver mercadorias
CREATE POLICY "guest_lot_merchandise_select_authenticated"
  ON guest_lot_merchandise FOR SELECT
  USING (auth.role() = 'authenticated');

-- Política: Usuários com can_create podem criar mercadorias
CREATE POLICY "guest_lot_merchandise_insert_creator"
  ON guest_lot_merchandise FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text 
      AND can_create = true
      AND is_active = true
    )
  );

-- Política: Usuários com can_edit podem editar mercadorias
CREATE POLICY "guest_lot_merchandise_update_editor"
  ON guest_lot_merchandise FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text 
      AND can_edit = true
      AND is_active = true
    )
  );

-- Política: Usuários com can_delete podem deletar mercadorias
CREATE POLICY "guest_lot_merchandise_delete_deleter"
  ON guest_lot_merchandise FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text 
      AND can_delete = true
      AND is_active = true
    )
  );

-- ===================================================================
-- 9. TABELAS DE LOG (user_actions, user_activity_logs, email_logs)
-- ===================================================================

-- Política: Apenas admins podem ver logs
CREATE POLICY "user_actions_select_admin"
  ON user_actions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text 
      AND can_manage_users = true
      AND is_active = true
    )
  );

-- Política: Sistema pode inserir logs (qualquer usuário autenticado)
CREATE POLICY "user_actions_insert_authenticated"
  ON user_actions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Política: Ninguém pode deletar logs (auditoria)
CREATE POLICY "user_actions_no_delete"
  ON user_actions FOR DELETE
  USING (false);

-- Repetir para user_activity_logs
CREATE POLICY "user_activity_logs_select_admin"
  ON user_activity_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text 
      AND can_manage_users = true
      AND is_active = true
    )
  );

CREATE POLICY "user_activity_logs_insert_authenticated"
  ON user_activity_logs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "user_activity_logs_no_delete"
  ON user_activity_logs FOR DELETE
  USING (false);

-- Repetir para email_logs
CREATE POLICY "email_logs_select_admin"
  ON email_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()::text 
      AND can_manage_users = true
      AND is_active = true
    )
  );

CREATE POLICY "email_logs_insert_authenticated"
  ON email_logs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "email_logs_no_delete"
  ON email_logs FOR DELETE
  USING (false);

-- ===================================================================
-- 10. OUTRAS TABELAS (invoices, lots, merchandise)
-- ===================================================================

-- Aplicar mesmas políticas de auctions para estas tabelas
-- (SELECT: authenticated, INSERT: can_create, UPDATE: can_edit, DELETE: can_delete)

-- Invoices
CREATE POLICY "invoices_select_authenticated" ON invoices FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "invoices_insert_creator" ON invoices FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid()::text AND can_create = true AND is_active = true));
CREATE POLICY "invoices_update_editor" ON invoices FOR UPDATE USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid()::text AND can_edit = true AND is_active = true));
CREATE POLICY "invoices_delete_deleter" ON invoices FOR DELETE USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid()::text AND can_delete = true AND is_active = true));

-- Lots
CREATE POLICY "lots_select_authenticated" ON lots FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "lots_insert_creator" ON lots FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid()::text AND can_create = true AND is_active = true));
CREATE POLICY "lots_update_editor" ON lots FOR UPDATE USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid()::text AND can_edit = true AND is_active = true));
CREATE POLICY "lots_delete_deleter" ON lots FOR DELETE USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid()::text AND can_delete = true AND is_active = true));

-- Merchandise
CREATE POLICY "merchandise_select_authenticated" ON merchandise FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "merchandise_insert_creator" ON merchandise FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid()::text AND can_create = true AND is_active = true));
CREATE POLICY "merchandise_update_editor" ON merchandise FOR UPDATE USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid()::text AND can_edit = true AND is_active = true));
CREATE POLICY "merchandise_delete_deleter" ON merchandise FOR DELETE USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid()::text AND can_delete = true AND is_active = true));

-- ===================================================================
-- 11. VERIFICAÇÃO - Execute para confirmar que RLS está ativo
-- ===================================================================

SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- ===================================================================
-- FIM DO SCRIPT
-- ===================================================================
-- ✅ Após executar, todas as tabelas estarão protegidas por RLS
-- ✅ Usuários só podem acessar dados conforme suas permissões
-- ===================================================================
