// ============================================
// SEO Intelligence Engine — Frontend
// ============================================

let analysisData = null;

document.getElementById('analyze-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = document.getElementById('url-input').value.trim();
  const keyword = document.getElementById('keyword-input').value.trim();
  if (!url) return;
  const btn = document.getElementById('analyze-btn');
  const btnText = btn.querySelector('.btn-text');
  const btnLoader = btn.querySelector('.btn-loader');
  const errorBox = document.getElementById('error-box');
  const results = document.getElementById('results');
  btn.disabled = true; btnText.style.display = 'none'; btnLoader.style.display = 'flex';
  errorBox.style.display = 'none'; results.style.display = 'none';
  try {
    const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, keyword }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Analysis failed');
    analysisData = data;
    renderResults(data);
    results.style.display = 'block';
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    errorBox.textContent = '❌ ' + err.message; errorBox.style.display = 'block';
  } finally {
    btn.disabled = false; btnText.style.display = 'inline'; btnLoader.style.display = 'none';
  }
});

document.getElementById('results-nav').addEventListener('click', (e) => {
  if (!e.target.classList.contains('nav-btn')) return;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  e.target.classList.add('active');
  const target = document.getElementById(e.target.dataset.target);
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

function renderResults(d) {
  renderSummary(d);
  renderOnSite(d);
  renderOffSite(d);
  renderSerp(d);
  renderKeyword(d);
  renderContentPlan(d);
  renderActionPlan(d);
}

// === 1. Executive Summary ===
function renderSummary(d) {
  const circle = document.getElementById('score-circle');
  const scoreVal = document.getElementById('score-value');
  const offset = 534 - (534 * d.score / 100);
  setTimeout(() => {
    circle.style.strokeDashoffset = offset;
    circle.style.stroke = d.score >= 80 ? '#10b981' : d.score >= 60 ? '#f59e0b' : '#ef4444';
  }, 100);
  animateNumber(scoreVal, 0, d.score, 1500);

  document.getElementById('intent-value').textContent = capitalize(d.searchIntent?.type || '—');
  document.getElementById('wordcount-value').textContent = (d.content?.wordCount || 0).toLocaleString();
  document.getElementById('images-value').textContent = `${d.images?.total || 0} (${d.images?.withAlt || 0} with alt)`;
  document.getElementById('links-value').textContent = `${d.links?.internal || 0} int / ${d.links?.external || 0} ext`;

  // Sub-scores
  const onSite = d.onSiteScore || 0;
  const offSite = d.offSiteScore || 0;
  const rankProb = d.serpIntelligence?.rankingProbability || 0;
  document.getElementById('sub-scores').innerHTML = `
    ${subScoreCard('On-Site Score', onSite, getScoreColor(onSite))}
    ${subScoreCard('Off-Site Score', offSite, getScoreColor(offSite))}
    ${subScoreCard('Ranking Probability', rankProb, getScoreColor(rankProb))}
  `;

  // Top blockers
  const blockers = (d.issues || []).filter(i => i.severity === 'critical').slice(0, 3);
  const blkBox = document.getElementById('blockers');
  blkBox.innerHTML = blockers.length > 0 ? '<div style="font-size:0.85rem;font-weight:700;color:var(--danger);margin-bottom:10px;margin-top:16px;">🔥 Top Ranking Blockers</div>' +
    blockers.map(b => `<div class="blocker-item"><span>🔥</span><span>${b.message}</span></div>`).join('') : '';
}

function subScoreCard(label, value, colorClass) {
  const color = colorClass === 'good' ? 'var(--success)' : colorClass === 'mid' ? 'var(--warning)' : 'var(--danger)';
  return `<div class="sub-score-card">
    <div class="sub-score-label">${label}</div>
    <div class="sub-score-value ${colorClass}">${value}</div>
    <div class="sub-score-bar"><div class="sub-score-fill" style="width:${value}%;background:${color};"></div></div>
  </div>`;
}

// === 2. On-Site SEO ===
function renderOnSite(d) {
  const titleStatus = !d.title?.exists ? 'bad' : (d.title.length >= 50 && d.title.length <= 60) ? 'good' : 'mid';
  const metaStatus = !d.metaDescription?.exists ? 'bad' : (d.metaDescription.length >= 140 && d.metaDescription.length <= 160) ? 'good' : 'mid';

  let html = `
    <div class="detail-group"><div class="detail-group-title">📋 Technical SEO</div>
      <div class="detail-row"><span class="detail-label">Title Tag</span><span class="detail-val neutral" style="max-width:55%;text-align:right;word-break:break-word;">${d.title?.text || '<em>Missing</em>'}</span></div>
      <div class="detail-row"><span class="detail-label">Title Length</span><span class="detail-val ${titleStatus}">${d.title?.length || 0} chars ${titleStatus === 'good' ? '✓' : titleStatus === 'mid' ? '⚠️' : '✗'}</span></div>
      <div class="detail-row"><span class="detail-label">Keyword in Title</span><span class="detail-val ${d.title?.keywordPresent ? 'good' : 'bad'}">${d.title?.keywordPresent ? 'Present ✓' : 'Missing ✗'}</span></div>
      <div class="detail-row"><span class="detail-label">Meta Description</span><span class="detail-val neutral" style="max-width:55%;text-align:right;word-break:break-word;">${(d.metaDescription?.text || '<em>Missing</em>').substring(0, 80)}${(d.metaDescription?.text?.length || 0) > 80 ? '...' : ''}</span></div>
      <div class="detail-row"><span class="detail-label">Meta Length</span><span class="detail-val ${metaStatus}">${d.metaDescription?.length || 0} chars</span></div>
      <div class="detail-row"><span class="detail-label">H1 Count</span><span class="detail-val ${d.headings?.h1Count === 1 ? 'good' : 'bad'}">${d.headings?.h1Count || 0} ${d.headings?.h1Count === 1 ? '✓' : '✗'}</span></div>
      <div class="detail-row"><span class="detail-label">Heading Hierarchy</span><span class="detail-val ${d.headings?.hasProperHierarchy ? 'good' : 'mid'}">${d.headings?.hasProperHierarchy ? 'Correct ✓' : 'Inconsistent ⚠️'}</span></div>
      <div class="detail-row"><span class="detail-label">URL Structure</span><span class="detail-val ${d.url?.clean ? 'good' : 'mid'}">${d.url?.clean ? 'Clean ✓' : 'Needs improvement ⚠️'}</span></div>
      <div class="detail-row"><span class="detail-label">HTTPS</span><span class="detail-val ${d.url?.hasHttps ? 'good' : 'bad'}">${d.url?.hasHttps ? 'Enabled ✓' : 'Not enabled ✗'}</span></div>
      <div class="detail-row"><span class="detail-label">Canonical</span><span class="detail-val ${d.technical?.hasCanonical ? 'good' : 'mid'}">${d.technical?.hasCanonical ? 'Set ✓' : 'Missing ⚠️'}</span></div>
      <div class="detail-row"><span class="detail-label">Indexing</span><span class="detail-val ${!d.technical?.isNoindex ? 'good' : 'bad'}">${!d.technical?.isNoindex ? 'Indexable ✓' : 'NOINDEX ✗'}</span></div>
    </div>`;

  // Heading tags display
  ['h1','h2','h3'].forEach(tag => {
    if (d.headings?.[tag]?.length > 0) {
      html += `<div style="margin:8px 0 4px;font-size:0.8rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;">${tag.toUpperCase()} Tags</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px;">${d.headings[tag].slice(0, 8).map(h => `<span class="heading-tag">${h.substring(0, 60)}</span>`).join('')}</div>`;
    }
  });

  html += `<div class="detail-group"><div class="detail-group-title">✍️ Content SEO</div>
    <div class="detail-row"><span class="detail-label">Word Count</span><span class="detail-val ${d.content?.wordCount >= 1000 ? 'good' : d.content?.wordCount >= 300 ? 'mid' : 'bad'}">${(d.content?.wordCount || 0).toLocaleString()}</span></div>
    <div class="detail-row"><span class="detail-label">Paragraphs</span><span class="detail-val neutral">${d.content?.paragraphs || 0}</span></div>
    <div class="detail-row"><span class="detail-label">Keyword Density</span><span class="detail-val neutral">${d.content?.keywordDensity || 0}%</span></div>
    <div class="detail-row"><span class="detail-label">Keyword Quality</span><span class="detail-val ${d.content?.keywordQuality === 'natural' ? 'good' : d.content?.keywordQuality === 'overstuffed' ? 'bad' : 'mid'}">${capitalize(d.content?.keywordQuality || 'N/A')}</span></div>
  </div>`;

  html += `<div class="detail-group"><div class="detail-group-title">⚡ UX & Engagement Signals</div>
    <div class="detail-row"><span class="detail-label">Images</span><span class="detail-val ${d.images?.withoutAlt === 0 ? 'good' : 'mid'}">${d.images?.total || 0} total, ${d.images?.withoutAlt || 0} missing alt</span></div>
    <div class="detail-row"><span class="detail-label">Internal Links</span><span class="detail-val ${d.links?.internal >= 5 ? 'good' : d.links?.internal >= 2 ? 'mid' : 'bad'}">${d.links?.internal || 0}</span></div>
    <div class="detail-row"><span class="detail-label">External Links</span><span class="detail-val neutral">${d.links?.external || 0}</span></div>
    <div class="detail-row"><span class="detail-label">URL Depth</span><span class="detail-val ${(d.url?.depth || 0) <= 3 ? 'good' : 'mid'}">${d.url?.depth || 0} levels</span></div>
  </div>`;

  document.getElementById('onsite-details').innerHTML = html;

  // Issues breakdown
  const critical = (d.issues || []).filter(i => i.severity === 'critical');
  const warnings = (d.issues || []).filter(i => i.severity === 'warning');
  const infos = (d.issues || []).filter(i => i.severity === 'info');
  let issuesHtml = '<div class="issues-grid">';
  issuesHtml += issueGroup('Critical', 'critical', critical);
  issuesHtml += issueGroup('Warning', 'warning', warnings);
  issuesHtml += issueGroup('Info', 'info', infos);
  issuesHtml += '</div>';
  document.getElementById('issues-breakdown').innerHTML = issuesHtml;
}

function issueGroup(title, severity, items) {
  return `<div class="issue-group">
    <div class="issue-group-title ${severity}"><span class="issue-count ${severity}">${items.length}</span> ${title}</div>
    ${items.length > 0 ? items.map(i => `<div class="issue-item">${i.message}</div>`).join('') : '<div class="issue-item" style="color:var(--success);">No issues ✓</div>'}
  </div>`;
}

// === 3. Off-Site SEO ===
function renderOffSite(d) {
  const off = d.offSiteAnalysis || {};
  const signals = d.offSiteSignals || [];
  let html = '<div class="offsite-grid">';

  // Backlink card
  html += `<div class="offsite-card card-backlinks">
    <div class="offsite-card-title">🔗 Backlink Strength (Estimated)</div>
    <div class="offsite-card-value"><span class="strength-badge ${off.backlinkEstimate?.strength || 'low'}">${capitalize(off.backlinkEstimate?.strength || 'low')}</span></div>
    <p style="font-size:0.8rem;color:var(--text-dim);margin-top:8px;">${off.backlinkEstimate?.description || 'No data available'}</p>
  </div>`;

  // Domain Authority card
  html += `<div class="offsite-card card-authority">
    <div class="offsite-card-title">🏛️ Domain Authority (Estimated)</div>
    <div class="offsite-card-value"><span class="strength-badge ${off.domainAuthority?.estimate || 'low'}">${capitalize(off.domainAuthority?.estimate || 'low')}</span></div>
    <div style="margin-top:10px;">${(off.domainAuthority?.signals || []).map(s => `<span style="display:inline-block;padding:3px 10px;margin:2px;font-size:0.73rem;background:rgba(139,92,246,0.1);border-radius:12px;color:#c4b5fd;">${s}</span>`).join('')}</div>
  </div>`;

  // Social readiness card
  html += `<div class="offsite-card card-social">
    <div class="offsite-card-title">📢 Content Distribution</div>
    <div class="offsite-card-value"><span class="strength-badge ${off.contentDistribution?.shareability || 'low'}">${capitalize(off.contentDistribution?.shareability || 'low')} Shareability</span></div>
    <div style="margin-top:8px;font-size:0.8rem;color:var(--text-dim);">
      <div>Open Graph: ${off.contentDistribution?.socialReadiness ? '<span style="color:var(--success)">Ready ✓</span>' : '<span style="color:var(--danger)">Missing ✗</span>'}</div>
      <div>Twitter Card: ${off.contentDistribution?.hasTwitterCard ? '<span style="color:var(--success)">Ready ✓</span>' : '<span style="color:var(--danger)">Missing ✗</span>'}</div>
    </div>
  </div>`;

  // Competition card
  html += `<div class="offsite-card card-competition">
    <div class="offsite-card-title">🏁 Competitor Authority Gap</div>
    <div style="font-size:0.8rem;color:var(--text-dim);">${(off.competitorAuthorityGap || []).slice(0, 3).map(g => `<div style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.03);">• ${g}</div>`).join('')}</div>
  </div>`;

  html += '</div>';

  // Signal list
  if (signals.length > 0) {
    html += '<div class="detail-group"><div class="detail-group-title">📡 Authority Signals Analysis</div><div class="signal-list">';
    signals.forEach(s => {
      html += `<div class="signal-item"><div class="signal-dot ${s.type}"></div><span>${s.text}</span></div>`;
    });
    html += '</div></div>';
  }

  document.getElementById('offsite-details').innerHTML = html;
}

// === 4. SERP Intelligence ===
function renderSerp(d) {
  const serp = d.serpIntelligence || {};
  const intent = serp.intentAnalysis || {};
  const expected = serp.expectedStructure || {};

  let html = '<div class="serp-grid">';

  // Intent card
  html += `<div class="serp-card">
    <div class="serp-card-title">🎯 Search Intent Classification</div>
    <div style="margin-bottom:12px;"><span class="intent-badge ${intent.type || 'informational'}">${capitalize(intent.type || 'informational')}</span>
    <span style="font-size:0.75rem;color:var(--text-muted);margin-left:8px;">Confidence: ${capitalize(intent.confidence || 'low')}</span></div>
    <p style="font-size:0.8rem;color:var(--text-dim);">${intent.description || ''}</p>
  </div>`;

  // Ranking probability
  html += `<div class="serp-card">
    <div class="serp-card-title">📈 Top 10 Ranking Probability</div>
    <div class="ranking-prob">
      <div class="ranking-prob-value" style="color:${getScoreHex(serp.rankingProbability || 0)}">${serp.rankingProbability || 0}%</div>
      <div class="ranking-prob-label">Estimated probability</div>
    </div>
    <div class="sub-score-bar" style="margin-top:10px;"><div class="sub-score-fill" style="width:${serp.rankingProbability || 0}%;background:${getScoreHex(serp.rankingProbability || 0)};"></div></div>
  </div>`;

  html += '</div>';

  // Expected content structure
  if (expected.headings) {
    html += `<div class="detail-group"><div class="detail-group-title">📝 Expected Top 10 Content Structure</div>
      <div class="detail-row"><span class="detail-label">Format</span><span class="detail-val neutral">${expected.format || 'N/A'}</span></div>
      <div class="detail-row"><span class="detail-label">Expected Word Count</span><span class="detail-val neutral">${expected.wordCount || 'N/A'}</span></div>
      <div style="margin-top:12px;font-size:0.8rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;">Typical Headings</div>
      <div class="expected-list" style="margin-top:8px;">${expected.headings.map(h => `<div class="expected-item">${h}</div>`).join('')}</div>`;
    if (expected.features) {
      html += `<div style="margin-top:12px;font-size:0.8rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;">Expected Features</div>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">${expected.features.map(f => `<span style="padding:4px 12px;font-size:0.75rem;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);border-radius:14px;color:var(--success);">${f}</span>`).join('')}</div>`;
    }
    html += '</div>';
  }

  // Missing for Top 10
  if (serp.missingForTop10?.length > 0) {
    html += `<div class="detail-group"><div class="detail-group-title">⚠️ Missing for Top 10 Ranking</div>
      <div class="plan-list">${serp.missingForTop10.map(m => `<div class="plan-item" style="border-left:3px solid var(--warning);padding-left:14px;">→ ${m}</div>`).join('')}</div>
    </div>`;
  }

  document.getElementById('serp-details').innerHTML = html;
}

// === 5. Keyword & Intent ===
function renderKeyword(d) {
  const kw = document.getElementById('keyword-input').value.trim();
  const items = [
    { label: 'Title Tag', present: d.title?.keywordPresent, detail: (d.title?.text || '—').substring(0, 50) },
    { label: 'Meta Description', present: d.metaDescription?.keywordPresent, detail: (d.metaDescription?.text || '—').substring(0, 50) },
    { label: 'H1 Heading', present: d.headings?.h1KeywordPresent, detail: (d.headings?.h1?.[0] || '—').substring(0, 50) },
    { label: 'H2 Headings', present: d.headings?.h2KeywordPresent, detail: `${d.headings?.h2Count || 0} H2 tags` },
    { label: 'URL Path', present: kw && d.url?.pathname?.toLowerCase().includes(kw.toLowerCase()), detail: d.url?.pathname || '—' },
    { label: 'Page Content', present: d.content?.keywordCount > 0, detail: `Found ${d.content?.keywordCount || 0} times` },
  ];
  document.getElementById('keyword-checklist').innerHTML = items.map(item => `
    <div class="check-item">
      <div class="check-status ${item.present ? 'pass' : 'fail'}">${item.present ? '✓' : '✗'}</div>
      <span class="check-label">${item.label}</span>
      <span class="check-detail">${item.detail}</span>
    </div>`).join('');

  const quality = d.content?.keywordQuality || 'none';
  const qualityColors = { 'natural': 'var(--success)', 'optimized': 'var(--primary)', 'low': 'var(--warning)', 'overstuffed': 'var(--danger)', 'none': 'var(--text-muted)' };
  const density = d.content?.keywordDensity || 0;
  const fillW = Math.min(density * 20, 100);
  document.getElementById('keyword-quality').innerHTML = `
    <div class="quality-title">Keyword Usage Quality</div>
    <div class="density-bar-wrapper">
      <div class="density-bar"><div class="density-fill" style="width:${fillW}%;background:${qualityColors[quality] || 'var(--primary)'}"></div></div>
      <div class="density-value">${density}%</div>
    </div>
    <div style="font-size:0.85rem;color:${qualityColors[quality]};font-weight:600;margin-top:8px;">
      Status: ${capitalize(quality)}
      ${quality === 'overstuffed' ? ' ⚠️ Keyword stuffing risk!' : ''}
      ${quality === 'natural' ? ' ✅ Ideal range' : ''}
    </div>`;
}

// === 6. Content Plan ===
function renderContentPlan(d) {
  const plan = d.contentPlan;
  if (!plan) { document.getElementById('content-plan').innerHTML = '<p style="color:var(--text-muted)">No data available</p>'; return; }
  let html = '';
  if (plan.missingSections?.length > 0) html += `<div class="plan-section"><div class="plan-section-title">📌 Missing Sections</div><div class="plan-list">${plan.missingSections.map(s => `<div class="plan-item">+ ${s}</div>`).join('')}</div></div>`;
  if (plan.expandSections?.length > 0) html += `<div class="plan-section"><div class="plan-section-title">📈 Sections to Expand</div><div class="plan-list">${plan.expandSections.map(s => `<div class="plan-item">↗ ${s}</div>`).join('')}</div></div>`;
  if (plan.suggestedHeadings?.length > 0) html += `<div class="plan-section"><div class="plan-section-title">💡 Suggested Headings</div><div class="plan-list">${plan.suggestedHeadings.map(h => `<div class="plan-item">&lt;H2&gt; ${h}</div>`).join('')}</div></div>`;
  if (plan.lsiKeywords?.length > 0) html += `<div class="plan-section"><div class="plan-section-title">🔗 Semantic Keywords (LSI)</div><div class="lsi-grid">${plan.lsiKeywords.map(k => `<span class="lsi-tag">${k}</span>`).join('')}</div></div>`;
  document.getElementById('content-plan').innerHTML = html || '<p style="color:var(--text-muted)">Enter a keyword to see content suggestions.</p>';
}

// === 7. Action Plan ===
function renderActionPlan(d) {
  const steps = d.actionPlan || [];
  document.getElementById('action-plan').innerHTML = steps.length > 0
    ? steps.map(step => `
      <div class="action-group">
        <div class="action-group-header"><span>${step.icon}</span><span>${step.level}</span></div>
        <div class="action-group-desc">${step.description || ''}</div>
        ${step.items.map((item, i) => `<div class="action-item"><div class="action-number">${i + 1}</div><span>${item}</span></div>`).join('')}
      </div>`).join('')
    : '<p style="color:var(--text-muted)">No issues found. Congratulations! 🎉</p>';
}

// === Utilities ===
function animateNumber(el, start, end, duration) {
  const startTime = performance.now();
  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(start + (end - start) * eased);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function capitalize(str) { if (!str) return ''; return str.charAt(0).toUpperCase() + str.slice(1); }
function getScoreColor(score) { return score >= 70 ? 'good' : score >= 40 ? 'mid' : 'bad'; }
function getScoreHex(score) { return score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'; }

async function exportPDF() {
  if (!analysisData) return;
  try {
    const res = await fetch('/api/export-pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(analysisData) });
    if (!res.ok) throw new Error('Failed to generate PDF');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'seo-report.pdf'; a.click();
    URL.revokeObjectURL(url);
  } catch (err) { alert('PDF download error: ' + err.message); }
}
