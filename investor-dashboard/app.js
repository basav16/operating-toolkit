// Calculations and drawings for the the company investor dashboard.
dash.calc('kpi', {
  inputs: ['monthly', 'snapshot'],
  title: 'Headline numbers: now vs last update',
  description: 'Each headline number at the latest month and at the last investor update, with the change between them.',
  fn: (monthly, snapshot) => {
    const s = snapshot[0] || {};
    const rows = monthly.slice().sort((a, b) => String(a.month).localeCompare(String(b.month)));
    if (!rows.length) return [];
    const nowM = String(s.as_of || '').slice(0, 7);
    const prevM = String(s.last_update || '').slice(0, 7);
    const cur = rows.find((r) => r.month === nowM) || rows[rows.length - 1];
    const prev = rows.find((r) => r.month === prevM) || null;
    const r1 = (v) => Math.round(v * 10) / 10;
    const pick = {
      arr: (r) => +r.arr_m,
      customers: (r) => +r.customers_live,
      signed: (r) => +r.signed_not_live,
      arr_per_customer: (r) => r1(+r.arr_m * 1000 / +r.customers_live),
      products: (r) => +r.products_per_customer,
      interactions: (r) => +r.interactions_k,
      resolved: (r) => +r.resolved_pct,
      margin: (r) => +r.gross_margin_pct,
      burn: (r) => +r.net_burn_k,
      cash: (r) => +r.cash_m,
      runway: (r) => Math.round(+r.cash_m * 1000 / +r.net_burn_k),
      headcount: (r) => +r.headcount
    };
    const out = Object.entries(pick).map(([id, f]) => {
      const now = f(cur);
      const was = prev ? f(prev) : null;
      return {id, now, prev: was, change: was == null ? null : r1(now - was), change_pct: was ? Math.round((now / was - 1) * 100) : null};
    });
    out.push({id: 'nrr', now: +s.nrr_pct, prev: null, change: null, change_pct: null});
    out.push({id: 'churn', now: +s.logo_churn, prev: null, change: null, change_pct: null});
    out.push({id: 'days_live', now: +s.days_to_live, prev: null, change: null, change_pct: null});
    out.push({id: 'runway_hires', now: Math.round(+cur.cash_m * 1000 / +s.burn_after_hires_k), prev: null, change: null, change_pct: null});
    return out;
  }
});

dash.calc('score_sum', {
  inputs: ['scorecard'],
  title: 'July goals: how many were hit',
  description: 'Counts of last update goals: achieved, within a point, or on track for the next update.',
  fn: (scorecard) => [{
    hit: scorecard.filter((r) => r.status === 'Achieved').length,
    close: scorecard.filter((r) => /^Within/.test(r.status)).length,
    missed: scorecard.filter((r) => r.status !== 'Achieved' && !/^Within/.test(r.status)).length,
    total: scorecard.length
  }]
});

dash.calc('backlog_sum', {
  inputs: ['backlog'],
  title: 'Signed customers waiting to go live',
  description: 'Customers signed but not yet live, and the yearly revenue they add once live.',
  fn: (backlog) => [{customers: backlog.reduce((a, r) => a + (+r.customers), 0), arr_m: Math.round(backlog.reduce((a, r) => a + (+r.arr_k), 0) / 10) / 100}]
});

dash.calc('funds_sum', {
  inputs: ['funds'],
  title: 'Gross spend since January',
  description: 'Total spent across all uses since January, in millions.',
  fn: (funds) => [{spent_m: Math.round(funds.reduce((a, r) => a + (+r.spent_k), 0) / 10) / 100}]
});

(function () {
  const f1 = d3.format('.1f');
  const f2 = d3.format('.2f');
  const sg = (x) => (x > 0 ? '+' : x < 0 ? '-' : '');
  const fmt = {
    arr: {v: (x) => '$' + f1(x) + 'M', c: (x) => sg(x) + '$' + f1(Math.abs(x)) + 'M', good: 1},
    customers: {v: (x) => String(x), c: (x) => sg(x) + Math.abs(x), good: 1},
    signed: {v: (x) => String(x), c: (x) => sg(x) + Math.abs(x), good: 0},
    arr_per_customer: {v: (x) => '$' + f1(x) + 'K', c: (x) => sg(x) + '$' + f1(Math.abs(x)) + 'K', good: 1},
    products: {v: (x) => f1(x), c: (x) => sg(x) + f1(Math.abs(x)), good: 1},
    interactions: {v: (x) => x + 'K', c: (x) => sg(x) + Math.abs(x) + 'K', good: 1},
    resolved: {v: (x) => x + '%', c: (x) => sg(x) + Math.abs(x) + ' pts', good: 1},
    margin: {v: (x) => x + '%', c: (x) => sg(x) + Math.abs(x) + ' pts', good: 1},
    burn: {v: (x) => '$' + x + 'K', c: (x) => sg(x) + '$' + Math.abs(x) + 'K', good: -1},
    cash: {v: (x) => '$' + f1(x) + 'M', c: (x) => sg(x) + '$' + f1(Math.abs(x)) + 'M', good: 1},
    runway: {v: (x) => String(x), c: (x) => sg(x) + Math.abs(x), good: 1},
    headcount: {v: (x) => String(x), c: (x) => sg(x) + Math.abs(x), good: 0},
    nrr: {v: (x) => x + '%'},
    churn: {v: (x) => String(x)},
    days_live: {v: (x) => String(x)},
    runway_hires: {v: (x) => String(x)}
  };
  const kpiRow = (id) => {
    const k = dash.data('kpi');
    return k.status === 'ok' && Array.isArray(k.data) ? k.data.find((r) => r.id === id) : null;
  };

  // One number from the headline calc: data-k is the row id, data-field the column.
  dash.draw('kv', (el) => {
    const id = el.dataset.k, field = el.dataset.field || 'now';
    const r = kpiRow(id), F = fmt[id];
    el.classList.remove('good', 'bad', 'neutral');
    if (!r || !F || r[field] == null) { el.textContent = '—'; return; }
    const v = r[field];
    if (field === 'change_pct') el.textContent = sg(v) + Math.abs(v) + '%';
    else if (field === 'change') el.textContent = F.c(v);
    else el.textContent = F.v(v);
    if ((field === 'change' || field === 'change_pct') && F.good !== undefined) {
      el.classList.add(F.good === 0 || v === 0 ? 'neutral' : (v > 0) === (F.good > 0) ? 'good' : 'bad');
    }
  });

  // "up" or "down", from the sign of a change
  dash.draw('dir', (el) => {
    const r = kpiRow(el.dataset.k);
    el.textContent = !r || r.change == null ? '—' : r.change >= 0 ? 'up' : 'down';
  });

  const snap = () => { const s = dash.data('snapshot'); return s.status === 'ok' && s.data.length ? s.data[0] : null; };
  const dateTxt = (v, f) => { const d = d3.utcParse('%Y-%m-%d')(String(v)); return d ? d3.utcFormat(f)(d) : '—'; };
  dash.draw('asof', (el) => { const s = snap(); el.textContent = s ? dateTxt(s.as_of, '%B %-d, %Y') : '—'; });
  dash.draw('asof-s', (el) => { const s = snap(); el.textContent = s ? dateTxt(s.as_of, '%b %-d') : '—'; });
  dash.draw('lastupd', (el) => { const s = snap(); el.textContent = s ? dateTxt(s.last_update, '%b %-d') : '—'; });
  dash.draw('lastmon', (el) => { const s = snap(); el.textContent = s ? dateTxt(s.last_update, '%B') : '—'; });
  dash.draw('goal-h', (el) => { const s = snap(); el.textContent = s ? String(s.next_goal_customers) : '—'; });
  dash.draw('goal-arr', (el) => { const s = snap(); el.textContent = s ? '$' + f1(s.next_goal_arr_m) + 'M' : '—'; });
  dash.draw('answer', (el) => { const s = snap(); el.textContent = s ? f1(s.answer_sec) : '—'; });
  dash.draw('raised', (el) => { const s = snap(); el.textContent = s ? '$' + f1(s.raised_m) + 'M' : '—'; });
  dash.draw('burnhire', (el) => { const s = snap(); el.textContent = s ? '$' + s.burn_after_hires_k + 'K' : '—'; });

  const one = (id, field, f) => (el) => { const d = dash.data(id); el.textContent = d.status === 'ok' && d.data && d.data[0] ? f(d.data[0][field]) : '—'; };
  dash.draw('sc-hit', one('score_sum', 'hit', String));
  dash.draw('sc-close', one('score_sum', 'close', String));
  dash.draw('sc-missed', one('score_sum', 'missed', String));
  dash.draw('sc-total', one('score_sum', 'total', String));
  dash.draw('bl-customers', one('backlog_sum', 'customers', String));
  dash.draw('bl-arr', one('backlog_sum', 'arr_m', (v) => '$' + f2(v) + 'M'));
  dash.draw('fu-spent', one('funds_sum', 'spent_m', (v) => '$' + f2(v) + 'M'));

  const monthly = () => {
    const m = dash.data('monthly');
    if (m.status !== 'ok') return {status: m.status, rows: []};
    return {status: 'ok', rows: m.data.map((r) => Object.assign({}, r, {x: LD.parseM(String(r.month))})).filter((r) => r.x).sort((a, b) => a.x - b.x)};
  };
  const plan = () => {
    const p = dash.data('plan');
    if (p.status !== 'ok') return [];
    return p.data.map((r) => Object.assign({}, r, {x: LD.parseM(String(r.month)), plan: true})).filter((r) => r.x).sort((a, b) => a.x - b.x);
  };
  const lastOf = (a) => a[a.length - 1];

  dash.draw('c-arr', (el) => {
    const m = monthly();
    if (m.status !== 'ok' || !m.rows.length) return LD.empty(el, m.status);
    const p = plan(), s = snap(), last = lastOf(m.rows);
    const series = [{name: 'ARR', color: LD.C.green, points: m.rows.map((r) => ({x: r.x, y: +r.arr_m}))}];
    if (p.length) series.push({name: 'Plan', color: LD.C.faint, dashed: true, points: [{x: last.x, y: +last.arr_m}, ...p.map((r) => ({x: r.x, y: +r.arr_m}))]});
    LD.line(el, {
      series, height: 260,
      yFmt: (v) => '$' + d3.format('.1f')(v) + 'M',
      tipFmt: (v) => '$' + d3.format('.2f')(v) + 'M',
      endFmt: (sr) => '$' + d3.format('.1f')(lastOf(sr.points).y) + 'M',
      refs: s ? [{y: +s.next_goal_arr_m, label: 'Jan 31 goal'}] : [],
      aria: 'Line chart of annual recurring revenue by month from ' + LD.fmtMonY(m.rows[0].x) + ' to ' + LD.fmtMonY(last.x) + ', reaching $' + d3.format('.1f')(+last.arr_m) + 'M, with the plan to January.'
    });
  });

  dash.draw('c-customers', (el) => {
    const m = monthly();
    if (m.status !== 'ok' || !m.rows.length) return LD.empty(el, m.status);
    const rows = [...m.rows, ...plan().map((r) => Object.assign({}, r, {signed_not_live: 0}))];
    LD.bars(el, {
      rows, height: 260,
      keys: [{key: 'customers_live', name: 'Live', color: LD.C.green, planColor: '#E3F1EA'}, {key: 'signed_not_live', name: 'Contracted, not live', color: '#9FE3C9'}],
      yFmt: (v) => String(v), tipFmt: (v) => String(v), totalFmt: (acc, r) => String(r.customers_live),
      aria: 'Stacked bar chart of customers live and customers signed but not live, by month, with the plan to January.'
    });
  });

  dash.draw('c-inter', (el) => {
    const m = monthly();
    if (m.status !== 'ok' || !m.rows.length) return LD.empty(el, m.status);
    LD.bars(el, {
      rows: m.rows, height: 240,
      keys: [{key: 'interactions_k', name: 'Calls + messages', color: LD.C.forest}],
      yFmt: (v) => v + 'K', tipFmt: (v) => v + 'K', totalFmt: (v) => v + 'K',
      aria: 'Bar chart of end user calls and messages handled per month, in thousands.'
    });
  });

  dash.draw('c-quality', (el) => {
    const m = monthly();
    if (m.status !== 'ok' || !m.rows.length) return LD.empty(el, m.status);
    LD.line(el, {
      height: 240, yMin: 30,
      series: [
        {name: 'Resolved with no staff', color: LD.C.green, points: m.rows.map((r) => ({x: r.x, y: +r.resolved_pct}))},
        {name: 'Gross margin', color: LD.C.sand, points: m.rows.map((r) => ({x: r.x, y: +r.gross_margin_pct}))}
      ],
      yFmt: (v) => v + '%', tipFmt: (v) => v + '%', endFmt: (sr) => lastOf(sr.points).y + '%',
      aria: 'Line chart of the share of customer requests resolved with no staff and gross margin, by month.'
    });
  });

  dash.draw('c-cash', (el) => {
    const m = monthly();
    if (m.status !== 'ok' || !m.rows.length) return LD.empty(el, m.status);
    const p = plan(), last = lastOf(m.rows);
    const series = [{name: 'Cash', color: LD.C.forest, points: m.rows.map((r) => ({x: r.x, y: +r.cash_m}))}];
    if (p.length) series.push({name: 'Plan', color: LD.C.faint, dashed: true, points: [{x: last.x, y: +last.cash_m}, ...p.map((r) => ({x: r.x, y: +r.cash_m}))]});
    const seed = m.rows.find((r) => r.month === '2026-04');
    LD.line(el, {
      series, height: 240,
      yFmt: (v) => '$' + v + 'M', tipFmt: (v) => '$' + d3.format('.2f')(v) + 'M', endFmt: (sr) => '$' + d3.format('.1f')(lastOf(sr.points).y) + 'M',
      notes: seed ? [{x: seed.x, y: +seed.cash_m, text: '$5M seed'}] : [],
      aria: 'Line chart of cash at month end, with the plan to January.'
    });
  });

  dash.draw('c-burn', (el) => {
    const m = monthly();
    if (m.status !== 'ok' || !m.rows.length) return LD.empty(el, m.status);
    LD.bars(el, {
      rows: [...m.rows, ...plan()], height: 240,
      keys: [{key: 'net_burn_k', name: 'Net burn', color: LD.C.red, planColor: '#F6DAD6'}],
      yFmt: (v) => '$' + v + 'K', tipFmt: (v) => '$' + v + 'K', totalFmt: (v) => '$' + v + 'K',
      aria: 'Bar chart of monthly net burn in thousands of dollars, with the plan to January.'
    });
  });

  const hb = (id, cfg) => (el) => {
    const d = dash.data(id);
    if (d.status !== 'ok' || !d.data.length) return LD.empty(el, d.status);
    LD.hbars(el, Object.assign({rows: d.data}, typeof cfg === 'function' ? cfg() : cfg));
  };
  const liveNow = () => { const r = kpiRow('customers'); return r ? r.now : null; };
  dash.draw('h-products', hb('products', () => ({
    label: 'product', value: 'customers', sub: (r) => r.launched === 'Live' ? '' : 'Launched ' + r.launched,
    max: liveNow() || undefined, fmt: (v) => String(v), color: LD.C.green,
    tip: (r) => [['Customers using it', String(r.customers)], ['Share of live customers', liveNow() ? Math.round(100 * r.customers / liveNow()) + '%' : '—']]
  })));
  dash.draw('h-brands', hb('brands', () => ({
    label: 'brand', value: 'customers', fmt: (v) => String(v), color: LD.C.forest,
    tip: (r) => [['Customers live', String(r.customers)], ['Share', liveNow() ? Math.round(100 * r.customers / liveNow()) + '%' : '—']]
  })));
  dash.draw('h-funds', hb('funds', {
    label: 'use', value: 'spent_k', fmt: (v) => '$' + d3.format('.2f')(v / 1000) + 'M', color: LD.C.sand,
    tip: (r) => [['Spent since Jan', '$' + d3.format(',')(r.spent_k) + 'K']]
  }));
  dash.draw('h-backlog', hb('backlog', {
    label: 'stage', value: 'customers', sub: (r) => '$' + r.arr_k + 'K ARR', fmt: (v) => v + ' customers', color: '#2BCA95',
    tip: (r) => [['Customers', String(r.customers)], ['ARR once live', '$' + r.arr_k + 'K']]
  }));

  dash.draw('score', (el) => {
    const d = dash.data('scorecard');
    el.replaceChildren();
    if (d.status !== 'ok') return;
    d.data.forEach((r) => {
      const tr = document.createElement('tr');
      ['goal', 'target', 'result'].forEach((k) => { const td = document.createElement('td'); td.textContent = r[k]; tr.appendChild(td); });
      const td = document.createElement('td'); const s = document.createElement('span'); s.className = 'ld-st ' + (r.status === 'Achieved' ? 'Hit' : /^Within/.test(r.status) ? 'Close' : 'Prog'); s.textContent = r.status; td.appendChild(s); tr.appendChild(td);
      el.appendChild(tr);
    });
  });

  // Section links keep the place in a copied link
  document.querySelectorAll('.ld-nav a').forEach((a) => a.addEventListener('click', () => dash.setLink(a.getAttribute('href').slice(1))));
  if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
})();
