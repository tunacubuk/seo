// ============================================
// SEO Analiz Aracı - Frontend Application
// ============================================

let analysisData = null;

// Form submit
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

  btn.disabled = true;
  btnText.style.display = 'none';
  btnLoader.style.display = 'flex';
  errorBox.style.display = 'none';
  results.style.display = 'none';

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, keyword })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Analiz başarısız');
    analysisData = data;
    renderResults(data);
    results.style.display = 'block';
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    errorBox.textContent = '❌ ' + err.message;
    errorBox.style.display = 'block';
  } finally {
    btn.disabled = false;
    btnText.style.display = 'inline';
    btnLoader.style.display = 'none';
  }
});

// Nav buttons
document.getElementById('results-nav').addEventListener('click', (e) => {
  if (!e.target.classList.contains('nav-btn')) return;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  e.target.classList.add('active');
  const target = document.getElementById(e.target.dataset.target);
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

function renderResults(d) {
  renderSummary(d);
  renderKeyword(d);
  renderOnPage(d);
  renderTechnical(d);
  renderContentPlan(d);
  renderCompetitorGap(d);
  renderActionPlan(d);
}

// 1. Summary
function renderSummary(d) {
  // Score animation
  const circle = document.getElementById('score-circle');
  const scoreVal = document.getElementById('score-value');
  const offset = 534 - (534 * d.score / 100);
  setTimeout(() => {
    circle.style.strokeDashoffset = offset;
    // Determine stroke color
    const color = d.score >= 80 ? '#10b981' : d.score >= 60 ? '#f59e0b' : '#ef4444';
    circle.style.stroke = color;
  }, 100);
  // Animate number
  animateNumber(scoreVal, 0, d.score, 1500);

  document.getElementById('intent-value').textContent = d.searchIntent?.type || '—';
  document.getElementById('wordcount-value').textContent = (d.content?.wordCount || 0).toLocaleString('tr-TR');
  document.getElementById('images-value').textContent = `${d.images?.total || 0} (${d.images?.withAlt || 0} alt)`;
  document.getElementById('links-value').textContent = `${d.links?.internal || 0} iç / ${d.links?.external || 0} dış`;

  // Quick wins (top 3 non-critical recommendations)
  const qwBox = document.getElementById('quick-wins');
  const quickWins = (d.recommendations || []).filter(r => r.priority !== 'kritik').slice(0, 3);
  qwBox.innerHTML = quickWins.length > 0 ? '<div style="font-size:0.85rem;font-weight:700;color:var(--success);margin-bottom:10px;">⚡ Hızlı Kazanımlar</div>' +
    quickWins.map(q => `<div class="quick-win-item"><span class="qw-icon">✅</span><span>${q.text}</span></div>`).join('') : '';

  // Blockers
  const blkBox = document.getElementById('blockers');
  const blockers = (d.issues || []).filter(i => i.severity === 'critical');
  blkBox.innerHTML = blockers.length > 0 ? '<div style="font-size:0.85rem;font-weight:700;color:var(--danger);margin-bottom:10px;margin-top:16px;">🔥 Kritik Engeller</div>' +
    blockers.map(b => `<div class="blocker-item"><span>🔥</span><span>${b.message}</span></div>`).join('') : '';
}

// 2. Keyword
function renderKeyword(d) {
  const kw = document.getElementById('keyword-input').value.trim();
  const items = [
    { label: 'Title Tag', present: d.title?.keywordPresent, detail: d.title?.text?.substring(0, 50) || '—' },
    { label: 'Meta Description', present: d.metaDescription?.keywordPresent, detail: (d.metaDescription?.text || '—').substring(0, 50) },
    { label: 'H1 Başlığı', present: d.headings?.h1KeywordPresent, detail: (d.headings?.h1?.[0] || '—').substring(0, 50) },
    { label: 'H2 Başlıkları', present: d.headings?.h2KeywordPresent, detail: `${d.headings?.h2Count || 0} adet H2` },
    { label: 'URL Yapısı', present: d.url?.pathname?.toLowerCase().includes(kw.toLowerCase()), detail: d.url?.pathname || '—' },
    { label: 'Sayfa İçeriği', present: d.content?.keywordCount > 0, detail: `${d.content?.keywordCount || 0} kez kullanılmış` },
  ];
  document.getElementById('keyword-checklist').innerHTML = items.map(item => `
    <div class="check-item">
      <div class="check-status ${item.present ? 'pass' : 'fail'}">${item.present ? '✓' : '✗'}</div>
      <span class="check-label">${item.label}</span>
      <span class="check-detail">${item.detail}</span>
    </div>
  `).join('');

  // Quality
  const quality = d.content?.keywordQuality || 'yok';
  const qualityColors = { 'doğal': 'var(--success)', 'optimize': 'var(--primary)', 'düşük': 'var(--warning)', 'aşırı doldurulmuş': 'var(--danger)', 'yok': 'var(--text-muted)' };
  const density = d.content?.keywordDensity || 0;
  const fillW = Math.min(density * 20, 100);
  document.getElementById('keyword-quality').innerHTML = `
    <div class="quality-title">Anahtar Kelime Kullanım Kalitesi</div>
    <div class="density-bar-wrapper">
      <div class="density-bar"><div class="density-fill" style="width:${fillW}%;background:${qualityColors[quality] || 'var(--primary)'}"></div></div>
      <div class="density-value">%${density}</div>
    </div>
    <div style="font-size:0.85rem;color:${qualityColors[quality]};font-weight:600;margin-top:8px;">
      Durum: ${quality.charAt(0).toUpperCase() + quality.slice(1)}
      ${quality === 'aşırı doldurulmuş' ? ' ⚠️ Anahtar kelime dolgulama riski!' : ''}
      ${quality === 'doğal' ? ' ✅ İdeal aralıkta' : ''}
    </div>
  `;
}

// 3. On-Page
function renderOnPage(d) {
  const titleStatus = !d.title?.exists ? 'bad' : (d.title.length >= 50 && d.title.length <= 60) ? 'good' : 'mid';
  const metaStatus = !d.metaDescription?.exists ? 'bad' : (d.metaDescription.length >= 140 && d.metaDescription.length <= 160) ? 'good' : 'mid';

  let html = `
    <div class="detail-group">
      <div class="detail-group-title">Title Tag</div>
      <div class="detail-row"><span class="detail-label">İçerik</span><span class="detail-val neutral" style="max-width:60%;text-align:right;word-break:break-word;">${d.title?.text || '<em>Yok</em>'}</span></div>
      <div class="detail-row"><span class="detail-label">Uzunluk</span><span class="detail-val ${titleStatus}">${d.title?.length || 0} karakter ${titleStatus === 'good' ? '✓' : titleStatus === 'mid' ? '⚠️' : '✗'}</span></div>
      <div class="detail-row"><span class="detail-label">Anahtar Kelime</span><span class="detail-val ${d.title?.keywordPresent ? 'good' : 'bad'}">${d.title?.keywordPresent ? 'Var ✓' : 'Yok ✗'}</span></div>
    </div>
    <div class="detail-group">
      <div class="detail-group-title">Meta Description</div>
      <div class="detail-row"><span class="detail-label">İçerik</span><span class="detail-val neutral" style="max-width:60%;text-align:right;word-break:break-word;">${(d.metaDescription?.text || '<em>Yok</em>').substring(0, 100)}${(d.metaDescription?.text?.length || 0) > 100 ? '...' : ''}</span></div>
      <div class="detail-row"><span class="detail-label">Uzunluk</span><span class="detail-val ${metaStatus}">${d.metaDescription?.length || 0} karakter</span></div>
      <div class="detail-row"><span class="detail-label">Anahtar Kelime</span><span class="detail-val ${d.metaDescription?.keywordPresent ? 'good' : 'bad'}">${d.metaDescription?.keywordPresent ? 'Var ✓' : 'Yok ✗'}</span></div>
    </div>
    <div class="detail-group">
      <div class="detail-group-title">Başlık Yapısı (Headings)</div>
      <div class="detail-row"><span class="detail-label">H1 Sayısı</span><span class="detail-val ${d.headings?.h1Count === 1 ? 'good' : 'bad'}">${d.headings?.h1Count || 0} ${d.headings?.h1Count === 1 ? '✓' : '✗'}</span></div>
      <div class="detail-row"><span class="detail-label">Hiyerarşi</span><span class="detail-val ${d.headings?.hasProperHierarchy ? 'good' : 'mid'}">${d.headings?.hasProperHierarchy ? 'Düzgün ✓' : 'Düzensiz ⚠️'}</span></div>
  `;
  ['h1','h2','h3'].forEach(tag => {
    if (d.headings?.[tag]?.length > 0) {
      html += `<div style="margin:8px 0 4px;font-size:0.8rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;">${tag.toUpperCase()} Etiketleri</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;">${d.headings[tag].slice(0, 8).map(h => `<span class="heading-tag">${h.substring(0, 60)}</span>`).join('')}</div>`;
    }
  });
  html += `</div>
    <div class="detail-group">
      <div class="detail-group-title">İçerik & Bağlantılar</div>
      <div class="detail-row"><span class="detail-label">Kelime Sayısı</span><span class="detail-val ${d.content?.wordCount >= 1000 ? 'good' : d.content?.wordCount >= 300 ? 'mid' : 'bad'}">${(d.content?.wordCount || 0).toLocaleString('tr-TR')}</span></div>
      <div class="detail-row"><span class="detail-label">Paragraf Sayısı</span><span class="detail-val neutral">${d.content?.paragraphs || 0}</span></div>
      <div class="detail-row"><span class="detail-label">Görseller</span><span class="detail-val ${d.images?.withoutAlt === 0 ? 'good' : 'mid'}">${d.images?.total || 0} toplam, ${d.images?.withoutAlt || 0} alt eksik</span></div>
      <div class="detail-row"><span class="detail-label">İç Bağlantılar</span><span class="detail-val ${d.links?.internal >= 5 ? 'good' : d.links?.internal >= 2 ? 'mid' : 'bad'}">${d.links?.internal || 0}</span></div>
      <div class="detail-row"><span class="detail-label">Dış Bağlantılar</span><span class="detail-val neutral">${d.links?.external || 0}</span></div>
    </div>`;
  document.getElementById('onpage-details').innerHTML = html;
}

// 4. Technical
function renderTechnical(d) {
  const items = [
    { label: 'HTTPS', val: d.url?.hasHttps, good: 'Aktif ✓', bad: 'Yok ✗' },
    { label: 'Canonical URL', val: d.technical?.hasCanonical, good: d.technical?.canonicalUrl?.substring(0, 50) || 'Var ✓', bad: 'Tanımlanmamış ✗' },
    { label: 'Schema.org', val: d.technical?.hasSchema, good: (d.technical?.schemaTypes || []).join(', ') || 'Var ✓', bad: 'Yok ✗' },
    { label: 'Open Graph', val: d.technical?.hasOG, good: 'Var ✓', bad: 'Yok ✗' },
    { label: 'Robots Meta', val: !d.technical?.isNoindex, good: 'İndexlenebilir ✓', bad: 'NOINDEX ✗ KRİTİK!' },
    { label: 'Nofollow', val: !d.technical?.isNofollow, good: 'Yok ✓', bad: 'Nofollow aktif ⚠️' },
  ];
  let html = '<div class="detail-group"><div class="detail-group-title">İndexlenebilirlik & Güvenlik</div>';
  items.forEach(item => {
    html += `<div class="detail-row"><span class="detail-label">${item.label}</span><span class="detail-val ${item.val ? 'good' : 'bad'}">${item.val ? item.good : item.bad}</span></div>`;
  });
  html += '</div>';

  // URL Structure
  html += `<div class="detail-group"><div class="detail-group-title">URL Yapısı</div>
    <div class="detail-row"><span class="detail-label">Protokol</span><span class="detail-val ${d.url?.hasHttps ? 'good' : 'bad'}">${d.url?.protocol || '—'}</span></div>
    <div class="detail-row"><span class="detail-label">Alan Adı</span><span class="detail-val neutral">${d.url?.hostname || '—'}</span></div>
    <div class="detail-row"><span class="detail-label">Yol</span><span class="detail-val neutral">${d.url?.pathname || '—'}</span></div>
    <div class="detail-row"><span class="detail-label">URL Temizliği</span><span class="detail-val ${d.url?.clean ? 'good' : 'mid'}">${d.url?.clean ? 'Temiz ✓' : 'İyileştirilebilir ⚠️'}</span></div>
    <div class="detail-row"><span class="detail-label">Derinlik</span><span class="detail-val ${d.url?.depth <= 3 ? 'good' : 'mid'}">${d.url?.depth || 0} seviye</span></div>
  </div>`;

  // OG Details
  if (d.technical?.hasOG) {
    html += `<div class="detail-group"><div class="detail-group-title">Open Graph Detayları</div>
      <div class="detail-row"><span class="detail-label">OG Title</span><span class="detail-val neutral" style="max-width:60%;text-align:right;word-break:break-word;">${d.technical?.ogTitle || '—'}</span></div>
      <div class="detail-row"><span class="detail-label">OG Description</span><span class="detail-val neutral" style="max-width:60%;text-align:right;word-break:break-word;">${(d.technical?.ogDesc || '—').substring(0, 80)}</span></div>
      <div class="detail-row"><span class="detail-label">OG Image</span><span class="detail-val ${d.technical?.ogImage ? 'good' : 'bad'}">${d.technical?.ogImage ? 'Var ✓' : 'Yok ✗'}</span></div>
    </div>`;
  }
  document.getElementById('technical-details').innerHTML = html;
}

// 5. Content Plan
function renderContentPlan(d) {
  const plan = d.contentPlan;
  if (!plan) { document.getElementById('content-plan').innerHTML = '<p style="color:var(--text-muted)">Veri yok</p>'; return; }
  let html = '';
  if (plan.missingSections?.length > 0) {
    html += `<div class="plan-section"><div class="plan-section-title">📌 Eksik Bölümler</div><div class="plan-list">${plan.missingSections.map(s => `<div class="plan-item">+ ${s}</div>`).join('')}</div></div>`;
  }
  if (plan.expandSections?.length > 0) {
    html += `<div class="plan-section"><div class="plan-section-title">📈 Genişletilmesi Gereken Alanlar</div><div class="plan-list">${plan.expandSections.map(s => `<div class="plan-item">↗ ${s}</div>`).join('')}</div></div>`;
  }
  if (plan.suggestedHeadings?.length > 0) {
    html += `<div class="plan-section"><div class="plan-section-title">💡 Önerilen Başlıklar</div><div class="plan-list">${plan.suggestedHeadings.map(h => `<div class="plan-item">&lt;H2&gt; ${h}</div>`).join('')}</div></div>`;
  }
  if (plan.lsiKeywords?.length > 0) {
    html += `<div class="plan-section"><div class="plan-section-title">🔗 Semantik Anahtar Kelimeler (LSI)</div><div class="lsi-grid">${plan.lsiKeywords.map(k => `<span class="lsi-tag">${k}</span>`).join('')}</div></div>`;
  }
  document.getElementById('content-plan').innerHTML = html || '<p style="color:var(--text-muted)">Anahtar kelime girilmedi.</p>';
}

// 6. Competitor Gap
function renderCompetitorGap(d) {
  const gaps = d.competitorGap || [];
  document.getElementById('competitor-gaps').innerHTML = gaps.length > 0
    ? gaps.map(g => `<div class="gap-item"><span class="gap-icon">🔸</span><span>${g}</span></div>`).join('')
    : '<p style="color:var(--text-muted)">Veri yok</p>';
}

// 7. Action Plan
function renderActionPlan(d) {
  const steps = d.actionPlan || [];
  document.getElementById('action-plan').innerHTML = steps.length > 0
    ? steps.map(step => `
      <div class="action-group">
        <div class="action-group-header"><span>${step.icon}</span><span>${step.level}</span></div>
        ${step.items.map((item, i) => `<div class="action-item"><div class="action-number">${i + 1}</div><span>${item}</span></div>`).join('')}
      </div>`).join('')
    : '<p style="color:var(--text-muted)">Sorun bulunamadı. Tebrikler! 🎉</p>';
}

// Animate number
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

// PDF Export
async function exportPDF() {
  if (!analysisData) return;
  try {
    const res = await fetch('/api/export-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(analysisData)
    });
    if (!res.ok) throw new Error('PDF oluşturulamadı');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'seo-rapor.pdf'; a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('PDF indirme hatası: ' + err.message);
  }
}
