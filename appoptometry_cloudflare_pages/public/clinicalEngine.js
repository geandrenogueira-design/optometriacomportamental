// Clinical Engine (offline). No fetch, no modules.
(function(){
  'use strict';

  function clamp(n, a, b){ return Math.min(b, Math.max(a, n)); }

  // Normal CDF approximation for percentile (error function approximation)
  function erf(x){
    // Abramowitz & Stegun approximation
    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);
    const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429;
    const p=0.3275911;
    const t=1/(1+p*x);
    const y=1-((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
    return sign*y;
  }
  function normCdf(z){ return 0.5*(1+erf(z/Math.SQRT2)); }
  function percentileFromZ(z){ return clamp(normCdf(z)*100, 0, 100); }

  // Age calc with user rounding rule: if days >= 15, round months up by 1.
  function calcAgeYMD(dobStr, refDate=new Date()){
    if(!dobStr) return null;
    const dob = new Date(dobStr + 'T00:00:00');
    if(Number.isNaN(dob.getTime())) return null;

    let y = refDate.getFullYear() - dob.getFullYear();
    let m = refDate.getMonth() - dob.getMonth();
    let d = refDate.getDate() - dob.getDate();

    if(d < 0){
      // borrow days from previous month
      const prevMonth = new Date(refDate.getFullYear(), refDate.getMonth(), 0);
      d += prevMonth.getDate();
      m -= 1;
    }
    if(m < 0){
      m += 12;
      y -= 1;
    }
    // rounding rule for "age in months": if days >= 15, round month up
    let y2=y, m2=m;
    if(d >= 15){
      m2 += 1;
      if(m2 >= 12){ m2=0; y2 += 1; }
    }
    return {years:y, months:m, days:d, yearsRounded:y2, monthsRounded:m2};
  }

  function ageToKeyTVPS(y, m){
    // y,m are rounded months (0-11)
    // valid: 5-0 .. 21-11
    if(y < 5) return null;
    if(y === 5) return (m <= 5) ? '5-0_to_5-5' : '5-6_to_5-11';
    if(y === 6) return (m <= 5) ? '6-0_to_6-5' : '6-6_to_6-11';
    if(y === 7) return (m <= 5) ? '7-0_to_7-5' : '7-6_to_7-11';
    if(y === 8) return (m <= 5) ? '8-0_to_8-5' : '8-6_to_8-11';
    if(y === 9) return (m <= 5) ? '9-0_to_9-5' : '9-6_to_9-11';
    if(y === 10) return (m <= 5) ? '10-0_to_10-5' : '10-6_to_10-11';
    if(y === 11) return (m <= 5) ? '11-0_to_11-5' : '11-6_to_11-11';
    if(y >= 12 && y <= 21) return `${y}-0_to_${y}-11`;
    return null;
  }

  function ageToKeyDTVP(y, m){
    // DTVP3 norms file uses "4-0_a_4-5" style keys
    if(y < 4) return null;
    const half = (m <= 5) ? '0_a_5' : '6_a_11';
    return `${y}-${half.replace('_a_', '-').replace('0_a_5','0_a_5')}`; // placeholder (we map below)
  }

  function findDTVPAgeKey(y, m){
    // match actual keys in DTVP3_NORMS.tabelas_conversao
    const keys = Object.keys(window.DTVP3_NORMS?.tabelas_conversao || {});
    // keys like "4-0_a_4-5"
    for(const k of keys){
      const m1 = k.match(/^(\d+)-(\d+)_a_(\d+)-(\d+)$/);
      if(!m1) continue;
      const y1=+m1[1], mo1=+m1[2], y2=+m1[3], mo2=+m1[4];
      const a = y*12 + m;
      const lo = y1*12 + mo1;
      const hi = y2*12 + mo2;
      if(a >= lo && a <= hi) return k;
    }
    return null;
  }

  function tvpsRawToScaled(ageKey, subtest, raw){
    const map = window.TVPS4_NORMS?.tables?.B1?.ageGroups?.[ageKey]?.[subtest];
    if(!map) return null;
    const v = map[String(raw)];
    return (typeof v === 'number') ? v : null;
  }

  function tvpsSumScaledToStandard(sumScaled){
    const map = window.TVPS4_NORMS?.tables?.B2?.sumScaledToStandard || {};
    const v = map[String(sumScaled)];
    return (typeof v === 'number') ? v : null;
  }

  function tvpsStandardToB3(standard){
    const table = window.TVPS4_NORMS?.tables?.B3?.standardToDerived || {};
    const row = table[String(standard)];
    return row || null;
  }

  function tvpsAgeEquivalent(subtest, raw){
    const map = window.TVPS4_NORMS?.tables?.B4?.ageEquivalent?.[subtest];
    if(!map) return null;
    return map[String(raw)] ?? null;
  }

  // --- TVPS Age Equivalent aggregation (system rule, not a published norm) ---
  // Parse an age-equivalent string like "7-2" into months.
  // Also accepts censoring markers from norms: "<5-0" or ">21-11".
  // For censoring values, we keep a *sorting key* (slightly below/above the boundary)
  // and also keep the numeric boundary itself so we can compute a bounded mean
  // without inventing a value.
  function tvpsAgeEqParse(ageEq){
    if(typeof ageEq !== 'string') return null;
    const s0 = ageEq.trim();
    if(!s0) return null;

    let s = s0;
    let cens = null; // '<' | '>' | null
    if(s.startsWith('<') || s.startsWith('>')){
      cens = s[0];
      s = s.slice(1).trim();
    }

    const m = s.match(/^(\d{1,2})-(\d{1,2})$/);
    if(!m) return null;
    const y = parseInt(m[1],10);
    const mo = parseInt(m[2],10);
    if(!Number.isFinite(y) || !Number.isFinite(mo) || mo < 0 || mo > 11 || y < 0) return null;

    const boundary = y*12 + mo;
    if(cens === '<') return { sortKey: boundary - 0.5, boundary, cens };
    if(cens === '>') return { sortKey: boundary + 0.5, boundary, cens };
    return { sortKey: boundary, boundary, cens: null };
  }

  // Convert total months (number) back to "y-m" string.
  function tvpsMonthsToAgeEq(months){
    if(!Number.isFinite(months) || months < 0) return null;
    const total = Math.round(months); // nearest month
    const y = Math.floor(total/12);
    const mo = total % 12;
    return `${y}-${mo}`;
  }

  // Trimmed mean for 7 subtests: drop min and max, average the middle 5.
  // If censoring values (< / >) fall inside the middle 5, we compute a *bounded* mean
  // by using the boundary month value (e.g. "<5-0" uses 5-0), and we mark the
  // result with a trailing "*" so the UI can explain that limits were used.
  function tvpsTrimmedMeanAgeEquivalent(ageEqList){
    if(!Array.isArray(ageEqList) || ageEqList.length !== 7) return null;
    const arr = [];
    for(const v of ageEqList){
      const p = tvpsAgeEqParse(v);
      if(!p) return null;
      arr.push(p);
    }
    arr.sort((a,b)=>a.sortKey - b.sortKey);
    const mid = arr.slice(1, 6); // 5 values
    let usedBounds = false;
    const midMonths = mid.map(p=>{
      if(p.cens){ usedBounds = true; }
      return p.boundary;
    });
    const avg = midMonths.reduce((a,b)=>a+b,0) / 5;
    const out = tvpsMonthsToAgeEq(avg);
    if(out === null) return null;
    return usedBounds ? `${out}*` : out;
  }

  // Optional (not always included in the norms bundle): subtest percentile ranks.
  // Expected shape if present:
  //   TVPS4_NORMS.tables.B5.ageGroups[ageKey][subtest][scaledScore] => percentile (string or number)
  function tvpsSubtestPercentile(ageKey, subtest, scaledScore){
    // 1) Prefer the explicit subtest percentile table if present (B5)
    const map = window.TVPS4_NORMS?.tables?.B5?.ageGroups?.[ageKey]?.[subtest];
    if(map){
      const v = map[String(scaledScore)];
      return (v === undefined || v === null || v === '') ? null : v;
    }

    // 2) Fallback: user requested to reuse Table B.3 by matching the *individual* scaled score
    //    and returning its percentile rank.
    const b3 = window.TVPS4_NORMS?.tables?.B3?.standardToDerived;
    if(!b3) return null;
    const target = Number(scaledScore);
    if(!Number.isFinite(target)) return null;

    // Search B.3 rows for a scaledScore match.
    for(const k of Object.keys(b3)){
      const row = b3[k];
      if(!row || typeof row !== 'object') continue;
      const sc = row.scaledScore ?? row.ScaledComposite ?? row.Scaled ?? row.scaled;
      if(Number(sc) !== target) continue;
      const pct = row.percentileRank ?? row.Percentile ?? row.percentile;
      if(pct === undefined || pct === null || pct === '') continue;
      return pct;
    }
    return null;
  }

  // Optional: total/composite age-equivalent.
  // Expected shape if present:
  //   TVPS4_NORMS.tables.B4_total.standardToAgeEquivalent[standard] => "y-m" (string)
  function tvpsTotalAgeEquivalent(standard){
    const map = window.TVPS4_NORMS?.tables?.B4_total?.standardToAgeEquivalent;
    if(!map) return null;
    const v = map[String(standard)];
    return (v === undefined || v === null || v === '') ? null : v;
  }

  function demAgeKey(y, m){
    // dem norms keys like "6.0-6.11"
    const a = y + (m/12);
    if(a < 6) return null;
    // choose integer year bracket
    const yInt = y;
    if(yInt >= 13) return '13.0-13.11';
    return `${yInt}.0-${yInt}.11`;
  }

  function demZ(ageKey, metric, value){
    const g = window.DEM_NORMS?.ageGroups?.[ageKey];
    if(!g || !g[metric]) return null;
    const mean = g[metric].mean;
    const sd = g[metric].sd;
    if(typeof mean !== 'number' || typeof sd !== 'number' || sd === 0) return null;
    return (value - mean) / sd;
  }

  function dtvpRawToScaled(ageKey, subtest, raw){
    const ranges = window.DTVP3_NORMS?.tabelas_conversao?.[ageKey]?.[subtest];
    if(!Array.isArray(ranges)) return null;
    for(const r of ranges){
      // Support both naming conventions:
      // - Current norms bundle: bruta_min/bruta_max/escalonada
      // - Older/internal: raw_min/raw_max/scaled
      const lo = (typeof r.bruta_min === 'number') ? r.bruta_min : r.raw_min;
      const hi = (typeof r.bruta_max === 'number') ? r.bruta_max : r.raw_max;
      const sc = (typeof r.escalonada === 'number') ? r.escalonada : r.scaled;
      if(typeof lo !== 'number' || typeof hi !== 'number' || typeof sc !== 'number') continue;
      if(raw >= lo && raw <= hi) return sc;
    }
    return null;
  }

  function dtvpComposite(ageKey, sums){
    const rows = window.DTVP3_NORMS?.indices_compostos;
    if(!Array.isArray(rows)) return null;
    // The provided norms bundle may expose different composite key fields.
    // We refuse to invent data; we only return a row when an exact key match exists.
    const want = {
      soma_pe: sums?.soma_pe,
      soma_mr: sums?.soma_mr,
      soma_gvp: sums?.soma_gvp,
      // fallback: some bundles provide only a single sum column (often named soma_pe)
      soma_total: sums?.soma_gvp
    };

    // 1) Exact 3-sum match if available
    let row = rows.find(r=> typeof r.soma_pe==='number' && typeof r.soma_mr==='number' && typeof r.soma_gvp==='number'
      && r.soma_pe===want.soma_pe && r.soma_mr===want.soma_mr && r.soma_gvp===want.soma_gvp) || null;
    if(row) return row;

    // 2) Exact total match (some bundles only have one sum column)
    row = rows.find(r=> typeof r.soma_pe==='number' && (typeof r.soma_mr!=='number' && typeof r.soma_gvp!=='number')
      && r.soma_pe===want.soma_total) || null;
    if(row) return row;

    // 3) Alternative name if present
    row = rows.find(r=> typeof r.soma_total==='number' && r.soma_total===want.soma_total) || null;
    return row;
  }

  window.ClinicalEngine = {
    calcAgeYMD,
    ageToKeyTVPS,
    tvpsRawToScaled,
    tvpsSumScaledToStandard,
    tvpsStandardToB3,
    tvpsAgeEquivalent,
    tvpsTrimmedMeanAgeEquivalent,
    tvpsSubtestPercentile,
    tvpsTotalAgeEquivalent,

    findDTVPAgeKey,
    dtvpRawToScaled,
    dtvpComposite,

    demAgeKey,
    demZ,
    percentileFromZ,
    normCdf
  };
})();
