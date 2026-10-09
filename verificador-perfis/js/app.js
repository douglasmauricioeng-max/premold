/* Interface: formulário, projetos salvos e apresentação dos resultados. */
(function () {
  'use strict';

  const { secoes, calculo, desenhos } = PM;
  const fmt = PM.nbr8800.fmt;
  const esc = desenhos.esc;
  const CHAVE_ATUAL = 'verificador-perfis:atual';
  const CHAVE_LISTA = 'verificador-perfis:projetos';

  const MATERIAIS = [
    { nome: 'ASTM A572 Gr. 50', fy: 345, fu: 450 },
    { nome: 'ASTM A36', fy: 250, fu: 400 },
    { nome: 'ASTM A588', fy: 345, fu: 485 },
    { nome: 'ASTM A500 Gr. B (tubo circular)', fy: 290, fu: 400 },
    { nome: 'ASTM A500 Gr. B (tubo retangular)', fy: 315, fu: 400 },
  ];

  const PADROES_PERFIL = {
    I_LAMINADO: { catalogo: 'W 310 x 38,7' },
    I_SOLDADO: { d: '400', bf: '200', tw: '6.3', tf: '9.5' },
    U: { d: '200', bf: '75', tw: '6.3', tf: '9.5', fabricacao: 'soldado' },
    TUBO_RET: { H: '150', B: '100', t: '6.3' },
    TUBO_CIRC: { D: '168.3', t: '6.4' },
  };

  let idSeq = 1;
  const novoId = () => `c${Date.now().toString(36)}${idSeq++}`;

  function projetoExemplo() {
    return {
      nome: 'Exemplo: viga de mezanino',
      perfil: { tipo: 'I_LAMINADO', catalogo: 'W 310 x 38,7' },
      material: { nome: 'ASTM A572 Gr. 50', fy: '345', fu: '450' },
      barra: {
        L: '6',
        apoios: [{ x: '0', tipo: 'fixo', lateral: true }, { x: '6', tipo: 'movel', lateral: true }],
        contencoes: '0; 3; 6', KxLx: '', KyLy: '3', KzLz: '3', Cb: '',
        AeAg: '1', a: '', flechaLim: '350', pesoProprio: true,
      },
      cargas: [
        { id: novoId(), tipo: 'distribuida', plano: 'v', cat: 'G', a: '0', b: '6', q1: '4.5', q2: '4.5' },
        { id: novoId(), tipo: 'distribuida', plano: 'v', cat: 'Q', a: '0', b: '6', q1: '6', q2: '6' },
        { id: novoId(), tipo: 'pontual', plano: 'v', cat: 'Q', x: '2', P: '15' },
      ],
      coef: { gg: '1.4', ggFav: '1.0', gq: '1.5', gw: '1.4', psi0q: '0.7', psi0w: '0.6', psi1q: '0.4', psi1w: '0.3' },
    };
  }

  // -------------------------------------------------------------- armazenamento

  const ler = chave => { try { return JSON.parse(localStorage.getItem(chave)); } catch { return null; } };
  const gravar = (chave, v) => { try { localStorage.setItem(chave, JSON.stringify(v)); return true; } catch { return false; } };

  let projeto = ler(CHAVE_ATUAL) || projetoExemplo();
  for (const c of projeto.cargas) if (!c.id) c.id = novoId();
  const ui = { combo: null, aviso: '', confirmarExclusao: null, mostrarImportar: false };

  // ------------------------------------------------------------------ utilidades

  const $ = sel => document.querySelector(sel);
  const opcoes = (lista, atual) => lista.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(atual) ? ' selected' : ''}>${esc(t)}</option>`).join('');

  function obter(caminho) {
    return caminho.split('.').reduce((o, k) => (o == null ? o : o[k]), projeto);
  }
  function definir(caminho, valor) {
    const partes = caminho.split('.');
    const ult = partes.pop();
    const alvo = partes.reduce((o, k) => o[k], projeto);
    alvo[ult] = valor;
  }

  function campo(caminho, rotulo, { unidade = '', dica = '', placeholder = '', largura = '' } = {}) {
    const id = 'f-' + caminho.replace(/\./g, '-');
    const v = obter(caminho);
    return `<label class="campo ${largura}" for="${id}">
      <span class="campo-rot">${rotulo}${unidade ? ` <em>${unidade}</em>` : ''}</span>
      <input id="${id}" data-campo="${caminho}" inputmode="decimal" autocomplete="off" value="${esc(v ?? '')}" placeholder="${esc(placeholder)}"${dica ? ` title="${esc(dica)}"` : ''}>
    </label>`;
  }

  function seletor(caminho, rotulo, lista, { recriar = true } = {}) {
    const id = 'f-' + caminho.replace(/\./g, '-');
    return `<label class="campo" for="${id}">
      <span class="campo-rot">${rotulo}</span>
      <select id="${id}" data-campo="${caminho}"${recriar ? ' data-recriar' : ''}>${opcoes(lista, obter(caminho))}</select>
    </label>`;
  }

  // ------------------------------------------------------------------- entradas

  function htmlPerfil() {
    const p = projeto.perfil;
    const tipos = Object.entries(secoes.NOMES_TIPOS);
    let dims = '';
    if (p.tipo === 'I_LAMINADO') {
      dims = seletor('perfil.catalogo', 'Perfil', secoes.CATALOGO_W.map(c => [c.nome, c.nome]));
    } else if (p.tipo === 'I_SOLDADO' || p.tipo === 'U') {
      dims = `<div class="grade g4">
        ${campo('perfil.d', 'd', { unidade: 'mm', dica: 'Altura total' })}
        ${campo('perfil.bf', 'bf', { unidade: 'mm', dica: 'Largura da mesa' })}
        ${campo('perfil.tw', 'tw', { unidade: 'mm', dica: 'Espessura da alma' })}
        ${campo('perfil.tf', 'tf', { unidade: 'mm', dica: 'Espessura da mesa' })}
      </div>`;
      if (p.tipo === 'U') dims += seletor('perfil.fabricacao', 'Fabricação', [['laminado', 'Laminado'], ['soldado', 'Soldado']], { recriar: false });
    } else if (p.tipo === 'TUBO_RET') {
      dims = `<div class="grade g3">
        ${campo('perfil.H', 'H', { unidade: 'mm', dica: 'Altura (plano vertical)' })}
        ${campo('perfil.B', 'B', { unidade: 'mm', dica: 'Largura' })}
        ${campo('perfil.t', 't', { unidade: 'mm', dica: 'Espessura da parede' })}
      </div>`;
    } else if (p.tipo === 'TUBO_CIRC') {
      dims = `<div class="grade g2">
        ${campo('perfil.D', 'D', { unidade: 'mm', dica: 'Diâmetro externo' })}
        ${campo('perfil.t', 't', { unidade: 'mm', dica: 'Espessura da parede' })}
      </div>`;
    }
    const mats = [...MATERIAIS.map(m => [m.nome, `${m.nome} (fy ${m.fy} MPa)`]), ['Outro', 'Outro aço']];
    return `
      ${seletor('perfil.tipo', 'Tipo de perfil', tipos)}
      ${dims}
      <div class="grade g3">
        ${seletor('material.nome', 'Aço', mats)}
        ${campo('material.fy', 'fy', { unidade: 'MPa' })}
        ${campo('material.fu', 'fu', { unidade: 'MPa' })}
      </div>
      <div id="secao-props" class="secao-props"></div>`;
  }

  const TIPOS_APOIO = [['movel', 'Apoio móvel (1º gênero)'], ['fixo', 'Apoio fixo (2º gênero)'], ['engaste', 'Engaste']];

  function htmlBarra() {
    const b = projeto.barra;
    const apoios = b.apoios.map((a, i) => `
      <div class="linha-apoio">
        ${campo(`barra.apoios.${i}.x`, 'Posição', { unidade: 'm' })}
        ${seletor(`barra.apoios.${i}.tipo`, 'Tipo', TIPOS_APOIO, { recriar: false })}
        <label class="marcar" for="f-barra-apoios-${i}-lateral" title="Impede o deslocamento lateral (plano horizontal) neste ponto">
          <input type="checkbox" id="f-barra-apoios-${i}-lateral" data-campo="barra.apoios.${i}.lateral"${a.lateral !== false ? ' checked' : ''}> trava lateral
        </label>
        <button type="button" class="btn-icone" data-acao="remover-apoio" data-i="${i}" aria-label="Remover apoio ${i + 1}">×</button>
      </div>`).join('');
    return `
      <div class="grade g2">
        ${campo('barra.L', 'Comprimento L', { unidade: 'm' })}
        <div class="campo"><span class="campo-rot">Modelos prontos</span>
          <div class="chips">
            <button type="button" class="chip" data-acao="modelo" data-m="biapoiada">Biapoiada</button>
            <button type="button" class="chip" data-acao="modelo" data-m="balanco">Balanço</button>
            <button type="button" class="chip" data-acao="modelo" data-m="biengastada">Biengastada</button>
            <button type="button" class="chip" data-acao="modelo" data-m="engaste-apoio">Engaste + apoio</button>
            <button type="button" class="chip" data-acao="modelo" data-m="continua">2 vãos</button>
          </div>
        </div>
      </div>
      <h3 class="sub">Apoios</h3>
      <div class="lista-apoios">${apoios}</div>
      <button type="button" class="btn-sec" data-acao="add-apoio">+ Apoio</button>
      <h3 class="sub">Estabilidade</h3>
      ${campo('barra.contencoes', 'Contenções laterais da mesa comprimida', { unidade: 'm', placeholder: 'Nos apoios com trava lateral', dica: 'Posições separadas por ponto e vírgula, por exemplo: 0; 3; 6' })}
      <div class="grade g4">
        ${campo('barra.KxLx', 'KxLx', { unidade: 'm', placeholder: 'L' })}
        ${campo('barra.KyLy', 'KyLy', { unidade: 'm', placeholder: 'L' })}
        ${campo('barra.KzLz', 'KzLz', { unidade: 'm', placeholder: 'L' })}
        ${campo('barra.Cb', 'Cb', { placeholder: 'auto' })}
      </div>
      <p class="nota">Comprimentos de flambagem em branco valem L. O Cb em branco é calculado pela NBR 8800 em cada trecho entre contenções.</p>
      <details class="mais">
        <summary>Mais parâmetros</summary>
        <div class="grade g3">
          ${campo('barra.flechaLim', 'Flecha limite L /', { dica: 'Anexo C: 350 para vigas de piso, 250 para cobertura' })}
          ${campo('barra.AeAg', 'Ae / Ag', { dica: 'Área líquida efetiva sobre área bruta, para a ruptura da ligação tracionada' })}
          ${campo('barra.a', 'Enrijecedores a', { unidade: 'mm', placeholder: 'sem', dica: 'Distância entre enrijecedores transversais da alma' })}
        </div>
      </details>`;
  }

  const NOMES_CARGA = { pontual: 'Força concentrada', distribuida: 'Carga distribuída', momento: 'Momento concentrado', axial: 'Força axial' };

  function htmlCargas() {
    const cats = Object.entries(calculo.CATEGORIAS).map(([k, v]) => [k, `${k} · ${v}`]);
    const planos = [['v', 'Vertical'], ['h', 'Horizontal']];
    const itens = projeto.cargas.map((c, i) => {
      const base = `cargas.${i}`;
      let campos;
      if (c.tipo === 'distribuida') {
        campos = `<div class="grade g4">
          ${campo(`${base}.a`, 'Início', { unidade: 'm' })}
          ${campo(`${base}.b`, 'Fim', { unidade: 'm' })}
          ${campo(`${base}.q1`, 'q no início', { unidade: 'kN/m' })}
          ${campo(`${base}.q2`, 'q no fim', { unidade: 'kN/m', placeholder: 'igual' })}
        </div>`;
      } else if (c.tipo === 'momento') {
        campos = `<div class="grade g2">${campo(`${base}.x`, 'Posição', { unidade: 'm' })}${campo(`${base}.M`, 'Momento', { unidade: 'kN·m' })}</div>`;
      } else {
        campos = `<div class="grade g2">${campo(`${base}.x`, 'Posição', { unidade: 'm' })}${campo(`${base}.P`, 'Força', { unidade: 'kN' })}</div>`;
      }
      return `<div class="carga-item cat-${c.cat}">
        <div class="carga-topo">
          <strong>${i + 1}. ${NOMES_CARGA[c.tipo]}</strong>
          <button type="button" class="btn-icone" data-acao="remover-carga" data-i="${i}" aria-label="Remover carga ${i + 1}">×</button>
        </div>
        <div class="grade g2">
          ${seletor(`${base}.cat`, 'Ação', cats)}
          ${c.tipo === 'axial' ? '<div></div>' : seletor(`${base}.plano`, 'Plano', planos, { recriar: false })}
        </div>
        ${campos}
      </div>`;
    }).join('');
    return `
      <p class="nota">Valores característicos (sem coeficientes). Sinal positivo: para baixo no plano vertical, sentido +z no horizontal, horário nos momentos. Força axial positiva aponta para a direita: na extremidade direita, positivo traciona e negativo comprime.</p>
      <div class="lista-cargas">${itens || '<p class="vazio">Nenhuma carga. Adicione uma abaixo.</p>'}</div>
      <div class="chips">
        <button type="button" class="btn-sec" data-acao="add-carga" data-t="distribuida">+ Distribuída</button>
        <button type="button" class="btn-sec" data-acao="add-carga" data-t="pontual">+ Concentrada</button>
        <button type="button" class="btn-sec" data-acao="add-carga" data-t="momento">+ Momento</button>
        <button type="button" class="btn-sec" data-acao="add-carga" data-t="axial">+ Axial</button>
      </div>
      <label class="marcar" for="f-barra-pesoProprio">
        <input type="checkbox" id="f-barra-pesoProprio" data-campo="barra.pesoProprio"${projeto.barra.pesoProprio ? ' checked' : ''}> Incluir o peso próprio do perfil (G)
      </label>`;
  }

  function htmlCoeficientes() {
    return `<div class="grade g4">
      ${campo('coef.gg', 'γg')}
      ${campo('coef.ggFav', 'γg favorável')}
      ${campo('coef.gq', 'γq')}
      ${campo('coef.gw', 'γw (vento)')}
      ${campo('coef.psi0q', 'ψ0 uso')}
      ${campo('coef.psi0w', 'ψ0 vento')}
      ${campo('coef.psi1q', 'ψ1 uso (ELS)')}
      ${campo('coef.psi1w', 'ψ1 vento (ELS)')}
    </div>
    <p class="nota">ELU: combinações últimas normais (4.7.7.2). ELS: combinação rara, com cada ação variável como principal.</p>`;
  }

  function htmlProjetos() {
    const lista = ler(CHAVE_LISTA) || {};
    const nomes = Object.keys(lista).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const itens = nomes.map(n => {
      const conf = ui.confirmarExclusao === n;
      return `<li>
        <span class="proj-nome">${esc(n)}</span>
        <span class="proj-acoes">
          ${conf
            ? `<span class="proj-conf">Excluir?</span><button type="button" class="btn-mini perigo" data-acao="excluir-sim" data-n="${esc(n)}">Sim</button><button type="button" class="btn-mini" data-acao="excluir-nao">Não</button>`
            : `<button type="button" class="btn-mini" data-acao="abrir" data-n="${esc(n)}">Abrir</button><button type="button" class="btn-mini" data-acao="excluir" data-n="${esc(n)}">Excluir</button>`}
        </span>
      </li>`;
    }).join('');
    return `
      <div class="proj-salvar">
        <label class="campo" for="f-nome"><span class="campo-rot">Nome do projeto</span>
          <input id="f-nome" data-campo="nome" value="${esc(projeto.nome || '')}" autocomplete="off"></label>
        <button type="button" class="btn" data-acao="salvar">Salvar</button>
      </div>
      <p class="nota">Cada nome é um projeto separado. Salvar com um nome que já existe substitui aquele projeto; use outro nome para manter os dois.</p>
      ${ui.aviso ? `<p class="toast" role="status">${esc(ui.aviso)}</p>` : ''}
      ${nomes.length ? `<ul class="proj-lista">${itens}</ul>` : '<p class="vazio">Nenhum projeto salvo neste navegador.</p>'}
      <div class="chips">
        <button type="button" class="btn-sec" data-acao="novo">Novo projeto</button>
        <button type="button" class="btn-sec" data-acao="copiar">Copiar JSON</button>
        <button type="button" class="btn-sec" data-acao="importar">Importar JSON</button>
      </div>
      ${ui.mostrarImportar ? `
        <div class="importar">
          <label class="campo" for="f-json"><span class="campo-rot">Cole o JSON do projeto ou escolha um arquivo</span>
            <textarea id="f-json" rows="4"></textarea></label>
          <input type="file" id="f-arquivo" accept=".json,application/json">
          <button type="button" class="btn" data-acao="importar-ok">Carregar</button>
        </div>` : ''}
      <textarea id="f-export" class="export" rows="3" readonly hidden></textarea>`;
  }

  function renderEntradas() {
    $('#painel-projetos').innerHTML = htmlProjetos();
    $('#painel-perfil').innerHTML = htmlPerfil();
    $('#painel-barra').innerHTML = htmlBarra();
    $('#painel-cargas').innerHTML = htmlCargas();
    $('#painel-coef').innerHTML = htmlCoeficientes();
  }

  // ------------------------------------------------------------------ resultados

  const pct = r => (r === Infinity ? 'fora do escopo' : `${fmt(r * 100, 1)}%`);
  const estado = r => (r > 1 + 1e-9 ? 'falha' : r > 0.9 ? 'atencao' : 'ok');

  function htmlPropriedades(sec) {
    const linhas = [
      ['A', fmt(sec.A / 100), 'cm²'], ['Massa', fmt(sec.massa, 1), 'kg/m'],
      ['Ix', fmt(sec.Ix / 1e4, 0), 'cm⁴'], ['Iy', fmt(sec.Iy / 1e4, 0), 'cm⁴'],
      ['Wx', fmt(sec.Wx / 1e3, 1), 'cm³'], ['Wy', fmt(sec.Wy / 1e3, 1), 'cm³'],
      ['Zx', fmt(sec.Zx / 1e3, 1), 'cm³'], ['Zy', fmt(sec.Zy / 1e3, 1), 'cm³'],
      ['rx', fmt(sec.rx / 10), 'cm'], ['ry', fmt(sec.ry / 10), 'cm'],
      ['J', fmt(sec.J / 1e4), 'cm⁴'], ['Cw', fmt(sec.Cw / 1e6, 0), 'cm⁶'],
    ];
    return `<div class="secao-desenho">${desenhos.secao(sec)}</div>
      <dl class="props">${linhas.map(([k, v, u]) => `<div><dt>${k}</dt><dd>${v} <span>${u}</span></dd></div>`).join('')}</dl>
      ${sec.familia === 'I' && sec.fabricacao === 'laminado' ? '<p class="nota">Propriedades calculadas com as dimensões nominais, sem as concordâncias mesa-alma (a favor da segurança). Confira no catálogo do fabricante.</p>' : ''}`;
  }

  function renderResultados() {
    let sec = null;
    try { sec = secoes.criarSecao(projeto.perfil); } catch (e) { /* mostrado abaixo */ }
    $('#secao-props').innerHTML = sec ? htmlPropriedades(sec) : '';

    let r;
    try {
      r = calculo.calcular(projeto);
    } catch (e) {
      $('#resumo').innerHTML = `<div class="status erro"><span class="pill">Verifique os dados</span><p>${esc(e.message)}</p></div>`;
      $('#verificacoes').innerHTML = '';
      $('#diagramas').innerHTML = '';
      $('#memorial').innerHTML = '';
      return;
    }

    // Resumo
    const p = r.pior;
    $('#resumo').innerHTML = `
      <div class="status ${r.atende ? 'ok' : 'falha'}">
        <span class="pill">${r.atende ? 'Atende' : 'Não atende'}</span>
        <div class="status-texto">
          <strong>${esc(r.sec.nome)} · ${fmt(r.mat.fy, 0)} MPa · L = ${fmt(r.L)} m</strong>
          <span>Maior aproveitamento: <b>${pct(p.ratio)}</b> em ${esc(p.nome.toLowerCase())}</span>
        </div>
      </div>
      ${r.avisos.length ? `<ul class="avisos">${r.avisos.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}`;

    // Tabela de verificações
    $('#verificacoes').innerHTML = `
      <div class="tabela-rolagem"><table class="ver">
        <thead><tr><th>Verificação</th><th class="num">Solicitante</th><th class="num">Resistente</th><th>Aproveitamento</th></tr></thead>
        <tbody>${r.verificacoes.map(v => {
          const st = estado(v.ratio);
          const largura = Math.min(100, v.ratio === Infinity ? 100 : v.ratio * 100);
          const onde = [v.combo, Number.isFinite(v.x) ? `x = ${fmt(v.x)} m` : ''].filter(Boolean).join(' · ');
          return `<tr class="${st}">
            <td><span class="ver-nome">${esc(v.nome)}</span>${onde ? `<span class="ver-onde">${esc(onde)}</span>` : ''}</td>
            <td class="num">${v.Sd == null ? '—' : `${fmt(v.Sd, v.un ? 2 : 0)} ${v.un}`}</td>
            <td class="num">${v.Rd == null ? '—' : `${fmt(v.Rd, v.un ? 2 : 0)} ${v.un}`}</td>
            <td><div class="barra-uso"><span style="width:${largura}%"></span></div><b class="uso">${pct(v.ratio)}</b></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`;

    // Diagramas
    const elu = r.resultadosELU;
    const govIdx = Math.max(0, elu.findIndex(x => x.combo.nome === (r.verificacoes.find(v => v.id !== 'fv' && v.id !== 'fh' && v.combo) || {}).combo));
    let idx = elu.findIndex(x => x.combo.nome === ui.combo);
    if (idx < 0) idx = govIdx;
    const sel = elu[idx];
    const est = sel.res.estacoes;
    const graf = [];
    const add = (titulo, chave, unidade, classe, inverter) => {
      const pts = est.map(e => ({ x: e.x, v: e[chave] }));
      if (pts.every(p => Math.abs(p.v) < 1e-9)) return;
      graf.push(`<figure><figcaption>${titulo}</figcaption>${desenhos.diagrama({ pontos: pts, L: r.L, unidade, classe, inverter })}</figure>`);
    };
    add('Força normal N (tração +)', 'N', 'kN', 'd-n', false);
    add('Cortante no plano vertical Vy', 'Vv', 'kN', 'd-v', false);
    add('Momento fletor no plano vertical Mx', 'Mv', 'kN·m', 'd-m', true);
    add('Cortante no plano horizontal Vz', 'Vh', 'kN', 'd-v', false);
    add('Momento fletor no plano horizontal My', 'Mh', 'kN·m', 'd-m', true);

    const fv = r.verificacoes.find(v => v.id === 'fv') || r.verificacoes.find(v => v.id === 'fh');
    const els = r.resultadosELS.find(x => fv && x.combo.nome === fv.combo) || r.resultadosELS[0];
    if (els) {
      for (const [chave, titulo] of [['dv', 'Deslocamento vertical (ELS)'], ['dh', 'Deslocamento horizontal (ELS)']]) {
        const pts = els.res.nos.map((x, i) => ({ x, v: els.res[chave][i] * 1000 }));
        if (pts.every(p => Math.abs(p.v) < 1e-9)) continue;
        graf.push(`<figure><figcaption>${titulo} · ${esc(els.combo.nome)}</figcaption>${desenhos.diagrama({ pontos: pts, L: r.L, unidade: 'mm', classe: 'd-f', inverter: true, casas: 1 })}</figure>`);
      }
    }

    const cargasDesenho = r.cargas;
    $('#diagramas').innerHTML = `
      <figure class="modelo"><figcaption>Esquema da barra · cargas características</figcaption>
        <div class="rolagem">${desenhos.modelo({ L: r.L, apoios: r.apoios, cargas: cargasDesenho, contencoes: r.contencoes })}</div>
        <div class="legenda"><span class="lg cat-G">G permanente</span><span class="lg cat-Q">Q uso</span><span class="lg cat-W">W vento</span><span class="lg lg-cont">contenção lateral</span></div>
      </figure>
      <label class="campo combo-sel" for="f-combo"><span class="campo-rot">Esforços da combinação (ELU)</span>
        <select id="f-combo">${opcoes(elu.map((x, i) => [x.combo.nome, `${x.combo.nome}${i === govIdx ? ' · governa' : ''}`]), sel.combo.nome)}</select>
      </label>
      ${sel.B1.x > 1 ? `<p class="nota">Diagramas de 1ª ordem. Na verificação, os momentos foram multiplicados por B1x = ${fmt(sel.B1.x, 3)} e B1y = ${fmt(sel.B1.y, 3)}.</p>` : ''}
      <div class="graficos">${graf.join('')}</div>`;

    // Memorial
    const blocos = [];
    const bloco = (titulo, passos) => blocos.push(`<details><summary>${titulo}</summary><ol>${passos.map(s => `<li>${esc(s)}</li>`).join('')}</ol></details>`);
    bloco('Seção e material', [
      `${r.sec.nome}; fy = ${fmt(r.mat.fy, 0)} MPa; fu = ${fmt(r.mat.fu, 0)} MPa; E = 200.000 MPa; G = 77.000 MPa`,
      `A = ${fmt(r.sec.A / 100)} cm²; Ix = ${fmt(r.sec.Ix / 1e4, 0)} cm⁴; Iy = ${fmt(r.sec.Iy / 1e4, 0)} cm⁴; J = ${fmt(r.sec.J / 1e4)} cm⁴; Cw = ${fmt(r.sec.Cw / 1e6, 0)} cm⁶`,
      `Trechos entre contenções laterais: ${r.trechos.map(t => `${fmt(t.x1)}–${fmt(t.x2)} m${t.livre ? ' (extremidade livre, Cb = 1)' : ''}`).join('; ')}`,
      `KxLx = ${fmt(r.comp.KxLx / 1000)} m; KyLy = ${fmt(r.comp.KyLy / 1000)} m; KzLz = ${fmt(r.comp.KzLz / 1000)} m`,
    ]);
    bloco('Combinações de ações', [
      ...r.combos.elu.map(c => `${c.id}: ${c.nome}`),
      ...r.combos.els.map(c => `${c.id}: ${c.nome}`),
    ]);
    for (const v of r.verificacoes) {
      bloco(`${v.nome} · ${pct(v.ratio)}`, [
        ...(v.combo ? [`Combinação ${v.combo}${Number.isFinite(v.x) ? `, seção x = ${fmt(v.x)} m` : ''}${v.trecho ? `, trecho ${fmt(v.trecho.x1)}–${fmt(v.trecho.x2)} m` : ''}`] : []),
        ...v.passos,
      ]);
    }
    $('#memorial').innerHTML = blocos.join('');
  }

  // --------------------------------------------------------------- eventos

  let espera = null;
  function agendarCalculo() {
    clearTimeout(espera);
    espera = setTimeout(() => {
      gravar(CHAVE_ATUAL, projeto);
      renderResultados();
    }, 200);
  }

  function aplicarModelo(m) {
    const L = calculo.num(projeto.barra.L) || 6;
    const s = v => String(+v.toFixed(3));
    const ap = (x, tipo) => ({ x: s(x), tipo, lateral: true });
    const modelos = {
      biapoiada: [ap(0, 'fixo'), ap(L, 'movel')],
      balanco: [ap(0, 'engaste')],
      biengastada: [ap(0, 'engaste'), ap(L, 'engaste')],
      'engaste-apoio': [ap(0, 'engaste'), ap(L, 'movel')],
      continua: [ap(0, 'fixo'), ap(L / 2, 'movel'), ap(L, 'movel')],
    };
    projeto.barra.apoios = modelos[m];
    projeto.barra.contencoes = '';
  }

  function novaCarga(tipo) {
    const L = calculo.num(projeto.barra.L) || 6;
    const s = v => String(+v.toFixed(3));
    const base = { id: novoId(), tipo, cat: 'Q', plano: 'v' };
    if (tipo === 'distribuida') return { ...base, a: '0', b: s(L), q1: '5', q2: '' };
    if (tipo === 'momento') return { ...base, x: s(L / 2), M: '10' };
    if (tipo === 'axial') return { ...base, cat: 'G', x: s(L), P: '-50' };
    return { ...base, x: s(L / 2), P: '10' };
  }

  function acao(btn) {
    const a = btn.dataset.acao;
    ui.aviso = '';
    if (a === 'add-apoio') {
      projeto.barra.apoios.push({ x: projeto.barra.L || '0', tipo: 'movel', lateral: true });
    } else if (a === 'remover-apoio') {
      projeto.barra.apoios.splice(+btn.dataset.i, 1);
    } else if (a === 'modelo') {
      aplicarModelo(btn.dataset.m);
    } else if (a === 'add-carga') {
      projeto.cargas.push(novaCarga(btn.dataset.t));
    } else if (a === 'remover-carga') {
      projeto.cargas.splice(+btn.dataset.i, 1);
    } else if (a === 'salvar') {
      const nome = (projeto.nome || '').trim();
      if (!nome) { ui.aviso = 'Dê um nome ao projeto antes de salvar.'; }
      else {
        const lista = ler(CHAVE_LISTA) || {};
        const existia = nome in lista;
        lista[nome] = JSON.parse(JSON.stringify(projeto));
        ui.aviso = gravar(CHAVE_LISTA, lista)
          ? (existia ? `"${nome}" atualizado.` : `"${nome}" salvo.`)
          : 'Este navegador não permite salvar. Use "Copiar JSON" para guardar o projeto.';
      }
    } else if (a === 'abrir') {
      const lista = ler(CHAVE_LISTA) || {};
      const p = lista[btn.dataset.n];
      if (p) { projeto = JSON.parse(JSON.stringify(p)); ui.combo = null; ui.aviso = `"${btn.dataset.n}" aberto.`; }
    } else if (a === 'excluir') {
      ui.confirmarExclusao = btn.dataset.n;
    } else if (a === 'excluir-nao') {
      ui.confirmarExclusao = null;
    } else if (a === 'excluir-sim') {
      const lista = ler(CHAVE_LISTA) || {};
      delete lista[btn.dataset.n];
      gravar(CHAVE_LISTA, lista);
      ui.aviso = `"${btn.dataset.n}" excluído.`;
      ui.confirmarExclusao = null;
    } else if (a === 'novo') {
      projeto = projetoExemplo();
      projeto.nome = 'Novo projeto';
      projeto.cargas = [];
      ui.combo = null;
      ui.aviso = 'Projeto novo criado. Os projetos salvos continuam na lista.';
    } else if (a === 'copiar') {
      const txt = JSON.stringify(projeto, null, 2);
      const area = $('#f-export');
      area.value = txt;
      area.hidden = false;
      const selecionar = () => { area.focus(); area.select(); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(() => {
          const t = document.createElement('p'); t.className = 'toast'; t.textContent = 'JSON copiado.';
          area.before(t);
        }).catch(selecionar);
      } else selecionar();
      return; // não redesenha, para manter o texto visível
    } else if (a === 'importar') {
      ui.mostrarImportar = !ui.mostrarImportar;
    } else if (a === 'importar-ok') {
      try {
        const p = JSON.parse($('#f-json').value);
        if (!p.perfil || !p.barra || !Array.isArray(p.cargas)) throw new Error();
        for (const c of p.cargas) if (!c.id) c.id = novoId();
        p.coef = { ...projetoExemplo().coef, ...(p.coef || {}) };
        projeto = p;
        ui.mostrarImportar = false;
        ui.aviso = 'Projeto importado.';
      } catch {
        ui.aviso = 'O texto não é um projeto válido. Cole o JSON copiado deste programa.';
      }
    }
    renderEntradas();
    agendarCalculo();
  }

  function aoMudar(ev) {
    const el = ev.target;
    if (el.id === 'f-combo') { ui.combo = el.value; renderResultados(); return; }
    if (el.id === 'f-arquivo' && el.files && el.files[0]) {
      el.files[0].text().then(t => { $('#f-json').value = t; });
      return;
    }
    const caminho = el.dataset.campo;
    if (!caminho) return;
    const valor = el.type === 'checkbox' ? el.checked : el.value;
    definir(caminho, valor);
    if (caminho === 'perfil.tipo') {
      projeto.perfil = { tipo: valor, ...PADROES_PERFIL[valor] };
      if (valor.startsWith('TUBO')) {
        const m = MATERIAIS.find(m => m.nome.includes(valor === 'TUBO_CIRC' ? 'circular' : 'retangular'));
        projeto.material = { nome: m.nome, fy: String(m.fy), fu: String(m.fu) };
      } else if (projeto.material.nome.includes('A500')) {
        const m = MATERIAIS[0];
        projeto.material = { nome: m.nome, fy: String(m.fy), fu: String(m.fu) };
      }
    }
    if (caminho === 'material.nome') {
      const m = MATERIAIS.find(m => m.nome === valor);
      if (m) { projeto.material.fy = String(m.fy); projeto.material.fu = String(m.fu); }
    }
    if (ev.type === 'change' && el.hasAttribute('data-recriar')) renderEntradas();
    agendarCalculo();
  }

  function iniciar() {
    renderEntradas();
    renderResultados();
    const entradas = $('#entradas');
    entradas.addEventListener('input', aoMudar);
    entradas.addEventListener('change', ev => {
      if (ev.target.tagName === 'SELECT' || ev.target.type === 'checkbox' || ev.target.type === 'file') aoMudar(ev);
    });
    entradas.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-acao]');
      if (btn) acao(btn);
    });
    $('#resultados').addEventListener('change', aoMudar);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
