/*
 * Orquestra o cálculo: monta as combinações de ações, analisa a barra para cada
 * uma e confronta os esforços com as resistências da NBR 8800.
 */
var PM = globalThis.PM || (globalThis.PM = {});

(function () {
  'use strict';

  const { secoes, analise } = PM;
  const N = PM.nbr8800;
  const fmt = N.fmt;
  const PESO_ESPECIFICO = 78.5; // kN/m³

  const num = v => {
    if (typeof v === 'number') return v;
    if (v === undefined || v === null) return NaN;
    const t = String(v).trim().replace(',', '.');
    return t === '' ? NaN : Number(t);
  };

  const listaNumeros = txt => String(txt || '')
    .split(/[;\s]+/).map(num).filter(Number.isFinite);

  const CATEGORIAS = { G: 'Permanente', Q: 'Variável (uso)', W: 'Vento' };

  function nomeCombinacao(f) {
    const termos = [];
    for (const c of ['G', 'Q', 'W']) if (f[c] > 0) termos.push(`${fmt(f[c], 2)}·${c}`);
    return termos.join(' + ');
  }

  function gerarCombinacoes(co, cats) {
    const temQ = cats.has('Q'), temW = cats.has('W');
    const elu = [], els = [], vistos = new Set();
    const add = (lista, tipo, G, Q, W) => {
      const f = { G, Q: temQ ? Q : 0, W: temW ? W : 0 };
      const chave = `${tipo}|${f.G}|${f.Q}|${f.W}`;
      if (vistos.has(chave) || (f.Q === 0 && f.W === 0 && tipo === 'ELU' && G !== co.gg)) return;
      vistos.add(chave);
      lista.push({ tipo, f, nome: nomeCombinacao(f) });
    };
    for (const g of [co.gg, co.ggFav]) {
      add(elu, 'ELU', g, 0, 0);
      add(elu, 'ELU', g, co.gq, 0);
      add(elu, 'ELU', g, 0, co.gw);
      if (temQ && temW) {
        add(elu, 'ELU', g, co.gq, co.gw * co.psi0w);
        add(elu, 'ELU', g, co.gq * co.psi0q, co.gw);
      }
    }
    add(els, 'ELS', 1, 1, temW ? co.psi1w : 0);
    add(els, 'ELS', 1, temQ ? co.psi1q : 0, 1);
    add(els, 'ELS', 1, 1, 0);
    add(els, 'ELS', 1, 0, 1);
    add(els, 'ELS', 1, 0, 0);
    elu.forEach((c, i) => { c.id = `ELU${i + 1}`; });
    els.forEach((c, i) => { c.id = `ELS${i + 1}`; });
    return { elu, els };
  }

  /** Converte uma carga do formulário em números, validando os campos. */
  function lerCarga(c, i) {
    const rot = `Carga ${i + 1}`;
    const exigir = (v, campo) => {
      if (!Number.isFinite(v)) throw new Error(`${rot}: preencha o campo "${campo}".`);
      return v;
    };
    const base = { tipo: c.tipo, plano: c.tipo === 'axial' ? 'x' : c.plano, cat: c.cat };
    if (c.tipo === 'distribuida') {
      const q1 = exigir(num(c.q1), 'q início');
      const q2 = Number.isFinite(num(c.q2)) ? num(c.q2) : q1;
      return { ...base, a: exigir(num(c.a), 'início'), b: exigir(num(c.b), 'fim'), q1, q2 };
    }
    const campo = c.tipo === 'momento' ? 'M' : 'P';
    return { ...base, x: exigir(num(c.x), 'posição'), [campo]: exigir(num(c[campo]), campo === 'M' ? 'momento' : 'força') };
  }

  function fatorar(c, f) {
    if (c.tipo === 'distribuida') return { ...c, q1: c.q1 * f, q2: c.q2 * f };
    if (c.tipo === 'momento') return { ...c, M: c.M * f };
    return { ...c, P: c.P * f };
  }

  function valorEm(est, chave, x) {
    if (x <= est[0].x) return est[0][chave];
    for (let i = 1; i < est.length; i++) {
      if (est[i].x >= x) {
        const a = est[i - 1], b = est[i];
        if (b.x - a.x < 1e-12) return b[chave];
        return a[chave] + (b[chave] - a[chave]) * (x - a.x) / (b.x - a.x);
      }
    }
    return est[est.length - 1][chave];
  }

  function calcular(projeto) {
    const sec = secoes.criarSecao(projeto.perfil);
    const mat = { fy: num(projeto.material.fy), fu: num(projeto.material.fu) };
    if (!(mat.fy > 0) || !(mat.fu > 0)) throw new Error('Informe fy e fu do aço.');
    if (mat.fu < mat.fy) throw new Error('A resistência à ruptura fu deve ser maior ou igual a fy.');

    const b = projeto.barra;
    const L = num(b.L);
    if (!(L > 0)) throw new Error('Informe o comprimento da barra.');
    const Lmm = L * 1000;
    const apoios = b.apoios.map((a, i) => {
      const x = num(a.x);
      if (!Number.isFinite(x)) throw new Error(`Apoio ${i + 1}: informe a posição.`);
      return { x, tipo: a.tipo, lateral: a.lateral !== false };
    });
    if (!apoios.length) throw new Error('Adicione pelo menos um apoio.');

    const avisos = [];
    const cargas = projeto.cargas.map(lerCarga);
    if (b.pesoProprio) {
      const pp = sec.A * 1e-6 * PESO_ESPECIFICO;
      cargas.push({ tipo: 'distribuida', plano: 'v', cat: 'G', a: 0, b: L, q1: pp, q2: pp, automatica: true });
    }
    if (!cargas.length) throw new Error('Adicione pelo menos uma carga para verificar o perfil.');

    const co = {};
    for (const [k, v] of Object.entries(projeto.coef)) {
      co[k] = num(v);
      if (!(co[k] >= 0)) throw new Error(`Coeficiente ${k} inválido.`);
    }
    const combos = gerarCombinacoes(co, new Set(cargas.map(c => c.cat)));

    const Ekn = N.E * 1e3; // kN/m²
    const EIv = Ekn * sec.Ix * 1e-12, EIh = Ekn * sec.Iy * 1e-12, EA = Ekn * sec.A * 1e-6;

    // Contenções laterais e trechos destravados
    let cont = listaNumeros(b.contencoes).filter(x => x >= 0 && x <= L);
    if (!cont.length) cont = apoios.filter(a => a.lateral).map(a => a.x);
    cont = [...new Set(cont)].sort((p, q) => p - q);
    const marcos = [...new Set([0, ...cont, L])].sort((p, q) => p - q);
    const trechos = [];
    for (let i = 0; i < marcos.length - 1; i++) {
      const x1 = marcos[i], x2 = marcos[i + 1];
      if (x2 - x1 < 1e-6) continue;
      const livre = !cont.some(c => Math.abs(c - x1) < 1e-6) || !cont.some(c => Math.abs(c - x2) < 1e-6);
      trechos.push({ x1, x2, livre });
    }
    const pontosExtras = [...cont];
    for (const t of trechos) for (const f of [0.25, 0.5, 0.75]) pontosExtras.push(t.x1 + f * (t.x2 - t.x1));

    const comp = {
      KxLx: (num(b.KxLx) || L) * 1000,
      KyLy: (num(b.KyLy) || L) * 1000,
      KzLz: (num(b.KzLz) || L) * 1000,
    };
    const CbFixo = num(b.Cb);
    const AeAg = Number.isFinite(num(b.AeAg)) ? num(b.AeAg) : 1;
    const limFlecha = num(b.flechaLim) || 250;

    const trac = N.tracao(sec, mat, { L: Lmm, AeAg });
    let compr = null, erroCompr = null;
    try { compr = N.compressao(sec, mat, comp); } catch (e) { erroCompr = e.message; }
    const cortV = N.cortante(sec, mat, 'v', { a: num(b.a) || 0, Lv: Lmm });
    const cortH = N.cortante(sec, mat, 'h', { Lv: Lmm });

    const cacheFlexao = new Map();
    const flexao = (eixo, Lb, Cb) => {
      const chave = `${eixo}|${Lb.toFixed(3)}|${Cb.toFixed(4)}`;
      if (!cacheFlexao.has(chave)) cacheFlexao.set(chave, N.flexao(sec, mat, eixo, { Lb, Cb }));
      return cacheFlexao.get(chave);
    };

    const ver = {};
    const registrar = (id, nome, ratio, dados) => {
      if (!Number.isFinite(ratio)) ratio = Infinity; // seção fora do escopo
      if (!ver[id]) ver[id] = { id, nome, ratio: -1 };
      if (ratio > ver[id].ratio) Object.assign(ver[id], { ratio }, dados);
    };

    const resultadosELU = [];
    for (const combo of combos.elu) {
      const cargasF = cargas.map(c => fatorar(c, combo.f[c.cat] || 0))
        .filter(c => (c.tipo === 'distribuida' ? (c.q1 !== 0 || c.q2 !== 0) : (c.P || c.M)));
      if (!cargasF.length) continue;
      const res = analise.analisar({ L, apoios, cargas: cargasF, EIv, EIh, EA, pontosExtras });
      const est = res.estacoes;

      // Efeitos de 2ª ordem locais (B1, com Cm = 1,0, a favor da segurança)
      const Nc = Math.max(0, ...est.map(e => -e.N));
      const B1 = { x: 1, y: 1 };
      if (Nc > 0) {
        const Ne1x = Math.PI ** 2 * EIv / (comp.KxLx / 1000) ** 2;
        const Ne1y = Math.PI ** 2 * EIh / (comp.KyLy / 1000) ** 2;
        if (Nc >= Ne1x || Nc >= Ne1y) {
          throw new Error(`Na combinação ${combo.nome}, a compressão (${fmt(Nc)} kN) supera a carga crítica de flambagem da barra. Use um perfil mais rígido ou reduza os comprimentos de flambagem.`);
        }
        B1.x = 1 / (1 - Nc / Ne1x);
        B1.y = 1 / (1 - Nc / Ne1y);
      }

      const resist = trechos.map(t => {
        const Lb = (t.x2 - t.x1) * 1000;
        const cbDe = chave => {
          if (Number.isFinite(CbFixo)) return CbFixo;
          if (t.livre) return 1;
          const dentro = est.filter(e => e.x >= t.x1 - 1e-9 && e.x <= t.x2 + 1e-9);
          const Mmax = Math.max(...dentro.map(e => Math.abs(e[chave])));
          const q = f => Math.abs(valorEm(est, chave, t.x1 + f * (t.x2 - t.x1)));
          return N.calcularCb(Mmax, q(0.25), q(0.5), q(0.75));
        };
        return { t, fx: flexao('x', Lb, cbDe('Mv')), fy: flexao('y', Lb, cbDe('Mh')) };
      });

      for (const e of est) {
        const aplicaveis = resist.filter(r => e.x >= r.t.x1 - 1e-9 && e.x <= r.t.x2 + 1e-9);
        for (const r of aplicaveis) {
          const MxRd = r.fx.MRd, MyRd = r.fy.MRd;
          const Mx = Math.abs(e.Mv) * B1.x, My = Math.abs(e.Mh) * B1.y;
          const local = { combo: combo.nome, x: e.x };
          if (Mx > 0) registrar('Mx', 'Flexão no plano vertical (eixo x)', Mx / MxRd,
            { ...local, Sd: Mx, Rd: MxRd, un: 'kN·m', passos: r.fx.passos, trecho: r.t });
          if (My > 0) registrar('My', 'Flexão no plano horizontal (eixo y)', My / MyRd,
            { ...local, Sd: My, Rd: MyRd, un: 'kN·m', passos: r.fy.passos, trecho: r.t });
          let NRd = Infinity;
          if (e.N > 0) NRd = trac.NRd;
          else if (e.N < 0) {
            if (!compr) throw new Error(erroCompr);
            NRd = compr.NRd;
          }
          if (e.N !== 0 && (Mx > 0 || My > 0)) {
            registrar('NM', 'Força axial + flexão (5.5.1.2)', N.interacao(e.N, NRd, Mx, MxRd, My, MyRd),
              { ...local, Sd: null, passos: [
                `NSd = ${fmt(e.N)} kN; NRd = ${fmt(NRd)} kN; Mx,Sd = ${fmt(Mx)} kN·m; Mx,Rd = ${fmt(MxRd)} kN·m; My,Sd = ${fmt(My)} kN·m; My,Rd = ${fmt(MyRd)} kN·m`,
                Math.abs(e.N) / NRd >= 0.2 ? 'NSd/NRd ≥ 0,2 → NSd/NRd + 8/9·(Mx,Sd/Mx,Rd + My,Sd/My,Rd) ≤ 1,0'
                  : 'NSd/NRd < 0,2 → NSd/(2·NRd) + (Mx,Sd/Mx,Rd + My,Sd/My,Rd) ≤ 1,0',
                B1.x > 1 || B1.y > 1 ? `Momentos amplificados por B1x = ${fmt(B1.x, 3)} e B1y = ${fmt(B1.y, 3)}` : 'Sem amplificação (barra não comprimida nesta combinação)',
              ] });
          }
        }
        if (e.N > 0) registrar('Nt', 'Tração', e.N / trac.NRd, { combo: combo.nome, x: e.x, Sd: e.N, Rd: trac.NRd, un: 'kN', passos: trac.passos });
        if (e.N < 0 && compr) registrar('Nc', 'Compressão', -e.N / compr.NRd, { combo: combo.nome, x: e.x, Sd: -e.N, Rd: compr.NRd, un: 'kN', passos: compr.passos });
        if (e.Vv !== 0) registrar('Vv', 'Cortante no plano vertical', Math.abs(e.Vv) / cortV.VRd, { combo: combo.nome, x: e.x, Sd: Math.abs(e.Vv), Rd: cortV.VRd, un: 'kN', passos: cortV.passos });
        if (e.Vh !== 0) registrar('Vh', 'Cortante no plano horizontal', Math.abs(e.Vh) / cortH.VRd, { combo: combo.nome, x: e.x, Sd: Math.abs(e.Vh), Rd: cortH.VRd, un: 'kN', passos: cortH.passos });
      }
      resultadosELU.push({ combo, res, B1 });
    }

    if (ver.Nc && compr) {
      registrar('esbC', 'Esbeltez de barra comprimida', compr.esbeltez / 200,
        { Sd: compr.esbeltez, Rd: 200, un: '', passos: ['KL/r ≤ 200 (5.3.4)'] });
    }
    if (ver.Nt) {
      registrar('esbT', 'Esbeltez de barra tracionada', trac.esbeltez / 300,
        { Sd: trac.esbeltez, Rd: 300, un: '', passos: ['L/r ≤ 300 (5.2.8, recomendação)'] });
    }

    // Deslocamentos (ELS)
    const vaos = plano => {
      const xs = [...new Set(apoios.filter(a => plano === 'v' || a.lateral).map(a => a.x))].sort((p, q) => p - q);
      const lista = [];
      if (!xs.length) return lista;
      if (xs[0] > 1e-6) lista.push({ x1: 0, x2: xs[0], Lref: 2 * xs[0], balanco: true });
      for (let i = 0; i < xs.length - 1; i++) lista.push({ x1: xs[i], x2: xs[i + 1], Lref: xs[i + 1] - xs[i], balanco: false });
      if (L - xs[xs.length - 1] > 1e-6) lista.push({ x1: xs[xs.length - 1], x2: L, Lref: 2 * (L - xs[xs.length - 1]), balanco: true });
      if (xs.length === 1 && apoios.find(a => a.x === xs[0]).tipo !== 'engaste') return [];
      return lista;
    };
    const resultadosELS = [];
    for (const combo of combos.els) {
      const cargasF = cargas.map(c => fatorar(c, combo.f[c.cat] || 0))
        .filter(c => c.tipo !== 'axial' && (c.tipo === 'distribuida' ? (c.q1 !== 0 || c.q2 !== 0) : (c.P || c.M)));
      if (!cargasF.length) continue;
      const res = analise.analisar({ L, apoios, cargas: cargasF, EIv, EIh, EA, pontosExtras });
      resultadosELS.push({ combo, res });
      for (const [plano, chave, id, nome] of [['v', 'dv', 'fv', 'Flecha no plano vertical'], ['h', 'dh', 'fh', 'Flecha no plano horizontal']]) {
        for (const v of vaos(plano)) {
          let dmax = 0, xmax = v.x1;
          res.nos.forEach((x, i) => {
            if (x < v.x1 - 1e-9 || x > v.x2 + 1e-9) return;
            if (Math.abs(res[chave][i]) > Math.abs(dmax)) { dmax = res[chave][i]; xmax = x; }
          });
          if (dmax === 0) continue;
          const lim = v.Lref / limFlecha * 1000;
          registrar(id, nome, Math.abs(dmax) * 1000 / lim, {
            combo: combo.nome, x: xmax, Sd: Math.abs(dmax) * 1000, Rd: lim, un: 'mm',
            passos: [
              `${v.balanco ? 'Balanço' : 'Vão'} de ${fmt(v.x2 - v.x1)} m → L de referência = ${fmt(v.Lref)} m${v.balanco ? ' (2 × comprimento do balanço)' : ''}`,
              `δmax = ${fmt(Math.abs(dmax) * 1000)} mm; limite L/${fmt(limFlecha, 0)} = ${fmt(lim)} mm`,
            ],
          });
        }
      }
    }

    if (!Number.isFinite(sec.Ix)) throw new Error('Não foi possível calcular as propriedades da seção.');
    for (const v of Object.values(ver)) {
      if (v.ratio === Infinity) avisos.push(`${v.nome}: a seção está fora do escopo da NBR 8800 para este estado-limite (alma ou parede esbelta).`);
    }
    if (erroCompr && cargas.some(c => c.tipo === 'axial')) avisos.push(erroCompr);
    if (resultadosELU.some(r => r.B1.x > 1)) {
      avisos.push('Há compressão com flexão: os momentos foram amplificados por B1 (Cm = 1,0). Para pórticos com deslocamento lateral, considere também B2.');
    }
    if (sec.familia === 'U' && ver.My) {
      avisos.push('Flexão do U em torno do eixo de menor inércia: foi verificada apenas a FLM; a alma é tratada como compacta.');
    }

    const ordem = ['NM', 'Mx', 'My', 'Vv', 'Vh', 'Nc', 'Nt', 'esbC', 'esbT', 'fv', 'fh'];
    const verificacoes = ordem.filter(k => ver[k]).map(k => ver[k]);
    const pior = verificacoes.reduce((m, v) => (!m || !(v.ratio <= m.ratio) ? v : m), null);
    return {
      sec, mat, cargas, combos, trechos, contencoes: cont, comp, trac, compr, cortV, cortH,
      verificacoes, pior, resultadosELU, resultadosELS, avisos, L, apoios,
      atende: verificacoes.every(v => v.ratio <= 1.0 + 1e-9),
    };
  }

  PM.calculo = { calcular, gerarCombinacoes, num, listaNumeros, CATEGORIAS };
})();

if (typeof module !== 'undefined') module.exports = PM;
