// Shared chart helpers for the the company investor dashboard. Everything is drawn inside the element it is given.
window.LD = (function () {
  const C = {ink: '#121210', soft: '#5E5B55', faint: '#8A867E', green: '#0F7A55', mint: '#2BCA95', forest: '#09281E', sand: '#8A6A1F', red: '#B42318', plan: '#A9A59C'};
  const parseM = d3.utcParse('%Y-%m');
  const fmtMon = d3.utcFormat('%b');
  const fmtMonY = d3.utcFormat('%b %Y');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: no-preference)').matches;

  function empty(el, status) {
    el.replaceChildren();
    const d = document.createElement('div');
    d.className = 'ld-empty';
    d.textContent = status === 'error' ? 'Failed to load' : '—';
    el.appendChild(d);
  }

  function tip(el) {
    const t = document.createElement('div');
    t.className = 'ld-tip';
    el.appendChild(t);
    return {
      show(x, y, head, rows) {
        t.replaceChildren();
        const h = document.createElement('div'); h.className = 'h'; h.textContent = head; t.appendChild(h);
        rows.forEach(([k, v]) => {
          const r = document.createElement('div'); r.className = 'r';
          const a = document.createElement('span'); a.textContent = k;
          const b = document.createElement('b'); b.textContent = v;
          r.append(a, b); t.appendChild(r);
        });
        const W = el.clientWidth, tw = t.offsetWidth, th = t.offsetHeight;
        let left = x + 14; if (left + tw > W) left = x - tw - 14; if (left < 0) left = 0;
        let top = y - th - 10; if (top < 0) top = y + 14;
        t.style.left = left + 'px'; t.style.top = top + 'px'; t.style.opacity = 1;
      },
      hide() { t.style.opacity = 0; }
    };
  }

  function textW(svg, strings, cls) {
    const g = svg.append('g').attr('class', cls || 'tick');
    let m = 0;
    strings.forEach((s) => { const n = g.append('text').text(s).node(); m = Math.max(m, n.getComputedTextLength ? n.getComputedTextLength() : s.length * 7); });
    g.remove();
    return m;
  }

  // Line chart with optional plan (dashed) segment, reference lines and end labels.
  // cfg: {series:[{name,color,dashed,points:[{x:Date,y}]}], yFmt, tipFmt, refs:[{y,label}], height, aria, yMin, notes:[{x,y,text}]}
  function line(el, cfg) {
    el.replaceChildren();
    const W = Math.max(280, el.clientWidth || 600), H = cfg.height || 250;
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', cfg.aria || '');
    const all = cfg.series.flatMap((s) => s.points);
    const ymax = d3.max([...all.map((p) => p.y), ...(cfg.refs || []).map((r) => r.y)]) * 1.12;
    const y0 = cfg.yMin != null ? cfg.yMin : 0;
    const yTmp = d3.scaleLinear().domain([y0, ymax]).nice(4);
    const ticks = yTmp.ticks(4);
    const left = Math.ceil(textW(svg, ticks.map(cfg.yFmt))) + 10;
    const ends = cfg.series.filter((s) => s.endLabel !== false).map((s) => cfg.endFmt ? cfg.endFmt(s) : '');
    const right = Math.ceil(Math.max(16, textW(svg, ends, 'lbl') + 12));
    const M = {t: 12, r: right, b: 26, l: left};
    const x = d3.scaleUtc().domain(d3.extent(all, (p) => p.x)).range([M.l, W - M.r]);
    const y = yTmp.range([H - M.b, M.t]);
    svg.append('g').selectAll('line').data(ticks).join('line').attr('class', 'grid').attr('x1', M.l).attr('x2', W - M.r).attr('y1', y).attr('y2', y);
    svg.append('g').attr('class', 'tick').selectAll('text').data(ticks).join('text').attr('x', M.l - 8).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').text(cfg.yFmt);
    const months = Array.from(new Set(all.map((p) => +p.x))).sort((a, b) => a - b).map((v) => new Date(v));
    const step = Math.max(1, Math.ceil(months.length / Math.max(2, Math.floor((W - M.l - M.r) / 44))));
    svg.append('g').attr('class', 'tick').selectAll('text').data(months.filter((d, i) => i % step === 0 || i === months.length - 1)).join('text')
      .attr('x', x).attr('y', H - 6).attr('text-anchor', 'middle').text(fmtMon);
    const yb = y.domain()[0];
    svg.append('line').attr('class', 'base').attr('x1', M.l).attr('x2', W - M.r).attr('y1', y(yb)).attr('y2', y(yb));
    (cfg.refs || []).forEach((r) => {
      svg.append('line').attr('class', 'ref').attr('x1', M.l).attr('x2', W - M.r).attr('y1', y(r.y)).attr('y2', y(r.y));
      svg.append('text').attr('class', 'reft').attr('x', M.l + 4).attr('y', y(r.y) - 6).text(r.label);
    });
    const ln = d3.line().x((p) => x(p.x)).y((p) => y(p.y));
    cfg.series.forEach((s, i) => {
      const path = svg.append('path').attr('fill', 'none').attr('stroke', s.color).attr('stroke-width', s.dashed ? 2 : 2.5).attr('stroke-dasharray', s.dashed ? '5 5' : null).attr('d', ln(s.points));
      if (reduce && !el.__drawn && !s.dashed) {
        const L = path.node().getTotalLength();
        path.attr('stroke-dasharray', L + ' ' + L).attr('stroke-dashoffset', L).transition().duration(700).attr('stroke-dashoffset', 0).on('end', () => path.attr('stroke-dasharray', null));
      }
      svg.append('g').selectAll('circle').data(s.points).join('circle').attr('cx', (p) => x(p.x)).attr('cy', (p) => y(p.y)).attr('r', 3).attr('fill', s.dashed ? '#FFFFFF' : s.color).attr('stroke', s.color).attr('stroke-width', 1.5);
    });
    // end labels, kept apart
    const lab = cfg.series.filter((s) => s.endLabel !== false).map((s) => { const p = s.points[s.points.length - 1]; return {s, p, yy: y(p.y) + 4}; }).sort((a, b) => a.yy - b.yy);
    for (let i = 1; i < lab.length; i++) if (lab[i].yy - lab[i - 1].yy < 15) lab[i].yy = lab[i - 1].yy + 15;
    lab.forEach((l) => svg.append('text').attr('class', 'lbl').attr('x', x(l.p.x) + 8).attr('y', l.yy).attr('fill', l.s.color).text(cfg.endFmt(l.s)));
    (cfg.notes || []).forEach((n) => svg.append('text').attr('class', 'note').attr('x', x(n.x) + 6).attr('y', y(n.y) - 8).text(n.text));
    // tooltip
    const tt = tip(el);
    const hair = svg.append('line').attr('class', 'hair').attr('y1', M.t).attr('y2', H - M.b).style('opacity', 0);
    const move = (ev) => {
      const [mx] = d3.pointer(ev, svg.node());
      const d = months[d3.minIndex(months, (m) => Math.abs(x(m) - mx))];
      if (!d) return;
      hair.attr('x1', x(d)).attr('x2', x(d)).style('opacity', 1);
      const rows = [];
      cfg.series.forEach((s) => { const p = s.points.find((q) => +q.x === +d); if (p) rows.push([s.name, cfg.tipFmt(p.y, s)]); });
      tt.show(x(d), d3.min(cfg.series.flatMap((s) => s.points.filter((q) => +q.x === +d).map((q) => y(q.y)))), fmtMonY(d), rows);
    };
    svg.append('rect').attr('x', M.l).attr('y', 0).attr('width', W - M.l - M.r).attr('height', H).attr('fill', 'transparent')
      .on('pointermove', move).on('pointerdown', move).on('pointerleave', () => { tt.hide(); hair.style('opacity', 0); });
    el.__drawn = true;
  }

  // Vertical bars, stacked when more than one key. rows: [{x:Date, plan:bool, ...}]
  // cfg: {rows, keys:[{key,name,color,planColor}], yFmt, tipFmt, totalFmt, height, aria}
  function bars(el, cfg) {
    el.replaceChildren();
    const W = Math.max(280, el.clientWidth || 600), H = cfg.height || 250;
    const svg = d3.select(el).append('svg').attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', cfg.aria || '');
    const tot = (r) => d3.sum(cfg.keys, (k) => r[k.key] || 0);
    const yTmp = d3.scaleLinear().domain([0, d3.max(cfg.rows, tot) * 1.15]).nice(4);
    const ticks = yTmp.ticks(4);
    const M = {t: 16, r: 6, b: 26, l: Math.ceil(textW(svg, ticks.map(cfg.yFmt))) + 10};
    const x = d3.scaleBand().domain(cfg.rows.map((r) => +r.x)).range([M.l, W - M.r]).padding(0.28);
    const y = yTmp.range([H - M.b, M.t]);
    svg.append('g').selectAll('line').data(ticks).join('line').attr('class', 'grid').attr('x1', M.l).attr('x2', W - M.r).attr('y1', y).attr('y2', y);
    svg.append('g').attr('class', 'tick').selectAll('text').data(ticks).join('text').attr('x', M.l - 8).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').text(cfg.yFmt);
    const step = Math.max(1, Math.ceil(cfg.rows.length / Math.max(2, Math.floor((W - M.l - M.r) / 40))));
    svg.append('g').attr('class', 'tick').selectAll('text').data(cfg.rows.filter((r, i) => i % step === 0 || i === cfg.rows.length - 1)).join('text')
      .attr('x', (r) => x(+r.x) + x.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').text((r) => fmtMon(r.x));
    const g = svg.append('g');
    cfg.rows.forEach((r) => {
      let acc = 0;
      cfg.keys.forEach((k) => {
        const v = r[k.key] || 0;
        const rect = g.append('rect').attr('x', x(+r.x)).attr('width', x.bandwidth()).attr('rx', 2)
          .attr('fill', r.plan ? (k.planColor || '#D9D6CE') : k.color).attr('stroke', r.plan ? k.color : null).attr('stroke-dasharray', r.plan ? '3 3' : null);
        const yTop = y(acc + v), hgt = y(acc) - y(acc + v);
        if (reduce && !el.__drawn) rect.attr('y', y(acc)).attr('height', 0).transition().duration(500).attr('y', yTop).attr('height', hgt);
        else rect.attr('y', yTop).attr('height', hgt);
        acc += v;
      });
      if (cfg.totalFmt && x.bandwidth() >= 22) svg.append('text').attr('class', 'lbl').attr('fill', r.plan ? C.faint : C.ink).attr('x', x(+r.x) + x.bandwidth() / 2).attr('y', y(acc) - 5).attr('text-anchor', 'middle').text(cfg.totalFmt(acc, r));
    });
    svg.append('line').attr('class', 'base').attr('x1', M.l).attr('x2', W - M.r).attr('y1', y(0)).attr('y2', y(0));
    const tt = tip(el);
    svg.append('g').selectAll('rect').data(cfg.rows).join('rect').attr('x', (r) => x(+r.x) - x.step() * x.paddingInner() / 2).attr('width', x.step()).attr('y', 0).attr('height', H).attr('fill', 'transparent')
      .on('pointermove pointerdown', (ev, r) => tt.show(x(+r.x) + x.bandwidth() / 2, y(tot(r)), fmtMonY(r.x) + (r.plan ? ' · plan' : ''), cfg.keys.map((k) => [k.name, cfg.tipFmt(r[k.key] || 0, k)])))
      .on('pointerleave', () => tt.hide());
    el.__drawn = true;
  }

  // Horizontal bars as HTML rows. cfg: {rows, label, sub, value, fmt, max, color, tip}
  function hbars(el, cfg) {
    el.replaceChildren();
    const max = cfg.max || d3.max(cfg.rows, (r) => +r[cfg.value]) || 1;
    const tt = tip(el);
    cfg.rows.forEach((r) => {
      const row = document.createElement('div'); row.className = 'ld-hr';
      const n = document.createElement('div'); n.className = 'n'; n.textContent = r[cfg.label];
      if (cfg.sub) { const s = document.createElement('small'); s.textContent = cfg.sub(r); n.appendChild(s); }
      const t = document.createElement('div'); t.className = 't';
      const f = document.createElement('div'); f.className = 'f'; f.style.background = cfg.color || C.green;
      f.style.width = (el.__drawn || !reduce ? (100 * r[cfg.value] / max) : 0) + '%';
      t.appendChild(f);
      const v = document.createElement('div'); v.className = 'v'; v.textContent = cfg.fmt(+r[cfg.value], r);
      row.append(n, t, v);
      if (cfg.tip) {
        const sh = (ev) => { const b = el.getBoundingClientRect(); tt.show(ev.clientX - b.left, ev.clientY - b.top, r[cfg.label], cfg.tip(r)); };
        row.addEventListener('pointermove', sh); row.addEventListener('pointerdown', sh); row.addEventListener('pointerleave', () => tt.hide());
      }
      el.appendChild(row);
      if (!el.__drawn && reduce) requestAnimationFrame(() => requestAnimationFrame(() => { f.style.width = (100 * r[cfg.value] / max) + '%'; }));
    });
    el.__drawn = true;
  }

  return {C, parseM, fmtMon, fmtMonY, empty, line, bars, hbars};
})();
