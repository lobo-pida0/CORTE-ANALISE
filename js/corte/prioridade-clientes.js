// =========================================================================
// 👑 PRIORIDADE DE CLIENTES — lista editável, do mais pro menos prioritário.
// Usada só como critério de DESEMPATE entre pedidos que vencem dentro da
// mesma janela de urgência (7 dias) — fora dessa janela, a data manda sozinha.
// =========================================================================
const LISTA_PRIORIDADE_CLIENTES_PADRAO = [
    "Tejofran", "G4S", "Protege", "Sam's", "Brinks", "Security", "Porto Seguro",
    "Carrefour", "Atacadão", "Prosegur e Segurpro", "Nestlé", "GR", "Rede D'Or",
    "Richet", "Haganá", "Santa Catarina", "Ipiranga", "Mais Barato", "Sodexo",
    "Belfort", "CVC", "Viação Cometa"
];

function obterListaPrioridadeClientes() {
    const salva = localStorage.getItem('listaPrioridadeClientes');
    if (salva) { try { return JSON.parse(salva); } catch (e) { return [...LISTA_PRIORIDADE_CLIENTES_PADRAO]; } }
    return [...LISTA_PRIORIDADE_CLIENTES_PADRAO];
}

function salvarListaPrioridadeClientes(lista) {
    localStorage.setItem('listaPrioridadeClientes', JSON.stringify(lista));
}

function abrirModalPrioridadeClientes() {
    renderizarModalPrioridadeClientes();
    $('modalPrioridadeClientes').style.display = 'flex';
}

function renderizarModalPrioridadeClientes() {
    const lista = obterListaPrioridadeClientes();
    const ehAdmin = !!sessaoAdminAtual;
    const linhas = lista.map((cliente, i) => `
        <div style="display:flex; align-items:center; gap:10px; padding:8px 12px; border-bottom:1px solid var(--borda-cor);">
            <span style="width:28px; text-align:center; font-weight:900; color:var(--texto-secundario);">${i + 1}º</span>
            <span style="flex:1; font-weight:600;">${cliente}</span>
            ${ehAdmin ? `
            <button onclick="moverClientePrioridade(${i}, -1)" class="btn" style="padding:4px 8px; background:var(--bg-painel); color:var(--texto-cor);" ${i === 0 ? 'disabled' : ''}><i class="fas fa-arrow-up"></i></button>
            <button onclick="moverClientePrioridade(${i}, 1)" class="btn" style="padding:4px 8px; background:var(--bg-painel); color:var(--texto-cor);" ${i === lista.length - 1 ? 'disabled' : ''}><i class="fas fa-arrow-down"></i></button>
            <button onclick="removerClientePrioridade(${i})" class="btn btn-perigo" style="padding:4px 8px;"><i class="fas fa-trash"></i></button>
            ` : ''}
        </div>
    `).join('');

    $('modalPrioridadeClientes').innerHTML = `
        <div class="modal-card" style="width:480px; max-width:90vw; border-top:5px solid #B8862A; max-height:85vh;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid var(--borda-cor); padding-bottom:10px;">
                <h2 style="margin:0; color:var(--texto-cor); display:flex; align-items:center; gap:10px; font-size:16px;">
                    <i class="fas fa-crown" style="color:#B8862A;"></i> PRIORIDADE DE CLIENTES
                </h2>
                <button onclick="fecharModais()" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
            </div>
            <div style="font-size:12px; color:var(--texto-secundario); margin-bottom:15px;">
                Do mais prioritário pro menos prioritário. Usado só pra desempatar quando dois pedidos vencem dentro da mesma semana — fora disso, a data mais próxima sempre vence.
            </div>
            <div style="overflow-y:auto; flex:1; margin-bottom:15px; border:1px solid var(--borda-cor); border-radius:8px;">
                ${linhas || '<div style="padding:20px; text-align:center; color:var(--texto-secundario);">Nenhum cliente cadastrado.</div>'}
            </div>
            ${ehAdmin ? `
            <div style="display:flex; gap:10px;">
                <input type="text" id="inputNovoClientePrioridade" placeholder="Nome do cliente..." style="flex:1;">
                <button onclick="adicionarClientePrioridade()" class="btn btn-sugestao"><i class="fas fa-plus"></i> ADICIONAR</button>
            </div>
            ` : ''}
        </div>
    `;
}

function moverClientePrioridade(idx, direcao) {
    if (!exigirAdmin('editar a prioridade de clientes')) return;
    const lista = obterListaPrioridadeClientes();
    const novoIdx = idx + direcao;
    if (novoIdx < 0 || novoIdx >= lista.length) return;
    [lista[idx], lista[novoIdx]] = [lista[novoIdx], lista[idx]];
    salvarListaPrioridadeClientes(lista);
    renderizarModalPrioridadeClientes();
}

function removerClientePrioridade(idx) {
    if (!exigirAdmin('editar a prioridade de clientes')) return;
    const lista = obterListaPrioridadeClientes();
    if (!confirm(`Remover "${lista[idx]}" da lista de prioridade?`)) return;
    lista.splice(idx, 1);
    salvarListaPrioridadeClientes(lista);
    renderizarModalPrioridadeClientes();
}

function adicionarClientePrioridade() {
    if (!exigirAdmin('editar a prioridade de clientes')) return;
    const input = $('inputNovoClientePrioridade');
    const nome = input.value.trim();
    if (!nome) return;
    const lista = obterListaPrioridadeClientes();
    if (lista.some(c => c.toLowerCase() === nome.toLowerCase())) { alert("Esse cliente já está na lista."); return; }
    lista.push(nome);
    salvarListaPrioridadeClientes(lista);
    renderizarModalPrioridadeClientes();
}
