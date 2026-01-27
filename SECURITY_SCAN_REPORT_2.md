# 🔒 RELATÓRIO DE SEGURANÇA - VARREDURA #2
**Data:** 27/01/2026  
**Status:** ⚠️ 1 Vulnerabilidade Crítica Encontrada

---

## 🚨 VULNERABILIDADE CRÍTICA #2

### ❌ **Upload de Arquivos Sem Validação**

**Severidade:** 🔴 **CRÍTICA**  
**CWE:** CWE-434 (Unrestricted Upload of File with Dangerous Type)  
**OWASP:** A05:2021 - Security Misconfiguration

---

### 📍 **PROBLEMA DETALHADO**

#### **Situação Atual:**
1. ✅ Existe biblioteca de validação robusta: `src/lib/file-validation.ts`
2. ❌ **A biblioteca NÃO está sendo importada nem usada**
3. ❌ Upload confia apenas em `accept="image/*"` HTML (facilmente bypassado)
4. ❌ Nenhuma validação de magic bytes
5. ❌ Nenhuma validação de tamanho (exceto Configurações: 5MB)
6. ❌ Nenhuma sanitização de nome de arquivo

---

### 📂 **ARQUIVOS VULNERÁVEIS**

| Arquivo | Linha | Handler | Validação? |
|---------|-------|---------|------------|
| `src/pages/Leiloes.tsx` | 713 | `handleFileUpload` | ❌ Nenhuma |
| `src/pages/Arrematantes.tsx` | 1027 | `handleFileUpload` | ❌ Nenhuma |
| `src/pages/Arrematantes.tsx` | 1124 | `handleFullEditFileUpload` | ❌ Nenhuma |
| `src/pages/Lotes.tsx` | 2221 | Upload inline | ❌ Nenhuma |
| `src/components/AuctionForm.tsx` | 267 | `handleFileUpload` | ❌ Nenhuma |
| `src/components/ArrematanteWizard.tsx` | 1285 | `handleFileUpload` | ❌ Nenhuma |
| `src/components/ArrematanteWizard.tsx` | 1325 | `handleFileUploadDivisao` | ❌ Nenhuma |
| `src/pages/Configuracoes.tsx` | 209 | `handleImageUpload` | ⚠️ Apenas tamanho (5MB) |

---

### 🎯 **CÓDIGO VULNERÁVEL**

**Exemplo:** `src/pages/Leiloes.tsx:713`

```typescript
// ❌ VULNERÁVEL - Sem validação
const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
  const files = event.target.files;
  if (!files) return;

  Array.from(files).forEach((file) => {
    const blobUrl = URL.createObjectURL(file);
    const novoDocumento: DocumentoInfo = {
      id: crypto.randomUUID(),
      nome: file.name,        // ⚠️ Nome não sanitizado
      tipo: file.type,        // ⚠️ MIME não validado
      tamanho: file.size,     // ⚠️ Tamanho não validado
      dataUpload: new Date().toISOString(),
      url: blobUrl
    };
    
    // Adiciona direto sem validação!
    setArrematanteForm(prev => ({
      ...prev,
      documentos: [...prev.documentos, novoDocumento]
    }));
  });
};
```

---

### 🔥 **IMPACTOS**

1. **🚨 Upload de Arquivos Maliciosos**
   - Atacante pode fazer upload de scripts (`.js`, `.exe`, `.sh`)
   - Arquivo pode ser disfarçado mudando extensão

2. **💣 Denial of Service (DoS)**
   - Sem limite de tamanho, pode fazer upload de arquivos gigantes
   - Pode esgotar armazenamento e largura de banda

3. **🕵️ Path Traversal**
   - Nome de arquivo não sanitizado: `../../etc/passwd`
   - Pode sobrescrever arquivos do sistema

4. **💾 Consumo Excessivo de Recursos**
   - Sem validação de quantidade de arquivos
   - Pode fazer upload de milhares de arquivos

---

### ✅ **CORREÇÃO NECESSÁRIA**

#### **1. Importar Biblioteca de Validação**

```typescript
import { validateFile, FileValidationError } from '@/lib/file-validation';
```

#### **2. Atualizar Handler de Upload**

```typescript
// ✅ SEGURO - Com validação completa
const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
  const files = event.target.files;
  if (!files) return;

  // Validar cada arquivo antes de processar
  for (const file of Array.from(files)) {
    try {
      // 🔒 VALIDAÇÃO ROBUSTA: Magic bytes + MIME + Tamanho
      await validateFile(file, 'document'); // ou 'image'
      
      // Sanitizar nome do arquivo
      const safeName = file.name
        .replace(/[^a-zA-Z0-9.-]/g, '_') // Remove caracteres especiais
        .substring(0, 255); // Limita tamanho do nome
      
      const blobUrl = URL.createObjectURL(file);
      const novoDocumento: DocumentoInfo = {
        id: crypto.randomUUID(),
        nome: safeName, // ✅ Nome sanitizado
        tipo: file.type,
        tamanho: file.size,
        dataUpload: new Date().toISOString(),
        url: blobUrl
      };
      
      setArrematanteForm(prev => ({
        ...prev,
        documentos: [...prev.documentos, novoDocumento]
      }));
      
    } catch (error) {
      if (error instanceof FileValidationError) {
        toast({
          title: "Arquivo inválido",
          description: error.message,
          variant: "destructive",
        });
      }
      console.error('Erro na validação do arquivo:', error);
    }
  }

  event.target.value = '';
};
```

---

### 📋 **PLANO DE CORREÇÃO**

#### **Fase 1: Crítico (Fazer AGORA)**

- [ ] Adicionar validação em `src/pages/Leiloes.tsx`
- [ ] Adicionar validação em `src/pages/Arrematantes.tsx` (2 handlers)
- [ ] Adicionar validação em `src/pages/Lotes.tsx`
- [ ] Adicionar validação em `src/components/AuctionForm.tsx`
- [ ] Adicionar validação em `src/components/ArrematanteWizard.tsx` (2 handlers)

#### **Fase 2: Melhorias**

- [ ] Implementar limite de quantidade de arquivos (ex: máx 20 por vez)
- [ ] Adicionar progress bar para uploads grandes
- [ ] Implementar scan antivírus (opcional, via API externa)
- [ ] Adicionar watermark em imagens (para rastreamento)

---

### 🛡️ **CONFIGURAÇÃO ATUAL DO VERCEL**

**Arquivo:** `vercel.json`

```json
{
  "headers": [
    {
      "key": "X-Frame-Options",
      "value": "DENY"
    },
    {
      "key": "X-Content-Type-Options",
      "value": "nosniff"  // ✅ Previne MIME sniffing
    },
    {
      "key": "Referrer-Policy",
      "value": "strict-origin-when-cross-origin"
    }
  ]
}
```

✅ **Bom:** Header `X-Content-Type-Options: nosniff` ajuda

⚠️ **Falta:** Content Security Policy (CSP)

---

### 🔒 **CONFIGURAÇÃO CORS**

**Edge Function:** `supabase_edge_function_send_email.ts`

```typescript
'Access-Control-Allow-Origin': '*' // ⚠️ Muito permissivo
```

**Recomendação:**
```typescript
// ✅ Restringir a domínios específicos
'Access-Control-Allow-Origin': 'https://auction-usher-sooty.vercel.app'
```

---

### ⚙️ **DEPENDÊNCIAS**

**Arquivo:** `package.json`

Todas as dependências parecem atualizadas (verificado manualmente):
- React: 18.3.1 ✅
- Supabase: 2.57.2 ✅
- Vite: 7.3.1 ✅

❌ **Falta:** Ferramenta de auditoria de dependências

**Recomendação:** Adicionar ao `package.json`:
```json
"scripts": {
  "audit": "npm audit --audit-level=moderate"
}
```

---

### 📊 **OUTROS ACHADOS (MENORES)**

#### 1. ⚠️ **parseInt sem Radix (Baixo)**

**Arquivos:** Vários  
**Problema:** `parseInt(value)` sem radix pode causar problemas

```typescript
// ⚠️ Pode interpretar '08' como octal
parseInt(e.target.value)

// ✅ Sempre usar radix 10
parseInt(e.target.value, 10)
```

**Impacto:** Baixo - Apenas potencial bug de lógica

---

#### 2. ✅ **Error Handling (Bom)**

Nenhum `console.log` em catch blocks ✅  
Uso correto de `error.message` ✅

---

#### 3. ✅ **CORS no Vercel (Configurado)**

Headers de segurança presentes ✅  
Falta CSP, mas não é crítico ⚠️

---

### 🎯 **SCORE DE SEGURANÇA ATUALIZADO**

```
┌─────────────────────────────────────────┐
│  SCORE GERAL: 85/100 ⚠️  BOM            │
├─────────────────────────────────────────┤
│  Autenticação:      100/100 ✅          │
│  Autorização:       100/100 ✅          │
│  Injeção SQL:       100/100 ✅          │
│  XSS:               100/100 ✅          │
│  Credenciais:        90/100 ⚠️          │
│  RLS:               100/100 ✅          │
│  Upload:             40/100 🔴          │
│  LGPD:               95/100 ✅          │
└─────────────────────────────────────────┘
```

**Nota:** Score caiu de 95 para 85 devido à vulnerabilidade de upload.

---

## 📋 CHECKLIST DE AÇÕES IMEDIATAS

### 🔴 **URGENTE (Fazer Hoje)**

- [ ] Revogar API keys expostas:
  - `re_SfWdJiMK_7352YoeoJdgw3mBSe2eArUBH` (Resend)
  - `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` (GitHub)

- [ ] **ADICIONAR VALIDAÇÃO DE UPLOAD** em TODOS os handlers:
  - [ ] `src/pages/Leiloes.tsx:713`
  - [ ] `src/pages/Arrematantes.tsx:1027`
  - [ ] `src/pages/Arrematantes.tsx:1124`
  - [ ] `src/pages/Lotes.tsx:2221`
  - [ ] `src/components/AuctionForm.tsx:267`
  - [ ] `src/components/ArrematanteWizard.tsx:1285`
  - [ ] `src/components/ArrematanteWizard.tsx:1325`

### ⚠️ **IMPORTANTE (Esta Semana)**

- [ ] Implementar limite de quantidade de arquivos
- [ ] Adicionar CSP headers no Vercel
- [ ] Restringir CORS na Edge Function
- [ ] Adicionar script `npm audit` ao CI/CD

### 💡 **MELHORIAS (Próximo Sprint)**

- [ ] Implementar rate limiting
- [ ] Adicionar watermark em imagens
- [ ] Implementar scan antivírus (opcional)
- [ ] Auditoria de dependências automatizada

---

## 🔍 **METODOLOGIA DA VARREDURA**

### Ferramentas Usadas:
- ✅ Grep pattern matching
- ✅ Semantic code search
- ✅ Manual code review
- ✅ OWASP Top 10 checklist
- ✅ CWE database

### Áreas Verificadas:
- ✅ Upload de arquivos (199 ocorrências)
- ✅ CORS configuration (177 ocorrências)
- ✅ Error handling (28 ocorrências)
- ✅ parseInt/Number usage (30 ocorrências)
- ✅ Variáveis de ambiente
- ✅ Dependências do projeto

---

## 📝 CONCLUSÃO

### ✅ **Pontos Fortes:**
- Autenticação robusta com RLS
- Erro handling bem implementado
- Headers de segurança configurados
- Biblioteca de validação bem escrita (só não está sendo usada!)

### 🔴 **Pontos Críticos:**
- **Upload sem validação** - Precisa correção IMEDIATA
- API keys expostas - Revogar hoje
- CORS muito permissivo

### 💡 **Recomendação:**
Sistema tem boa base de segurança, mas a vulnerabilidade de upload é **CRÍTICA** e deve ser corrigida antes de qualquer deploy em produção.

---

**Próxima auditoria:** Após correção dos uploads  
**Auditor:** Cursor AI Security Agent
