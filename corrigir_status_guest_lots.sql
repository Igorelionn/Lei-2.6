-- 🔧 SCRIPT DE CORREÇÃO: Atualizar status de guest_lots que estão "arrematado" mas não têm arrematantes

-- 1. Verificar lotes com problema (status arrematado mas sem arrematantes na tabela bidders)
SELECT 
    gl.id,
    gl.numero,
    gl.descricao,
    gl.status,
    gl.leilao_id,
    a.nome as leilao_nome,
    COUNT(b.id) as qtd_arrematantes
FROM guest_lots gl
LEFT JOIN auctions a ON a.id = gl.leilao_id
LEFT JOIN bidders b ON b.guest_lot_id = gl.id
WHERE gl.status = 'arrematado'
GROUP BY gl.id, gl.numero, gl.descricao, gl.status, gl.leilao_id, a.nome
HAVING COUNT(b.id) = 0;

-- 2. Corrigir status para 'disponivel' quando não há arrematantes
UPDATE guest_lots
SET 
    status = 'disponivel',
    updated_at = NOW()
WHERE id IN (
    SELECT gl.id
    FROM guest_lots gl
    LEFT JOIN bidders b ON b.guest_lot_id = gl.id
    WHERE gl.status = 'arrematado'
    GROUP BY gl.id
    HAVING COUNT(b.id) = 0
);

-- 3. Verificar resultado
SELECT 
    gl.numero,
    gl.status,
    COUNT(b.id) as qtd_arrematantes
FROM guest_lots gl
LEFT JOIN bidders b ON b.guest_lot_id = gl.id
GROUP BY gl.id, gl.numero, gl.status
ORDER BY gl.numero;
