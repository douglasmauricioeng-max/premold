/*
 * Propriedades geométricas das seções transversais.
 * Unidades: mm, mm², mm⁴, mm⁶. Eixo x = eixo de maior inércia (horizontal),
 * eixo y = eixo de menor inércia (vertical no desenho).
 */
var PM = globalThis.PM || (globalThis.PM = {});

(function () {
  'use strict';

  const RHO_ACO = 7850; // kg/m³

  // Perfis W laminados (dimensões nominais). Concordâncias mesa-alma são desprezadas
  // no cálculo das propriedades, o que fica a favor da segurança.
  const CATALOGO_W = [
    ['W 150 x 13,0', 148, 100, 4.3, 4.9],
    ['W 150 x 18,0', 153, 102, 5.8, 7.1],
    ['W 150 x 22,5 (H)', 152, 152, 5.8, 6.6],
    ['W 150 x 24,0', 160, 102, 6.6, 10.3],
    ['W 150 x 29,8 (H)', 157, 153, 6.6, 9.3],
    ['W 150 x 37,1 (H)', 162, 154, 8.1, 11.6],
    ['W 200 x 15,0', 200, 100, 4.3, 5.2],
    ['W 200 x 19,3', 203, 102, 5.8, 6.5],
    ['W 200 x 22,5', 206, 102, 6.2, 8.0],
    ['W 200 x 26,6', 207, 133, 5.8, 8.4],
    ['W 200 x 31,3', 210, 134, 6.4, 10.2],
    ['W 200 x 35,9 (H)', 201, 165, 6.2, 10.2],
    ['W 200 x 46,1 (H)', 203, 203, 7.2, 11.0],
    ['W 250 x 17,9', 251, 101, 4.8, 5.3],
    ['W 250 x 22,3', 254, 102, 5.8, 6.9],
    ['W 250 x 25,3', 257, 102, 6.1, 8.4],
    ['W 250 x 32,7', 258, 146, 6.1, 9.1],
    ['W 250 x 38,5', 262, 147, 6.6, 11.2],
    ['W 250 x 44,8', 266, 148, 7.6, 13.0],
    ['W 310 x 21,0', 303, 101, 5.1, 5.7],
    ['W 310 x 23,8', 305, 101, 5.6, 6.7],
    ['W 310 x 28,3', 309, 102, 6.0, 8.9],
    ['W 310 x 32,7', 313, 102, 6.6, 10.8],
    ['W 310 x 38,7', 310, 165, 5.8, 9.7],
    ['W 310 x 44,5', 313, 166, 6.6, 11.2],
    ['W 310 x 52,0', 317, 167, 7.6, 13.2],
    ['W 360 x 32,9', 349, 127, 5.8, 8.5],
    ['W 360 x 39,0', 353, 128, 6.5, 10.7],
    ['W 360 x 44,0', 352, 171, 6.9, 9.8],
    ['W 360 x 51,0', 355, 171, 7.2, 11.6],
    ['W 410 x 38,8', 399, 140, 6.4, 8.8],
    ['W 410 x 46,1', 403, 140, 7.0, 11.2],
    ['W 410 x 53,0', 403, 177, 7.5, 10.9],
    ['W 410 x 60,0', 407, 178, 7.7, 12.8],
    ['W 460 x 52,0', 450, 152, 7.6, 10.8],
    ['W 460 x 60,0', 455, 153, 8.0, 13.3],
    ['W 530 x 66,0', 525, 165, 8.9, 11.4],
    ['W 530 x 72,0', 524, 207, 9.0, 10.9],
    ['W 610 x 101,0', 603, 228, 10.5, 14.9],
  ].map(([nome, d, bf, tw, tf]) => ({ nome, d, bf, tw, tf }));

  const TIPOS = {
    I_LAMINADO: 'I_LAMINADO',
    I_SOLDADO: 'I_SOLDADO',
    U: 'U',
    TUBO_RET: 'TUBO_RET',
    TUBO_CIRC: 'TUBO_CIRC',
  };

  const NOMES_TIPOS = {
    I_LAMINADO: 'I / H laminado (catálogo W)',
    I_SOLDADO: 'I / H soldado (dimensões livres)',
    U: 'U laminado ou soldado',
    TUBO_RET: 'Tubo retangular ou quadrado',
    TUBO_CIRC: 'Tubo circular',
  };

  /** Propriedades de uma seção composta por retângulos {x0, x1, y0, y1}. */
  function propsRetangulos(rets) {
    let A = 0, Sx = 0, Sy = 0;
    for (const r of rets) {
      const a = (r.x1 - r.x0) * (r.y1 - r.y0);
      A += a;
      Sx += a * (r.y0 + r.y1) / 2;
      Sy += a * (r.x0 + r.x1) / 2;
    }
    const xc = Sy / A, yc = Sx / A;
    let Ix = 0, Iy = 0;
    for (const r of rets) {
      const b = r.x1 - r.x0, h = r.y1 - r.y0, a = b * h;
      Ix += b * h ** 3 / 12 + a * ((r.y0 + r.y1) / 2 - yc) ** 2;
      Iy += h * b ** 3 / 12 + a * ((r.x0 + r.x1) / 2 - xc) ** 2;
    }
    const Zx = moduloPlastico(rets.map(r => ({ s0: r.y0, s1: r.y1, w: r.x1 - r.x0 })), A);
    const Zy = moduloPlastico(rets.map(r => ({ s0: r.x0, s1: r.x1, w: r.y1 - r.y0 })), A);
    return { A, xc, yc, Ix, Iy, Zx, Zy };
  }

  /** Módulo plástico: faixas de largura w entre as coordenadas s0 e s1. */
  function moduloPlastico(faixas, A) {
    const areaAte = s => faixas.reduce((t, f) => t + f.w * Math.min(Math.max(s - f.s0, 0), f.s1 - f.s0), 0);
    let lo = Math.min(...faixas.map(f => f.s0)), hi = Math.max(...faixas.map(f => f.s1));
    for (let i = 0; i < 200; i++) {
      const m = (lo + hi) / 2;
      if (areaAte(m) < A / 2) lo = m; else hi = m;
    }
    const sp = (lo + hi) / 2;
    let Z = 0;
    for (const f of faixas) {
      const abaixo = [f.s0, Math.min(f.s1, sp)];
      const acima = [Math.max(f.s0, sp), f.s1];
      if (abaixo[1] > abaixo[0]) Z += f.w * (abaixo[1] - abaixo[0]) * (sp - (abaixo[0] + abaixo[1]) / 2);
      if (acima[1] > acima[0]) Z += f.w * (acima[1] - acima[0]) * ((acima[0] + acima[1]) / 2 - sp);
    }
    return Z;
  }

  function completar(s) {
    s.Wx = s.Ix / s.cx;
    s.Wy = s.Iy / s.cy;
    s.rx = Math.sqrt(s.Ix / s.A);
    s.ry = Math.sqrt(s.Iy / s.A);
    s.massa = s.A * 1e-6 * RHO_ACO; // kg/m
    return s;
  }

  function exigirPositivos(dados, campos) {
    for (const c of campos) {
      if (!(dados[c] > 0)) throw new Error(`Informe um valor positivo para a dimensão ${c} do perfil.`);
    }
  }

  function secaoI(dados, fabricacao) {
    exigirPositivos(dados, ['d', 'bf', 'tw', 'tf']);
    const { d, bf, tw, tf } = dados;
    if (2 * tf >= d) throw new Error('As mesas (2·tf) não cabem na altura d.');
    if (tw >= bf) throw new Error('A alma (tw) deve ser mais fina que a largura da mesa (bf).');
    const h = d - 2 * tf;
    const rets = [
      { x0: -bf / 2, x1: bf / 2, y0: 0, y1: tf },
      { x0: -tw / 2, x1: tw / 2, y0: tf, y1: d - tf },
      { x0: -bf / 2, x1: bf / 2, y0: d - tf, y1: d },
    ];
    const p = propsRetangulos(rets);
    const Iy = p.Iy;
    return completar({
      tipo: fabricacao === 'soldado' ? TIPOS.I_SOLDADO : TIPOS.I_LAMINADO,
      familia: 'I', fabricacao, d, bf, tw, tf, h,
      A: p.A, Ix: p.Ix, Iy, Zx: p.Zx, Zy: p.Zy,
      cx: d / 2, cy: bf / 2,
      J: (2 * bf * tf ** 3 + h * tw ** 3) / 3,
      Cw: Iy * (d - tf) ** 2 / 4,
      x0: 0, y0: 0,
      desenho: { retangulos: rets, largura: bf, altura: d, origemX: -bf / 2 },
    });
  }

  function secaoU(dados, fabricacao) {
    exigirPositivos(dados, ['d', 'bf', 'tw', 'tf']);
    const { d, bf, tw, tf } = dados;
    if (2 * tf >= d) throw new Error('As mesas (2·tf) não cabem na altura d.');
    if (tw >= bf) throw new Error('A alma (tw) deve ser mais fina que a largura da mesa (bf).');
    const h = d - 2 * tf;
    const rets = [
      { x0: 0, x1: tw, y0: 0, y1: d },
      { x0: tw, x1: bf, y0: 0, y1: tf },
      { x0: tw, x1: bf, y0: d - tf, y1: d },
    ];
    const p = propsRetangulos(rets);
    // Linha média para empenamento e centro de cisalhamento
    const b1 = bf - tw / 2, h1 = d - tf;
    const e = 3 * b1 ** 2 * tf / (6 * b1 * tf + h1 * tw); // centro de cisalhamento, a partir da linha média da alma
    const x0 = e + (p.xc - tw / 2); // distância entre centro de cisalhamento e centroide
    return completar({
      tipo: TIPOS.U, familia: 'U', fabricacao, d, bf, tw, tf, h,
      A: p.A, Ix: p.Ix, Iy: p.Iy, Zx: p.Zx, Zy: p.Zy,
      cx: d / 2, cy: Math.max(p.xc, bf - p.xc),
      xc: p.xc,
      J: (2 * bf * tf ** 3 + h * tw ** 3) / 3,
      Cw: tf * b1 ** 3 * h1 ** 2 / 12 * (3 * b1 * tf + 2 * h1 * tw) / (6 * b1 * tf + h1 * tw),
      x0, y0: 0,
      desenho: { retangulos: rets, largura: bf, altura: d, origemX: 0 },
    });
  }

  function secaoTuboRet(dados) {
    exigirPositivos(dados, ['H', 'B', 't']);
    const { H, B, t } = dados;
    if (2 * t >= Math.min(H, B)) throw new Error('A espessura t é grande demais para as dimensões do tubo.');
    const rets = [
      { x0: 0, x1: B, y0: 0, y1: t },
      { x0: 0, x1: B, y0: H - t, y1: H },
      { x0: 0, x1: t, y0: t, y1: H - t },
      { x0: B - t, x1: B, y0: t, y1: H - t },
    ];
    const p = propsRetangulos(rets);
    const Am = (B - t) * (H - t);
    const perimetro = 2 * ((B - t) + (H - t));
    return completar({
      tipo: TIPOS.TUBO_RET, familia: 'TR', fabricacao: 'tubo', H, B, t,
      d: H, bf: B,
      A: p.A, Ix: p.Ix, Iy: p.Iy, Zx: p.Zx, Zy: p.Zy,
      cx: H / 2, cy: B / 2,
      J: 4 * Am ** 2 * t / perimetro,
      Cw: 0, x0: 0, y0: 0,
      desenho: { retangulos: rets, largura: B, altura: H, origemX: 0 },
    });
  }

  function secaoTuboCirc(dados) {
    exigirPositivos(dados, ['D', 't']);
    const { D, t } = dados;
    if (2 * t >= D) throw new Error('A espessura t é grande demais para o diâmetro D.');
    const Di = D - 2 * t;
    const A = Math.PI * (D ** 2 - Di ** 2) / 4;
    const I = Math.PI * (D ** 4 - Di ** 4) / 64;
    const Z = (D ** 3 - Di ** 3) / 6;
    return completar({
      tipo: TIPOS.TUBO_CIRC, familia: 'TC', fabricacao: 'tubo', D, t,
      d: D, bf: D,
      A, Ix: I, Iy: I, Zx: Z, Zy: Z,
      cx: D / 2, cy: D / 2,
      J: 2 * I, Cw: 0, x0: 0, y0: 0,
      desenho: { circulo: { D, Di }, largura: D, altura: D },
    });
  }

  /** Cria a seção a partir da descrição salva no projeto. */
  function criarSecao(entrada) {
    // Os campos do formulário chegam como texto, possivelmente com vírgula decimal
    const perfil = { ...entrada };
    for (const k of ['d', 'bf', 'tw', 'tf', 'H', 'B', 't', 'D']) {
      if (perfil[k] !== undefined) perfil[k] = Number(String(perfil[k]).trim().replace(',', '.') || NaN);
    }
    switch (perfil.tipo) {
      case TIPOS.I_LAMINADO: {
        const item = CATALOGO_W.find(p => p.nome === perfil.catalogo) || CATALOGO_W[0];
        const s = secaoI(item, 'laminado');
        s.nome = item.nome;
        return s;
      }
      case TIPOS.I_SOLDADO: {
        const s = secaoI(perfil, 'soldado');
        s.nome = `I soldado ${perfil.d} x ${perfil.bf} x ${perfil.tw} x ${perfil.tf}`;
        return s;
      }
      case TIPOS.U: {
        const s = secaoU(perfil, perfil.fabricacao === 'soldado' ? 'soldado' : 'laminado');
        s.nome = `U ${perfil.d} x ${perfil.bf} x ${perfil.tw} x ${perfil.tf}`;
        return s;
      }
      case TIPOS.TUBO_RET: {
        const s = secaoTuboRet(perfil);
        s.nome = `Tubo ${perfil.H} x ${perfil.B} x ${perfil.t}`;
        return s;
      }
      case TIPOS.TUBO_CIRC: {
        const s = secaoTuboCirc(perfil);
        s.nome = `Tubo Ø ${perfil.D} x ${perfil.t}`;
        return s;
      }
      default:
        throw new Error('Tipo de perfil desconhecido.');
    }
  }

  PM.secoes = { TIPOS, NOMES_TIPOS, CATALOGO_W, criarSecao, propsRetangulos, secaoI, secaoU, secaoTuboRet, secaoTuboCirc };
})();

if (typeof module !== 'undefined') module.exports = PM;
