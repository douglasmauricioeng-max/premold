/* Testes do motor de cálculo. Execute com: node testes/testes.js */
const assert = require('assert');
const PM = require('../js/secoes.js');
require('../js/analise.js'); require('../js/nbr8800.js'); require('../js/calculo.js');

const perto = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${msg}: ${a} ≠ ${b}`);
const maxAbs = (r, k) => Math.max(...r.estacoes.map(e => Math.abs(e[k])));
const EI = 1e4, EA = 1e6;
const an = (L, apoios, cargas) => PM.analise.analisar({ L, apoios, cargas, EIv: EI, EIh: EI, EA });

// Viga biapoiada com carga uniforme
let r = an(6, [{ x: 0, tipo: 'fixo' }, { x: 6, tipo: 'movel' }], [{ tipo: 'distribuida', plano: 'v', a: 0, b: 6, q1: 10, q2: 10 }]);
perto(maxAbs(r, 'Mv'), 45, 1e-6, 'M biapoiada'); perto(maxAbs(r, 'Vv'), 30, 1e-6, 'V biapoiada');
perto(Math.max(...r.dv), 5 * 10 * 6 ** 4 / (384 * EI), 1e-6, 'flecha biapoiada');

// Balanço com carga na ponta
r = an(3, [{ x: 0, tipo: 'engaste' }], [{ tipo: 'pontual', plano: 'v', x: 3, P: 10 }]);
perto(r.estacoes[0].Mv, -30, 1e-6, 'M balanço'); perto(r.dv.at(-1), 10 * 27 / (3 * EI), 1e-6, 'flecha balanço');

// Biengastada (plano horizontal)
r = an(6, [{ x: 0, tipo: 'engaste' }, { x: 6, tipo: 'engaste' }], [{ tipo: 'distribuida', plano: 'h', a: 0, b: 6, q1: 10, q2: 10 }]);
perto(r.estacoes[0].Mh, -30, 1e-6, 'M engaste'); perto(r.estacoes.find(e => e.x === 3).Mh, 15, 1e-6, 'M meio biengastada');

// Contínua de dois vãos: reação central 5qL/4 (L = vão)
r = an(8, [{ x: 0, tipo: 'fixo' }, { x: 4, tipo: 'movel' }, { x: 8, tipo: 'movel' }], [{ tipo: 'distribuida', plano: 'v', a: 0, b: 8, q1: 10, q2: 10 }]);
perto(-r.reacoes.v.find(x => x.x === 4).F, 5 * 10 * 4 / 4, 1e-6, 'reação contínua');

// Carga axial
r = an(5, [{ x: 0, tipo: 'fixo' }, { x: 5, tipo: 'movel' }], [{ tipo: 'axial', x: 5, P: -40 }]);
perto(r.estacoes[1].N, -40, 1e-9, 'N compressão');
assert.throws(() => an(5, [{ x: 0, tipo: 'movel' }, { x: 5, tipo: 'movel' }], [{ tipo: 'axial', x: 5, P: -40 }]), /axial/);
assert.throws(() => an(5, [{ x: 0, tipo: 'fixo' }], [{ tipo: 'pontual', plano: 'v', x: 3, P: 1 }]), /instável/);

// NBR 8800: W 310 x 38,7, A572 Gr. 50
const N = PM.nbr8800, s = PM.secoes.criarSecao({ tipo: 'I_LAMINADO', catalogo: 'W 310 x 38,7' }), m = { fy: 345, fu: 450 };
perto(N.flexao(s, m, 'x', { Lb: 0, Cb: 1 }).MRd, s.Zx * 345 / 1.1 / 1e6, 1e-9, 'MRd contida');
const f3 = N.flexao(s, m, 'x', { Lb: 3000, Cb: 1 });
assert.strictEqual(f3.governa, 'FLT');
perto(N.cortante(s, m, 'v').VRd, 0.6 * s.d * s.tw * 345 / 1.1 / 1e3, 1e-9, 'VRd compacta');
const c = N.compressao(s, m, { KxLx: 3000, KyLy: 3000, KzLz: 3000 });
assert.ok(c.Q < 1 && c.chi > 0.6 && c.chi < 0.7, 'compressão W310');
perto(N.calcularCb(1, 1, 1, 1), 1, 1e-12, 'Cb uniforme');
perto(N.calcularCb(1, 0.75, 1, 0.75), 1.136, 1e-3, 'Cb parabólico');

// Projeto completo com todos os tipos de perfil
const base = tipo => ({
  perfil: { tipo, catalogo: 'W 250 x 32,7', d: '300', bf: '150', tw: '6.3', tf: '9.5', H: '150', B: '100', t: '6.3', D: '168.3' },
  material: { fy: '250', fu: '400' },
  barra: { L: '4', apoios: [{ x: '0', tipo: 'engaste', lateral: true }], contencoes: '', KxLx: '8', KyLy: '8', KzLz: '8', Cb: '', AeAg: '1', a: '', flechaLim: '250', pesoProprio: true },
  cargas: [{ tipo: 'pontual', plano: 'v', cat: 'Q', x: '4', P: '5' }, { tipo: 'axial', cat: 'G', x: '4', P: '-20' }, { tipo: 'pontual', plano: 'h', cat: 'W', x: '4', P: '1' }],
  coef: { gg: 1.4, ggFav: 1, gq: 1.5, gw: 1.4, psi0q: 0.7, psi0w: 0.6, psi1q: 0.4, psi1w: 0.3 },
});
for (const tipo of Object.keys(PM.secoes.NOMES_TIPOS)) {
  const res = PM.calculo.calcular(base(tipo));
  assert.ok(res.verificacoes.length >= 5, tipo);
  assert.ok(res.verificacoes.every(v => v.ratio >= 0), tipo);
}
console.log('Todos os testes passaram.');
