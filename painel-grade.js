// =========================================================================
// 📊 PAINEL DE VISÃO GERAL — resumo rápido de 5 números-chave, no topo da
// Fila Geral, cada um clicável levando pra aba/análise correspondente.
// =========================================================================
// Anima um número subindo de 0 até o valor final — usado nos cartões da
// Visão Geral pra dar aquela sensação de "painel vivo" ao atualizar.
function animarContador(elementId, valorFinal, duracaoMs = 700) {
    const el = $(elementId);
    if (!el) return;
    const inicioTempo = performance.now();
    function passo(agora) {
        const progresso = Math.min((agora - inicioTempo) / duracaoMs, 1);
        el.innerText = Math.round(valorFinal * progresso);
        if (progresso < 1) requestAnimationFrame(passo);
        else el.innerText = valorFinal;
    }
    requestAnimationFrame(passo);
}

function renderizarResumoGeral(pendentesPorReferenciaParam, mediaCorteParam) {
    if (!$('resumo-pedidos-total')) return;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

    // Recebe o mapa já calculado quando vem do ciclo principal de renderização
    // (evita reprocessar o localStorage de novo pras seções que dependem
    // disso); senão, calcula na hora — mantém a função utilizável sozinha
    // (ex: depois de sincronizar a Fila de Corte, que roda fora do ciclo
    // principal). A lista completa de pedidos é lida à parte (não reconstruída
    // a partir do mapa), porque o mapa ignora de propósito pedidos sem
    // referência preenchida — reconstruir a partir dele os perderia da contagem.
    const pendentesPorReferencia = pendentesPorReferenciaParam || obterPendentesPorReferencia();
    const pendentes = obterPedidosPendentes();

    // Pedidos pendentes
    const pedidosUrgentes = pendentes.filter(p => p.prior !== 99 || (p.chegada && new Date(p.chegada) < hoje)).length;
    animarContador('resumo-pedidos-total', pendentes.length);
    $('resumo-pedidos-urgentes').innerText = pedidosUrgentes > 0 ? `${pedidosUrgentes} urgente${pedidosUrgentes > 1 ? 's' : ''}` : 'nenhum urgente';
    if ($('cardResumoPedidos')) $('cardResumoPedidos').classList.toggle('destaque-urgente', pedidosUrgentes > 0);

    // OPs vinculadas a pedidos
    let totalVinculadas = 0, vinculadasUrgentes = 0;
    bancoDadosOPs.forEach(op => {
        if (!op.referencia) return;
        const pendentesRef = pendentesPorReferencia.get(op.referencia);
        if (!pendentesRef || !pendentesRef.length) return;
        totalVinculadas++;
        const pedido = [...pendentesRef].sort(compararUrgenciaPedidos)[0];
        const especial = pedido.prior !== 99;
        const dataChegada = pedido.chegada ? new Date(pedido.chegada) : null;
        const vencido = dataChegada && dataChegada < hoje;
        if (especial || vencido) vinculadasUrgentes++;
    });
    animarContador('resumo-vinculadas-total', totalVinculadas);
    $('resumo-vinculadas-urgentes').innerText = vinculadasUrgentes > 0 ? `${vinculadasUrgentes} urgente${vinculadasUrgentes > 1 ? 's' : ''}` : 'nenhuma urgente';
    if ($('cardResumoVinculadas')) $('cardResumoVinculadas').classList.toggle('destaque-urgente', vinculadasUrgentes > 0);

    // Fila de corte
    const salvoFilaCorte = localStorage.getItem('filaCorteDados');
    if (salvoFilaCorte) {
        try {
            const dadosFC = JSON.parse(salvoFilaCorte);
            const media = mediaCorteParam ?? calcularMediaDiariaCorte();
            const opsFC = obterOPsFilaCorte();
            let pecasProximoCorte;
            if (opsFC.length) {
                pecasProximoCorte = opsFC.reduce((s, o) => s + (CODIGOS_DIAS_FILA_CORTE.includes(o.cod) && opPassaFiltroFilaCorte(o) ? (o.qtd || 0) : 0), 0);
            } else {
                pecasProximoCorte = dadosFC.reduce((s, x) => s + (CODIGOS_DIAS_FILA_CORTE.includes(x.codigo) ? (x.qtdPecas || 0) : 0), 0);
            }
            const diasFilaCorte = media > 0 ? pecasProximoCorte / media : 0;
            $('resumo-diasfilacorte').innerText = diasFilaCorte.toFixed(1).replace('.', ',');
            $('resumo-diasfilacorte-detalhe').innerText = 'dias na porta do corte';
            if ($('cardResumoFilaCorte')) $('cardResumoFilaCorte').classList.toggle('destaque-urgente', diasFilaCorte >= 5);
        } catch (e) { $('resumo-diasfilacorte').innerText = '—'; }
    } else {
        $('resumo-diasfilacorte').innerText = '—';
        $('resumo-diasfilacorte-detalhe').innerText = 'planilha não importada';
    }

    // Maior gargalo — passa o mapa adiante, em vez de deixar recalcular de novo
    const ranking = calcularRankingGargalo(pendentesPorReferencia);
    if (ranking.length > 0) {
        $('resumo-gargalo-setor').innerText = ranking[0].nome;
        $('resumo-gargalo-detalhe').innerText = ranking[0].diasFila !== null ? `${ranking[0].diasFila.toFixed(1).replace('.', ',')} dias de fila · ${ranking[0].qtdOps} OPs` : `${ranking[0].qtdOps} OPs · ${ranking[0].maxDias}d no pior caso`;
        if ($('cardResumoGargalo')) $('cardResumoGargalo').classList.toggle('destaque-urgente', ranking[0].opsComPedidoUrgente > 0);
    } else {
        $('resumo-gargalo-setor').innerText = '—';
        $('resumo-gargalo-detalhe').innerText = 'sem dados';
        if ($('cardResumoGargalo')) $('cardResumoGargalo').classList.remove('destaque-urgente');
    }

    // Fila geral (a própria tabela logo abaixo)
    const totalFila = filaGeralDadosGlobais.length;
    const atrasadosFila = filaGeralDadosGlobais.filter(i => i.sCls === 'pill-atraso').length;
    animarContador('resumo-fila-total', totalFila);
    $('resumo-fila-atraso').innerText = atrasadosFila > 0 ? `${atrasadosFila} em atraso` : 'nenhum em atraso';
    if ($('cardResumoFilaGeral')) $('cardResumoFilaGeral').classList.toggle('destaque-urgente', atrasadosFila > 0);
}

function analisarGargalo() {
    if (!bancoDadosOPs || bancoDadosOPs.length === 0) {
        showToast("<i class='fas fa-info-circle'></i> Sem OPs para analisar.");
        return;
    }

    let setoresAtivos = calcularRankingGargalo();

    if (setoresAtivos.length === 0) {
        showToast("<i class='fas fa-check-circle'></i> Fluxo limpo! Nenhuma OP parada.");
        return;
    }

    const fmt1 = v => v.toFixed(1).replace('.', ',');
    const comRitmo = setoresAtivos.filter(s => s.diasFila !== null);
    const maxDiasFila = comRitmo.length ? Math.max(...comRitmo.map(s => s.diasFila)) : 0;
    const maxScoreGlobal = Math.max(1, ...setoresAtivos.map(s => s.score));
    const corDaFila = d => d >= 3 ? 'var(--cor-alerta)' : (d >= 1.5 ? 'var(--cor-selecao)' : 'var(--cor-despacho)');

    // Esteira: as etapas na ordem real, largura proporcional aos dias de fila
    const porEtapa = [...setoresAtivos].sort((a, b) => a.id - b.id);
    const esteira = comRitmo.length ? `<div style="display:flex; gap:3px; margin-bottom:14px; align-items:stretch;">${porEtapa.map(st => {
        const peso = st.diasFila !== null ? Math.max(st.diasFila, 0.25) : 0.25;
        return `<div title="${st.nome}: ${st.diasFila !== null ? fmt1(st.diasFila) + ' dias de fila' : 'sem ritmo no KPI'}" style="flex:${peso} 1 0; min-width:44px; background:${st.diasFila !== null ? corDaFila(st.diasFila) : 'var(--borda-cor)'}; color:white; border-radius:6px; padding:6px 4px; text-align:center; overflow:hidden;">
            <div style="font-size:9px; font-weight:700; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${st.nome}</div>
            <div style="font-size:13px; font-weight:900;">${st.diasFila !== null ? fmt1(st.diasFila) + 'd' : '—'}</div></div>`;
    }).join('')}</div>` : '';

    const linhaOP = o => {
        const x = o.op;
        const prio = opEstaNaAbaPrioridades(x.ciclo, x.id);
        return `<tr>
            <td style="white-space:nowrap;">${prio ? '<i class="fas fa-star" style="color:var(--cor-selecao); font-size:10px;" title="Está na aba Prioridades"></i> ' : ''}<strong>${x.id}</strong>${x.ciclo ? ' · ' + x.ciclo : ''}</td>
            <td style="max-width:230px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${String(x.desc || '').replace(/"/g, '&quot;')}">${x.desc || ''}</td>
            <td class="num">${o.pecas.toLocaleString('pt-BR')}</td>
            <td class="num" style="${o.dias >= 3 ? 'color:var(--cor-alerta); font-weight:700;' : ''}">${o.dias}d</td>
            <td>${o.comPedido ? `<span class="pill" style="background:${o.urgente ? 'var(--cor-roxo)' : 'var(--cor-sugestao)'}; color:white;" title="Trava um pedido de cliente em aberto">${o.urgente ? 'PEDIDO URGENTE' : 'PEDIDO'}</span>` : ''}</td>
        </tr>`;
    };
    const listaOPs = st => {
        const ordenadas = [...st.ops].sort((a, b) => (opEstaNaAbaPrioridades(b.op.ciclo, b.op.id) ? 1 : 0) - (opEstaNaAbaPrioridades(a.op.ciclo, a.op.id) ? 1 : 0) || (b.urgente ? 1 : 0) - (a.urgente ? 1 : 0) || b.dias - a.dias);
        return `<div style="max-height:260px; overflow-y:auto; margin-top:8px; border-top:1px solid var(--borda-cor);"><table class="tabela-dados" style="width:100%;"><thead><tr><th>OP</th><th>DESCRIÇÃO</th><th style="text-align:right;">PEÇAS</th><th style="text-align:right;">NO LOCAL</th><th></th></tr></thead><tbody>${ordenadas.map(linhaOP).join('')}</tbody></table></div>`;
    };

    let htmlGargalos = setoresAtivos.map((s, index) => {
        const mediaDias = s.qtdOps > 0 ? (s.somaDias / s.qtdOps).toFixed(1) : 0;
        const temFila = s.diasFila !== null;
        const pctBarra = temFila ? (maxDiasFila > 0 ? (s.diasFila / maxDiasFila) * 100 : 0) : (s.score / maxScoreGlobal) * 100;
        const corNivel = temFila ? corDaFila(s.diasFila) : 'var(--borda-cor)';
        const icone = index === 0 && temFila ? '<i class="fas fa-exclamation-triangle" style="color:var(--cor-alerta);"></i>' : `#${index + 1}`;
        const explicacao = temFila
            ? `<strong>${s.pcsFila.toLocaleString('pt-BR')}</strong> pçs na etapa${s.pcsFila !== s.qtdPcs ? ' <span title="Enfesto e Corte contam por camada (Paletó/Blazer/Sobretudo 3x, Jaqueta 2x), igual ao KPI">(contando camadas)</span>' : ''} ÷ <strong>${Math.round(s.ritmo.media).toLocaleString('pt-BR')}</strong> pçs/dia <span title="Média dos últimos ${s.ritmo.dias} dias úteis com movimento (${formatarChaveDataBR(s.ritmo.de)} a ${formatarChaveDataBR(s.ritmo.ate)})">(últimos ${s.ritmo.dias} dias úteis)</span>`
            : `sem ritmo do KPI pra essa etapa — ordenada pelo peso (volume + dias parada + pedido)`;
        return `
            <details style="background:var(--bg-painel); border:1px solid var(--borda-cor); border-radius:8px; margin-bottom:10px; overflow:hidden; position:relative;">
                <summary style="list-style:none; cursor:pointer; position:relative;">
                    <div class="barra-gargalo-fill" data-pct="${pctBarra}" style="position:absolute; top:0; left:0; height:100%; width:0%; background:${corNivel}; opacity:0.12; z-index:0; transition:width 0.6s ease-out;"></div>
                    <div style="position:relative; z-index:1; padding:12px 15px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
                        <div style="flex:1; min-width:0;">
                            <div style="font-size:14px; font-weight:900; color:var(--texto-cor); display:flex; align-items:center; gap:10px;">
                                <span style="font-size:14px; width:20px; text-align:center; color:var(--texto-secundario);">${icone}</span>${s.nome}
                            </div>
                            <div style="font-size:11px; color:var(--texto-secundario); margin-top:4px; margin-left:30px;">
                                <strong>${s.qtdOps}</strong> OPs • <strong>${s.qtdPcs.toLocaleString('pt-BR')}</strong> pçs • no local: máx <strong style="color:${s.maxDias >= 3 ? 'var(--cor-alerta)' : 'inherit'};">${s.maxDias}d</strong>, média ${mediaDias}d
                            </div>
                            <div style="font-size:11px; color:var(--texto-secundario); margin-top:2px; margin-left:30px;">${explicacao}</div>
                        </div>
                        <div style="text-align:right; min-width:110px;">
                            ${temFila ? `<div style="font-size:22px; font-weight:900; color:${corNivel}; line-height:1;">${fmt1(s.diasFila)}</div><div style="font-size:10px; color:var(--texto-secundario);">dias de fila</div>` : ''}
                            <div style="margin-top:4px;">${s.opsCriticas > 0 ? `<span style="font-size:9px; background:var(--cor-alerta); color:white; padding:2px 6px; border-radius:4px; font-weight:bold;">${s.opsCriticas} Críticas</span>` : ''}
                            ${s.opsComPedido > 0 ? `<span style="font-size:9px; background:${s.opsComPedidoUrgente > 0 ? 'var(--cor-roxo)' : 'var(--cor-sugestao)'}; color:white; padding:2px 6px; border-radius:4px; margin-left:3px; font-weight:bold;" title="OPs paradas aqui que também travam um pedido de cliente ainda em aberto"><i class="fas fa-user-clock"></i> ${s.opsComPedido} c/ pedido</span>` : ''}</div>
                        </div>
                    </div>
                </summary>
                <div style="padding:0 15px 12px;">${listaOPs(s)}</div>
            </details>`;
    }).join('');

    let modal = $('modalGargalo');
    modal.innerHTML = `
        <div class="modal-card" style="width:720px; max-width:92vw; border-top:5px solid var(--cor-alerta); max-height:88vh;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid var(--borda-cor); padding-bottom:10px;">
                <h2 style="margin:0; color:var(--texto-cor); display:flex; align-items:center; gap:10px;">
                    <i class="fas fa-search-location" style="color:var(--cor-alerta);"></i> VISÃO DE GARGALO
                </h2>
                <button onclick="document.getElementById('modalGargalo').style.display='none'" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
            </div>
            <div style="font-size:12px; color:var(--texto-secundario); margin-bottom:12px;">
                <strong>Dias de fila</strong> = peças que estão na etapa agora ÷ média de peças/dia que o setor produziu nos últimos dias úteis (do KPI). Quanto maior, mais tempo o setor levaria para esvaziar a fila no ritmo atual.
                Verde até 1,5 dia · amarelo até 3 · vermelho acima. Clique numa etapa para ver as OPs (as da aba Prioridades e as com pedido urgente aparecem primeiro).
            </div>
            ${esteira}
            <div style="overflow-y:auto; flex:1; padding-right:5px; margin-bottom:15px;">
                ${htmlGargalos}
            </div>
            <div style="display:flex; gap:10px; justify-content:flex-end; border-top:1px solid var(--borda-cor); padding-top:15px;">
                <button onclick="document.getElementById('modalGargalo').style.display='none'" class="btn" style="background:var(--borda-cor); color:var(--texto-cor);">FECHAR</button>
                <button onclick="document.getElementById('modalGargalo').style.display='none'; abrirAba(null, 'aba-fila');" class="btn btn-acao">
                    <i class="fas fa-list"></i> VER FILA GERAL
                </button>
            </div>
        </div>
    `;
    modal.style.display = 'flex';

    // Deixa as barras nascerem em 0% pra depois crescer até o valor real — só
    // funciona se houver um "antes" real no DOM antes de mudar o valor, por
    // isso o requestAnimationFrame duplo (garante que o navegador já pintou
    // a largura 0% antes de mudar pra largura de verdade).
    requestAnimationFrame(() => requestAnimationFrame(() => {
        $$('.barra-gargalo-fill').forEach(el => { el.style.width = el.dataset.pct + '%'; });
    }));
}

// FILA GERAL E RAIO-X
function ordenarFilaGeral(col) { if (filaOrdenacaoCol === col) filaOrdenacaoAsc = !filaOrdenacaoAsc; else { filaOrdenacaoCol = col; filaOrdenacaoAsc = true; } renderizarTabelaFilaGeral(); }

function renderizarTabelaFilaGeral() {
    let d = [...filaGeralDadosGlobais]; $$('th[id^="ordenarFilaGeral"] span').forEach(e => e.innerText = '');
    if (filaOrdenacaoCol !== 'padrao' && $('seta-' + filaOrdenacaoCol)) $('seta-' + filaOrdenacaoCol).innerText = filaOrdenacaoAsc ? " ▲" : " ▼";
    d.sort((a, b) => { if (a.op.prioridade !== b.op.prioridade) return b.op.prioridade - a.op.prioridade; if (filaOrdenacaoCol === 'padrao') return (a.peso - b.peso) || (a.dMeta - b.dMeta); let vA = ['dMeta', 'sTxt'].includes(filaOrdenacaoCol) ? a[filaOrdenacaoCol] : a.op[filaOrdenacaoCol], vB = ['dMeta', 'sTxt'].includes(filaOrdenacaoCol) ? b[filaOrdenacaoCol] : b.op[filaOrdenacaoCol]; return filaOrdenacaoAsc ? String(vA || '').localeCompare(String(vB || ''), undefined, { numeric: true }) : -String(vA || '').localeCompare(String(vB || ''), undefined, { numeric: true }); });
    $('listaFilaGeral').innerHTML = d.length === 0
        ? `<tr><td colspan="9" class="tabela-vazia"><i class="fas fa-inbox tabela-vazia-icone"></i>Nenhuma OP encontrada com os filtros atuais.</td></tr>`
        : d.map(i => `<tr oncontextmenu="mostrarMenuContexto(event, '${i.op.id}')" style="${i.op.prioridade ? 'background:rgba(107, 76, 122, 0.05);' : (i.sCls === 'pill-atraso' ? 'background:rgba(193, 68, 78, 0.06);' : '')}"><td>${i.op.prioridade ? '<i class="fas fa-star" style="color:var(--cor-selecao);"></i>' : '<span class="status-mov">●</span>'}</td><td>${i.op.ciclo}</td><td><strong>${i.op.id}</strong></td><td>${i.op.localDestino}</td><td>${i.op.localExcel}</td><td><span class="pill" style="background:${i.op.temDublado ? 'var(--cor-sugestao)' : '#ccc'};">${i.op.temDublado ? 'SIM' : 'NÃO'}</span></td><td>${i.op.tempoCorte} min</td><td style="color:var(--cor-alerta); font-weight:bold;">${i.metaTxt}</td><td><span class="pill ${i.sCls}">${i.sTxt}</span></td></tr>`).join('');
}

//PAINEL MONTADOR/PROGRAMAÇÃO//
// Lê a grade por tamanho de todas as OPs (planilha de Grade já importada) —
// usada tanto no tooltip da OP quanto na checagem de cobertura de pedido.
// =========================================================================
// 📐 UNIFORMIDADE DE GRADE — o quão "redonda" é a grade de uma OP, pensando
// no enfesto. Ideia explicada pelo usuário: uma grade uniforme (ex: 100 de
// cada tamanho) fecha num esquema só, repetido; uma grade "torta" (ex:
// 3/27/17/37/10) obriga a fatiar em vários esquemas menores — o que demora
// mais mesmo tendo menos peças no total. A base matemática disso é o MDC
// (máximo divisor comum) das quantidades: se ele for alto (perto do maior
// tamanho), existe um padrão que se repete; se for baixo (perto de 1), não
// tem padrão nenhum pra repetir.
// =========================================================================
function mdc(a, b) { while (b) { [a, b] = [b, a % b]; } return a; }
function mdcLista(numeros) {
    const validos = numeros.filter(n => n > 0);
    if (!validos.length) return 0;
    return validos.reduce((a, b) => mdc(a, b));
}

// Retorna um número de 0 (grade bem torta, muitos esquemas) a 1 (grade
// uniforme, um esquema só) — ou null se não tiver tamanho suficiente pra
// calcular (grade vazia ou só 1 tamanho, onde MDC = a própria quantidade).
function calcularUniformidadeGrade(tamanhos) {
    if (!tamanhos) return null;
    const qtds = Object.values(tamanhos).map(q => parseInt(q) || 0).filter(q => q > 0);
    if (qtds.length < 2) return null;
    const maior = Math.max(...qtds);
    const divisorComum = mdcLista(qtds);
    return maior > 0 ? divisorComum / maior : null;
}

// Junta OP + Ciclo numa chave só. Comprovado que o mesmo número de OP pode
// se repetir em ciclos diferentes representando produtos totalmente
// diferentes (ex: OP 3855 é avental no ciclo 211 e calçado no ciclo 111) —
// sem isso, as duas grades se misturavam na mesma "gaveta".
function chaveGrade(opId, ciclo) {
    return `${opId}|${ciclo || ''}`;
}

// Busca a grade de uma OP, usando o ciclo quando disponível. Quando o ciclo
// não é conhecido (ex: OP que só existe na jornada pós-corte, que não
// carrega ciclo), tenta achar só pelo número — mas SÓ devolve se existir
// exatamente 1 correspondência; se o número bater em mais de um ciclo, não
// dá pra saber qual é a certa, então não arrisca (retorna null em vez de
// adivinhar errado).
function buscarGrade(grades, opId, ciclo) {
    if (ciclo) {
        const exata = grades[chaveGrade(opId, ciclo)];
        if (exata) return exata;
    }
    const candidatas = Object.keys(grades).filter(k => k.split('|')[0] === String(opId));
    if (candidatas.length === 1) return grades[candidatas[0]];
    return null;
}

function obterOPsAguardandoMateriaPrima() {
    try { return JSON.parse(localStorage.getItem('opsAguardandoMP') || '[]'); } catch (e) { return []; }
}

let cacheGradesPorOP = null; // limpo (= null) sempre que gradesPorOP é escrito de novo
function obterGradesPorOP() {
    if (cacheGradesPorOP) return cacheGradesPorOP;
    try { cacheGradesPorOP = JSON.parse(localStorage.getItem('gradesPorOP') || '{}'); }
    catch (e) { cacheGradesPorOP = {}; }
    return cacheGradesPorOP;
}

// Agrupa os pedidos pendentes por referência — usado tanto pra vincular OPs
// da Programação quanto pra montar a lista separada de "OPs vinculadas".
function obterPendentesPorReferencia() {
    const mapa = new Map();
    obterPedidosPendentes().forEach(p => {
        if (!p.referencia) return;
        if (!mapa.has(p.referencia)) mapa.set(p.referencia, []);
        mapa.get(p.referencia).push(p);
    });
    return mapa;
}

// Ordem da lista PROGRAMAR LOTE (aba Programação). Gira em torno da DATA DE
// INCLUSÃO da OP (mais antiga primeiro), não da urgência de pedido — assim uma
// OP de reposição que ninguém pediu ainda também vai subindo com o tempo, em
// vez de ficar parada. Matéria-prima agrupa: quando uma OP entra na lista, as
// outras OPs da MESMA MP vêm logo atrás dela (mesmo com inclusão mais nova),
// então cada lote de MP fica na posição da OP mais antiga que ele tem.
// Combinado com o usuário:
//  - dentro do lote: da mais antiga pra mais nova; empate de data -> nº da OP
//  - OP sem código de MP não forma lote: fica solta, na sua própria data
//  - OP sem data de inclusão vai pro FINAL da lista (agrupadas por MP)
//  - setinha do cabeçalho CORTE inverte: mais nova primeiro (o lote fica na
//    posição da OP mais NOVA dele); as OPs sem data continuam no final
//  - estrela de prioridade e vínculo com pedido NÃO mexem na ordem
function ordenarProgramacaoPorInclusao(ops, maisAntigaPrimeiro) {
    const dir = maisAntigaPrimeiro ? 1 : -1;
    const tempo = op => { const t = op.dataInclusao ? new Date(op.dataInclusao).getTime() : NaN; return isNaN(t) ? null : t; };
    const codigoMP = op => (op.codigoMP && op.codigoMP !== 'SEM CÓDIGO') ? op.codigoMP : null;
    const cmpId = (a, b) => {
        const na = parseInt(a.id), nb = parseInt(b.id);
        if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
        return String(a.id).localeCompare(String(b.id));
    };
    const cmpOP = (a, b) => (tempo(a) - tempo(b)) * dir || cmpId(a, b) * dir;

    const comData = ops.filter(op => tempo(op) !== null);
    const semData = ops.filter(op => tempo(op) === null);

    // Cada lote = lista de OPs da mesma MP. OP sem MP vira um lote de uma OP só.
    const lotes = [];
    const lotePorMP = new Map();
    comData.forEach(op => {
        const mp = codigoMP(op);
        if (mp === null) { lotes.push([op]); return; }
        if (!lotePorMP.has(mp)) { lotePorMP.set(mp, []); lotes.push(lotePorMP.get(mp)); }
        lotePorMP.get(mp).push(op);
    });
    lotes.forEach(lote => lote.sort(cmpOP));
    lotes.sort((la, lb) => cmpOP(la[0], lb[0]));

    // Sem data de inclusão: final da lista, ainda agrupadas por MP (sem MP por último)
    semData.sort((a, b) => {
        const ma = codigoMP(a), mb = codigoMP(b);
        if (ma !== mb) { if (ma === null) return 1; if (mb === null) return -1; return ma.localeCompare(mb); }
        return cmpId(a, b);
    });

    return [...lotes.flat(), ...semData];
}

