// -------------------------------------------------------------------------
// (separado de nuvem.js) Estado global do sistema (bancoDadosOPs, seleções, undo/redo) e plugins do Chart.js.
// -------------------------------------------------------------------------
let bancoDadosOPs = JSON.parse(localStorage.getItem('bancoOPs')) || [];
let historicoLotes = JSON.parse(localStorage.getItem('historicoLotes')) || [];

// A aba de KPI/Gestão Mensal foi removida pra ser refeita do zero — uma
// coisa de FORA dela ainda lê esse dado (calcularMediaDiariaCorte, usada na
// Fila de Corte). Um array vazio evita que ela quebre; simplesmente mostra
// "sem dados" até o novo KPI existir e repor essa informação. (O Fluxo
// Geral, que também lia daqui, foi removido do sistema — não usa mais.)
let dadosMes = [];

let locaisSelecionados = [], etapasSelecionadas = [], lastChecked = null, ordemCorteAsc = true, ultimaSugestao = 'pecas', ultimaSequenciaPedidosGerada = [];
let filaOrdenacaoCol = 'padrao', filaOrdenacaoAsc = true, filaGeralDadosGlobais = [];
let opContextoId = null, opFracionarOrigem = null;

// Seleção do montador de lote — guardada aqui (não só no checkbox da tela)
// pra sobreviver a mudanças de filtro. Antes, filtrar uma OP e depois trocar
// o filtro fazia a marcação sumir, porque a tabela é reconstruída do zero a
// cada filtro e o HTML não "lembra" de nada sozinho.
let selecaoLoteOPs = new Set();
let pilhaUndo = [], pilhaRedo = []; const MAX_HISTORICO = 30;

Chart.register(ChartDataLabels);

const pluginFundoSolido = {
    id: 'fundoSolido',
    beforeDraw(chart) {
        const { ctx, width, height } = chart;
        ctx.save();
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = document.body.classList.contains('dark-mode') ? '#221F1A' : '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
    }
};

const pluginFinaisDeSemana = {
    id: 'finaisDeSemana',
    beforeDraw(chart) {
        const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
        if (!x || chart.config.id === 'fluxoConsolidado') return;
        ctx.save();
        ctx.fillStyle = document.body.classList.contains('dark-mode') ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)';
        let anoAtual = new Date().getFullYear();
        let elMes = document.getElementById('mesReferencia');
        let mesInput = elMes ? (parseInt(elMes.value) || (new Date().getMonth() + 1)) : (new Date().getMonth() + 1);
        let tickWidth = chart.data.labels.length > 1 ? (x.getPixelForTick(1) - x.getPixelForTick(0)) : x.width;

        chart.data.labels.forEach((label, index) => {
            let dia = parseInt(label);
            let diaSemana = new Date(anoAtual, mesInput - 1, dia).getDay();
            if (diaSemana === 0 || diaSemana === 6) {
                let xPos = x.getPixelForTick(index);
                if (xPos >= x.left && xPos <= x.right) { ctx.fillRect(xPos - tickWidth / 2, top, tickWidth, bottom - top); }
            }
        });
        ctx.restore();
    }
};
