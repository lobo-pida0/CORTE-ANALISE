// =========================================================================
// 🏷️ AGRUPAMENTO POR REFERÊNCIA — junta as OPs que compartilham a mesma
// referência entre os dois setores iniciais (PCP-Programação e Almox.
// Análise de Medidas), pra facilitar planejar/produzir elas juntas. Só
// mostra referências com 2+ OPs — uma OP sozinha não é "agrupamento".
// =========================================================================
// Mesmo cálculo do Agrupador por Referência (2+ OPs entre Programação,
// Análise de Medidas e Aguardando Matéria Prima, sem SBM), só que
// reaproveitável — usado tanto pelo modal quanto pelo selo na tabela da
// Programação. Cacheado (mesma lógica do cache de grade/pedidos de ontem):
// só refaz quando a sincronização traz dado novo.
let cacheGruposPorReferencia = null;
function calcularGruposPorReferencia() {
    if (cacheGruposPorReferencia) return cacheGruposPorReferencia;
    const candidatasBanco = bancoDadosOPs.filter(op => (op.etapa === 0 || op.etapa === 1) && op.referencia && !op.sobMedida);
    // Marca essas com uma etapa de exibição própria (nomesEtapas não tem
    // índice pra "Aguardando Matéria Prima" — fica antes de tudo, fora da
    // escala 0-7 normal)
    const candidatasAguardMP = obterOPsAguardandoMateriaPrima()
        .filter(op => op.referencia && !op.sobMedida)
        .map(op => ({ ...op, etapaRotulo: op.analiseMP ? 'ANÁLISE DE MATÉRIA PRIMA' : 'AGUARD. MATÉRIA PRIMA', etapaCor: 'var(--cor-alerta)' }));
    const candidatas = [...candidatasBanco, ...candidatasAguardMP];

    const porReferencia = new Map();
    candidatas.forEach(op => {
        if (!porReferencia.has(op.referencia)) porReferencia.set(op.referencia, []);
        porReferencia.get(op.referencia).push(op);
    });
    const grupos = [...porReferencia.entries()]
        .filter(([ref, ops]) => ops.length >= 2)
        .sort((a, b) => b[1].length - a[1].length);

    cacheGruposPorReferencia = grupos;
    return grupos;
}

function abrirAgrupamentoReferencia() {
    const grupos = calcularGruposPorReferencia();
    ultimoAgrupamentoReferenciaGerado = grupos;
    renderizarAgrupamentoReferencia(grupos);
    $('modalAgrupamentoReferencia').style.display = 'flex';
}

function renderizarAgrupamentoReferencia(grupos) {
    const gruposHtml = grupos.map(([ref, ops]) => {
        const totalPecas = ops.reduce((s, o) => s + (parseInt(o.qtd) || 0), 0);
        const descricaoRef = ops.find(o => o.desc)?.desc || '';
        const linhas = ops.map(op => `
            <tr>
                <td><strong>${op.id}</strong></td>
                <td>${op.ciclo}</td>
                <td><span class="pill" style="background:${op.etapaRotulo ? op.etapaCor : (op.etapa === 0 ? 'var(--cor-fila)' : 'var(--cor-sugestao)')};">${op.etapaRotulo || nomesEtapas[op.etapa]}</span></td>
                <td style="text-align:right;">${op.qtd}</td>
                <td>${op.codigoMP || '-'}</td>
                <td style="text-align:right; color:${(op.diasLocal || 0) >= 3 ? 'var(--cor-alerta)' : 'var(--texto-cor)'};">${op.diasLocal || 0}</td>
            </tr>
        `).join('');
        return `
            <div style="border-left:4px solid var(--cor-fila); background:var(--bg-painel); border-radius:8px; padding:12px; margin-bottom:14px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <strong style="font-size:13px;"><i class="fas fa-tag"></i> ${ref}${descricaoRef ? ` <span style="font-weight:normal; color:var(--texto-secundario); font-size:11px;">— ${descricaoRef}</span>` : ''}</strong>
                    <span style="font-size:11px; color:var(--texto-secundario);">${ops.length} OPs · ${totalPecas} peças no total</span>
                </div>
                <table class="tabela-dados">
                    <thead><tr><th>OP</th><th>CICLO</th><th>ETAPA</th><th style="text-align:right;">PEÇAS</th><th>MATÉRIA-PRIMA</th><th style="text-align:right;">DIAS PARADO</th></tr></thead>
                    <tbody>${linhas}</tbody>
                </table>
            </div>
        `;
    }).join('');

    $('modalAgrupamentoReferencia').innerHTML = `
        <div class="modal-card" style="width:680px; max-width:92vw; border-top:5px solid var(--cor-fila); max-height:88vh;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid var(--borda-cor); padding-bottom:10px;">
                <h2 style="margin:0; color:var(--texto-cor); display:flex; align-items:center; gap:10px; font-size:16px;">
                    <i class="fas fa-layer-group" style="color:var(--cor-fila);"></i> OPs AGRUPADAS POR REFERÊNCIA
                </h2>
                <button onclick="fecharModais()" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
            </div>
            <div style="font-size:11px; color:var(--texto-secundario); margin-bottom:12px;">
                Só mostra referências com 2 ou mais OPs entre PCP-Programação, Almox. Análise de Medidas e Aguardando Matéria Prima — referência com uma única OP não aparece aqui, e OPs sob medida (SBM) nunca entram, já que cada uma é única.
            </div>
            <div style="overflow-y:auto; flex:1;">
                ${grupos.length === 0 ? `<div class="tabela-vazia">Nenhuma referência repetida entre esses dois setores no momento.</div>` : gruposHtml}
            </div>
            ${grupos.length > 0 ? `<button onclick="copiarAgrupamentoReferencia()" class="btn btn-acao" style="margin-top:12px;"><i class="fas fa-copy"></i> COPIAR LISTA</button>` : ''}
        </div>
    `;
}

function copiarAgrupamentoReferencia() {
    if (!ultimoAgrupamentoReferenciaGerado || !ultimoAgrupamentoReferenciaGerado.length) return;
    const texto = ultimoAgrupamentoReferenciaGerado.map(([ref, ops]) =>
        `${ref} (${ops.length} OPs):\n` + ops.map(op => `  - OP ${op.id} | Ciclo ${op.ciclo} | ${op.etapaRotulo || nomesEtapas[op.etapa]} | ${op.qtd} pçs | MP ${op.codigoMP || '-'} | ${op.diasLocal || 0}d parado`).join('\n')
    ).join('\n\n');
    navigator.clipboard.writeText(texto).then(() => showToast("<i class='fas fa-check'></i> Agrupamento copiado!"));
}

// =========================================================================
// 🖥️ CONSOLE DE DEPURAÇÃO — funções de exibição do painel (a captura de
// logs em si já roda desde o topo do arquivo, antes de tudo mais).
// =========================================================================
function renderizarConsoleDebug() {
    const corpo = $('corpoConsoleDebug');
    if (!corpo) return;
    const cores = { log: '#ddd', warn: '#e2b93b', error: '#ff6b6b' };
    const icones = { log: 'fa-circle-info', warn: 'fa-triangle-exclamation', error: 'fa-circle-xmark' };
    corpo.innerHTML = logsConsoleDebug.length === 0
        ? `<div style="padding:20px; text-align:center; color:#666; font-family:monospace; font-size:11px;">Nenhum registro ainda.</div>`
        : logsConsoleDebug.slice().reverse().map(l => {
            const hora = new Date(l.hora).toLocaleTimeString('pt-BR');
            const cor = cores[l.nivel] || cores.log;
            const msgSegura = String(l.mensagem).replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<div style="padding:5px 10px; border-bottom:1px solid #2a2a2a; font-family:'Courier New', monospace; font-size:11px; color:${cor}; display:flex; gap:8px; align-items:flex-start;">
                <span style="opacity:0.55; white-space:nowrap;">${hora}</span>
                <i class="fas ${icones[l.nivel] || icones.log}" style="margin-top:2px; flex-shrink:0;"></i>
                <span style="word-break:break-word; white-space:pre-wrap;">${msgSegura}</span>
            </div>`;
        }).join('');
}

function atualizarBadgeConsoleDebug() {
    const badge = $('badgeConsoleDebug');
    if (!badge) return;
    const qtdErros = logsConsoleDebug.filter(l => l.nivel === 'error').length;
    if (qtdErros > 0) { badge.style.display = 'flex'; badge.innerText = qtdErros > 99 ? '99+' : qtdErros; }
    else badge.style.display = 'none';
}

function toggleConsoleDebug() {
    const painel = $('painelConsoleDebug');
    if (!painel) return;
    const aberto = painel.classList.toggle('aberto');
    if (aberto) renderizarConsoleDebug();
}

function limparLogsConsoleDebug() {
    if (!confirm('Limpar todo o histórico do console de depuração?')) return;
    logsConsoleDebug = [];
    try { localStorage.setItem('logsConsoleDebug', '[]'); } catch (e) { /* ignora */ }
    renderizarConsoleDebug();
    atualizarBadgeConsoleDebug();
}

function copiarLogsConsoleDebug() {
    if (!logsConsoleDebug.length) { showToast("<i class='fas fa-info-circle'></i> Nenhum log registrado ainda."); return; }
    const texto = logsConsoleDebug.map(l => `[${new Date(l.hora).toLocaleString('pt-BR')}] ${l.nivel.toUpperCase()}: ${l.mensagem}`).join('\n');
    navigator.clipboard.writeText(texto).then(() => showToast("<i class='fas fa-check'></i> Log copiado! Já pode colar e me mandar."));
}

// PROGRAMAÇÃO / LOTE
function calcularSomaLoteImediato() {
    let p = 0, t = 0, c = 0;
    // Se alguma OP selecionada não existir mais (ex: sumiu numa sincronização
    // nova), tira ela da seleção em vez de contar errado ou travar
    for (const id of [...selecaoLoteOPs]) {
        const op = bancoDadosOPs.find(o => o.id === id);
        if (!op) { selecaoLoteOPs.delete(id); continue; }
        p += parseInt(op.qtd) || 0; t += parseFloat(op.tempoCorte) || 0; c++;
    }
    // realça as linhas visíveis que fazem parte da seleção (o resto da
    // seleção pode estar fora do filtro atual, sem linha renderizada agora)
    $$('.check-lote').forEach(x => {
        if (selecaoLoteOPs.has(x.dataset.id)) x.closest('tr').classList.add('linha-marcada');
        else x.closest('tr').classList.remove('linha-marcada');
    });
    $('somaOpsTxt').innerText = c + " OPs";
    $('somaPecasTxt').innerText = p + " pçs";
    $('somaTempoTxt').innerText = t.toFixed(1) + " min";
    let m = ultimaSugestao === 'tempo' ? parseFloat($('metaTempo').value) || 1 : parseInt($('metaLote').value) || 1, pc = Math.min(((ultimaSugestao === 'tempo' ? t : p) / m) * 100, 100);
    $('barraProgresso').style.width = pc + '%';
    $('textoProgresso').innerText = Math.round(pc) + '%';
}

function limparSelecaoLote() {
    selecaoLoteOPs.clear();
    $$('.check-lote').forEach(x => x.checked = false);
    calcularSomaLoteImediato();
}
const calcularSomaLote = debounce(calcularSomaLoteImediato, 150);
function autoSelecionarPorMeta(tp) {
    ultimaSugestao = tp;
    const m = parseFloat(tp === 'tempo' ? $('metaTempo').value : $('metaLote').value) || 0;
    $$('.check-lote').forEach(x => x.checked = false);
    selecaoLoteOPs.clear();

    // Agrupa em blocos contíguos da mesma matéria-prima, preservando a ordem da fila
    // (prioridade > urgência > matéria-prima > data). Isso evita que a sugestão misture
    // matérias-primas diferentes num mesmo lote só porque uma OP menor cabe na meta —
    // ela tenta fechar o bloco da matéria-prima atual antes de avançar pra próxima.
    const blocos = [];
    for (let cb of $$('#listaDespacho .check-lote')) {
        const mp = cb.dataset.mp || 'SEM-MP';
        const ultimo = blocos[blocos.length - 1];
        if (ultimo && ultimo.mp === mp) ultimo.itens.push(cb);
        else blocos.push({ mp, itens: [cb] });
    }

    let s = 0;
    for (const bloco of blocos) {
        if (s >= m) break;
        for (const cb of bloco.itens) {
            const v = tp === 'tempo' ? parseFloat(cb.dataset.tempo) || 0 : parseInt(cb.dataset.qtd) || 0;
            if (s + v <= m) { s += v; cb.checked = true; selecaoLoteOPs.add(cb.dataset.id); }
        }
    }
    calcularSomaLoteImediato();
}
function sugerirPorDias() { const d = parseFloat($('qtdDiasProg').value) || 0, m = parseFloat($('mediaDiaProg').value) || 0; if (d > 0 && m > 0) { $('metaLote').value = d * m; autoSelecionarPorMeta('pecas'); showToast(`Meta: ${d * m} pçs`); } }
function handleShiftClick(e) {
    const id = this.dataset.id;
    if (lastChecked && e.shiftKey) {
        const c = Array.from($$('.check-lote')), s = c.indexOf(this), ex = c.indexOf(lastChecked);
        c.slice(Math.min(s, ex), Math.max(s, ex) + 1).forEach(x => {
            x.checked = lastChecked.checked;
            if (x.checked) selecaoLoteOPs.add(x.dataset.id); else selecaoLoteOPs.delete(x.dataset.id);
        });
    } else {
        if (this.checked) selecaoLoteOPs.add(id); else selecaoLoteOPs.delete(id);
    }
    lastChecked = this;
    calcularSomaLoteImediato();
}

function copiarListaOps() { const s = [...selecaoLoteOPs]; if (s.length > 0) navigator.clipboard.writeText(s.join('\n')).then(() => alert(s.length + " OPs copiadas!")); }
function exportarRelatorioMontador() {
    const ids = [...selecaoLoteOPs];
    
    if (ids.length === 0) {
        return showToast("<i class='fas fa-exclamation-triangle'></i> Selecione ao menos uma OP!", true);
    }
    
    try {
        const s = ids.map(id => {
            let op = bancoDadosOPs.find(o => o.id === id);
            return op ? { 
                "CICLO": op.ciclo, 
                "OP": op.id, 
                "DESCRIÇÃO PEÇA": op.desc,
                "PEÇAS": op.qtd,
                "LOCAL DESTINO": op.localDestino, 
                "DUB?": op.temDublado ? 'SIM' : 'NÃO', 
                "TEMPO (MIN)": op.tempoCorte, 
                "MATÉRIA-PRIMA": (op.codigoMP && op.codigoMP !== "SEM CÓDIGO") ? op.codigoMP : "MISTO", 
                "DESCRIÇÃO MP": op.descMP || ""
            } : null;
        }).filter(x => x !== null);
        
        // =================================================================
        // 🎯 A CORREÇÃO DO "INVALID WORKBOOK" ESTÁ AQUI:
        // Em vez de esmagar tudo numa linha, fazemos em 4 passos limpos!
        // =================================================================
        const worksheet = XLSX.utils.json_to_sheet(s); // Passo 1: Cria os dados
        const workbook = XLSX.utils.book_new();        // Passo 2: Cria o arquivo em branco
        XLSX.utils.book_append_sheet(workbook, worksheet, "Lote"); // Passo 3: Junta os dois
        XLSX.writeFile(workbook, "Lote_Producao.xlsx"); // Passo 4: Salva no PC
        // =================================================================
        
        // Histórico
        if (typeof historicoLotes !== 'undefined') {
            historicoLotes.unshift({ 
                data: new Date().toLocaleString('pt-BR'), 
                qtdOps: s.length, 
                totalPecas: s.reduce((a, c) => a + parseInt(c["PEÇAS"]), 0) 
            });
            if (historicoLotes.length > 5) historicoLotes.pop();
            localStorage.setItem('historicoLotes', JSON.stringify(historicoLotes));
        }
        
        if (typeof renderizarHistorico === 'function') renderizarHistorico();
        
        showToast("<i class='fas fa-file-excel'></i> Relatório gerado com sucesso!");

    } catch (erro) {
        console.error("ERRO NO RELATÓRIO:", erro);
        alert("Ainda deu erro! Verifique o console novamente.");
    }
}
function renderizarHistorico() { if ($('listaHistorico')) $('listaHistorico').innerHTML = historicoLotes.map(h => `<tr><td>${h.data}</td><td>${h.totalPecas} pçs</td><td>${h.qtdOps} OPs</td></tr>`).join(''); }
function limparHistorico(e) { e.stopPropagation(); if (confirm("Limpar histórico?")) { historicoLotes = []; localStorage.removeItem('historicoLotes'); renderizarHistorico(); } }


// SIDEBAR E MODO TV
// Antes enchia a sidebar do Radar (removida — usuário achou redundante com
// a aba Prioridades, que já filtra por setor/mês destino em formato de
// tabela). Ficou só atualizando o número no topo, que agora leva direto
// pra aba Prioridades quando clicado.
function renderizarSidebarPrioridades() {
    const u = bancoDadosOPs.filter(o => o.prioridade);
    if ($('badge-prioridades')) {
        if (u.length > 0) { $('badge-prioridades').style.display = 'flex'; $('badge-prioridades').innerText = u.length; }
        else $('badge-prioridades').style.display = 'none';
    }
}

let scInt = null;
function ativarModoTV() { document.body.classList.add('modo-tv'); if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => { }); abrirAba(null, 'aba-fila'); initScrollV('#aba-fila .secao-corpo'); }
function initScrollV(sel) { const e = document.querySelector(sel); if (!e) return; e.scrollTop = 0; let d = 1; scInt = setInterval(() => { if (e.scrollHeight <= e.clientHeight) return; e.scrollTop += d; if (e.scrollTop >= (e.scrollHeight - e.clientHeight - 1)) d = -1; if (e.scrollTop <= 0) d = 1; }, 40); }
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('modo-tv')) { document.body.classList.remove('modo-tv'); clearInterval(scInt); abrirAba(null, 'aba-programacao'); } });

// SISTEMA (TEMA, BACKUP, START)

