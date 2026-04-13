const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// SEO Analysis Engine
function analyzeKeywordPresence(text, keyword) {
  if (!text || !keyword) return { found: false, count: 0, density: 0 };
  const lower = text.toLowerCase();
  const kw = keyword.toLowerCase().trim();
  const words = lower.split(/\s+/);
  const kwWords = kw.split(/\s+/);
  let count = 0;
  for (let i = 0; i <= words.length - kwWords.length; i++) {
    if (words.slice(i, i + kwWords.length).join(' ') === kw) count++;
  }
  const density = words.length > 0 ? ((count * kwWords.length) / words.length) * 100 : 0;
  return { found: count > 0, count, density: Math.round(density * 100) / 100 };
}

function getKeywordQuality(density) {
  if (density === 0) return 'yok';
  if (density < 0.5) return 'düşük';
  if (density <= 2.5) return 'doğal';
  if (density <= 4) return 'optimize';
  return 'aşırı doldurulmuş';
}

function detectSearchIntent(url, title, content) {
  const text = `${url} ${title} ${content}`.toLowerCase();
  const transactional = ['satın al', 'fiyat', 'ücret', 'sipariş', 'buy', 'price', 'order', 'shop', 'cart', 'checkout', 'indirim', 'kampanya', 'ürün', 'product'];
  const navigational = ['login', 'giriş', 'kayıt', 'register', 'iletişim', 'contact', 'hakkımızda', 'about', 'sign in', 'account'];
  const informational = ['nasıl', 'nedir', 'rehber', 'guide', 'how to', 'what is', 'blog', 'makale', 'article', 'tips', 'tutorial', 'öğren', 'bilgi'];
  let scores = { bilgilendirici: 0, islemsel: 0, gezinme: 0 };
  informational.forEach(w => { if (text.includes(w)) scores.bilgilendirici++; });
  transactional.forEach(w => { if (text.includes(w)) scores.islemsel++; });
  navigational.forEach(w => { if (text.includes(w)) scores.gezinme++; });
  const max = Math.max(scores.bilgilendirici, scores.islemsel, scores.gezinme);
  if (max === 0) return { type: 'bilgilendirici', confidence: 'düşük' };
  if (max === scores.islemsel) return { type: 'işlemsel', confidence: max > 2 ? 'yüksek' : 'orta' };
  if (max === scores.gezinme) return { type: 'gezinme amaçlı', confidence: max > 2 ? 'yüksek' : 'orta' };
  return { type: 'bilgilendirici', confidence: max > 2 ? 'yüksek' : 'orta' };
}

function analyzeURL(url) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const isClean = !pathname.includes('?') && !/[A-Z]/.test(pathname) && !pathname.includes('_');
    const hasNumbers = /\d{5,}/.test(pathname);
    const depth = pathname.split('/').filter(Boolean).length;
    return { clean: isClean && !hasNumbers, depth, pathname: parsed.pathname, hostname: parsed.hostname, protocol: parsed.protocol, hasHttps: parsed.protocol === 'https:' };
  } catch { return { clean: false, depth: 0, pathname: '', hostname: '', protocol: '', hasHttps: false }; }
}

function calculateScore(analysis) {
  let score = 0;
  const details = [];
  // Title (15 pts)
  if (analysis.title.exists) {
    score += 5;
    if (analysis.title.length >= 50 && analysis.title.length <= 60) score += 5;
    else if (analysis.title.length >= 30 && analysis.title.length <= 70) score += 3;
    else score += 1;
    if (analysis.title.keywordPresent) score += 5;
    else details.push({ severity: 'critical', message: 'Title tag\'da hedef anahtar kelime bulunamadı' });
  } else { details.push({ severity: 'critical', message: 'Title tag eksik' }); }
  // Meta desc (10 pts)
  if (analysis.metaDescription.exists) {
    score += 3;
    if (analysis.metaDescription.length >= 140 && analysis.metaDescription.length <= 160) score += 4;
    else if (analysis.metaDescription.length >= 100 && analysis.metaDescription.length <= 200) score += 2;
    if (analysis.metaDescription.keywordPresent) score += 3;
    else details.push({ severity: 'warning', message: 'Meta description\'da anahtar kelime yok' });
  } else { details.push({ severity: 'critical', message: 'Meta description eksik' }); }
  // H1 (10 pts)
  if (analysis.headings.h1Count === 1) { score += 5; if (analysis.headings.h1KeywordPresent) score += 5; else details.push({ severity: 'warning', message: 'H1\'de anahtar kelime yok' }); }
  else if (analysis.headings.h1Count > 1) { score += 2; details.push({ severity: 'warning', message: `Birden fazla H1 tag\'ı var (${analysis.headings.h1Count} adet)` }); }
  else { details.push({ severity: 'critical', message: 'H1 tag\'ı bulunamadı' }); }
  // Heading hierarchy (5 pts)
  if (analysis.headings.hasProperHierarchy) score += 5;
  else { score += 2; details.push({ severity: 'info', message: 'Heading hiyerarşisi düzensiz' }); }
  // URL (5 pts)
  if (analysis.url.clean) score += 3;
  if (analysis.url.hasHttps) score += 2;
  else details.push({ severity: 'warning', message: 'HTTPS kullanılmıyor' });
  // Content depth (15 pts)
  if (analysis.content.wordCount >= 2000) score += 15;
  else if (analysis.content.wordCount >= 1000) score += 10;
  else if (analysis.content.wordCount >= 500) score += 7;
  else if (analysis.content.wordCount >= 300) score += 4;
  else { score += 1; details.push({ severity: 'critical', message: `İçerik çok sığ (${analysis.content.wordCount} kelime)` }); }
  // Keyword density (10 pts)
  const quality = analysis.content.keywordQuality;
  if (quality === 'doğal') score += 10;
  else if (quality === 'optimize') score += 7;
  else if (quality === 'düşük') { score += 3; details.push({ severity: 'warning', message: 'Anahtar kelime yoğunluğu düşük' }); }
  else if (quality === 'aşırı doldurulmuş') { score += 1; details.push({ severity: 'critical', message: 'Anahtar kelime aşırı kullanımı (stuffing) tespit edildi' }); }
  else { details.push({ severity: 'warning', message: 'İçerikte anahtar kelime bulunamadı' }); }
  // Image alts (5 pts)
  if (analysis.images.total === 0) score += 3;
  else { const ratio = analysis.images.withAlt / analysis.images.total; score += Math.round(ratio * 5); if (ratio < 0.5) details.push({ severity: 'warning', message: `Resimlerin ${Math.round((1-ratio)*100)}%'inde alt tag eksik` }); }
  // Internal links (5 pts)
  if (analysis.links.internal >= 5) score += 5;
  else if (analysis.links.internal >= 2) score += 3;
  else { score += 1; details.push({ severity: 'info', message: 'İç bağlantı sayısı yetersiz' }); }
  // Canonical (5 pts)
  if (analysis.technical.hasCanonical) score += 5;
  else { score += 1; details.push({ severity: 'info', message: 'Canonical URL tanımlanmamış' }); }
  // Schema (5 pts)
  if (analysis.technical.hasSchema) score += 5;
  else { score += 0; details.push({ severity: 'info', message: 'Schema.org yapılandırılmış verisi yok' }); }
  // OG tags (5 pts)
  if (analysis.technical.hasOG) score += 5;
  else { score += 1; details.push({ severity: 'info', message: 'Open Graph meta tagları eksik' }); }
  // Robots (5 pts)
  if (!analysis.technical.isNoindex) score += 5;
  else { details.push({ severity: 'critical', message: 'Sayfa noindex olarak işaretlenmiş!' }); }
  return { score: Math.min(score, 100), details };
}

app.post('/api/analyze', async (req, res) => {
  const { url, keyword } = req.body;
  if (!url) return res.status(400).json({ error: 'URL gereklidir' });
  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8' },
      timeout: 15000, maxRedirects: 5
    });
    const $ = cheerio.load(response.data);
    const title = $('title').first().text().trim();
    const metaDesc = $('meta[name="description"]').attr('content') || '';
    const metaKeywords = $('meta[name="keywords"]').attr('content') || '';
    const canonical = $('link[rel="canonical"]').attr('href') || '';
    const robotsMeta = $('meta[name="robots"]').attr('content') || '';
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    const ogDesc = $('meta[property="og:description"]').attr('content') || '';
    const ogImage = $('meta[property="og:image"]').attr('content') || '';

    // Headings
    const headings = {};
    ['h1','h2','h3','h4','h5','h6'].forEach(tag => {
      headings[tag] = [];
      $(tag).each((i, el) => headings[tag].push($(el).text().trim()));
    });
    const h1KeywordCheck = headings.h1.some(h => h.toLowerCase().includes((keyword||'').toLowerCase()));
    const h2KeywordCheck = headings.h2.some(h => h.toLowerCase().includes((keyword||'').toLowerCase()));
    let hasProperHierarchy = true;
    if (headings.h1.length === 0 && (headings.h2.length > 0 || headings.h3.length > 0)) hasProperHierarchy = false;
    if (headings.h3.length > 0 && headings.h2.length === 0) hasProperHierarchy = false;

    // Body text
    $('script, style, noscript, iframe').remove();
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const wordCount = bodyText.split(/\s+/).filter(w => w.length > 1).length;
    const paragraphs = $('p').length;
    const kwAnalysis = analyzeKeywordPresence(bodyText, keyword);

    // Images
    const images = [];
    $('img').each((i, el) => { images.push({ src: $(el).attr('src') || '', alt: $(el).attr('alt') || '' }); });
    const imagesWithAlt = images.filter(img => img.alt.length > 0).length;

    // Links
    let internalLinks = 0, externalLinks = 0;
    const urlInfo = analyzeURL(url);
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href') || '';
      if (href.startsWith('#') || href.startsWith('javascript:')) return;
      try { const linkUrl = new URL(href, url); if (linkUrl.hostname === urlInfo.hostname) internalLinks++; else externalLinks++; } catch { if (href.startsWith('/')) internalLinks++; }
    });

    // Schema & structured data
    const hasSchema = $('script[type="application/ld+json"]').length > 0;
    let schemaTypes = [];
    $('script[type="application/ld+json"]').each((i, el) => {
      try { const data = JSON.parse($(el).html()); if (data['@type']) schemaTypes.push(data['@type']); } catch {}
    });

    const hasOG = ogTitle.length > 0 || ogDesc.length > 0;
    const isNoindex = robotsMeta.toLowerCase().includes('noindex');
    const isNofollow = robotsMeta.toLowerCase().includes('nofollow');
    const searchIntent = detectSearchIntent(url, title, bodyText);

    const analysis = {
      url: urlInfo,
      title: { text: title, length: title.length, exists: title.length > 0, keywordPresent: keyword ? title.toLowerCase().includes(keyword.toLowerCase()) : false },
      metaDescription: { text: metaDesc, length: metaDesc.length, exists: metaDesc.length > 0, keywordPresent: keyword ? metaDesc.toLowerCase().includes(keyword.toLowerCase()) : false },
      metaKeywords: metaKeywords,
      headings: { h1: headings.h1, h2: headings.h2, h3: headings.h3, h4: headings.h4, h5: headings.h5, h6: headings.h6, h1Count: headings.h1.length, h2Count: headings.h2.length, h1KeywordPresent: h1KeywordCheck, h2KeywordPresent: h2KeywordCheck, hasProperHierarchy },
      content: { wordCount, paragraphs, keywordCount: kwAnalysis.count, keywordDensity: kwAnalysis.density, keywordQuality: getKeywordQuality(kwAnalysis.density) },
      images: { total: images.length, withAlt: imagesWithAlt, withoutAlt: images.length - imagesWithAlt, list: images.slice(0, 10) },
      links: { internal: internalLinks, external: externalLinks, total: internalLinks + externalLinks },
      technical: { hasCanonical: canonical.length > 0, canonicalUrl: canonical, hasSchema, schemaTypes, hasOG, ogTitle, ogDesc, ogImage, isNoindex, isNofollow, robotsMeta, hasHttps: urlInfo.hasHttps },
      searchIntent,
      analyzedAt: new Date().toISOString()
    };

    const { score, details } = calculateScore(analysis);
    analysis.score = score;
    analysis.issues = details;

    // Generate recommendations
    analysis.recommendations = generateRecommendations(analysis);
    analysis.competitorGap = generateCompetitorGap(analysis);
    analysis.contentPlan = generateContentPlan(analysis, keyword);
    analysis.actionPlan = generateActionPlan(analysis);

    res.json(analysis);
  } catch (err) {
    console.error('Analysis error:', err.message);
    res.status(500).json({ error: `Sayfa analiz edilemedi: ${err.message}` });
  }
});

function generateRecommendations(a) {
  const recs = [];
  if (!a.title.exists) recs.push({ priority: 'kritik', text: 'Title tag ekleyin. 50-60 karakter arasında, hedef anahtar kelimeyi içeren bir başlık yazın.' });
  else if (a.title.length < 50 || a.title.length > 60) recs.push({ priority: 'önemli', text: `Title tag uzunluğunu optimize edin (şu an ${a.title.length} karakter, ideal: 50-60).` });
  if (!a.title.keywordPresent) recs.push({ priority: 'kritik', text: 'Title tag\'a hedef anahtar kelimeyi ekleyin, tercihen başa yakın.' });
  if (!a.metaDescription.exists) recs.push({ priority: 'kritik', text: 'Meta description ekleyin. 140-160 karakter arasında, anahtar kelimeyi ve eylem çağrısı içeren bir açıklama yazın.' });
  else if (a.metaDescription.length < 140 || a.metaDescription.length > 160) recs.push({ priority: 'önemli', text: `Meta description uzunluğunu optimize edin (şu an ${a.metaDescription.length} karakter, ideal: 140-160).` });
  if (a.headings.h1Count === 0) recs.push({ priority: 'kritik', text: 'Sayfaya bir H1 tag\'ı ekleyin. Anahtar kelimeyi doğal olarak içeren bir başlık kullanın.' });
  if (a.headings.h1Count > 1) recs.push({ priority: 'önemli', text: `Sayfada ${a.headings.h1Count} adet H1 var. Sadece bir tane H1 olmalı.` });
  if (!a.headings.hasProperHierarchy) recs.push({ priority: 'önemli', text: 'Heading hiyerarşisini düzeltin. H1 > H2 > H3 sıralamasını takip edin.' });
  if (a.content.wordCount < 300) recs.push({ priority: 'kritik', text: `İçerik çok sığ (${a.content.wordCount} kelime). En az 1000+ kelimelik kapsamlı içerik hedefleyin.` });
  else if (a.content.wordCount < 1000) recs.push({ priority: 'önemli', text: `İçerik derinliğini artırın (${a.content.wordCount} kelime). Rakip sayfalar genellikle 1500+ kelime içerir.` });
  if (a.content.keywordQuality === 'aşırı doldurulmuş') recs.push({ priority: 'kritik', text: 'Anahtar kelime aşırı kullanımı tespit edildi. Doğal bir dil kullanın, yoğunluğu %1-2.5 aralığında tutun.' });
  if (a.images.withoutAlt > 0) recs.push({ priority: 'önemli', text: `${a.images.withoutAlt} resimde alt tag eksik. Tüm resimlere açıklayıcı alt text ekleyin.` });
  if (!a.technical.hasCanonical) recs.push({ priority: 'önemli', text: 'Canonical URL tanımlayın. Yinelenen içerik sorunlarını önlemek için canonical tag ekleyin.' });
  if (!a.technical.hasSchema) recs.push({ priority: 'önemli', text: 'Schema.org yapılandırılmış verisi ekleyin. Zengin snippet\'lar için JSON-LD formatını kullanın.' });
  if (!a.technical.hasOG) recs.push({ priority: 'önemli', text: 'Open Graph meta taglarını ekleyin. Sosyal medya paylaşımlarını optimize edin.' });
  if (a.technical.isNoindex) recs.push({ priority: 'kritik', text: 'Sayfa noindex olarak işaretlenmiş! Bu tag\'ı kaldırın, yoksa Google sayfayı indexlemeyecek.' });
  if (a.links.internal < 3) recs.push({ priority: 'önemli', text: `İç bağlantı sayısını artırın (şu an ${a.links.internal}). En az 3-5 ilgili iç bağlantı ekleyin.` });
  if (!a.url.hasHttps) recs.push({ priority: 'kritik', text: 'HTTPS kullanın. Google güvenli siteleri tercih eder.' });
  return recs;
}

function generateCompetitorGap(a) {
  const gaps = [];
  if (!a.technical.hasSchema) gaps.push('Rakipler genellikle Schema.org yapılandırılmış verisi kullanır (FAQ, Article, Product vb.)');
  if (a.content.wordCount < 1500) gaps.push('Üst sıralardaki sayfalar genellikle 1500-3000 kelimelik kapsamlı içerik sunar');
  if (a.headings.h2Count < 3) gaps.push('Rakipler genellikle 5-10 alt başlık (H2) ile içeriği yapılandırır');
  if (!a.technical.hasOG) gaps.push('Rakipler Open Graph ve Twitter Card meta tagları ile sosyal paylaşımları optimize eder');
  if (a.images.total < 3) gaps.push('Rakipler genellikle görseller, infografikler ve videolar ile içeriği zenginleştirir');
  if (a.links.internal < 5) gaps.push('Rakipler güçlü iç bağlantı yapısı ile site otoritesini artırır');
  gaps.push('Üst sıralardaki sayfalar genellikle SSS (FAQ) bölümü içerir');
  gaps.push('Rakipler içerik tablosu (Table of Contents) ile kullanıcı deneyimini iyileştirir');
  return gaps;
}

function generateContentPlan(a, keyword) {
  const plan = { missingSections: [], expandSections: [], suggestedHeadings: [], lsiKeywords: [] };
  if (a.headings.h2Count < 3) {
    plan.missingSections.push('Giriş ve temel kavramlar bölümü');
    plan.missingSections.push('Detaylı açıklama ve örnekler bölümü');
    plan.missingSections.push('Sıkça Sorulan Sorular (SSS) bölümü');
    plan.missingSections.push('Sonuç ve özet bölümü');
  }
  if (a.content.wordCount < 1000) {
    plan.expandSections.push('Mevcut içeriğin daha detaylı ve kapsamlı hale getirilmesi');
    plan.expandSections.push('Örnek ve vaka çalışmaları eklenmesi');
  }
  if (keyword) {
    const kw = keyword.toLowerCase();
    plan.suggestedHeadings = [
      `${keyword} Nedir?`, `${keyword} Nasıl Yapılır?`, `${keyword} Avantajları ve Dezavantajları`,
      `${keyword} İçin En İyi Uygulamalar`, `${keyword} Hakkında Sık Sorulan Sorular`,
      `${keyword} vs. Alternatifler`, `${keyword} Rehberi 2025`
    ];
    plan.lsiKeywords = [`${kw} nedir`, `${kw} nasıl`, `${kw} örnekleri`, `${kw} avantajları`,
      `${kw} fiyat`, `${kw} rehber`, `en iyi ${kw}`, `${kw} ipuçları`, `${kw} karşılaştırma`];
  }
  return plan;
}

function generateActionPlan(a) {
  const steps = [];
  const critical = a.issues.filter(i => i.severity === 'critical');
  const warnings = a.issues.filter(i => i.severity === 'warning');
  const infos = a.issues.filter(i => i.severity === 'info');
  if (critical.length > 0) steps.push({ level: 'Kritik Düzeltmeler', icon: '🔥', items: critical.map(c => c.message) });
  if (warnings.length > 0) steps.push({ level: 'Önemli İyileştirmeler', icon: '⚠️', items: warnings.map(w => w.message) });
  if (infos.length > 0) steps.push({ level: 'Büyüme Optimizasyonları', icon: '📈', items: infos.map(i => i.message) });
  return steps;
}

// PDF export endpoint
app.post('/api/export-pdf', (req, res) => {
  const data = req.body;
  if (!data || !data.score) return res.status(400).json({ error: 'Analiz verisi gereklidir' });
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: 'SEO Analiz Raporu', Author: 'SEO Analiz Aracı' } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=seo-rapor.pdf');
  doc.pipe(res);

  // Register a font that supports Turkish characters
  doc.font('Helvetica');

  const blue = '#3b82f6';
  const dark = '#1e293b';

  // Header
  doc.fontSize(24).fillColor(blue).text('SEO Analiz Raporu', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#64748b').text(`Analiz Tarihi: ${new Date().toLocaleDateString('tr-TR')}`, { align: 'center' });
  doc.text(`URL: ${data.url?.hostname || 'N/A'}${data.url?.pathname || ''}`, { align: 'center' });
  doc.moveDown(1);

  // Score
  doc.fontSize(16).fillColor(dark).text('SEO Skoru', { align: 'center' });
  const scoreColor = data.score >= 80 ? '#10b981' : data.score >= 60 ? '#f59e0b' : '#ef4444';
  doc.fontSize(48).fillColor(scoreColor).text(`${data.score}/100`, { align: 'center' });
  doc.moveDown(1);

  // Title analysis
  doc.fontSize(14).fillColor(blue).text('Title Tag Analizi');
  doc.fontSize(10).fillColor(dark);
  doc.text(`Baslik: ${data.title?.text || 'Yok'}`);
  doc.text(`Uzunluk: ${data.title?.length || 0} karakter`);
  doc.text(`Anahtar Kelime: ${data.title?.keywordPresent ? 'Var' : 'Yok'}`);
  doc.moveDown(0.5);

  // Meta description
  doc.fontSize(14).fillColor(blue).text('Meta Description');
  doc.fontSize(10).fillColor(dark);
  doc.text(`Aciklama: ${data.metaDescription?.text?.substring(0, 100) || 'Yok'}${(data.metaDescription?.text?.length || 0) > 100 ? '...' : ''}`);
  doc.text(`Uzunluk: ${data.metaDescription?.length || 0} karakter`);
  doc.moveDown(0.5);

  // Content
  doc.fontSize(14).fillColor(blue).text('Icerik Analizi');
  doc.fontSize(10).fillColor(dark);
  doc.text(`Kelime Sayisi: ${data.content?.wordCount || 0}`);
  doc.text(`Paragraf Sayisi: ${data.content?.paragraphs || 0}`);
  doc.text(`Anahtar Kelime Yogunlugu: %${data.content?.keywordDensity || 0}`);
  doc.text(`Kullanim Kalitesi: ${data.content?.keywordQuality || 'N/A'}`);
  doc.moveDown(0.5);

  // Headings
  doc.fontSize(14).fillColor(blue).text('Baslik Yapisi');
  doc.fontSize(10).fillColor(dark);
  doc.text(`H1: ${data.headings?.h1Count || 0} adet`);
  doc.text(`H2: ${data.headings?.h2Count || 0} adet`);
  doc.text(`Hiyerarsi: ${data.headings?.hasProperHierarchy ? 'Duzgun' : 'Duzensiz'}`);
  doc.moveDown(0.5);

  // Technical
  doc.fontSize(14).fillColor(blue).text('Teknik SEO');
  doc.fontSize(10).fillColor(dark);
  doc.text(`HTTPS: ${data.url?.hasHttps ? 'Evet' : 'Hayir'}`);
  doc.text(`Canonical: ${data.technical?.hasCanonical ? 'Var' : 'Yok'}`);
  doc.text(`Schema.org: ${data.technical?.hasSchema ? 'Var' : 'Yok'}`);
  doc.text(`Open Graph: ${data.technical?.hasOG ? 'Var' : 'Yok'}`);
  doc.text(`Noindex: ${data.technical?.isNoindex ? 'EVET - KRITIK!' : 'Hayir'}`);
  doc.moveDown(0.5);

  // Images & Links
  doc.fontSize(14).fillColor(blue).text('Gorseller ve Baglantilar');
  doc.fontSize(10).fillColor(dark);
  doc.text(`Toplam Gorsel: ${data.images?.total || 0}`);
  doc.text(`Alt Tag\'li: ${data.images?.withAlt || 0}`);
  doc.text(`Ic Baglanti: ${data.links?.internal || 0}`);
  doc.text(`Dis Baglanti: ${data.links?.external || 0}`);
  doc.moveDown(1);

  // Recommendations
  doc.addPage();
  doc.fontSize(18).fillColor(blue).text('Oneriler ve Eylem Plani', { align: 'center' });
  doc.moveDown(1);
  if (data.recommendations) {
    data.recommendations.forEach((rec, i) => {
      const pColor = rec.priority === 'kritik' ? '#ef4444' : rec.priority === 'onemli' ? '#f59e0b' : '#3b82f6';
      doc.fontSize(10).fillColor(pColor).text(`[${rec.priority.toUpperCase()}] `, { continued: true });
      doc.fillColor(dark).text(rec.text);
      doc.moveDown(0.3);
    });
  }
  doc.moveDown(1);

  // Competitor gap
  doc.fontSize(14).fillColor(blue).text('Rakip Bosluk Analizi');
  doc.moveDown(0.3);
  if (data.competitorGap) {
    data.competitorGap.forEach(gap => {
      doc.fontSize(10).fillColor(dark).text(`- ${gap}`);
      doc.moveDown(0.2);
    });
  }

  doc.end();
});

// Vercel için app'i dışa aktar
module.exports = app;

// Sadece yerelde çalışırken dinle
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`SEO Analiz Aracı çalışıyor: http://localhost:${PORT}`));
}
