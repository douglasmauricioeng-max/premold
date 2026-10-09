/*
 * Análise linear (1ª ordem) de uma barra reta pelo método dos elementos finitos
 * (viga de Euler-Bernoulli). Os esforços internos são obtidos por equilíbrio,
 * a partir das cargas e das reações, e por isso são exatos em qualquer seção.
 *
 * Unidades: kN, m. Convenções:
 *  - cargas transversais positivas no sentido da gravidade (plano vertical) ou
 *    no sentido +z (plano horizontal);
 *  - momento concentrado positivo no sentido horário;
 *  - carga axial positiva no sentido +x (da esquerda para a direita);
 *  - N positivo = tração; M positivo = tração na fibra do lado das cargas positivas
 *    (no plano vertical, tração embaixo).
 */
var PM = globalThis.PM || (globalThis.PM = {});

(function () {
  'use strict';

  const TOL = 1e-9;

  /** Resolve A·x = b (matriz densa) por eliminação de Gauss com pivotamento parcial. */
  function resolverSistema(A, b) {
    const n = b.length;
    const M = A.map((linha, i) => [...linha, b[i]]);
    const escala = Math.max(1e-30, ...A.map((l, i) => Math.abs(l[i])));
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i;
      if (Math.abs(M[p][c]) < 1e-10 * escala) {
        throw new Error('A barra está instável: os apoios não impedem todos os movimentos de corpo rígido. Acrescente ou troque apoios.');
      }
      [M[c], M[p]] = [M[p], M[c]];
      for (let i = c + 1; i < n; i++) {
        const f = M[i][c] / M[c][c];
        if (f === 0) continue;
        for (let j = c; j <= n; j++) M[i][j] -= f * M[c][j];
      }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = M[i][n];
      for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
      x[i] = s / M[i][i];
    }
    return x;
  }

  /** Coordenadas dos nós: pontos notáveis + subdivisão regular. */
  function gerarMalha(L, pontos, nDivisoes = 60) {
    const xs = [0, L, ...pontos.filter(x => x > 0 && x < L)];
    for (let i = 1; i < nDivisoes; i++) xs.push(L * i / nDivisoes);
    xs.sort((a, b) => a - b);
    const unicos = [];
    for (const x of xs) if (!unicos.length || x - unicos[unicos.length - 1] > 1e-6 * L) unicos.push(x);
    unicos[unicos.length - 1] = L;
    return unicos;
  }

  const indiceNo = (nos, x) => {
    let melhor = 0;
    for (let i = 1; i < nos.length; i++) if (Math.abs(nos[i] - x) < Math.abs(nos[melhor] - x)) melhor = i;
    return melhor;
  };

  /** Valor de uma carga distribuída linear na coordenada s. */
  const qEm = (c, s) => (c.b - c.a) < TOL ? c.q1 : c.q1 + (c.q2 - c.q1) * (s - c.a) / (c.b - c.a);

  /**
   * Flexão em um plano. restr[i] = {w, th}. cargas: pontuais {x, P}, momentos {x, M}, distribuidas {a, b, q1, q2}.
   * Retorna deslocamentos nodais e reações {x, F, C}.
   */
  function resolverFlexao(nos, EI, restr, cargas) {
    const n = nos.length, ndof = 2 * n;
    const K = Array.from({ length: ndof }, () => new Array(ndof).fill(0));
    const F = new Array(ndof).fill(0);
    for (let e = 0; e < n - 1; e++) {
      const l = nos[e + 1] - nos[e];
      const k = EI / l ** 3;
      const ke = [
        [12, 6 * l, -12, 6 * l],
        [6 * l, 4 * l * l, -6 * l, 2 * l * l],
        [-12, -6 * l, 12, -6 * l],
        [6 * l, 2 * l * l, -6 * l, 4 * l * l],
      ];
      const g = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) K[g[i]][g[j]] += k * ke[i][j];
      // Cargas distribuídas que cobrem o elemento (os nós coincidem com os extremos das cargas)
      const xm = (nos[e] + nos[e + 1]) / 2;
      for (const c of cargas.distribuidas) {
        if (xm < c.a || xm > c.b) continue;
        const q1 = qEm(c, nos[e]), q2 = qEm(c, nos[e + 1]);
        F[g[0]] += l * (7 * q1 + 3 * q2) / 20;
        F[g[1]] += l * l * (3 * q1 + 2 * q2) / 60;
        F[g[2]] += l * (3 * q1 + 7 * q2) / 20;
        F[g[3]] -= l * l * (2 * q1 + 3 * q2) / 60;
      }
    }
    for (const c of cargas.pontuais) F[2 * indiceNo(nos, c.x)] += c.P;
    for (const c of cargas.momentos) F[2 * indiceNo(nos, c.x) + 1] += c.M;

    const livres = [], presos = [];
    for (let i = 0; i < n; i++) {
      (restr[i].w ? presos : livres).push(2 * i);
      (restr[i].th ? presos : livres).push(2 * i + 1);
    }
    const u = new Array(ndof).fill(0);
    if (livres.length) {
      const Kr = livres.map(i => livres.map(j => K[i][j]));
      const sol = resolverSistema(Kr, livres.map(i => F[i]));
      livres.forEach((g, k) => { u[g] = sol[k]; });
    }
    const reacoes = [];
    for (let i = 0; i < n; i++) {
      if (!restr[i].w && !restr[i].th) continue;
      const r = { x: nos[i], F: 0, C: 0 };
      for (const [g, campo] of [[2 * i, 'F'], [2 * i + 1, 'C']]) {
        if (!presos.includes(g)) continue;
        let s = -F[g];
        for (let j = 0; j < ndof; j++) s += K[g][j] * u[j];
        r[campo] = s;
      }
      reacoes.push(r);
    }
    return { w: nos.map((_, i) => u[2 * i]), reacoes };
  }

  /** Esforços (V, M) por equilíbrio da parte à esquerda da seção x. incluir = considera itens em x. */
  function esforcosFlexao(x, cargas, reacoes, incluir) {
    let V = 0, M = 0;
    const antes = xi => incluir ? xi <= x + TOL : xi < x - TOL;
    for (const f of [...cargas.pontuais.map(c => ({ x: c.x, F: c.P, C: 0 })),
                     ...cargas.momentos.map(c => ({ x: c.x, F: 0, C: c.M })),
                     ...reacoes]) {
      if (!antes(f.x)) continue;
      V -= f.F;
      M += -f.F * (x - f.x) + f.C;
    }
    for (const c of cargas.distribuidas) {
      const fim = Math.min(c.b, x);
      if (fim <= c.a) continue;
      // Simpson: exato para o integrando quadrático q(s)·(x − s)
      const m = (c.a + fim) / 2, h = fim - c.a;
      const qa = qEm(c, c.a), qm = qEm(c, m), qf = qEm(c, fim);
      V -= h / 6 * (qa + 4 * qm + qf);
      M -= h / 6 * (qa * (x - c.a) + 4 * qm * (x - m) + qf * (x - fim));
    }
    return { V, M };
  }

  function resolverAxial(nos, EA, presos, cargas) {
    const n = nos.length;
    const K = Array.from({ length: n }, () => new Array(n).fill(0));
    const F = new Array(n).fill(0);
    for (let e = 0; e < n - 1; e++) {
      const k = EA / (nos[e + 1] - nos[e]);
      K[e][e] += k; K[e + 1][e + 1] += k; K[e][e + 1] -= k; K[e + 1][e] -= k;
    }
    for (const c of cargas) F[indiceNo(nos, c.x)] += c.P;
    const livres = [...Array(n).keys()].filter(i => !presos[i]);
    const u = new Array(n).fill(0);
    const sol = resolverSistema(livres.map(i => livres.map(j => K[i][j])), livres.map(i => F[i]));
    livres.forEach((g, k) => { u[g] = sol[k]; });
    const reacoes = [];
    for (let i = 0; i < n; i++) {
      if (!presos[i]) continue;
      let s = -F[i];
      for (let j = 0; j < n; j++) s += K[i][j] * u[j];
      reacoes.push({ x: nos[i], P: s });
    }
    return reacoes;
  }

  function normalApos(x, cargas, reacoes, incluir) {
    const antes = xi => incluir ? xi <= x + TOL : xi < x - TOL;
    let N = 0;
    for (const f of [...cargas, ...reacoes]) if (antes(f.x)) N -= f.P;
    return N;
  }

  /**
   * modelo: { L, apoios: [{x, tipo: 'engaste'|'fixo'|'movel', lateral}], cargas, EIv, EIh, EA, pontosExtras }
   * Retorna nós, deslocamentos (dv, dh em m), estações com esforços e reações.
   */
  function analisar(modelo) {
    const { L, apoios, cargas, EIv, EIh, EA } = modelo;
    if (!(L > 0)) throw new Error('Informe um comprimento de barra maior que zero.');
    for (const a of apoios) {
      if (a.x < -TOL || a.x > L + TOL) throw new Error(`Há um apoio fora da barra (x = ${a.x} m).`);
    }
    const pontos = [...apoios.map(a => a.x), ...(modelo.pontosExtras || [])];
    for (const c of cargas) {
      if (c.tipo === 'distribuida') {
        if (c.a < -TOL || c.b > L + TOL || c.b < c.a) throw new Error('Há uma carga distribuída com trecho fora da barra ou com início depois do fim.');
        pontos.push(c.a, c.b);
      } else {
        if (c.x < -TOL || c.x > L + TOL) throw new Error(`Há uma carga fora da barra (x = ${c.x} m).`);
        pontos.push(c.x);
      }
    }
    const nos = gerarMalha(L, pontos);

    const porPlano = plano => ({
      pontuais: cargas.filter(c => c.tipo === 'pontual' && c.plano === plano),
      momentos: cargas.filter(c => c.tipo === 'momento' && c.plano === plano),
      distribuidas: cargas.filter(c => c.tipo === 'distribuida' && c.plano === plano),
    });
    const cv = porPlano('v'), ch = porPlano('h');
    const axiais = cargas.filter(c => c.tipo === 'axial');

    const restr = plano => nos.map(x => {
      const r = { w: false, th: false };
      for (const a of apoios) {
        if (Math.abs(a.x - x) > 1e-6 * L) continue;
        if (plano === 'h' && a.lateral === false) continue;
        r.w = true;
        if (a.tipo === 'engaste') r.th = true;
      }
      return r;
    });

    const temCargas = c => c.pontuais.length + c.momentos.length + c.distribuidas.length > 0;
    const vazio = { w: nos.map(() => 0), reacoes: [] };
    const sv = temCargas(cv) ? resolverFlexao(nos, EIv, restr('v'), cv) : vazio;
    const sh = temCargas(ch) ? resolverFlexao(nos, EIh, restr('h'), ch) : vazio;

    let reacoesAx = [];
    if (axiais.length) {
      const presos = nos.map(x => apoios.some(a => Math.abs(a.x - x) <= 1e-6 * L && a.tipo !== 'movel'));
      if (!presos.some(Boolean)) {
        throw new Error('Há carga axial, mas nenhum apoio impede o deslocamento ao longo da barra. Use um apoio fixo ou engaste.');
      }
      reacoesAx = resolverAxial(nos, EA, presos, axiais);
    }

    const estacoes = [];
    for (const x of nos) {
      for (const incluir of [false, true]) {
        const v = esforcosFlexao(x, cv, sv.reacoes, incluir);
        const h = esforcosFlexao(x, ch, sh.reacoes, incluir);
        const e = { x, N: normalApos(x, axiais, reacoesAx, incluir), Vv: v.V, Mv: v.M, Vh: h.V, Mh: h.M };
        const ant = estacoes[estacoes.length - 1];
        if (incluir && ant && ant.x === x &&
            ['N', 'Vv', 'Mv', 'Vh', 'Mh'].every(k => Math.abs(ant[k] - e[k]) < 1e-9)) continue;
        estacoes.push(e);
      }
    }
    // Nas extremidades, o lado de fora da barra não existe
    if (estacoes.length > 1 && estacoes[1].x === 0) estacoes.shift();
    const ult = estacoes.length - 1;
    if (ult > 0 && estacoes[ult - 1].x === L) estacoes.pop();
    for (const e of estacoes) for (const k of ['N', 'Vv', 'Mv', 'Vh', 'Mh']) if (Math.abs(e[k]) < 1e-10) e[k] = 0;

    return {
      nos, dv: sv.w, dh: sh.w, estacoes,
      reacoes: { v: sv.reacoes, h: sh.reacoes, axial: reacoesAx },
    };
  }

  PM.analise = { analisar, gerarMalha, resolverSistema };
})();

if (typeof module !== 'undefined') module.exports = PM;
