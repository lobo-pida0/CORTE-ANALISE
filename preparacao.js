// =========================================================================
// 🧰 PREPARAÇÃO — fila das OPs entre o Corte e a Costura, em 5 grupos, cada um com suas "janelas" (um local por janela).
// Fonte: planilha POR_OP (colunas OP, Ciclo, Descrição Local, Qt OP Local, Data Finalização...). Só as OPs desses locais
// são guardadas. Ordem em cada janela: finalização mais próxima primeiro, depois quem está há mais dias no local.
// A pessoa marca as OPs do dia e clica em SALVAR NO PLANO (plano do dia, guardado por data).
// Para mudar o que entra em cada grupo/janela, é só editar GRUPOS_PREPARACAO. O campo `tempo` de cada janela é a coluna da
// planilha de TEMPO PEÇA POR TIPO DE OPERAÇÃO usada pra calcular o tempo (peças × tempo por peça); janela sem `tempo` não calcula.
// =========================================================================
const GRUPOS_PREPARACAO = [
    { chave: 'SUP', rotulo: 'Preparação parte superior', janelas: [
        { local: 'PNP PREP PARTES SUP', rotulo: 'Partes superiores', tempo: 'PREP PARTES SUPERIOR' }, { local: 'PNP PREP GOLA E PUNHO', rotulo: 'Gola e punho', tempo: 'PREP GLA E PUNHO' },
        // (no sistema o local está escrito "PROGAMADA", sem o R — aceita as duas grafias)
        { local: 'PNP COSTURA PROGAMADA', alias: ['PNP COSTURA PROGRAMADA'], rotulo: 'Costura programada', tempo: 'COSTURA PROGRAMADA' }] },
    { chave: 'INF', rotulo: 'Preparação parte inferior', janelas: [{ local: 'PNP PREP PARTES INF', rotulo: 'Partes inferiores', tempo: 'PREP PARTES INFERIOR' }] },
    { chave: 'LOGO', rotulo: 'Fusionadeira / logo / silk / bordado', janelas: [
        { local: 'PNP FUSIONADEIRA LOGO', rotulo: 'Fusionadeira logo', tempo: 'FUSIO LOGO' }, { local: 'PNP INSPECAO LOGO/MARCA INDIRETO', rotulo: 'Inspeção logo/marca' },
        { local: 'PNP SILK INTERNO', rotulo: 'Silk' }, { local: 'PNP BORDADO INTERNO', rotulo: 'Bordado', tempo: 'BORD INT' },
        { local: 'PNP AGUARD DEFINICAO SILK', rotulo: 'Aguardando definição de silk' }, { local: 'PNP AGUARD DEFINICAO BORDADO', rotulo: 'Aguardando definição de bordado' }] },
    { chave: 'UNIR', rotulo: 'Separar peças / unir corpo', janelas: [{ local: 'PNP SEPARAR PECAS / UNIR CORPO E PTS', rotulo: 'Separar peças / unir corpo', tempo: 'PREP SEPARACAO' }] },
    { chave: 'DIST', rotulo: 'Distribuição', janelas: [
        { local: 'PNP AGUARD BIP DISTRIBUICAO', rotulo: 'Aguardando bipagem' }, { local: 'PNP DISTRIBUICAO INT', rotulo: 'Distribuição interna' }] },
];
const CORES_JANELAS_PREPARACAO = ['#2E86AB', '#E07A1F', '#2E9E6B', '#8E5BB5', '#C2415C', '#B8941F'];   // uma cor por janela (só quando o grupo tem mais de uma)
const normLocalPrep = t => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const LOCAIS_PREPARACAO = new Set(GRUPOS_PREPARACAO.flatMap(g => g.janelas.flatMap(j => [j.local, ...(j.alias || [])].map(normLocalPrep))));
const CANONICO_LOCAL_PREP = new Map(GRUPOS_PREPARACAO.flatMap(g => g.janelas.flatMap(j => [j.local, ...(j.alias || [])].map(l => [normLocalPrep(l), normLocalPrep(j.local)]))));
const escPrep = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const isoLocalPrep = d => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null;

function obterOPsPreparacao() { try { return JSON.parse(localStorage.getItem('porOPPreparacao') || '[]'); } catch (e) { return []; } }
function obterPlanosPreparacao() { try { return JSON.parse(localStorage.getItem('planoPreparacao') || '{}') || {}; } catch (e) { return {}; } }
function salvarPlanosPreparacao(p) { try { localStorage.setItem('planoPreparacao', JSON.stringify(p)); } catch (e) { /* ignora */ } }
function hojePreparacao() { return isoLocalPrep(new Date()); }
let subabaPreparacao = GRUPOS_PREPARACAO[0].chave;
function abrirSubabaPreparacao(chave) { subabaPreparacao = chave; renderizarPreparacao(); }
const chaveOPPrep = o => `${o.ciclo || ''}-${o.op}`;

// Parte pura (testável): linhas da planilha → OPs nos locais da preparação.
function extrairOPsPreparacaoDasLinhas(rows) {
    const semAc = normLocalPrep;
    const iCab = [0, 1, 2, 3].find(i => rows[i] && rows[i].some(c => semAc(c) === 'OP'));
    if (iCab === undefined) throw new Error('Não achei a linha de títulos (coluna OP).');
    const cab = rows[iCab].map(semAc), f = fn => cab.findIndex(fn);
    const ix = {
        local: f(c => c === 'DESCRICAO LOCAL' || (c.startsWith('DESCRI') && c.endsWith(' LOCAL') && !c.includes('REFER'))), op: f(c => c === 'OP'), ciclo: f(c => c === 'CICLO'), ref: f(c => c.startsWith('REFERENCIA') && !c.includes('DESCRICAO')),
        descRef: f(c => c.includes('DESCRICAO') && c.includes('REFER')), cor: f(c => c === 'COR'), qtd: f(c => c.startsWith('QT') && c.includes('LOCAL')),
        tipo: f(c => c.includes('TIPO') && c.includes('PRODUTO')), localProd: f(c => c === 'LOCAL OBS' || c === 'LOCAL OBS.' || c.startsWith('LOCAL OBS')), dataFin: f(c => c.includes('DATA') && c.includes('FINALIZ')), dias: f(c => c === 'DIAS LOCAL'),
    };
    if (ix.local === -1 || ix.op === -1) throw new Error('Faltam as colunas "Descrição Local" e/ou "OP".');
    const lista = [];
    for (let i = iCab + 1; i < rows.length; i++) {
        const r = rows[i]; if (!r || r[ix.op] === undefined || r[ix.op] === null || r[ix.op] === '') continue;
        const localBruto = normLocalPrep(r[ix.local]); if (!LOCAIS_PREPARACAO.has(localBruto)) continue;
        const local = CANONICO_LOCAL_PREP.get(localBruto);   // grafia única (PROGAMADA/PROGRAMADA → a mesma janela)
        lista.push({
            op: String(r[ix.op]).trim(), ciclo: ix.ciclo !== -1 && r[ix.ciclo] != null ? String(r[ix.ciclo]).trim() : '', local,
            ref: ix.ref !== -1 && r[ix.ref] ? String(r[ix.ref]).trim().toUpperCase() : '', descRef: ix.descRef !== -1 ? String(r[ix.descRef] || '').trim() : '',
            cor: ix.cor !== -1 && r[ix.cor] ? String(r[ix.cor]).trim().toUpperCase() : '', qtd: ix.qtd !== -1 ? (parseFloat(r[ix.qtd]) || 0) : 0,
            tipo: ix.tipo !== -1 ? semAc(r[ix.tipo]) : '', localProd: ix.localProd !== -1 && r[ix.localProd] ? String(r[ix.localProd]).trim().toUpperCase() : '', fin: ix.dataFin !== -1 ? isoLocalPrep(extrairDataExcel(r[ix.dataFin])) : null,
            dias: ix.dias !== -1 && r[ix.dias] !== '' && r[ix.dias] != null ? (parseInt(r[ix.dias]) || 0) : null,
        });
    }
    return lista;
}

// Nome curto do local no balanço: a janela (ex.: "Gola e punho", "Silk").
function nomeLocalPreparacao(local) {
    for (const g of GRUPOS_PREPARACAO) { const j = g.janelas.find(x => normLocalPrep(x.local) === normLocalPrep(local)); if (j) return j.rotulo; }
    return local;
}

function processarPorOPPreparacao() {
    if (!exigirAdminOuUsuario('importar a planilha da preparação')) return;
    if (!exigirBibliotecaExcel()) return;
    const input = $('inputPorOPPreparacao'); if (!input.files[0]) return;
    const r = new FileReader();
    r.onload = e => {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const lista = extrairOPsPreparacaoDasLinhas(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }));
            if (!lista.length) throw new Error('Nenhuma OP nos locais da preparação foi encontrada.');
            const antes = obterOPsPreparacao();   // foto anterior, pro balanço
            localStorage.setItem('porOPPreparacao', JSON.stringify(lista));
            localStorage.setItem('porOPPreparacaoEm', new Date().toISOString());
            input.value = ''; renderizarPreparacao();
            showToast(`<i class="fas fa-check-double"></i> ${lista.length} OPs da preparação importadas!`);
            if (antes.length) exibirBalancoSeqCostura(antes, lista, { titulo: 'BALANÇO DA PREPARAÇÃO', icone: 'fa-boxes-packing', setor: 'PREPARAÇÃO', nomeLocal: nomeLocalPreparacao, semHistorico: true });
        } catch (err) { alert('❌ Não foi possível processar a planilha.\n\n' + err.message); input.value = ''; }
    };
    r.readAsArrayBuffer(input.files[0]);
}

// ---- TEMPO PEÇA POR TIPO DE OPERAÇÃO: planilha (1 linha por OP; colunas "Tempo Peca OP Local" com o nome da operação na linha de cima) ----
// Parte pura (testável): linhas → { 'ciclo-op': { 'PREP PARTES SUPERIOR': 7.76, ... }, 'op': {...} }  (valor = segundos por peça)
function extrairTemposPreparacaoDasLinhas(rows, soOperacoes) {
    const iCab = [0, 1, 2, 3].find(i => rows[i] && rows[i].some(c => normLocalPrep(c) === 'OP'));
    if (iCab === undefined || iCab === 0) throw new Error('Não achei a linha de títulos (coluna OP) com os nomes das operações acima dela.');
    const cab = rows[iCab].map(normLocalPrep), nomes = rows[iCab - 1].map(normLocalPrep);
    const iOP = cab.indexOf('OP'), iCiclo = cab.indexOf('CICLO');
    const colunas = cab.map((c, i) => (c.startsWith('TEMPO PECA') && nomes[i]) ? i : -1).filter(i => i !== -1);
    if (iOP === -1 || !colunas.length) throw new Error('Não achei as colunas "Tempo Peça" por operação.');
    const mapa = {}; let ciclo = '';
    for (let i = iCab + 1; i < rows.length; i++) {
        const r = rows[i]; if (!r) continue;
        if (iCiclo !== -1 && r[iCiclo] != null && r[iCiclo] !== '') ciclo = String(r[iCiclo]).trim();
        if (r[iOP] == null || r[iOP] === '') continue;   // linhas só com o local (mesma OP em outro local) repetem os mesmos tempos
        const tempos = {}; colunas.forEach(c => { const v = parseFloat(r[c]); if (v > 0 && (!soOperacoes || soOperacoes.has(nomes[c]))) tempos[nomes[c]] = Math.round(v * 1000) / 1000; });
        if (!Object.keys(tempos).length) continue;
        const op = String(r[iOP]).trim();
        mapa[`${ciclo}-${op}`] = tempos; if (!(op in mapa)) mapa[op] = tempos;
    }
    return mapa;
}
// Os tempos ficam no IndexedDB (a planilha é grande e o localStorage de 5 MB já enche com as outras abas); só as operações usadas pelas janelas.
let temposPreparacaoCache = {};
function abrirIDBTempos() { return new Promise((ok, erro) => { const r = indexedDB.open('corte-pro-tempos', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error); }); }
async function salvarTemposIDB(valor) { const db = await abrirIDBTempos(); return new Promise((ok, erro) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(valor, 'temposPreparacao'); tx.oncomplete = () => ok(); tx.onerror = () => erro(tx.error); }); }
async function carregarTemposPreparacao() {
    try { const db = await abrirIDBTempos(); temposPreparacaoCache = await new Promise((ok, erro) => { const r = db.transaction('kv').objectStore('kv').get('temposPreparacao'); r.onsuccess = () => ok(r.result || {}); r.onerror = () => erro(r.error); }); } catch (e) { temposPreparacaoCache = {}; }
    renderizarPreparacao();
}
function obterTemposPreparacao() { return temposPreparacaoCache; }
function operacoesUsadasPreparacao() { return new Set(GRUPOS_PREPARACAO.flatMap(g => g.janelas.map(j => j.tempo ? normLocalPrep(j.tempo) : null)).filter(Boolean)); }
function tempoPecaPreparacao(o, janela, tempos) {
    if (!janela.tempo) return 0;
    const t = tempos[`${o.ciclo}-${o.op}`] || tempos[o.op];
    return t ? (t[normLocalPrep(janela.tempo)] || 0) : 0;
}
const fmtMinPrep = min => { if (!min) return '—'; if (min < 1) return `${Math.max(1, Math.round(min * 60))}s`; const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}min`; };
function importarTemposPreparacao() {
    if (!exigirAdminOuUsuario('importar a planilha de tempos da preparação')) return;
    if (!exigirBibliotecaExcel()) return;
    const input = $('inputTemposPreparacao'); if (!input.files[0]) return;
    const r = new FileReader();
    r.onload = async e => {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const mapa = extrairTemposPreparacaoDasLinhas(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }), operacoesUsadasPreparacao());
            await salvarTemposIDB(mapa); temposPreparacaoCache = mapa;
            try { localStorage.removeItem('temposPreparacao'); localStorage.setItem('temposPreparacaoEm', new Date().toISOString()); } catch (e2) { /* localStorage cheio: só perde a data */ }
            input.value = ''; renderizarPreparacao();
            showToast(`<i class="fas fa-check-double"></i> Tempos de ${Object.keys(mapa).filter(k => k.includes('-')).length} OPs importados!`);
        } catch (err) { alert('❌ Não foi possível processar a planilha de tempos.\n\n' + err.message); input.value = ''; }
    };
    r.readAsArrayBuffer(input.files[0]);
}

// ---- URGENTE: marcação compartilhada (linha 'urgentes_preparacao' da tabela destino_producao), igual ao Destino ----
function obterUrgentesPreparacao() { try { return new Set(JSON.parse(localStorage.getItem('urgentesPreparacao') || '[]')); } catch (e) { return new Set(); } }
async function publicarUrgentesPreparacao() {
    if (!supabaseClient || !sessaoAdminAtual) return false;
    try {
        const agora = new Date().toISOString(), por = String((sessaoAdminAtual.user && sessaoAdminAtual.user.email) || '').split('@')[0].toUpperCase();
        localStorage.setItem('urgentesPendentePublicar', '1');
        const { error } = await supabaseClient.from('destino_producao').upsert({ id: 'urgentes_preparacao', dados: { chaves: [...obterUrgentesPreparacao()] }, atualizado_em: agora, atualizado_por: por }, { onConflict: 'id' });
        if (error) throw error;
        localStorage.setItem('urgentesNuvemEm', agora); localStorage.removeItem('urgentesPendentePublicar');
        return true;
    } catch (e) { registrarLogDebug('error', ['Falha ao publicar as urgências da preparação: ' + e.message]); return false; }
}
async function carregarUrgentesPreparacaoDaNuvem() {
    if (!supabaseClient) return;
    try {
        if (localStorage.getItem('urgentesPendentePublicar') === '1') { if (sessaoAdminAtual) await publicarUrgentesPreparacao(); return; }
        const { data, error } = await supabaseClient.from('destino_producao').select('dados, atualizado_em').eq('id', 'urgentes_preparacao').maybeSingle();
        if (error) throw error;
        if (!data || data.atualizado_em === localStorage.getItem('urgentesNuvemEm')) return;
        localStorage.setItem('urgentesPreparacao', JSON.stringify((data.dados && data.dados.chaves) || []));
        localStorage.setItem('urgentesNuvemEm', data.atualizado_em);
        renderizarPreparacao();
    } catch (e) { registrarLogDebug('error', ['Falha ao carregar as urgências da preparação: ' + e.message]); }
}
async function alternarUrgentePreparacao(chave) {
    if (!exigirAdminOuUsuario('marcar OP como urgente')) return;
    const u = obterUrgentesPreparacao(); if (u.has(chave)) u.delete(chave); else u.add(chave);
    localStorage.setItem('urgentesPreparacao', JSON.stringify([...u]));
    renderizarPreparacao();
    publicarUrgentesPreparacao();
}

function ordenarPreparacao(a, b) {
    const ua = obterUrgentesPreparacao().has(chaveOPPrep(a)), ub = obterUrgentesPreparacao().has(chaveOPPrep(b));
    if (ua !== ub) return ua ? -1 : 1;   // urgentes primeiro
    if (!!a.fin !== !!b.fin) return a.fin ? -1 : 1;
    if (a.fin !== b.fin) return a.fin < b.fin ? -1 : 1;
    return (b.dias || 0) - (a.dias || 0);
}
const dataBRPrep = iso => iso ? iso.split('-').reverse().join('/') : '—';

function renderizarPreparacao() {
    const alvo = $('preparacaoConteudo'); if (!alvo) return;
    const ops = obterOPsPreparacao(), planos = obterPlanosPreparacao(), hoje = hojePreparacao();
    const plano = planos[hoje] ? planos[hoje].ops : [], noPlano = new Set(plano.map(chaveOPPrep));
    const em = localStorage.getItem('porOPPreparacaoEm');
    const info = $('preparacaoInfo'); if (info) info.innerText = em ? `Planilha importada em ${new Date(em).toLocaleString('pt-BR')} · ${ops.length} OPs` : 'Nenhuma planilha importada ainda.';
    const infoT = $('preparacaoTemposInfo'); if (infoT) { const eT = (() => { try { return localStorage.getItem('temposPreparacaoEm'); } catch (e) { return null; } })(); infoT.innerText = Object.keys(temposPreparacaoCache).length ? (eT ? `Tempos importados em ${new Date(eT).toLocaleString('pt-BR')}` : 'Tempos importados') : 'Tempos: não importados' }
    if (!ops.length) { alvo.innerHTML = '<div style="padding:30px; text-align:center; color:var(--texto-secundario);">Importe a planilha POR_OP para ver as OPs da preparação.</div>'; return; }

    // Mês de destino (o mesmo da aba Prioridades / importação de Destino de Produção), ex.: "2026-11" → NOV/2026.
    const tempos = obterTemposPreparacao(), temTempos = Object.keys(tempos).length > 0;
    const urgentes = obterUrgentesPreparacao(), localProdFila = obterLocalProducaoPorOP();
    const htmlLocalProd = o => { const v = o.localProd || localProdFila.get(o.op) || ''; return v ? `<span style="font-size:11px;">${escPrep(v)}</span>` : '<span style="color:var(--texto-secundario);">—</span>'; };
    const mesesDestino = obterOpsMesDestino(), NOMES_MES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    const htmlMesDestino = o => { const m = String(mesesDestino[montarChaveOP(o.ciclo, o.op)] || '').match(/^(\d{4})-(\d{2})$/); return m ? `<strong>${NOMES_MES[parseInt(m[2]) - 1] || m[2]}/${m[1]}</strong>` : '<span style="color:var(--texto-secundario);">—</span>'; };
    const htmlPlano = plano.length ? `<div class="secao" style="margin-bottom:12px;"><div class="secao-header" style="background:var(--cor-despacho);"><span><i class="fas fa-clipboard-check"></i> PLANO DE HOJE (${dataBRPrep(hoje)})</span><span>${plano.length} OP(s) · ${plano.reduce((t, o) => t + (o.qtd || 0), 0).toLocaleString('pt-BR')} peças</span></div>
        <div class="secao-corpo" style="padding:0;"><table class="tabela-dados"><tbody>${plano.map(o => `<tr><td><strong>${escPrep(o.op)}</strong></td><td>ciclo ${escPrep(o.ciclo)}</td><td>${escPrep(o.grupoRotulo)} · ${escPrep(o.janelaRotulo)}</td><td>${escPrep(o.descRef)}</td><td>final.: ${dataBRPrep(o.fin)}</td><td style="text-align:right;">${o.qtd}</td><td><button class="btn btn-perigo" style="padding:2px 8px;" onclick="tirarOPDoPlanoPreparacao('${escPrep(chaveOPPrep(o))}')" title="Tirar do plano"><i class="fas fa-xmark"></i></button></td></tr>`).join('')}</tbody></table></div></div>` : '';

    const gSel = GRUPOS_PREPARACAO.find(g => g.chave === subabaPreparacao) || GRUPOS_PREPARACAO[0];
    const htmlSubabas = `<div class="subabas-programacao">${GRUPOS_PREPARACAO.map(g => { const q = ops.filter(o => g.janelas.some(j => normLocalPrep(j.local) === o.local)).length; return `<button class="subaba-btn${g === gSel ? ' ativo' : ''}" onclick="abrirSubabaPreparacao('${g.chave}')">${escPrep(g.rotulo)} (${q})</button>`; }).join('')}</div>`;
    const htmlGrupos = [gSel].map(g => {
        const janelas = g.janelas.map((j, ij) => {
            const cor = g.janelas.length > 1 ? CORES_JANELAS_PREPARACAO[ij % CORES_JANELAS_PREPARACAO.length] : 'var(--cor-primaria)';
            const lista = ops.filter(o => o.local === normLocalPrep(j.local)).sort(ordenarPreparacao);
            const pecas = lista.reduce((t, o) => t + (o.qtd || 0), 0), minJanela = temTempos && j.tempo ? lista.reduce((t, o) => t + (o.qtd || 0) * tempoPecaPreparacao(o, j, tempos), 0) / 60 : 0;   // planilha em segundos → minutos
            const colTempo = temTempos && !!j.tempo, tp = o => tempoPecaPreparacao(o, j, tempos);
            const linhas = lista.map(o => { const urg = urgentes.has(chaveOPPrep(o)); return `<tr style="${noPlano.has(chaveOPPrep(o)) ? 'opacity:.55;' : ''}${urg ? 'background:rgba(193,68,78,.14);' : ''}">
                <td><input type="checkbox" class="check-prep" data-chave="${escPrep(chaveOPPrep(o))}" ${noPlano.has(chaveOPPrep(o)) ? 'checked disabled' : ''}></td>
                <td style="text-align:center;"><i class="fas fa-fire prep-urg${urg ? ' ativa' : ''}" style="cursor:pointer; color:${urg ? 'var(--cor-alerta)' : 'var(--borda-cor)'};" onclick="alternarUrgentePreparacao('${escPrep(chaveOPPrep(o))}')" title="${urg ? 'Tirar urgência' : 'Marcar como urgente'}"></i></td>
                <td><strong>${escPrep(o.op)}</strong></td><td>${escPrep(o.ciclo)}</td><td>${escPrep(o.descRef)} <span style="color:var(--texto-secundario);">${escPrep(o.ref)}</span></td>
                <td>${htmlLocalProd(o)}</td><td style="white-space:nowrap;">${htmlMesDestino(o)}</td><td style="white-space:nowrap;">${dataBRPrep(o.fin)}</td><td style="text-align:right;">${o.dias == null ? '—' : o.dias + 'd'}</td><td class="prep-qtd" style="text-align:right; font-weight:bold;">${o.qtd}</td>${colTempo ? `<td style="text-align:right; white-space:nowrap;">${tp(o) ? tp(o).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '—'}</td><td class="prep-qtd" style="text-align:right; white-space:nowrap; font-weight:bold;">${fmtMinPrep((o.qtd || 0) * tp(o) / 60)}</td>` : ''}</tr>`; }).join('');
            return `<div id="prepJanela-${g.chave}-${ij}" style="border:1px solid ${cor}; border-left:6px solid ${cor}; border-radius:6px; overflow:hidden; min-width:0;">
                <div style="padding:8px 12px; background:${cor}2E; border-bottom:2px solid ${cor}; display:flex; justify-content:space-between; align-items:center; font-size:13px;"><strong style="display:flex; align-items:center; gap:8px;"><span style="width:12px; height:12px; border-radius:50%; background:${cor}; display:inline-block;"></span>${escPrep(j.rotulo)}</strong><span style="display:flex; align-items:center; gap:8px;"><span style="background:${cor}; color:white; padding:2px 10px; border-radius:12px; font-size:11px; font-weight:bold;">${lista.length} OP(s) · ${pecas.toLocaleString('pt-BR')} peças${minJanela ? ' · ⏱ ' + fmtMinPrep(minJanela) : ''}${lista.filter(o => urgentes.has(chaveOPPrep(o))).length ? ' · 🔥 ' + lista.filter(o => urgentes.has(chaveOPPrep(o))).length : ''}</span><button class="btn imprimir-esconder-sempre" style="padding:3px 10px; font-size:11px; background:var(--cor-historico); color:white;" onclick="imprimirJanelaPreparacao('prepJanela-${g.chave}-${ij}')" title="Imprime só esta janela (só as OPs marcadas)"><i class="fas fa-print"></i> IMPRIMIR</button></span></div>
                ${lista.length ? `<div class="prep-rolagem" style="max-height:340px; overflow:auto;"><table class="tabela-dados"><thead><tr><th></th><th title="Urgente"><i class="fas fa-fire"></i></th><th>OP</th><th>Ciclo</th><th>Produto</th><th title="Local de produção (Local Obs. da POR_OP, ou da Fila de Corte)">Local prod.</th><th>Mês destino</th><th>Final.</th><th>No local</th><th class="prep-qtd" style="text-align:right;">Qtd</th>${colTempo ? `<th style="text-align:right;" title="Segundos por peça (${escPrep(j.tempo)})">Seg/peça</th><th class="prep-qtd" style="text-align:right;" title="Qtd × segundos por peça (mostrado em horas/minutos)">Tempo</th>` : ''}</tr></thead><tbody>${linhas}</tbody></table></div>` : '<div style="padding:14px; text-align:center; color:var(--texto-secundario); font-size:12px;">Nenhuma OP neste local.</div>'}</div>`;
        }).join('');
        const todas = ops.filter(o => g.janelas.some(j => normLocalPrep(j.local) === o.local));
        return `<div class="secao" style="margin-bottom:12px;"><div class="secao-header" style="background:var(--cor-primaria);"><span><i class="fas fa-layer-group"></i> ${escPrep(g.rotulo)}</span><span>${todas.length} OP(s) · ${todas.reduce((t, o) => t + (o.qtd || 0), 0).toLocaleString('pt-BR')} peças</span></div>
            <div class="secao-corpo" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(${g.janelas.length === 1 ? '100%' : '620px'}, 1fr)); gap:14px; align-items:start;">${janelas}</div></div>`;
    }).join('');
    alvo.innerHTML = htmlSubabas + htmlPlano + htmlGrupos;
}

function salvarMarcadasNoPlanoPreparacao() {
    if (!exigirAdminOuUsuario('salvar o plano da preparação')) return;
    const marcadas = new Set(Array.from(document.querySelectorAll('.check-prep:checked:not(:disabled)')).map(c => c.dataset.chave));
    if (!marcadas.size) return showToast('Marque as OPs que quer salvar no plano.', true);
    const planos = obterPlanosPreparacao(), hoje = hojePreparacao(), plano = planos[hoje] || { ops: [] };
    const jaTem = new Set(plano.ops.map(chaveOPPrep));
    obterOPsPreparacao().forEach(o => {
        if (!marcadas.has(chaveOPPrep(o)) || jaTem.has(chaveOPPrep(o))) return;
        const g = GRUPOS_PREPARACAO.find(x => x.janelas.some(j => normLocalPrep(j.local) === o.local)), j = g.janelas.find(x => normLocalPrep(x.local) === o.local);
        plano.ops.push({ op: o.op, ciclo: o.ciclo, qtd: o.qtd, fin: o.fin, descRef: o.descRef, local: o.local, grupo: g.chave, grupoRotulo: g.rotulo, janelaRotulo: j.rotulo });
    });
    planos[hoje] = plano; salvarPlanosPreparacao(planos);
    renderizarPreparacao(); showToast(`<i class="fas fa-check"></i> ${marcadas.size} OP(s) salvas no plano de hoje.`);
}
function tirarOPDoPlanoPreparacao(chave) {
    if (!exigirAdminOuUsuario('alterar o plano da preparação')) return;
    const planos = obterPlanosPreparacao(), hoje = hojePreparacao();
    if (planos[hoje]) { planos[hoje].ops = planos[hoje].ops.filter(o => chaveOPPrep(o) !== chave); if (!planos[hoje].ops.length) delete planos[hoje]; }
    salvarPlanosPreparacao(planos); renderizarPreparacao();
}

// Imprime só UMA janela: esconde as OPs não marcadas (se alguma estiver marcada), o botão e a coluna dos checkboxes, e usa o
// mesmo mecanismo de impressão das outras abas (imprimirSecao → área de impressão isolada).
function imprimirJanelaPreparacao(idJanela) {
    const el = document.getElementById(idJanela); if (!el) return;
    const checks = [...el.querySelectorAll('.check-prep')], tem = checks.some(c => c.checked);
    checks.forEach(c => { const tr = c.closest('tr'); if (tr && tem && !c.checked) tr.classList.add('imprimir-esconder'); });
    el.querySelectorAll('button').forEach(b => b.classList.add('imprimir-esconder'));
    el.querySelectorAll('tr').forEach(tr => { const c = tr.firstElementChild; if (c) c.classList.add('imprimir-esconder'); });   // coluna dos checkboxes
    el.querySelectorAll('.prep-urg:not(.ativa)').forEach(i => i.classList.add('imprimir-esconder'));
    el.querySelectorAll('.prep-rolagem').forEach(d => d.classList.add('prep-sem-limite'));
    imprimirSecao(idJanela);
}
window.addEventListener('afterprint', () => { document.querySelectorAll('.prep-sem-limite').forEach(d => d.classList.remove('prep-sem-limite')); });
