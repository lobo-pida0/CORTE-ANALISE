// -------------------------------------------------------------------------
// (separado de ops-prioridades.js) Busca global (omni), menu de contexto da OP e menus suspensos.
// -------------------------------------------------------------------------
function abrirBuscaGlobal() { $('omniSearchOverlay').style.display = 'flex'; $('omniInput').value = ''; $('omniResults').innerHTML = ''; setTimeout(() => $('omniInput').focus(), 100); }

function pesquisaOmni() {
    const termo = $('omniInput').value.trim().toLowerCase(); const res = $('omniResults'); if (termo.length < 2) { res.innerHTML = ''; return; }
    const encontradas = bancoDadosOPs.filter(o =>
        `${o.ciclo}-${o.id}`.toLowerCase().includes(termo) ||
        `${o.ciclo} ${o.id}`.toLowerCase().includes(termo) ||
        o.id.toLowerCase().includes(termo) ||
        o.ciclo.toLowerCase().includes(termo) ||
        (o.referencia && o.referencia.toLowerCase().includes(termo))
    );
    const LIMITE_RESULTADOS = 50;
    const avisoLimite = encontradas.length > LIMITE_RESULTADOS
        ? `<div style="text-align:center; padding:8px; font-size:11px; color:var(--texto-secundario);">Mostrando ${LIMITE_RESULTADOS} de ${encontradas.length} resultados — refine a busca pra ver menos.</div>`
        : '';
    res.innerHTML = encontradas.slice(0, LIMITE_RESULTADOS).map(op => `
        <div class="omni-item" onclick="abrirAba(null,'aba-programacao'); fecharModais(); setTimeout(()=>alert('OP Localizada:\\n${op.id} - ${nomesEtapas[op.etapa]}'), 300);">
            <div><strong style="color:var(--texto-cor); font-size:16px;">OP: ${op.id}</strong> <span style="font-size:11px; color:var(--texto-secundario);">(Ciclo ${op.ciclo}${op.referencia ? ' · Ref. ' + op.referencia : ''})</span><div style="font-size:12px; margin-top:4px;">${escHtml(op.desc.substring(0, 40))}</div></div>
            <div style="text-align:right;"><span class="pill" style="background:var(--cor-sugestao);">${nomesEtapas[op.etapa]}</span><div style="font-size:11px; margin-top:4px;">${op.qtd} pçs | Local: ${escHtml(op.localDestino)}</div></div>
        </div>`).join('') + avisoLimite;
}

function mostrarMenuContexto(e, id) { e.preventDefault(); e.stopPropagation(); opContextoId = id; const m = $('ctxMenu'); m.style.display = 'block'; m.style.left = Math.min(e.pageX, window.innerWidth - 220) + 'px'; m.style.top = e.pageY + 'px'; }

document.addEventListener('click', e => {
    if (!e.target.closest('#ctxMenu')) $('ctxMenu').style.display = 'none';
    const dentroDropdown = e.target.closest('.dropdown-container');
    if (!dentroDropdown || e.target.closest('.dropdown-menu .btn, .dropdown-menu label')) {
        $$('.dropdown-menu.aberto').forEach(m => m.classList.remove('aberto'));
    }
    // fecha as listas de marcar (locais, etapas, local de produção, tipo)
    if (!e.target.closest('.multi-select-container') && !e.target.closest('.multi-select-options')) {
        $$('.multi-select-options').forEach(o => { o.style.display = 'none'; });
    }
});

// Os dropdowns de filtro são position:fixed (pra não serem cortados pelo
// overflow:hidden do container da aba — ver comentário no CSS), mas isso
// significa que eles NÃO acompanham a rolagem sozinhos. Em vez de recalcular
// a posição toda hora que rola (mais complexo e arriscado), fecha o
// dropdown assim que qualquer rolagem acontecer — inclusive rolagem DENTRO
// de uma área com scroll próprio, tipo a tabela (por isso o "true" no
// final, que pega o evento na fase de captura, já que "scroll" não borbulha
// como outros eventos).
document.addEventListener('scroll', (e) => {
    // Se a rolagem aconteceu DENTRO do próprio dropdown (ele tem scroll
    // próprio quando a lista é grande), não fecha — só fecha quando é a
    // página ou algum outro container por trás que rolou.
    if (e.target && e.target.closest && e.target.closest('.multi-select-options')) return;
    $$('.multi-select-options').forEach(o => { o.style.display = 'none'; });
}, true);

// Abre/fecha um menu suspenso do cabeçalho, fechando qualquer outro que já
// estivesse aberto (evita dois menus abertos ao mesmo tempo).
function toggleDropdown(id) {
    const menu = $(id);
    const jaAberto = menu.classList.contains('aberto');
    $$('.dropdown-menu.aberto').forEach(m => m.classList.remove('aberto'));
    if (!jaAberto) menu.classList.add('aberto');
}

// Igual toggleDropdown, mas pra menus que vivem dentro de um container com
// overflow:auto (como .tabs-container, que faz a barra de abas rolar
// horizontalmente quando não cabe tudo) — um dropdown position:absolute
// normal ficaria CORTADO por esse overflow, mesmo com z-index alto (mesma
// armadilha já documentada nos filtros multi-select). Resolve do mesmo
// jeito: move o menu pra filho direto do <body> e calcula a posição via
// JS (position:fixed), escapando do corte.
function toggleDropdownFixo(idBotao, idMenu) {
    const menu = $(idMenu);
    if (!menu.dataset.movidoParaBody) {
        document.body.appendChild(menu);
        menu.dataset.movidoParaBody = '1';
    }
    const jaAberto = menu.classList.contains('aberto');
    $$('.dropdown-menu.aberto').forEach(m => m.classList.remove('aberto'));
    if (jaAberto) return;
    const gatilho = $(idBotao);
    if (gatilho) {
        const rect = gatilho.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.left = Math.round(rect.left) + 'px';
        menu.style.top = Math.round(rect.bottom + 6) + 'px';
        menu.style.right = 'auto';
    }
    menu.classList.add('aberto');
}

function ctxAcao(acao) {
    if (!opContextoId) return; let op = bancoDadosOPs.find(o => o.id === opContextoId); if (!op) return;
    if (acao === 'copiar') { navigator.clipboard.writeText(op.id); $('ctxMenu').style.display = 'none'; return; }
    if (!exigirAdmin('mexer nas OPs')) { $('ctxMenu').style.display = 'none'; return; }
    if (acao === 'prioridade') { registrarEstado(); op.prioridade = !op.prioridade; localStorage.setItem('bancoOPs', JSON.stringify(bancoDadosOPs)); cacheGruposPorReferencia = null; renderizarTudoImediato(); }
    else if (acao === 'avancar') avancarEtapaOP(op.id);
    else if (acao === 'fracionar') abrirModalFracionar(op.id);
    $('ctxMenu').style.display = 'none';
}
