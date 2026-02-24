# Sistema de Métricas e Diagnóstico

## 🎯 Objetivo

Este sistema foi criado para rastrear e diagnosticar problemas em produção com precisão cirúrgica. Ele coleta métricas detalhadas sobre performance, queries, erros e ações do usuário.

## 📊 Funcionalidades

### 1. **Performance Tracking**
Rastreia o tempo de execução de operações:
- Queries do banco de dados
- Renderização de componentes
- Operações assíncronas

### 2. **Error Tracking**
Captura e registra todos os erros com contexto completo:
- Stack trace
- Contexto da operação
- Metadata adicional
- Timestamp

### 3. **Query Monitoring**
Monitora todas as queries ao banco:
- Tabela acessada
- Tipo de operação (SELECT, INSERT, UPDATE, DELETE)
- Tempo de execução
- Número de registros retornados
- Filtros aplicados

### 4. **User Action Tracking**
Registra ações do usuário:
- Navegação entre páginas
- Cliques em botões
- Preenchimento de formulários
- Qualquer interação importante

## 🚀 Como Usar

### No Console do Navegador

```javascript
// Ver todas as métricas coletadas
window.__dumpMetrics()

// Acessar o objeto de métricas diretamente
window.__metrics

// Limpar todas as métricas
window.__clearMetrics()
```

### No Código

#### Track Performance

```typescript
import { metrics, withPerformance } from '@/lib/metrics';

// Forma 1: Manual
metrics.startPerformance('operation-name');
// ... sua operação ...
metrics.endPerformance('operation-name');

// Forma 2: Com helper (recomendado)
const result = await withPerformance('operation-name', async () => {
  return await minhaOperacao();
});
```

#### Track Queries

```typescript
import { withQuery } from '@/lib/metrics';

const data = await withQuery('users', 'select', async () => {
  return await supabase.from('users').select('*');
}, { filters: { active: true } });
```

#### Track Errors

```typescript
import { metrics } from '@/lib/metrics';

try {
  // ... código que pode falhar ...
} catch (error) {
  metrics.trackError(error, 'context-name', {
    userId: user.id,
    action: 'save-data'
  });
  throw error;
}
```

#### Track User Actions

```typescript
import { metrics } from '@/lib/metrics';

const handleButtonClick = () => {
  metrics.trackUserAction('button-click:save-form', {
    formId: 'user-profile',
    values: sanitizedValues
  });
  
  // ... resto da lógica ...
};
```

## 🔍 Interpretando os Logs

### Cores e Símbolos

- 🟢 **Verde**: Performance boa (< 500ms)
- 🟡 **Amarelo**: Performance aceitável (500ms - 1000ms)
- 🔴 **Vermelho**: Performance ruim (> 1000ms)
- ❌ **Erro**: Algo deu errado
- ✅ **Sucesso**: Operação concluída com sucesso
- ⚠️ **Aviso**: Atenção necessária
- 📊 **Métrica**: Informação de métrica
- 👤 **Usuário**: Ação do usuário
- 🔍 **Debug**: Informação de debug
- 📦 **Dados**: Informação sobre dados
- 🎨 **Render**: Renderização de componente

### Exemplos de Logs

```
✅ Guest lots buscados com sucesso { count: 5, ids: [...] }
🟢 [METRICS] Performance End: guest-lots-query { duration: "234.50ms" }
❌ [METRICS] Error Tracked { context: "guest-lots-fetch", message: "..." }
🔴 DUPLICATAS DETECTADAS nos dados brutos do banco! { totalRegistros: 10, idsUnicos: 5 }
```

## 🐛 Diagnosticando Problemas

### Problema: Lotes Duplicados

1. Abra o console do navegador
2. Digite: `window.__dumpMetrics()`
3. Procure por:
   - `🔴 DUPLICATAS DETECTADAS` nos logs
   - Seção "Errors" com `guest-lots-duplicates`
   - Seção "Queries" com queries lentas em `guest_lots`

### Problema: Performance Lenta

1. Abra o console
2. Digite: `window.__metrics.getQuerySummary()`
3. Verifique:
   - `slowQueries`: queries que demoraram > 500ms
   - `avgDuration`: duração média das queries
   - `byTable`: quantas queries por tabela

### Problema: Erro Inesperado

1. Abra o console
2. Digite: `window.__metrics.getErrorSummary()`
3. Veja os últimos 10 erros com contexto completo

## 📈 Métricas Coletadas Atualmente

### Guest Lots Query
- ✅ Tempo total da query
- ✅ Detecção de duplicatas no banco
- ✅ Número de lotes carregados
- ✅ Tempo de carregamento de mercadorias
- ✅ Tempo de carregamento de arrematantes
- ✅ Duplicatas removidas durante processamento

### Frontend Filtering
- ✅ Duplicatas detectadas no array React
- ✅ Tempo de filtragem
- ✅ Número de lotes após cada filtro

### User Actions
- ✅ Visualização de página
- ✅ Busca de lotes
- ✅ Mudança de filtros
- ✅ Criação/edição/exclusão de lotes

## 🔧 Manutenção

### Limpeza Automática

O sistema limpa automaticamente:
- **Performance metrics**: após 5 minutos
- **Errors**: mantém apenas últimos 100
- **Queries**: mantém apenas últimas 50
- **User actions**: mantém apenas últimas 50

### Limpeza Manual

```javascript
// Limpar tudo
window.__clearMetrics()

// Limpar apenas uma métrica específica
window.__metrics.performances.clear()
```

## 💡 Dicas

1. **Sempre use `withPerformance` e `withQuery`** ao invés de tracking manual
2. **Adicione metadata relevante** nos tracks para facilitar debug
3. **Verifique os logs regularmente** durante desenvolvimento
4. **Use `window.__dumpMetrics()`** quando encontrar um bug
5. **Não exponha dados sensíveis** nas métricas (senhas, tokens, etc.)

## 🎓 Exemplo Completo

```typescript
import { metrics, withPerformance, withQuery } from '@/lib/metrics';

async function carregarUsuarios() {
  metrics.trackUserAction('button-click:load-users');
  
  try {
    const users = await withPerformance('load-users', async () => {
      return await withQuery('users', 'select', async () => {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('active', true);
        
        if (error) throw error;
        return data;
      }, { active: true });
    });
    
    return users;
  } catch (error) {
    metrics.trackError(error as Error, 'load-users', {
      action: 'load-users',
      filters: { active: true }
    });
    throw error;
  }
}
```
