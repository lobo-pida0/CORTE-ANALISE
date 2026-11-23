// -------------------------------------------------------------------------
// (separado de producao-tempos.js) Ritmo diário de cada setor (pelo KPI) e ranking de gargalo.
// -------------------------------------------------------------------------
// Etapa do sistema → setor do KPI que mede o ritmo dela (Dublagem não tem KPI).
const SETOR_KPI_DA_ETAPA = { 0: 'PPCP PROGRAMACAO', 1: 'ANALISE DE MEDIDAS', 2: 'CAD', 3: 'PCP PROGRAMACAO-CORTE', 4: 'ALMOX TECIDO', 6: 'ENFESTO', 7: 'CORTE' };
// Ritmo do setor: média de peças/dia dos últimos N dias ÚTEIS COM MOVIMENTO (até hoje). Precisa de pelo menos 2 dias.
function calcularRitmoDiarioSetorKPI(setorKpi, maxDias) {
    const movs = obterMovimentacoesPorSetor('fabrica')[setorKpi] || {};
    const porDia = {};
    const hojeISO = new Date().toISOString().slice(0, 10);
    Object.values(movs).forEach(m => {
        if (!m.data) return;
        const dia = new Date(m.data).toISOString().slice(0, 10);
        const dow = new Date(dia + 'T00:00:00Z').getUTCDay();
        if (dow === 0 || dow === 6 || dia > hojeISO) return;
        porDia[dia] = (porDia[dia] || 0) + (m.qtd || 0);
    });
    const dias = Object.keys(porDia).sort().slice(-maxDias);
    if (dias.length < 2) return null;
    return { media: dias.reduce((t, d) => t + porDia[d], 0) / dias.length, dias: dias.length, de: dias[0], ate: dias[dias.length - 1] };
}

// Calcula o ranking de setores por "peso de gargalo" — reaproveitado tanto
// pelo modal de Ranking de Gargalos quanto pelo painel de visão geral.
// Aceita o mapa de pendentes-por-referência já calculado (evita reler e
// reprocessar o localStorage de novo quando chamada de dentro do ciclo
// principal de renderização); se não vier nada, calcula na hora.
function calcularRankingGargalo(pendentesPorReferenciaParam) {
    if (!bancoDadosOPs || bancoDadosOPs.length === 0) return [];

    const pendentesPorReferencia = pendentesPorReferenciaParam || obterPendentesPorReferencia();
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

    let setoresStatus = nomesEtapas.map((nome, index) => ({
        id: index, nome: nome, qtdOps: 0, qtdPcs: 0, somaDias: 0, maxDias: 0, score: 0, opsCriticas: 0,
        opsComPedido: 0, opsComPedidoUrgente: 0, ops: [], pcsFila: 0, ritmo: null, diasFila: null
    }));

    bancoDadosOPs.forEach(op => {
        if (op.etapa >= 0 && op.etapa < nomesEtapas.length) {
            let diasParados = op.diasLocal || 0;
            let stat = setoresStatus[op.etapa];
            let pecas = parseInt(op.qtd) || 0;

            stat.qtdOps++;
            stat.qtdPcs += pecas;
            stat.somaDias += diasParados;
            if (diasParados > stat.maxDias) stat.maxDias = diasParados;
            if (diasParados >= 3) stat.opsCriticas++;

            let pesoOp = (pecas * 0.01) + (diasParados * 5);

            // OP parada que também está travando um pedido pesa mais no ranking —
            // não é só volume/tempo, tem entrega real de cliente em jogo.
            const pendentesRef = op.referencia ? pendentesPorReferencia.get(op.referencia) : null;
            let opComPedido = false, opUrgente = false;
            if (pendentesRef && pendentesRef.length) {
                const pedido = [...pendentesRef].sort(compararUrgenciaPedidos)[0];
                const especial = pedido.prior !== 99;
                const dataChegada = pedido.chegada ? new Date(pedido.chegada) : null;
                const vencido = dataChegada && dataChegada < hoje;
                opComPedido = true; opUrgente = !!(especial || vencido);
                stat.opsComPedido++;
                if (especial || vencido) stat.opsComPedidoUrgente++;
                pesoOp += especial ? 200 : (vencido ? 100 : 50);
            }

            stat.score += pesoOp;
            const sc = SETOR_KPI_DA_ETAPA[op.etapa];
            const mult = (sc && SETORES_COM_MULTIPLICADOR_CAMADAS_KPI.has(sc)) ? multiplicadorDeCamadas(op.desc) : 1;   // o KPI de Enfesto/Corte conta por camada
            stat.pcsFila += pecas * mult;
            stat.ops.push({ op, pecas, dias: diasParados, comPedido: opComPedido, urgente: opUrgente });
        }
    });

    // Dias de fila = peças na etapa ÷ ritmo diário do setor (média dos últimos dias úteis do KPI).
    // Etapa sem ritmo (ex.: Dublagem, ou KPI ainda não importado) fica sem esse número e cai no critério antigo (peso).
    setoresStatus.forEach(st => {
        const sc = SETOR_KPI_DA_ETAPA[st.id];
        const r = sc ? calcularRitmoDiarioSetorKPI(sc, 5) : null;
        if (r && r.media > 0) { st.ritmo = r; st.diasFila = st.pcsFila / r.media; }
    });
    return setoresStatus.filter(s => s.qtdOps > 0).sort((a, b) => {
        if (a.diasFila !== null && b.diasFila !== null) return b.diasFila - a.diasFila;
        if (a.diasFila !== null) return -1;
        if (b.diasFila !== null) return 1;
        return b.score - a.score;
    });
}



// ---- LUPA: procura uma OP em TODOS os grupos da Sequência (em andamento e aguardando) e leva até a linha ----
