/*
 * Desenhos em SVG: seção transversal, esquema da barra e diagramas de esforços.
 * As cores vêm das variáveis CSS da página, para funcionar nos temas claro e escuro.
 */
var PM = globalThis.PM || (globalThis.PM = {});

(function () {
  'use strict';

  const fmt = (v, c = 2) => PM.nbr8800.fmt(v, c);
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  function secao(sec) {
    const T = 150, m = 26;
    const d = sec.desenho;
    const k = Math.min((T - 2 * m) / d.largura, (T - 2 * m) / d.altura);
    const W = d.largura * k, H = d.altura * k;
    const ox = (T - W) / 2, oy = (T - H) / 2;
    let corpo = '';
    if (d.circulo) {
      const R = d.circulo.D / 2 * k, r = d.circulo.Di / 2 * k, cx = T / 2, cy = T / 2;
      corpo = `<path fill-rule="evenodd" class="sec-aco" d="M${cx - R},${cy}a${R},${R} 0 1,0 ${2 * R},0a${R},${R} 0 1,0 ${-2 * R},0zM${cx - r},${cy}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0z"/>`;
    } else {
      for (const r of d.retangulos) {
        const x = ox + (r.x0 - d.origemX) * k;
        const y = oy + (d.altura - r.y1) * k;
        corpo += `<rect class="sec-aco" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${((r.x1 - r.x0) * k).toFixed(2)}" height="${((r.y1 - r.y0) * k).toFixed(2)}"/>`;
      }
    }
    const eixos = `<line class="sec-eixo" x1="${ox - 12}" y1="${T / 2}" x2="${ox + W + 12}" y2="${T / 2}"/>
      <text class="sec-rot" x="${ox + W + 14}" y="${T / 2 + 4}">x</text>
      <line class="sec-eixo" x1="${T / 2}" y1="${oy - 12}" x2="${T / 2}" y2="${oy + H + 12}"/>
      <text class="sec-rot" x="${T / 2 + 4}" y="${oy - 4}">y</text>`;
    const cotas = `<text class="sec-cota" x="${T / 2}" y="${T - 4}" text-anchor="middle">${fmt(d.largura, 1)}</text>
      <text class="sec-cota" x="8" y="${T / 2}" text-anchor="middle" transform="rotate(-90 8 ${T / 2})">${fmt(d.altura, 1)}</text>`;
    return `<svg viewBox="0 0 ${T} ${T}" role="img" aria-label="Seção transversal ${esc(sec.nome)}">${corpo}${eixos}${cotas}</svg>`;
  }

  /** Esquema da barra com apoios, contenções laterais e cargas (valores característicos). */
  function modelo({ L, apoios, cargas, contencoes }) {
    const W = 720, ml = 64, mr = 64;
    const X = x => ml + x / L * (W - ml - mr);
    const distrib = cargas.filter(c => c.tipo === 'distribuida');
    const faixa = 42;
    const temPontual = cargas.some(c => c.tipo === 'pontual');
    const yV = 30 + (temPontual ? 56 : 0) + distrib.length * faixa + 6;
    const H = yV + 92;
    let s = '';

    // Cargas distribuídas, uma faixa por carga
    const qMax = Math.max(1e-9, ...distrib.map(c => Math.max(Math.abs(c.q1), Math.abs(c.q2))));
    distrib.forEach((c, i) => {
      const base = yV - 4 - i * faixa;
      const alt = q => Math.max(3, Math.abs(q) / qMax * (faixa - 20));
      const x1 = X(c.a), x2 = X(c.b);
      const cls = `carga cat-${c.cat}${c.plano === 'h' ? ' plano-h' : ''}`;
      s += `<path class="${cls} area" d="M${x1},${base}L${x1},${base - alt(c.q1)}L${x2},${base - alt(c.q2)}L${x2},${base}Z"/>`;
      const n = Math.max(2, Math.round((x2 - x1) / 22));
      for (let k = 0; k <= n; k++) {
        const x = x1 + (x2 - x1) * k / n;
        const q = c.q1 + (c.q2 - c.q1) * k / n;
        const topo = base - alt(q);
        s += q >= 0
          ? `<line class="${cls}" x1="${x}" y1="${topo}" x2="${x}" y2="${base - 1}" marker-end="url(#seta-${c.cat})"/>`
          : `<line class="${cls}" x1="${x}" y1="${base}" x2="${x}" y2="${topo + 1}" marker-end="url(#seta-${c.cat})"/>`;
      }
      const rot = c.q1 === c.q2 ? `${fmt(c.q1)} kN/m` : `${fmt(c.q1)} → ${fmt(c.q2)} kN/m`;
      s += `<text class="rot-carga cat-${c.cat}" x="${(x1 + x2) / 2}" y="${base - Math.max(alt(c.q1), alt(c.q2)) - 3}" text-anchor="middle">${rot} ${c.cat}${c.plano === 'h' ? ' · horiz.' : ''}${c.automatica ? ' · peso próprio' : ''}</text>`;
    });

    // Cargas concentradas
    const topoPont = yV - distrib.length * faixa - 50;
    for (const c of cargas.filter(c => c.tipo === 'pontual')) {
      const x = X(c.x);
      const cls = `carga cat-${c.cat}${c.plano === 'h' ? ' plano-h' : ''}`;
      s += c.P >= 0
        ? `<line class="${cls} forte" x1="${x}" y1="${topoPont}" x2="${x}" y2="${yV - 2}" marker-end="url(#seta-${c.cat})"/>`
        : `<line class="${cls} forte" x1="${x}" y1="${yV - 2}" x2="${x}" y2="${topoPont}" marker-end="url(#seta-${c.cat})"/>`;
      s += `<text class="rot-carga cat-${c.cat}" x="${x}" y="${topoPont - 5}" text-anchor="middle">${fmt(c.P)} kN ${c.cat}${c.plano === 'h' ? ' · horiz.' : ''}</text>`;
    }
    // Momentos concentrados (positivo = horário)
    for (const c of cargas.filter(c => c.tipo === 'momento')) {
      const x = X(c.x), r = 15;
      const cls = `carga cat-${c.cat}`;
      s += c.M >= 0
        ? `<path class="${cls} forte" fill="none" d="M${x - r},${yV}A${r},${r} 0 0,1 ${x + r},${yV}" marker-end="url(#seta-${c.cat})"/>`
        : `<path class="${cls} forte" fill="none" d="M${x + r},${yV}A${r},${r} 0 0,0 ${x - r},${yV}" marker-end="url(#seta-${c.cat})"/>`;
      s += `<text class="rot-carga cat-${c.cat}" x="${x}" y="${yV + 38}" text-anchor="middle">${fmt(c.M)} kN·m ${c.cat}${c.plano === 'h' ? ' · horiz.' : ''}</text>`;
    }
    // Cargas axiais
    for (const c of cargas.filter(c => c.tipo === 'axial')) {
      const x = X(c.x), comp = 34;
      const fora = c.x > L / 2 ? 1 : -1; // desenha do lado de fora da barra
      const cls = `carga cat-${c.cat} forte`;
      const xa = x + fora * 6, xb = x + fora * (6 + comp);
      s += c.P * fora < 0
        ? `<line class="${cls}" x1="${xb}" y1="${yV}" x2="${xa}" y2="${yV}" marker-end="url(#seta-${c.cat})"/>`
        : `<line class="${cls}" x1="${xa}" y1="${yV}" x2="${xb}" y2="${yV}" marker-end="url(#seta-${c.cat})"/>`;
      s += `<text class="rot-carga cat-${c.cat}" x="${(xa + xb) / 2}" y="${yV + 16}" text-anchor="middle">${fmt(c.P)} kN</text>`;
    }

    // Barra
    s += `<line class="barra" x1="${X(0)}" y1="${yV}" x2="${X(L)}" y2="${yV}"/>`;

    // Contenções laterais
    for (const x of contencoes) {
      s += `<rect class="contencao" x="${X(x) - 4}" y="${yV - 4}" width="8" height="8" transform="rotate(45 ${X(x)} ${yV})"/>`;
    }

    // Apoios
    for (const a of apoios) {
      const x = X(a.x);
      if (a.tipo === 'engaste') {
        const lado = a.x <= 1e-9 ? -1 : (a.x >= L - 1e-9 ? 1 : 0);
        if (lado) {
          s += `<line class="apoio" x1="${x}" y1="${yV - 18}" x2="${x}" y2="${yV + 18}"/>`;
          for (let k = -16; k <= 16; k += 6) s += `<line class="hachura" x1="${x}" y1="${yV + k}" x2="${x + lado * 7}" y2="${yV + k - 6}"/>`;
        } else {
          s += `<rect class="apoio cheio" x="${x - 7}" y="${yV}" width="14" height="14"/>`;
        }
      } else {
        s += `<path class="apoio" d="M${x},${yV + 2}L${x - 9},${yV + 18}L${x + 9},${yV + 18}Z"/>`;
        if (a.tipo === 'movel') {
          s += `<circle class="apoio" cx="${x - 5}" cy="${yV + 22}" r="3"/><circle class="apoio" cx="${x + 5}" cy="${yV + 22}" r="3"/>`;
          s += `<line class="apoio" x1="${x - 12}" y1="${yV + 26}" x2="${x + 12}" y2="${yV + 26}"/>`;
        } else {
          s += `<line class="apoio" x1="${x - 12}" y1="${yV + 18}" x2="${x + 12}" y2="${yV + 18}"/>`;
          for (let k = -10; k <= 10; k += 5) s += `<line class="hachura" x1="${x + k}" y1="${yV + 18}" x2="${x + k - 4}" y2="${yV + 24}"/>`;
        }
      }
    }

    // Cotas
    const yC = yV + 50;
    const marcas = [...new Set([0, L, ...apoios.map(a => a.x)])].sort((a, b) => a - b);
    s += `<line class="cota" x1="${X(0)}" y1="${yC}" x2="${X(L)}" y2="${yC}"/>`;
    marcas.forEach((m, i) => {
      s += `<line class="cota" x1="${X(m)}" y1="${yC - 5}" x2="${X(m)}" y2="${yC + 5}"/>`;
      if (i > 0) s += `<text class="rot-cota" x="${(X(marcas[i - 1]) + X(m)) / 2}" y="${yC - 6}" text-anchor="middle">${fmt(m - marcas[i - 1])} m</text>`;
    });
    s += `<text class="rot-cota forte" x="${(X(0) + X(L)) / 2}" y="${yC + 20}" text-anchor="middle">L = ${fmt(L)} m</text>`;

    const defs = `<defs>${['G', 'Q', 'W'].map(c => `<marker id="seta-${c}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0L10,5L0,10z" class="ponta cat-${c}"/></marker>`).join('')}</defs>`;
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Esquema da barra com apoios e cargas">${defs}${s}</svg>`;
  }

  /** Diagrama de uma grandeza ao longo da barra. pontos: [{x, v}]. */
  function diagrama({ pontos, L, unidade, classe, inverter = false, casas = 2 }) {
    const W = 720, H = 150, ml = 64, mr = 64, mt = 26, mb = 26;
    const X = x => ml + x / L * (W - ml - mr);
    const vmax = Math.max(...pontos.map(p => Math.abs(p.v)));
    const y0 = mt + (H - mt - mb) / 2;
    const k = vmax > 0 ? (H - mt - mb) / 2 / vmax : 0;
    const Y = v => y0 + (inverter ? v : -v) * k;
    let d = `M${X(pontos[0].x)},${y0}`;
    for (const p of pontos) d += `L${X(p.x).toFixed(2)},${Y(p.v).toFixed(2)}`;
    d += `L${X(pontos[pontos.length - 1].x)},${y0}Z`;
    let linha = '';
    pontos.forEach((p, i) => { linha += `${i ? 'L' : 'M'}${X(p.x).toFixed(2)},${Y(p.v).toFixed(2)}`; });

    // Rótulos: maior positivo e maior negativo
    const rotulos = [];
    const pMax = pontos.reduce((m, p) => (p.v > m.v ? p : m), pontos[0]);
    const pMin = pontos.reduce((m, p) => (p.v < m.v ? p : m), pontos[0]);
    for (const p of [pMax, pMin]) {
      if (Math.abs(p.v) < vmax * 1e-6 || rotulos.some(r => r === p)) continue;
      rotulos.push(p);
    }
    let txt = '';
    for (const p of rotulos) {
      const x = Math.min(W - 6, Math.max(6, X(p.x)));
      const acima = Y(p.v) < y0 || (Y(p.v) === y0 && !inverter);
      const y = acima ? Y(p.v) - 6 : Y(p.v) + 15;
      const anc = X(p.x) < ml + 30 ? 'start' : (X(p.x) > W - mr - 30 ? 'end' : 'middle');
      txt += `<circle class="diag-ponto ${classe}" cx="${X(p.x)}" cy="${Y(p.v)}" r="3"/>`;
      txt += `<text class="diag-rot" x="${x}" y="${y}" text-anchor="${anc}">${fmt(p.v, casas)} ${unidade} <tspan class="diag-x">x = ${fmt(p.x)} m</tspan></text>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Diagrama em ${esc(unidade)}">
      <path class="diag-area ${classe}" d="${d}"/>
      <path class="diag-linha ${classe}" d="${linha}" fill="none"/>
      <line class="diag-base" x1="${X(0)}" y1="${y0}" x2="${X(L)}" y2="${y0}"/>
      <line class="diag-base" x1="${X(0)}" y1="${y0 - 6}" x2="${X(0)}" y2="${y0 + 6}"/>
      <line class="diag-base" x1="${X(L)}" y1="${y0 - 6}" x2="${X(L)}" y2="${y0 + 6}"/>
      ${txt}</svg>`;
  }

  PM.desenhos = { secao, modelo, diagrama, esc };
})();
