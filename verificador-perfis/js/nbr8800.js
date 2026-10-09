/*
 * Forças e momentos resistentes de cálculo segundo a ABNT NBR 8800:2008.
 * Unidades internas: N, mm, MPa. Os resultados saem em kN e kN·m.
 * Cada função devolve também os passos do cálculo para o memorial.
 */
var PM = globalThis.PM || (globalThis.PM = {});

(function () {
  'use strict';

  const E = 200000; // MPa
  const G = 77000;  // MPa
  const GA1 = 1.10, GA2 = 1.35;

  const fmt = (v, casas = 2) => {
    if (!Number.isFinite(v)) return '—';
    return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  };

  const kc = s => Math.min(0.76, Math.max(0.35, 4 / Math.sqrt(s.h / s.tw)));

  /** Interpolação linear entre Mpl (λp) e Mr (λr), com o valor crítico acima de λr. */
  function estadoLimite(nome, lambda, lp, lr, Mpl, Mr, McrFn, Cb = 1) {
    let MRk, faixa;
    if (lambda <= lp) { MRk = Mpl; faixa = 'compacta (λ ≤ λp)'; }
    else if (lambda <= lr) { MRk = Math.min(Mpl, Cb * (Mpl - (Mpl - Mr) * (lambda - lp) / (lr - lp))); faixa = 'semicompacta (λp < λ ≤ λr)'; }
    else if (McrFn) { MRk = Math.min(Mpl, McrFn(lambda)); faixa = 'esbelta (λ > λr)'; }
    else { MRk = NaN; faixa = 'esbelta (λ > λr): fora do escopo, ver Anexo H'; }
    return { nome, lambda, lp, lr, MRk, faixa };
  }

  // ---------------------------------------------------------------- Q (Anexo F)

  function larguraEfetiva(b, t, fy, ca) {
    const raiz = Math.sqrt(E / fy);
    return Math.min(b, 1.92 * t * raiz * (1 - ca / (b / t) * raiz));
  }

  function fatorQ(s, fy) {
    const passos = [];
    const raiz = Math.sqrt(E / fy);
    let Qs = 1, Qa = 1;

    if (s.familia === 'TC') {
      const Dt = s.D / s.t;
      let Q;
      if (Dt <= 0.11 * E / fy) Q = 1;
      else if (Dt <= 0.45 * E / fy) Q = 0.038 * E / (fy * Dt) + 2 / 3;
      else throw new Error(`D/t = ${fmt(Dt, 1)} excede 0,45·E/fy = ${fmt(0.45 * E / fy, 1)}. A NBR 8800 não cobre tubos tão esbeltos.`);
      passos.push(`D/t = ${fmt(Dt, 1)}; limite sem flambagem local 0,11·E/fy = ${fmt(0.11 * E / fy, 1)} → Q = ${fmt(Q, 3)}`);
      return { Q, Qs: 1, Qa: Q, passos };
    }

    if (s.familia === 'I' || s.familia === 'U') {
      const b = s.familia === 'I' ? s.bf / 2 : s.bf;
      const bt = b / s.tf;
      if (s.fabricacao === 'soldado') {
        const k = kc(s);
        const lim = 0.64 * Math.sqrt(E / (fy / k)), lim2 = 1.17 * Math.sqrt(E / (fy / k));
        if (bt > lim) Qs = bt <= lim2 ? 1.415 - 0.65 * bt * Math.sqrt(fy / (k * E)) : 0.90 * E * k / (fy * bt ** 2);
        passos.push(`Mesa (AL, grupo 5): b/t = ${fmt(bt, 2)}; kc = ${fmt(k, 3)}; limite = ${fmt(lim, 2)} → Qs = ${fmt(Qs, 3)}`);
      } else {
        const lim = 0.56 * raiz, lim2 = 1.03 * raiz;
        if (bt > lim) Qs = bt <= lim2 ? 1.415 - 0.74 * bt * Math.sqrt(fy / E) : 0.69 * E / (fy * bt ** 2);
        passos.push(`Mesa (AL, grupo 4): b/t = ${fmt(bt, 2)}; limite = ${fmt(lim, 2)} → Qs = ${fmt(Qs, 3)}`);
      }
      const ht = s.h / s.tw, lim = 1.49 * raiz;
      if (ht > lim) {
        const bef = larguraEfetiva(s.h, s.tw, fy, 0.34);
        Qa = (s.A - (s.h - bef) * s.tw) / s.A;
        passos.push(`Alma (AA): h/tw = ${fmt(ht, 2)} > ${fmt(lim, 2)}; bef = ${fmt(bef, 1)} mm (σ = fy) → Qa = ${fmt(Qa, 3)}`);
      } else {
        passos.push(`Alma (AA): h/tw = ${fmt(ht, 2)} ≤ ${fmt(lim, 2)} → Qa = 1,000`);
      }
    } else if (s.familia === 'TR') {
      const lim = 1.40 * raiz;
      let perda = 0;
      for (const [nome, dim] of [['Paredes de altura H', s.H], ['Paredes de largura B', s.B]]) {
        const b = dim - 3 * s.t, bt = b / s.t;
        if (bt > lim) {
          const bef = larguraEfetiva(b, s.t, fy, 0.38);
          perda += 2 * (b - bef) * s.t;
          passos.push(`${nome} (AA): b/t = ${fmt(bt, 2)} > ${fmt(lim, 2)}; bef = ${fmt(bef, 1)} mm`);
        } else {
          passos.push(`${nome} (AA): b/t = ${fmt(bt, 2)} ≤ ${fmt(lim, 2)}`);
        }
      }
      Qa = (s.A - perda) / s.A;
      passos.push(`Qa = ${fmt(Qa, 3)}`);
    }
    const Q = Qs * Qa;
    passos.push(`Q = Qs·Qa = ${fmt(Q, 3)}`);
    return { Q, Qs, Qa, passos };
  }

  // --------------------------------------------------------- Tração (5.2)

  function tracao(s, mat, { L, AeAg = 1 }) {
    const N1 = s.A * mat.fy / GA1;
    const N2 = AeAg * s.A * mat.fu / GA2;
    const NRd = Math.min(N1, N2);
    const esbeltez = L / Math.min(s.rx, s.ry);
    return {
      NRd: NRd / 1e3,
      esbeltez,
      passos: [
        `Escoamento da seção bruta: Ag·fy/γa1 = ${fmt(s.A, 0)} × ${fmt(mat.fy, 0)} / 1,10 = ${fmt(N1 / 1e3)} kN`,
        `Ruptura da seção líquida: Ae·fu/γa2 = ${fmt(AeAg, 2)} × ${fmt(s.A, 0)} × ${fmt(mat.fu, 0)} / 1,35 = ${fmt(N2 / 1e3)} kN`,
        `Nt,Rd = ${fmt(NRd / 1e3)} kN`,
        `Esbeltez L/r = ${fmt(esbeltez, 0)} (recomendado ≤ 300)`,
      ],
    };
  }

  // ----------------------------------------------------- Compressão (5.3)

  function compressao(s, mat, { KxLx, KyLy, KzLz }) {
    const fy = mat.fy;
    const q = fatorQ(s, fy);
    const passos = [...q.passos];
    const Nex = Math.PI ** 2 * E * s.Ix / KxLx ** 2;
    const Ney = Math.PI ** 2 * E * s.Iy / KyLy ** 2;
    passos.push(`Nex = π²·E·Ix/(KxLx)² = ${fmt(Nex / 1e3)} kN; Ney = π²·E·Iy/(KyLy)² = ${fmt(Ney / 1e3)} kN`);
    let Ne = Math.min(Nex, Ney), modo = Nex < Ney ? 'flexão em torno de x' : 'flexão em torno de y';
    if (s.familia === 'I' || s.familia === 'U') {
      const r02 = s.rx ** 2 + s.ry ** 2 + s.x0 ** 2 + s.y0 ** 2;
      const Nez = (Math.PI ** 2 * E * s.Cw / KzLz ** 2 + G * s.J) / r02;
      passos.push(`Nez = [π²·E·Cw/(KzLz)² + G·J]/r0² = ${fmt(Nez / 1e3)} kN (r0 = ${fmt(Math.sqrt(r02), 1)} mm)`);
      if (s.familia === 'I') {
        if (Nez < Ne) { Ne = Nez; modo = 'torção'; }
      } else {
        const a = 1 - s.x0 ** 2 / r02;
        const Nexz = (Nex + Nez) / (2 * a) * (1 - Math.sqrt(1 - 4 * Nex * Nez * a / (Nex + Nez) ** 2));
        passos.push(`Flexo-torção (U, simetria em x): Nexz = ${fmt(Nexz / 1e3)} kN (x0 = ${fmt(s.x0, 1)} mm)`);
        Ne = Math.min(Ney, Nexz);
        modo = Ney < Nexz ? 'flexão em torno de y' : 'flexo-torção';
      }
    }
    const l0 = Math.sqrt(q.Q * s.A * fy / Ne);
    const chi = l0 <= 1.5 ? 0.658 ** (l0 ** 2) : 0.877 / l0 ** 2;
    const NRd = chi * q.Q * s.A * fy / GA1;
    const esbeltez = Math.max(KxLx / s.rx, KyLy / s.ry);
    passos.push(
      `Ne = ${fmt(Ne / 1e3)} kN (${modo})`,
      `λ0 = √(Q·Ag·fy/Ne) = ${fmt(l0, 3)} → χ = ${fmt(chi, 3)}`,
      `Nc,Rd = χ·Q·Ag·fy/γa1 = ${fmt(NRd / 1e3)} kN`,
      `Esbeltez KL/r = ${fmt(esbeltez, 0)} (limite 200)`,
    );
    return { NRd: NRd / 1e3, Q: q.Q, chi, lambda0: l0, Ne: Ne / 1e3, Nex: Nex / 1e3, Ney: Ney / 1e3, esbeltez, passos };
  }

  // ---------------------------------------------------- Cisalhamento (5.4.3)

  /** eixo 'v' = força cortante no plano vertical (paralela à alma); 'h' = plano horizontal. */
  function cortante(s, mat, eixo, { a = 0, Lv = 0 } = {}) {
    const fy = mat.fy;
    if (s.familia === 'TC') {
      const Dt = s.D / s.t;
      const t1 = 1.60 * E / (Math.sqrt(Lv / s.D) * Dt ** 1.25);
      const t2 = 0.78 * E / Dt ** 1.5;
      const tcr = Math.min(0.60 * fy, Math.max(t1, t2));
      const VRd = 0.5 * tcr * s.A / GA1;
      return {
        VRd: VRd / 1e3,
        passos: [`τcr = ${fmt(tcr, 1)} MPa (Lv = ${fmt(Lv, 0)} mm); VRd = 0,5·τcr·Ag/γa1 = ${fmt(VRd / 1e3)} kN`],
      };
    }
    let Aw, lambda, kv = 5, desc;
    if (eixo === 'v') {
      if (s.familia === 'TR') {
        const h = s.H - 3 * s.t;
        Aw = 2 * h * s.t; lambda = h / s.t; desc = '2·h·t';
      } else {
        Aw = s.d * s.tw; lambda = s.h / s.tw; desc = 'd·tw';
        if (a > 0) {
          const ah = a / s.h;
          if (ah <= 3 && ah <= (260 / lambda) ** 2) kv = 5 + 5 / ah ** 2;
        }
      }
    } else {
      if (s.familia === 'TR') {
        const h = s.B - 3 * s.t;
        Aw = 2 * h * s.t; lambda = h / s.t; desc = '2·b·t';
      } else {
        Aw = 2 * s.bf * s.tf; kv = 1.2; desc = '2·bf·tf';
        lambda = s.familia === 'I' ? s.bf / (2 * s.tf) : s.bf / s.tf;
      }
    }
    const lp = 1.10 * Math.sqrt(kv * E / fy), lr = 1.37 * Math.sqrt(kv * E / fy);
    const Vpl = 0.60 * Aw * fy;
    let VRd;
    if (lambda <= lp) VRd = Vpl / GA1;
    else if (lambda <= lr) VRd = lp / lambda * Vpl / GA1;
    else VRd = 1.24 * (lp / lambda) ** 2 * Vpl / GA1;
    return {
      VRd: VRd / 1e3,
      passos: [
        `Aw = ${desc} = ${fmt(Aw, 0)} mm²; kv = ${fmt(kv, 2)}; λ = ${fmt(lambda, 2)}; λp = ${fmt(lp, 2)}; λr = ${fmt(lr, 2)}`,
        `Vpl = 0,60·Aw·fy = ${fmt(Vpl / 1e3)} kN → VRd = ${fmt(VRd / 1e3)} kN`,
      ],
    };
  }

  // ----------------------------------------------------- Flexão (Anexo G)

  /** Lb em mm. eixo 'x' (plano vertical) ou 'y' (plano horizontal). */
  function flexao(s, mat, eixo, { Lb, Cb = 1 }) {
    const fy = mat.fy, sr = 0.3 * fy;
    const raiz = Math.sqrt(E / fy);
    const W = eixo === 'x' ? s.Wx : s.Wy;
    const Z = eixo === 'x' ? s.Zx : s.Zy;
    const Mpl = Z * fy;
    const estados = [];

    if (s.familia === 'I' || s.familia === 'U') {
      const bt = s.familia === 'I' ? s.bf / (2 * s.tf) : s.bf / s.tf;
      const soldado = s.fabricacao === 'soldado';
      const k = kc(s);
      const Mr = (fy - sr) * W;
      const lr = soldado ? 0.95 * Math.sqrt(E / ((fy - sr) / k)) : 0.83 * Math.sqrt(E / (fy - sr));
      const McrFLM = l => (soldado ? 0.90 * E * k : 0.69 * E) * W / l ** 2;
      if (eixo === 'x') {
        if (Lb > 0) {
          const b1 = (fy - sr) * W / (E * s.J);
          const lrFLT = 1.38 * Math.sqrt(s.Iy * s.J) / (s.ry * s.J * b1) * Math.sqrt(1 + Math.sqrt(1 + 27 * s.Cw * b1 ** 2 / s.Iy));
          const Mcr = () => Cb * Math.PI ** 2 * E * s.Iy / Lb ** 2 * Math.sqrt(s.Cw / s.Iy * (1 + 0.039 * s.J * Lb ** 2 / s.Cw));
          estados.push(estadoLimite('FLT', Lb / s.ry, 1.76 * raiz, lrFLT, Mpl, Mr, Mcr, Cb));
        }
        estados.push(estadoLimite('FLM', bt, 0.38 * raiz, lr, Mpl, Mr, McrFLM));
        estados.push(estadoLimite('FLA', s.h / s.tw, 3.76 * raiz, 5.70 * raiz, Mpl, fy * W, null));
      } else {
        estados.push(estadoLimite('FLM', bt, 0.38 * raiz, lr, Mpl, Mr, McrFLM));
      }
    } else if (s.familia === 'TR') {
      // Paredes paralelas ao eixo de flexão = mesas; perpendiculares = almas
      const hAlma = (eixo === 'x' ? s.H : s.B) - 3 * s.t;
      const bMesa = (eixo === 'x' ? s.B : s.H) - 3 * s.t;
      const Wef = moduloEfetivoTubo(s, eixo, fy);
      const maior = eixo === 'x' ? s.Ix > s.Iy : s.Iy > s.Ix;
      if (maior && Lb > 0) {
        const r = eixo === 'x' ? s.ry : s.rx;
        const raizJA = Math.sqrt(s.J * s.A);
        const Mr = (fy - sr) * W;
        estados.push(estadoLimite('FLT', Lb / r, 0.13 * E * raizJA / Mpl, 2.00 * E * raizJA / Mr, Mpl, Mr,
          l => 2.00 * Cb * E * raizJA / l, Cb));
      }
      estados.push(estadoLimite('FLM', bMesa / s.t, 1.12 * raiz, 1.40 * raiz, Mpl, fy * Wef, () => fy * Wef ** 2 / W));
      estados.push(estadoLimite('FLA', hAlma / s.t, 2.42 * raiz, 5.70 * raiz, Mpl, fy * W, null));
    } else if (s.familia === 'TC') {
      const Dt = s.D / s.t;
      const lp = 0.07 * E / fy, lr = 0.31 * E / fy;
      let MRk, faixa;
      if (Dt > 0.45 * E / fy) { MRk = NaN; faixa = 'D/t acima de 0,45·E/fy: fora do escopo da norma'; }
      else if (Dt <= lp) { MRk = Mpl; faixa = 'compacta (λ ≤ λp)'; }
      else if (Dt <= lr) { MRk = (0.021 * E / Dt + fy) * W; faixa = 'semicompacta (λp < λ ≤ λr)'; }
      else { MRk = 0.33 * E / Dt * W; faixa = 'esbelta (λ > λr)'; }
      estados.push({ nome: 'FLL', lambda: Dt, lp, lr, MRk: Math.min(MRk, Mpl), faixa });
    }

    // O menor MRk governa; um estado fora do escopo (NaN) prevalece sobre os demais
    const governante = estados.find(e => !Number.isFinite(e.MRk)) ||
      estados.reduce((m, e) => (e.MRk < m.MRk ? e : m));
    const limite = 1.5 * W * fy;
    const MRk = Math.min(governante.MRk, limite);
    const MRd = MRk / GA1;
    const passos = [
      `Mpl = Z·fy = ${fmt(Z, 0)} × ${fmt(fy, 0)} = ${fmt(Mpl / 1e6)} kN·m; limite 1,5·W·fy = ${fmt(limite / 1e6)} kN·m`,
      ...estados.map(e => `${e.nome}: λ = ${fmt(e.lambda, 2)}; λp = ${fmt(e.lp, 2)}; λr = ${fmt(e.lr, 2)}; ${e.faixa} → MRk = ${fmt(e.MRk / 1e6)} kN·m`),
      `MRd = ${fmt(MRk / 1e6)} / 1,10 = ${fmt(MRd / 1e6)} kN·m${Number.isFinite(MRd) ? '' : ' (seção fora do escopo)'}`,
    ];
    if (estados.some(e => e.nome === 'FLT')) passos.splice(1, 0, `Lb = ${fmt(Lb / 1e3)} m; Cb = ${fmt(Cb, 2)}`);
    return { MRd: MRd / 1e6, estados, passos, governa: governante.nome };
  }

  /** Módulo resistente elástico da seção efetiva do tubo retangular (mesa comprimida com bef). */
  function moduloEfetivoTubo(s, eixo, fy) {
    const H = eixo === 'x' ? s.H : s.B;
    const B = eixo === 'x' ? s.B : s.H;
    const t = s.t;
    const b = B - 3 * t;
    const bef = larguraEfetiva(b, t, fy, 0.38);
    const perda = b - bef;
    const rets = [
      { x0: 0, x1: B, y0: 0, y1: t },
      { x0: 0, x1: t, y0: t, y1: H - t },
      { x0: B - t, x1: B, y0: t, y1: H - t },
    ];
    if (perda > 0) {
      const meio = B / 2;
      rets.push({ x0: 0, x1: meio - perda / 2, y0: H - t, y1: H }, { x0: meio + perda / 2, x1: B, y0: H - t, y1: H });
    } else {
      rets.push({ x0: 0, x1: B, y0: H - t, y1: H });
    }
    const p = PM.secoes.propsRetangulos(rets);
    return p.Ix / (H - p.yc);
  }

  /** Cb (5.4.2.3) com Rm = 1. Momentos em valor absoluto. */
  function calcularCb(Mmax, MA, MB, MC) {
    if (!(Mmax > 1e-9)) return 1;
    return Math.min(3, 12.5 * Mmax / (2.5 * Mmax + 3 * MA + 4 * MB + 3 * MC));
  }

  /** Interação de esforços (5.5.1.2). N em valor absoluto. */
  function interacao(N, NRd, Mx, MxRd, My, MyRd) {
    const n = Math.abs(N) / NRd;
    const m = Math.abs(Mx) / MxRd + Math.abs(My) / MyRd;
    return n >= 0.2 ? n + 8 / 9 * m : n / 2 + m;
  }

  PM.nbr8800 = { E, G, GA1, GA2, fmt, fatorQ, tracao, compressao, cortante, flexao, calcularCb, interacao };
})();

if (typeof module !== 'undefined') module.exports = PM;
