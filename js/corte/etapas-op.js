// -------------------------------------------------------------------------
// (separado de ops-prioridades.js) Fracionar lote e regras de avanço de etapa da OP.
// -------------------------------------------------------------------------
function abrirModalFracionar(id) {
    opFracionarOrigem = bancoDadosOPs.find(o => o.id === id); if (!opFracionarOrigem || opFracionarOrigem.qtd <= 1) return alert("Não pode fracionar 1 peça.");
    $('fracOpId').innerText = opFracionarOrigem.id; $('fracTotalPcs').innerText = opFracionarOrigem.qtd; $('fracTotalTempo').innerText = opFracionarOrigem.tempoCorte;
    const s = $('fracSlider'); s.min = 1; s.max = opFracionarOrigem.qtd - 1; s.value = Math.floor(opFracionarOrigem.qtd / 2);
    $('modalFracionarOverlay').style.display = 'flex'; $('ctxMenu').style.display = 'none'; atualizarFracao();
}
function atualizarFracao() {
    const q1 = parseInt($('fracSlider').value), q2 = opFracionarOrigem.qtd - q1;
    const t1 = ((q1 / opFracionarOrigem.qtd) * opFracionarOrigem.tempoCorte).toFixed(1), t2 = (opFracionarOrigem.tempoCorte - t1).toFixed(1);
    $('fracPcs1').innerText = q1 + " pçs"; $('fracTempo1').innerText = t1 + " min"; $('fracPcs2').innerText = q2 + " pçs"; $('fracTempo2').innerText = t2 + " min";
}
function confirmarFracionamento() {
    if (!exigirAdmin('fracionar a OP')) return;
    registrarEstado(); const q1 = parseInt($('fracSlider').value), q2 = opFracionarOrigem.qtd - q1;
    const t1 = parseFloat(((q1 / opFracionarOrigem.qtd) * opFracionarOrigem.tempoCorte).toFixed(1)), t2 = parseFloat((opFracionarOrigem.tempoCorte - t1).toFixed(1));
    const base = opFracionarOrigem.id.split('-K')[0], rx = new RegExp(`^${base}-K(\\d+)$`); let mx = 0;
    bancoDadosOPs.forEach(o => { if (o.id === base) mx = Math.max(mx, 1); const m = o.id.match(rx); if (m) mx = Math.max(mx, parseInt(m[1])); });
    let op2 = JSON.parse(JSON.stringify(opFracionarOrigem)); op2.id = `${base}-K${mx > 0 ? mx + 2 : 2}`; op2.qtd = q2; op2.tempoCorte = t2;
    opFracionarOrigem.id = `${base}-K${mx > 0 ? mx + 1 : 1}`; opFracionarOrigem.qtd = q1; opFracionarOrigem.tempoCorte = t1;
    bancoDadosOPs.push(op2); localStorage.setItem('bancoOPs', JSON.stringify(bancoDadosOPs)); cacheGruposPorReferencia = null; fecharModais(); renderizarTudoImediato();
}

// 🔀 Regra da etapa de DUBLAGEM (etapa 5): só se aplica a OPs marcadas com temDublado.
// Centralizado aqui porque essa regra era checada em 2 lugares diferentes do código
// (avanço de etapa e cálculo de prazo) — se um dia mudar, só precisa mexer aqui.
function etapaEhAplicavel(idxEtapa, op) {
    return !(idxEtapa === 5 && !op.temDublado);
}
function proximaEtapa(etapaAtual, op) {
    let prox = etapaAtual + 1;
    if (!etapaEhAplicavel(prox, op)) prox++;
    return prox;
}
function avancarEtapaOP(id) { if (!exigirAdmin('avançar etapa')) return; let op = bancoDadosOPs.find(o => o.id === id); if (op && op.etapa < 7) { registrarEstado(); op.etapa = proximaEtapa(op.etapa, op); op.dataEntradaEtapa = new Date(); localStorage.setItem('bancoOPs', JSON.stringify(bancoDadosOPs)); cacheGruposPorReferencia = null; renderizarTudoImediato(); } }
