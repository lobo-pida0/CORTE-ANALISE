// -------------------------------------------------------------------------
// (separado de nuvem.js) Undo/redo, toast, tooltip da OP e fechar modais.
// -------------------------------------------------------------------------
// SISTEMA DE UNDO/REDO E TOAST
function registrarEstado() { const e = JSON.stringify(bancoDadosOPs); if (pilhaUndo[pilhaUndo.length - 1] !== e) { pilhaUndo.push(e); if (pilhaUndo.length > MAX_HISTORICO) pilhaUndo.shift(); pilhaRedo = []; } }
function desfazerAcao() { if (pilhaUndo.length > 0) { pilhaRedo.push(JSON.stringify(bancoDadosOPs)); bancoDadosOPs = JSON.parse(pilhaUndo.pop()); localStorage.setItem('bancoOPs', JSON.stringify(bancoDadosOPs)); cacheGruposPorReferencia = null; renderizarTudoImediato(); showToast("<i class='fas fa-undo'></i> Ação Desfeita"); } }
function refazerAcao() { if (pilhaRedo.length > 0) { pilhaUndo.push(JSON.stringify(bancoDadosOPs)); bancoDadosOPs = JSON.parse(pilhaRedo.pop()); localStorage.setItem('bancoOPs', JSON.stringify(bancoDadosOPs)); cacheGruposPorReferencia = null; renderizarTudoImediato(); showToast("<i class='fas fa-redo'></i> Ação Refeita"); } }

function showToast(html, err = false, duracaoMs = 2000) {
    let t = $('toast-atalhos'); if (!t) { t = document.createElement('div'); t.id = 'toast-atalhos'; t.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); color:white; padding:12px 25px; border-radius:30px; font-weight:800; font-size:14px; z-index:10000; transition:all 0.3s; opacity:0; pointer-events:none; display:flex; gap:10px; align-items:center;'; document.body.appendChild(t); }
    t.style.background = err ? 'var(--cor-alerta)' : 'var(--cor-sugestao)'; t.innerHTML = html; t.style.opacity = '1'; t.style.bottom = '40px';
    clearTimeout(t.timer); t.timer = setTimeout(() => { t.style.opacity = '0'; t.style.bottom = '20px'; }, duracaoMs);
}

// EVENTOS GLOBAIS (TECLADO E MOUSE)
document.addEventListener('keydown', e => {
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    if ($('omniInput') === document.activeElement && e.key !== 'Escape') return;
    if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'z' && !isInput) { e.preventDefault(); e.shiftKey ? refazerAcao() : desfazerAcao(); }
        if (e.key.toLowerCase() === 'y' && !isInput) { e.preventDefault(); refazerAcao(); }
        if (e.key.toLowerCase() === 'k') { e.preventDefault(); abrirBuscaGlobal(); }
    }
    if (e.altKey && !isInput) {
        const abas = { '1': 'aba-programacao', '2': 'aba-fila' };
        if (abas[e.key] && abaLiberadaAgora(abas[e.key])) { e.preventDefault(); abrirAba(null, abas[e.key]); }
        if (e.key.toLowerCase() === 's') { e.preventDefault(); processarExcel(); }
        if (e.key.toLowerCase() === 'c') { e.preventDefault(); $('filtroOP').focus(); }
    }
    if (e.key === 'Escape') { fecharModais(); $$('.dropdown-menu.aberto').forEach(m => m.classList.remove('aberto')); }
});

document.addEventListener('mouseover', function (e) {
    const opElement = e.target.closest('.card-op, .bloco-op, tr, .omni-item, .bloco-op-planta');
    if (!opElement) return;
    let opId = null;
    if (opElement.dataset.id) opId = opElement.dataset.id;
    else if (opElement.getAttribute('oncontextmenu')) { const match = opElement.getAttribute('oncontextmenu').match(/'([^']+)'/); if (match && match[1]) opId = match[1]; }
    else if (opElement.classList.contains('bloco-op')) { const span = opElement.querySelector('.texto-op-visivel'); if (span) opId = span.innerText.split(' ')[0].trim(); }
    else if (opElement.tagName === 'TR') { const cb = opElement.querySelector('.check-lote'); if (cb && cb.dataset.id) opId = cb.dataset.id; }
    else if (opElement.classList.contains('omni-item')) { const st = opElement.querySelector('strong'); if (st) opId = st.innerText.replace('OP:', '').trim(); }
    if (opId) mostrarTooltipOP(e, opId);
});

document.addEventListener('mouseout', function (e) { if (e.target.closest('.card-op, .bloco-op, tr, .omni-item, .bloco-op-planta')) esconderTooltipOP(); });
document.addEventListener('mousemove', function (e) {
    const tt = $('tooltip-op');
    if (tt && tt.style.display === 'block') {
        let x = e.clientX + 15; let y = e.clientY + 15;
        if (x + tt.offsetWidth > window.innerWidth) x = e.clientX - tt.offsetWidth - 15;
        if (y + tt.offsetHeight > window.innerHeight) y = e.clientY - tt.offsetHeight - 15;
        tt.style.left = x + 'px'; tt.style.top = y + 'px';
    }
});

// Em celular/toque não existe "passar o mouse" — um toque na OP abre o mesmo
// tooltip (calculando a posição na hora, já que não tem mousemove contínuo),
// e tocar fora de qualquer OP fecha ele.
document.addEventListener('click', function (e) {
    if (e.target.closest('button, a, input, select, label, .btn, [onclick]')) return;
    const opElement = e.target.closest('.card-op, .bloco-op, tr, .omni-item, .bloco-op-planta');
    if (!opElement) { esconderTooltipOP(); return; }
    let opId = null;
    if (opElement.dataset.id) opId = opElement.dataset.id;
    else if (opElement.getAttribute('oncontextmenu')) { const match = opElement.getAttribute('oncontextmenu').match(/'([^']+)'/); if (match && match[1]) opId = match[1]; }
    else if (opElement.classList.contains('bloco-op')) { const span = opElement.querySelector('.texto-op-visivel'); if (span) opId = span.innerText.split(' ')[0].trim(); }
    else if (opElement.tagName === 'TR') { const cb = opElement.querySelector('.check-lote'); if (cb && cb.dataset.id) opId = cb.dataset.id; }
    else if (opElement.classList.contains('omni-item')) { const st = opElement.querySelector('strong'); if (st) opId = st.innerText.replace('OP:', '').trim(); }
    if (!opId) return;
    mostrarTooltipOP(e, opId);
    const tt = $('tooltip-op');
    if (tt) {
        let x = e.clientX + 15, y = e.clientY + 15;
        if (x + tt.offsetWidth > window.innerWidth) x = e.clientX - tt.offsetWidth - 15;
        if (y + tt.offsetHeight > window.innerHeight) y = e.clientY - tt.offsetHeight - 15;
        tt.style.left = Math.max(5, x) + 'px'; tt.style.top = Math.max(5, y) + 'px';
    }
});

// TOOLTIP
function mostrarTooltipOP(e, id) {
    const tt = $('tooltip-op');
    // mouseover dispara de novo a cada célula que o mouse passa dentro da
    // MESMA linha (não é "entra na linha" uma vez só) — sem essa guarda, o
    // sistema refazia todo o cálculo caro (grade, uniformidade, quais
    // pedidos a OP fecha) várias vezes só pra mostrar a mesma OP de novo.
    if (tt && tt.style.display === 'block' && tt.dataset.opAtual === id) return;
    const op = bancoDadosOPs.find(o => o.id === id); if (!op) return;
    let alertaAtraso = '';
    if (op.dataCorte && new Date(op.dataCorte) < new Date(new Date().setHours(0, 0, 0, 0))) alertaAtraso = `<div style="margin-bottom:8px; background:rgba(193, 68, 78, 0.1); padding:4px 8px; border-radius:4px; color:var(--cor-alerta); font-size:11px; font-weight:900; display:inline-block;"><i class="fas fa-exclamation-triangle"></i> ATRASADO</div>`;

    // Grade por tamanho, se a planilha de grades já foi importada pra essa OP
    let gradeHtml = '';
    try {
        const grades = obterGradesPorOP();
        const gradeOP = buscarGrade(grades, op.id, op.ciclo);
        if (gradeOP && gradeOP.tamanhos && Object.keys(gradeOP.tamanhos).length) {
            const ordemTamanhosConhecidos = ['PP', 'P', 'PM', 'M', 'MG', 'G', 'GG', 'XG', 'EG', 'EGG', 'SG'];
            const compararTamanhos = (a, b) => {
                const idxA = ordemTamanhosConhecidos.indexOf(a.toUpperCase()), idxB = ordemTamanhosConhecidos.indexOf(b.toUpperCase());
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                return a.localeCompare(b, 'pt-BR', { numeric: true });
            };
            const selosTamanho = Object.entries(gradeOP.tamanhos)
                .sort((a, b) => compararTamanhos(a[0], b[0]))
                .map(([tam, qtd]) => `<span style="background:var(--bg-painel); border:1px solid var(--borda-cor); border-radius:4px; padding:2px 7px; margin:2px 3px 0 0; display:inline-block; font-size:11px;"><strong>${tam}</strong>: ${qtd}</span>`)
                .join('');
            gradeHtml = `<div style="margin-top:8px;"><span class="lbl">Grade:</span><div style="margin-top:4px;">${selosTamanho}</div></div>`;

            // Uniformidade — o quão "redonda" a grade é pro enfesto (ver
            // calcularUniformidadeGrade). Só mostra quando dá pra calcular.
            const uniformidade = calcularUniformidadeGrade(gradeOP.tamanhos);
            if (uniformidade !== null) {
                let corUnif, textoUnif;
                if (uniformidade >= 0.5) { corUnif = 'var(--cor-despacho)'; textoUnif = 'grade uniforme'; }
                else if (uniformidade >= 0.15) { corUnif = 'var(--cor-selecao)'; textoUnif = 'grade moderada'; }
                else { corUnif = 'var(--cor-alerta)'; textoUnif = 'grade complexa — enfesto tende a ser mais lento'; }
                gradeHtml += `<div style="margin-top:4px;"><span class="pill" style="background:${corUnif}; font-size:9px; color:${uniformidade >= 0.15 && uniformidade < 0.5 ? '#2d3436' : 'white'};" title="Quanto mais próximo de 100%, mais a grade se repete num padrão único — menos esquemas de enfesto.">${textoUnif} (${Math.round(uniformidade * 100)}%)</span></div>`;
            }
        }
    } catch (err) { /* se a leitura falhar, só não mostra a grade — não trava o tooltip */ }

    // Pedidos que essa OP ajuda a fechar (referência em comum) — inclui os já
    // cobertos, não só os que ainda faltam
    let pedidosHtml = '';
    try {
        const matches = pedidosQueEssaOPFecha(op);
        if (matches.length) {
            const MOSTRAR = 3;
            const linhas = matches.slice(0, MOSTRAR).map(m => {
                const selo = m.cobre === true ? '<i class="fas fa-check" style="color:var(--cor-despacho);"></i>' : m.cobre === false ? '<i class="fas fa-triangle-exclamation" style="color:var(--cor-alerta);" title="Grade dessa OP não tem esse tamanho"></i>' : '';
                const situacao = m.faltaProduzir > 0 ? `falta ${m.faltaProduzir}` : `<span style="color:var(--cor-despacho);">já coberto</span>`;
                return `<div style="font-size:11px;">${selo} <strong>${m.pedido}</strong> — ${m.tam}: ${situacao} <span style="color:var(--texto-secundario);">(${m.cliente})</span></div>`;
            }).join('');
            const sobrando = matches.length - MOSTRAR;
            pedidosHtml = `<div style="margin-top:8px;"><span class="lbl">Fecha pedido(s):</span><div style="margin-top:4px; display:flex; flex-direction:column; gap:2px;">${linhas}${sobrando > 0 ? `<div style="font-size:10px; color:var(--texto-secundario);">+${sobrando} outro(s)</div>` : ''}</div></div>`;
        }
    } catch (err) { /* se a leitura falhar, só não mostra essa seção */ }

    tt.innerHTML = `
        <div class="tt-header">
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="color:var(--cor-sugestao); font-size:16px;">${op.id}</span>
                ${op.prioridade ? '<i class="fas fa-star" style="color:var(--cor-selecao); font-size:12px;"></i>' : ''}
                ${op.laser ? '<span class="pill" style="background:var(--cor-roxo); font-size:9px;" title="Essa OP vai pra máquina de corte a laser"><i class="fas fa-bolt"></i> LASER</span>' : ''}
            </div>
            <span class="pill" style="background:var(--cor-primaria); font-size:10px;">${nomesEtapas[op.etapa]}</span>
        </div>
        <div class="tt-body">
            ${alertaAtraso}
            <div><span class="lbl">Ciclo:</span> <strong>${op.ciclo}</strong></div>
            <div><span class="lbl">Destino:</span> <strong>${escHtml(op.localDestino)}</strong></div>
            <div><span class="lbl">Setor Atual:</span> <strong style="color:var(--cor-sugestao);">${op.localExcel || 'N/D'}</strong></div>
            <div><span class="lbl">Peças:</span> <strong style="color:var(--cor-selecao); font-size:14px;">${op.qtd}</strong></div>
            <div><span class="lbl">Tempo:</span> <strong style="color:var(--cor-alerta);">${Number(op.tempoCorte).toFixed(1)} min</strong></div>
            <div><span class="lbl">Dublagem:</span> <strong>${op.temDublado ? 'SIM' : 'NÃO'}</strong></div>
            <div><span class="lbl">Dias Parada:</span> <strong style="color:var(--cor-alerta);">${op.diasLocal || 0} dias</strong></div>
            ${op.mesDestino ? `<div><span class="lbl">Mês Destino:</span> <strong style="color:#B8862A;">${op.mesDestino}</strong></div>` : ''}
            ${op.dataCorteSuposta && formatarDataBR(op.dataCorteSuposta) ? `<div><span class="lbl">Corte Suposto:</span> <strong style="color:var(--cor-roxo);" title="Calculado de trás pra frente a partir da data de finalização no estoque (${formatarDataBR(op.dataFinalizacao)}), descontando ~22 dias de etiquetação+distribuição+estoque. É uma estimativa, não um compromisso.">${formatarDataBR(op.dataCorteSuposta)} <i class="fas fa-circle-question" style="font-size:10px;"></i></strong></div>` : ''}
            ${gradeHtml || pedidosHtml ? `<div style="margin-top:10px; padding-top:8px; border-top:1px solid var(--borda-cor);">${gradeHtml}${pedidosHtml}</div>` : ''}
            <div style="margin-top:10px; padding-top:10px; border-top:1px dashed var(--borda-cor); color:var(--texto-secundario); font-style:italic;">${escHtml(op.desc)}</div>
        </div>
    `;
    tt.style.display = 'block'; tt.dataset.opAtual = id; setTimeout(() => tt.style.opacity = '1', 10);
}
function esconderTooltipOP() { const tt = $('tooltip-op'); if (!tt) return; tt.style.opacity = '0'; tt.style.display = 'none'; }

// MODAIS E MENUS
function fecharModais() { $('ctxMenu').style.display = 'none'; $('omniSearchOverlay').style.display = 'none'; $('modalFracionarOverlay').style.display = 'none'; if ($('modalDiasExtras')) $('modalDiasExtras').style.display = 'none'; $('modalGargalo').style.display = 'none'; $('modalPrioridadeClientes').style.display = 'none'; $('modalSequenciaPedidos').style.display = 'none'; $('modalSequenciamentoFifo').style.display = 'none'; $('modalGuiaSequenciamento').style.display = 'none'; $('modalAgrupamentoReferencia').style.display = 'none'; $('modalBalancoSincronizacao').style.display = 'none'; $('modalGuiaSistema').style.display = 'none'; $('modalLoginAdmin').style.display = 'none'; $('modalPrioridadeManual').style.display = 'none'; $('modalFeriados').style.display = 'none'; $('modalBalancoUrgencias').style.display = 'none'; $('modalMaquinasEnfesto').style.display = 'none'; if ($('modalOficinasKPI')) $('modalOficinasKPI').style.display = 'none'; if ($('modalDetalheSetorKPI')) $('modalDetalheSetorKPI').style.display = 'none'; }
