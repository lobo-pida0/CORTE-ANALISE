// -------------------------------------------------------------------------
// (separado de nuvem.js) Modal "Perguntar à IA" (monta o contexto das OPs e envia a pergunta).
// -------------------------------------------------------------------------
// Monta uma lista enxuta de OPs pra mandar como contexto pra IA — só os
// campos relevantes pra decisão de sequenciamento (não manda o objeto OP
// inteiro, pra não gastar tokens à toa com coisa que não ajuda a resposta).
function montarContextoParaIA(escopo) {
    let lista;
    if (escopo === 'aguard-mp') {
        lista = obterOPsAguardandoMateriaPrima().map(op => ({
            op: op.id, ciclo: op.ciclo, etapa: 'AGUARDANDO MATÉRIA PRIMA', referencia: op.referencia,
            peças: op.qtd, diasParado: op.diasLocal, materiaPrima: op.codigoMP, descricao: op.desc
        }));
    } else {
        const idxEtapa = parseInt(escopo);
        lista = bancoDadosOPs.filter(op => op.etapa === idxEtapa).map(op => ({
            op: op.id, ciclo: op.ciclo, etapa: nomesEtapas[op.etapa], referencia: op.referencia,
            peças: op.qtd, dataCorte: op.dataCorte ? formatarDataBR(op.dataCorte) : null,
            diasParado: op.diasLocal, materiaPrima: op.codigoMP, descricao: op.desc
        }));
    }
    return lista;
}

function abrirModalPerguntarIA() {
    if (!exigirAdmin('perguntar à IA')) return;
    if (!supabaseClient) { showToast('Conexão com a nuvem não foi iniciada.', true); return; }

    const opcoesEtapa = nomesEtapas.map((n, i) => `<option value="${i}">${n}</option>`).join('');

    $('modalPerguntarIA').innerHTML = `
        <div class="modal-card" style="width:600px; max-width:92vw; max-height:85vh; overflow-y:auto; border-top:5px solid var(--cor-roxo);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
                <h2 style="margin:0; font-size:16px; display:flex; align-items:center; gap:8px;"><i class="fas fa-robot" style="color:var(--cor-roxo);"></i> PERGUNTAR À IA</h2>
                <button onclick="fecharModais()" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
            </div>
            <div style="display:flex; flex-direction:column; gap:10px;">
                <div class="campo-meta">
                    <label>SOBRE QUAIS OPs?</label>
                    <select id="escopoPerguntarIA">
                        ${opcoesEtapa}
                        <option value="aguard-mp">AGUARDANDO MATÉRIA PRIMA</option>
                    </select>
                </div>
                <div class="campo-meta">
                    <label>SUA PERGUNTA</label>
                    <textarea id="textoPerguntarIA" rows="3" placeholder="Ex: quais OPs seria melhor mandar pra Análise de Medidas primeiro, misturando OPs grandes e pequenas?" style="resize:vertical; padding:8px 12px; border:1px solid var(--borda-cor); background:var(--bg-input); color:var(--texto-cor); border-radius:6px; font-family:'Inter', sans-serif; font-size:13px;"></textarea>
                </div>
                <button id="btnEnviarPerguntaIA" class="btn btn-acao"><i class="fas fa-paper-plane"></i> PERGUNTAR</button>
                <div id="respostaPerguntarIA"></div>
            </div>
        </div>
    `;
    $('modalPerguntarIA').style.display = 'flex';
    $('btnEnviarPerguntaIA').onclick = perguntarIA;
}

async function perguntarIA() {
    const pergunta = $('textoPerguntarIA').value.trim();
    if (!pergunta) return;
    const escopo = $('escopoPerguntarIA').value;
    const contexto = montarContextoParaIA(escopo);
    const respostaDiv = $('respostaPerguntarIA');

    if (!contexto.length) {
        respostaDiv.innerHTML = `<div style="padding:12px; color:var(--texto-secundario); font-style:italic;">Nenhuma OP encontrada nesse escopo — nada pra mandar pra IA analisar.</div>`;
        return;
    }

    $('btnEnviarPerguntaIA').disabled = true;
    respostaDiv.innerHTML = `<div style="padding:12px; color:var(--texto-secundario);"><i class="fas fa-spinner fa-spin"></i> Pensando (${contexto.length} OPs no contexto)...</div>`;

    try {
        const { data, error } = await supabaseClient.functions.invoke('perguntar-ia', { body: { pergunta, contexto } });
        if (error) throw error;
        if (data && data.erro) throw new Error(data.erro);
        const textoResposta = (data && data.resposta) || '(sem resposta)';
        respostaDiv.innerHTML = `<div style="padding:12px; background:var(--bg-painel); border:1px solid var(--borda-cor); border-radius:8px; white-space:pre-wrap; line-height:1.5;">${textoResposta}</div>`;
    } catch (e) {
        registrarLogDebug('error', ['Falha ao perguntar à IA: ' + e.message]);
        respostaDiv.innerHTML = `<div style="padding:12px; color:var(--cor-alerta);"><i class="fas fa-triangle-exclamation"></i> Não consegui obter resposta. Veja o console de depuração.</div>`;
    } finally {
        $('btnEnviarPerguntaIA').disabled = false;
    }
}
