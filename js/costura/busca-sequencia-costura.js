// -------------------------------------------------------------------------
// (separado de producao-tempos.js) Busca de OP dentro da Sequência da costura.
// -------------------------------------------------------------------------
function buscarOPNaSequenciaCostura(texto) {
    const sem = t => String(t == null ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
    const termo = sem(texto); if (termo.length < 2) return [];
    const achados = [];
    Object.entries(GRUPOS_SEQUENCIAMENTO_COSTURA).forEach(([chave, g]) => {
        montarFilaSequenciamentoCostura(chave).forEach((op, i) => {
            if ([op.op, op.ref, op.descRef, op.cor].some(c => sem(c).includes(termo))) achados.push({ grupo: chave, rotulo: g.rotulo, posicao: i + 1, op });
        });
    });
    return achados;
}
function irParaOPNaSequenciaCostura(grupo, chaveLinha) {
    const sel = $('seqCostGrupo'); if (sel) sel.value = grupo;
    renderizarSequenciamentoCostura();
    const tr = [...document.querySelectorAll('#seqCostListaOPs tr[data-seq-chave]')].find(x => x.dataset.seqChave === chaveLinha);
    if (!tr) return;
    tr.scrollIntoView({ block: 'center', behavior: 'smooth' });
    tr.style.outline = '3px solid var(--cor-sugestao)'; tr.style.outlineOffset = '-3px'; tr.style.opacity = '1';
    setTimeout(() => { tr.style.outline = ''; tr.style.outlineOffset = ''; }, 3500);
}
function renderizarBuscaSequenciaCostura() {
    const inp = $('seqCostBusca'), box = $('seqCostBuscaResultado'); if (!inp || !box) return;
    const achados = buscarOPNaSequenciaCostura(inp.value);
    if (inp.value.trim().length < 2) { box.style.display = 'none'; box.innerHTML = ''; return; }
    const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    box.style.display = 'block';
    box.innerHTML = achados.length
        ? `<div style="border:1px solid var(--borda-cor); border-radius:8px; background:var(--bg-card); max-height:260px; overflow:auto;">${achados.slice(0, 40).map(a => `<div class="seq-busca-item" style="display:flex; gap:10px; align-items:center; padding:7px 12px; border-bottom:1px solid var(--borda-cor); cursor:pointer; font-size:12px; flex-wrap:wrap;" onclick="irParaOPNaSequenciaCostura('${a.grupo}', '${esc(chaveOPCostura(a.op.op, a.op.ciclo))}')">
            <strong>${esc(a.op.op)}</strong><span style="color:var(--texto-secundario);">${esc(a.op.ciclo)}</span>
            <span class="pill" style="background:var(--cor-primaria); color:white;">${esc(a.rotulo)}</span>
            <span style="font-weight:700; color:${a.op.situacaoCostura === 'Em andamento' ? 'var(--cor-despacho)' : 'var(--texto-secundario)'};">${esc(a.op.situacaoCostura)}</span>
            <span>${a.posicao}º na fila</span><span>${(a.op.qtd || 0).toLocaleString('pt-BR')} peças</span>
            <span style="color:var(--texto-secundario);">${esc(String(a.op.descRef || '').slice(0, 50))}</span></div>`).join('')}${achados.length > 40 ? `<div style="padding:6px 12px; font-size:11px; color:var(--texto-secundario);">+${achados.length - 40} resultados — digite mais para afinar.</div>` : ''}</div>`
        : '<div style="padding:8px 12px; font-size:12px; color:var(--texto-secundario);">Nenhuma OP encontrada na Sequência (ela pode estar oculta, removida ou fora dos locais de costura).</div>';
}
