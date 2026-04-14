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

// ============================================
// SEO Intelligence Engine — English Only
// ============================================

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
  if (density === 0) return 'none';
  if (density < 0.5) return 'low';
  if (density <= 2.5) return 'natural';
  if (density <= 4) return 'optimized';
  return 'overstuffed';
}

function detectSearchIntent(url, title, content) {
  const text = `${url} ${title} ${content}`.toLowerCase();
  const transactional = ['buy', 'price', 'order', 'shop', 'cart', 'checkout', 'discount', 'deal', 'coupon', 'purchase', 'sale', 'product', 'subscribe', 'pricing', 'plan'];
  const navigational = ['login', 'sign in', 'register', 'contact', 'about', 'account', 'dashboard', 'support', 'help center', 'docs'];
  const informational = ['how to', 'what is', 'guide', 'tutorial', 'tips', 'learn', 'blog', 'article', 'review', 'comparison', 'best', 'top', 'vs', 'example', 'explained'];
  let scores = { informational: 0, transactional: 0, navigational: 0 };
  informational.forEach(w => { if (text.includes(w)) scores.informational++; });
  transactional.forEach(w => { if (text.includes(w)) scores.transactional++; });
  navigational.forEach(w => { if (text.includes(w)) scores.navigational++; });
  const max = Math.max(scores.informational, scores.transactional, scores.navigational);
  if (max === 0) return { type: 'informational', confidence: 'low' };
  if (max === scores.transactional) return { type: 'transactional', confidence: max > 2 ? 'high' : 'medium' };
  if (max === scores.navigational) return { type: 'navigational', confidence: max > 2 ? 'high' : 'medium' };
  return { type: 'informational', confidence: max > 2 ? 'high' : 'medium' };
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

function calculateOnSiteScore(analysis) {
  let score = 0;
  const details = [];
  if (analysis.title.exists) {
    score += 5;
    if (analysis.title.length >= 50 && analysis.title.length <= 60) score += 5;
    else if (analysis.title.length >= 30 && analysis.title.length <= 70) score += 3;
    else score += 1;
    if (analysis.title.keywordPresent) score += 5;
    else details.push({ severity: 'critical', message: 'Target keyword not found in title tag' });
  } else { details.push({ severity: 'critical', message: 'Title tag is missing' }); }
  if (analysis.metaDescription.exists) {
    score += 3;
    if (analysis.metaDescription.length >= 140 && analysis.metaDescription.length <= 160) score += 4;
    else if (analysis.metaDescription.length >= 100 && analysis.metaDescription.length <= 200) score += 2;
    if (analysis.metaDescription.keywordPresent) score += 3;
    else details.push({ severity: 'warning', message: 'Keyword missing from meta description' });
  } else { details.push({ severity: 'critical', message: 'Meta description is missing' }); }
  if (analysis.headings.h1Count === 1) { score += 5; if (analysis.headings.h1KeywordPresent) score += 5; else details.push({ severity: 'warning', message: 'H1 tag does not contain the target keyword' }); }
  else if (analysis.headings.h1Count > 1) { score += 2; details.push({ severity: 'warning', message: `Multiple H1 tags detected (${analysis.headings.h1Count} found)` }); }
  else { details.push({ severity: 'critical', message: 'No H1 tag found on the page' }); }
  if (analysis.headings.hasProperHierarchy) score += 5;
  else { score += 2; details.push({ severity: 'info', message: 'Heading hierarchy is inconsistent' }); }
  if (analysis.url.clean) score += 3;
  if (analysis.url.hasHttps) score += 2;
  else details.push({ severity: 'warning', message: 'HTTPS is not enabled' });
  if (analysis.content.wordCount >= 2000) score += 15;
  else if (analysis.content.wordCount >= 1000) score += 10;
  else if (analysis.content.wordCount >= 500) score += 7;
  else if (analysis.content.wordCount >= 300) score += 4;
  else { score += 1; details.push({ severity: 'critical', message: `Content is too thin (${analysis.content.wordCount} words)` }); }
  const quality = analysis.content.keywordQuality;
  if (quality === 'natural') score += 10;
  else if (quality === 'optimized') score += 7;
  else if (quality === 'low') { score += 3; details.push({ severity: 'warning', message: 'Keyword density is too low' }); }
  else if (quality === 'overstuffed') { score += 1; details.push({ severity: 'critical', message: 'Keyword stuffing detected — reduce keyword density' }); }
  else { details.push({ severity: 'warning', message: 'Target keyword not found in content' }); }
  if (analysis.images.total === 0) score += 3;
  else { const ratio = analysis.images.withAlt / analysis.images.total; score += Math.round(ratio * 5); if (ratio < 0.5) details.push({ severity: 'warning', message: `${Math.round((1-ratio)*100)}% of images are missing alt text` }); }
  if (analysis.links.internal >= 5) score += 5;
  else if (analysis.links.internal >= 2) score += 3;
  else { score += 1; details.push({ severity: 'info', message: 'Internal linking is insufficient' }); }
  if (analysis.technical.hasCanonical) score += 5;
  else { score += 1; details.push({ severity: 'info', message: 'Canonical URL not defined' }); }
  if (analysis.technical.hasSchema) score += 5;
  else { details.push({ severity: 'info', message: 'No Schema.org structured data found' }); }
  if (analysis.technical.hasOG) score += 5;
  else { score += 1; details.push({ severity: 'info', message: 'Open Graph meta tags are missing' }); }
  if (!analysis.technical.isNoindex) score += 5;
  else { details.push({ severity: 'critical', message: 'Page is marked as noindex — Google will NOT index this page!' }); }
  return { score: Math.min(score, 100), details };
}

function calculateOffSiteScore(analysis) {
  let score = 0;
  const signals = [];
  if (analysis.url.hasHttps) { score += 15; signals.push({ type: 'positive', text: 'HTTPS enabled — trust signal present' }); }
  else { signals.push({ type: 'negative', text: 'No HTTPS — major trust signal missing' }); }
  const hostname = analysis.url.hostname || '';
  const tld = hostname.split('.').pop();
  const premiumTlds = ['com', 'org', 'net', 'edu', 'gov', 'io', 'co'];
  if (premiumTlds.includes(tld)) { score += 10; signals.push({ type: 'positive', text: `Premium TLD (.${tld}) — strong credibility signal` }); }
  else { score += 3; signals.push({ type: 'neutral', text: `TLD (.${tld}) has lower perceived authority` }); }
  if (analysis.technical.hasOG) { score += 10; signals.push({ type: 'positive', text: 'Open Graph tags present — social sharing optimized' }); }
  else { signals.push({ type: 'negative', text: 'No OG tags — poor social distribution readiness' }); }
  const hasTwitterCard = analysis.technical.hasTwitterCard || false;
  if (hasTwitterCard) { score += 5; signals.push({ type: 'positive', text: 'Twitter Card tags detected' }); }
  if (analysis.technical.hasSchema) { score += 10; signals.push({ type: 'positive', text: 'Structured data present — rich snippet potential' }); }
  else { signals.push({ type: 'negative', text: 'No structured data — missing rich snippet opportunity' }); }
  if (analysis.content.wordCount >= 2000) { score += 15; signals.push({ type: 'positive', text: 'Comprehensive content signals topical authority' }); }
  else if (analysis.content.wordCount >= 1000) { score += 10; signals.push({ type: 'neutral', text: 'Moderate content depth — topical authority could improve' }); }
  else { score += 3; signals.push({ type: 'negative', text: 'Thin content reduces perceived authority' }); }
  if (analysis.links.external >= 2 && analysis.links.external <= 10) { score += 10; signals.push({ type: 'positive', text: 'Healthy external link profile — cites authoritative sources' }); }
  else if (analysis.links.external > 10) { score += 5; signals.push({ type: 'neutral', text: 'High external link count — may dilute page authority' }); }
  else { score += 2; signals.push({ type: 'negative', text: 'No outbound links — low trust signal to Google' }); }
  if (analysis.technical.hasCanonical) { score += 5; signals.push({ type: 'positive', text: 'Canonical URL set — consolidates link equity' }); }
  const urlDepth = analysis.url.depth || 0;
  if (urlDepth <= 2) { score += 10; signals.push({ type: 'positive', text: 'Shallow URL depth — strong crawl priority signal' }); }
  else if (urlDepth <= 4) { score += 5; signals.push({ type: 'neutral', text: 'Moderate URL depth — acceptable crawl priority' }); }
  else { score += 1; signals.push({ type: 'negative', text: 'Deep URL structure — low crawl priority' }); }
  const parts = hostname.replace(/^www\./, '').split('.');
  const domainName = parts[0] || '';
  const isBranded = domainName.length <= 12 && !/\d{3,}/.test(domainName) && !domainName.includes('-');
  if (isBranded) { score += 10; signals.push({ type: 'positive', text: 'Short branded domain — strong brand signal' }); }
  else { score += 3; signals.push({ type: 'neutral', text: 'Domain structure may lack brand strength' }); }
  return { score: Math.min(score, 100), signals };
}

function generateOffSiteAnalysis(analysis) {
  const hostname = analysis.url.hostname || '';
  let backlinkStrength = 'low';
  let backlinkDesc = 'No direct backlink data available. Based on observable signals, this page likely has limited backlink authority.';
  if (analysis.content.wordCount >= 2000 && analysis.technical.hasSchema && analysis.technical.hasOG) {
    backlinkStrength = 'medium';
    backlinkDesc = 'Content quality and technical optimization suggest moderate link-earning potential. The page may attract organic backlinks.';
  }
  if (analysis.content.wordCount >= 3000 && analysis.links.external >= 3) {
    backlinkStrength = 'high';
    backlinkDesc = 'Comprehensive content with external references indicates strong authority signals. Likely attracting natural backlinks.';
  }
  let authorityLevel = 'low';
  const authoritySignals = [];
  if (analysis.url.hasHttps) authoritySignals.push('HTTPS security');
  if (analysis.technical.hasSchema) authoritySignals.push('Structured data');
  if (analysis.technical.hasOG) authoritySignals.push('Social meta optimization');
  if (analysis.content.wordCount >= 1500) authoritySignals.push('Substantial content depth');
  if (analysis.url.clean) authoritySignals.push('Clean URL structure');
  if (authoritySignals.length >= 4) authorityLevel = 'high';
  else if (authoritySignals.length >= 2) authorityLevel = 'medium';
  const shareability = (analysis.technical.hasOG && analysis.content.wordCount >= 500) ? 'high' : (analysis.technical.hasOG || analysis.content.wordCount >= 500) ? 'medium' : 'low';
  const competitorGaps = [];
  if (analysis.content.wordCount < 1500) competitorGaps.push('Top-ranking pages typically feature 1,500–3,000 words of comprehensive content');
  if (!analysis.technical.hasSchema) competitorGaps.push('Competitors likely use structured data (FAQ, Article, Product schemas) for rich snippets');
  if (analysis.headings.h2Count < 5) competitorGaps.push('Top pages usually have 5–10 structured H2 subheadings');
  if (!analysis.technical.hasOG) competitorGaps.push('Competitors optimize Open Graph and Twitter Card tags for social amplification');
  if (analysis.links.internal < 5) competitorGaps.push('Competitors build strong internal linking structures (5+ contextual internal links)');
  if (analysis.images.total < 3) competitorGaps.push('Top-ranking pages typically include 3+ images, infographics, or embedded media');
  competitorGaps.push('Higher-authority competitors likely have stronger backlink profiles from trusted domains');
  competitorGaps.push('Competitors may have stronger topical authority clusters covering related subtopics');
  return {
    backlinkEstimate: { strength: backlinkStrength, description: backlinkDesc },
    domainAuthority: { estimate: authorityLevel, signals: authoritySignals },
    contentDistribution: { socialReadiness: analysis.technical.hasOG, shareability, hasTwitterCard: analysis.technical.hasTwitterCard || false },
    competitorAuthorityGap: competitorGaps
  };
}

function generateSerpIntelligence(analysis, keyword) {
  const intent = analysis.searchIntent;
  const serpData = {};
  serpData.intentAnalysis = {
    type: intent.type,
    confidence: intent.confidence,
    description: intent.type === 'transactional' ? 'Google will prioritize product pages, pricing, and conversion-optimized content.' : intent.type === 'navigational' ? 'Google will prioritize brand pages and official resources.' : 'Google will prioritize comprehensive guides, tutorials, and in-depth articles.'
  };
  if (intent.type === 'informational') {
    serpData.expectedStructure = {
      format: 'Long-form guide / article',
      wordCount: '1,500 – 3,000 words',
      headings: ['What is [keyword]?', 'How [keyword] Works', 'Benefits of [keyword]', 'Step-by-Step Guide', 'Common Mistakes', 'FAQ Section', 'Conclusion'],
      features: ['Table of Contents', 'Visual aids / images', 'Internal links to related topics', 'FAQ schema for rich snippets', 'Author bio / E-E-A-T signals']
    };
  } else if (intent.type === 'transactional') {
    serpData.expectedStructure = {
      format: 'Product / service page with conversion elements',
      wordCount: '800 – 2,000 words',
      headings: ['Product Overview', 'Key Features', 'Pricing', 'Comparison / Alternatives', 'Customer Reviews', 'FAQ', 'CTA Section'],
      features: ['Product schema markup', 'Clear pricing display', 'Trust signals (reviews, badges)', 'Strong call-to-action', 'Comparison tables']
    };
  } else {
    serpData.expectedStructure = {
      format: 'Brand / resource page',
      wordCount: '500 – 1,500 words',
      headings: ['About [Brand]', 'Services / Features', 'Getting Started', 'Contact / Support'],
      features: ['Organization schema', 'Clear navigation', 'Brand consistency', 'Contact information']
    };
  }
  let rankingProb = 0;
  const onSiteStrength = analysis.onSiteScore || 50;
  const offSiteStrength = analysis.offSiteScore || 30;
  rankingProb = Math.round((onSiteStrength * 0.45) + (offSiteStrength * 0.35));
  if (analysis.content.wordCount >= 1500) rankingProb += 5;
  if (analysis.technical.hasSchema) rankingProb += 5;
  if (analysis.title.keywordPresent && analysis.headings.h1KeywordPresent) rankingProb += 5;
  rankingProb = Math.min(Math.max(rankingProb, 5), 95);
  serpData.rankingProbability = rankingProb;
  const missingForTop10 = [];
  if (!analysis.title.keywordPresent) missingForTop10.push('Add target keyword to title tag (preferably at the beginning)');
  if (analysis.content.wordCount < 1500) missingForTop10.push(`Expand content from ${analysis.content.wordCount} to 1,500+ words`);
  if (!analysis.technical.hasSchema) missingForTop10.push('Implement FAQ or Article schema markup');
  if (analysis.headings.h2Count < 5) missingForTop10.push('Add more structured H2 subheadings (aim for 5–10)');
  if (!analysis.headings.h1KeywordPresent) missingForTop10.push('Include target keyword in H1 tag naturally');
  serpData.missingForTop10 = missingForTop10;
  return serpData;
}

function generateRecommendations(a) {
  const recs = [];
  if (!a.title.exists) recs.push({ priority: 'critical', category: 'on-site', text: 'Add a title tag. Write a compelling title between 50–60 characters with the target keyword near the beginning.' });
  else if (a.title.length < 50 || a.title.length > 60) recs.push({ priority: 'important', category: 'on-site', text: `Optimize title tag length (currently ${a.title.length} chars, ideal: 50–60).` });
  if (!a.title.keywordPresent) recs.push({ priority: 'critical', category: 'on-site', text: 'Add target keyword to the title tag, preferably near the beginning.' });
  if (!a.metaDescription.exists) recs.push({ priority: 'critical', category: 'on-site', text: 'Add a meta description. Write 140–160 characters including the keyword and a clear call-to-action.' });
  else if (a.metaDescription.length < 140 || a.metaDescription.length > 160) recs.push({ priority: 'important', category: 'on-site', text: `Optimize meta description length (currently ${a.metaDescription.length} chars, ideal: 140–160).` });
  if (a.headings.h1Count === 0) recs.push({ priority: 'critical', category: 'on-site', text: 'Add an H1 tag containing the target keyword naturally.' });
  if (a.headings.h1Count > 1) recs.push({ priority: 'important', category: 'on-site', text: `Reduce to a single H1 tag (currently ${a.headings.h1Count} H1 tags).` });
  if (!a.headings.hasProperHierarchy) recs.push({ priority: 'important', category: 'on-site', text: 'Fix heading hierarchy. Follow H1 > H2 > H3 order consistently.' });
  if (a.content.wordCount < 300) recs.push({ priority: 'critical', category: 'on-site', text: `Content is critically thin (${a.content.wordCount} words). Aim for 1,500+ words of comprehensive content.` });
  else if (a.content.wordCount < 1000) recs.push({ priority: 'important', category: 'on-site', text: `Increase content depth (${a.content.wordCount} words). Top-ranking pages average 1,500+ words.` });
  if (a.content.keywordQuality === 'overstuffed') recs.push({ priority: 'critical', category: 'on-site', text: 'Keyword stuffing detected. Reduce keyword density to 1–2.5% and use natural language.' });
  if (a.images.withoutAlt > 0) recs.push({ priority: 'important', category: 'on-site', text: `Add alt text to ${a.images.withoutAlt} images. Use descriptive, keyword-relevant alt attributes.` });
  if (!a.technical.hasCanonical) recs.push({ priority: 'important', category: 'on-site', text: 'Define a canonical URL to prevent duplicate content issues.' });
  if (!a.technical.hasSchema) recs.push({ priority: 'important', category: 'off-site', text: 'Add Schema.org structured data (Article, FAQ, or Product) for rich snippet eligibility.' });
  if (!a.technical.hasOG) recs.push({ priority: 'important', category: 'off-site', text: 'Add Open Graph meta tags to optimize social media sharing and content distribution.' });
  if (a.technical.isNoindex) recs.push({ priority: 'critical', category: 'on-site', text: 'CRITICAL: Remove noindex tag immediately — Google will not index this page!' });
  if (a.links.internal < 3) recs.push({ priority: 'important', category: 'on-site', text: `Add more internal links (currently ${a.links.internal}). Aim for 3–5 contextual internal links.` });
  if (!a.url.hasHttps) recs.push({ priority: 'critical', category: 'off-site', text: 'Enable HTTPS. Google strongly favors secure sites as a ranking signal.' });
  if (a.links.external < 2) recs.push({ priority: 'important', category: 'off-site', text: 'Add 2–3 outbound links to authoritative sources to increase trust signals.' });
  return recs;
}

function generateContentPlan(a, keyword) {
  const plan = { missingSections: [], expandSections: [], suggestedHeadings: [], lsiKeywords: [] };
  if (a.headings.h2Count < 3) {
    plan.missingSections.push('Introduction and core concepts section');
    plan.missingSections.push('Detailed explanation with practical examples');
    plan.missingSections.push('Frequently Asked Questions (FAQ) section');
    plan.missingSections.push('Conclusion and key takeaways');
  }
  if (a.content.wordCount < 1000) {
    plan.expandSections.push('Expand existing content with deeper analysis and detail');
    plan.expandSections.push('Add real-world examples and case studies');
    plan.expandSections.push('Include actionable step-by-step instructions');
  }
  if (keyword) {
    plan.suggestedHeadings = [
      `What is ${keyword}?`, `How ${keyword} Works`, `Benefits of ${keyword}`, `${keyword} Best Practices`,
      `${keyword} vs. Alternatives`, `Common ${keyword} Mistakes to Avoid`, `${keyword} FAQ`,
      `Step-by-Step ${keyword} Guide`, `${keyword} Tools and Resources`
    ];
    const kw = keyword.toLowerCase();
    plan.lsiKeywords = [`${kw} guide`, `${kw} tutorial`, `${kw} examples`, `${kw} benefits`,
      `${kw} best practices`, `how to use ${kw}`, `${kw} tips`, `${kw} comparison`, `${kw} tools`,
      `${kw} strategies`, `${kw} for beginners`, `advanced ${kw}`];
  }
  return plan;
}

function generateCompetitorGap(a) {
  const gaps = { content: [], authority: [], structural: [] };
  if (a.content.wordCount < 1500) gaps.content.push('Top pages typically deliver 1,500–3,000 words of in-depth content');
  if (a.headings.h2Count < 5) gaps.content.push('Competitors use 5–10 well-structured H2 subheadings');
  if (a.images.total < 3) gaps.content.push('Top-ranking pages include visual content (images, infographics, videos)');
  gaps.content.push('Top pages typically include a Table of Contents for user navigation');
  gaps.content.push('Competitors often include FAQ sections optimized with schema markup');
  if (!a.technical.hasSchema) gaps.structural.push('Competitors use structured data for rich snippet visibility in SERPs');
  if (!a.technical.hasOG) gaps.structural.push('Competitors optimize social sharing with OG and Twitter Card meta tags');
  if (a.links.internal < 5) gaps.structural.push('Competitors build strong internal linking architectures across topic clusters');
  gaps.authority.push('Higher-ranking competitors likely have stronger backlink profiles from authoritative domains');
  gaps.authority.push('Competitors may have established topical authority through content clusters');
  gaps.authority.push('Brand recognition and domain age typically favor established competitors');
  return gaps;
}

function generateActionPlan(a) {
  const steps = [];
  const critical = a.issues.filter(i => i.severity === 'critical');
  const warnings = a.issues.filter(i => i.severity === 'warning');
  const infos = a.issues.filter(i => i.severity === 'info');
  if (critical.length > 0) steps.push({ level: 'Critical Fixes', icon: '🔥', description: 'Must fix to be eligible for ranking', items: critical.map(c => c.message) });
  if (warnings.length > 0) steps.push({ level: 'Important Improvements', icon: '⚡', description: 'Will significantly improve rankings', items: warnings.map(w => w.message) });
  if (infos.length > 0) steps.push({ level: 'Growth Optimizations', icon: '🚀', description: 'Long-term authority building', items: infos.map(i => i.message) });
  return steps;
}

// ============================================
// API Route — Main Analysis
// ============================================
app.post('/api/analyze', async (req, res) => {
  const { url, keyword } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });
  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' },
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
    const twitterCard = $('meta[name="twitter:card"]').attr('content') || '';
    const twitterTitle = $('meta[name="twitter:title"]').attr('content') || '';

    const headings = {};
    ['h1','h2','h3','h4','h5','h6'].forEach(tag => { headings[tag] = []; $(tag).each((i, el) => headings[tag].push($(el).text().trim())); });
    const h1KeywordCheck = headings.h1.some(h => h.toLowerCase().includes((keyword||'').toLowerCase()));
    const h2KeywordCheck = headings.h2.some(h => h.toLowerCase().includes((keyword||'').toLowerCase()));
    let hasProperHierarchy = true;
    if (headings.h1.length === 0 && (headings.h2.length > 0 || headings.h3.length > 0)) hasProperHierarchy = false;
    if (headings.h3.length > 0 && headings.h2.length === 0) hasProperHierarchy = false;

    $('script, style, noscript, iframe').remove();
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const wordCount = bodyText.split(/\s+/).filter(w => w.length > 1).length;
    const paragraphs = $('p').length;
    const kwAnalysis = analyzeKeywordPresence(bodyText, keyword);

    const images = [];
    $('img').each((i, el) => { images.push({ src: $(el).attr('src') || '', alt: $(el).attr('alt') || '' }); });
    const imagesWithAlt = images.filter(img => img.alt.length > 0).length;

    let internalLinks = 0, externalLinks = 0;
    const urlInfo = analyzeURL(url);
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href') || '';
      if (href.startsWith('#') || href.startsWith('javascript:')) return;
      try { const linkUrl = new URL(href, url); if (linkUrl.hostname === urlInfo.hostname) internalLinks++; else externalLinks++; } catch { if (href.startsWith('/')) internalLinks++; }
    });

    const hasSchema = $('script[type="application/ld+json"]').length > 0;
    let schemaTypes = [];
    $('script[type="application/ld+json"]').each((i, el) => { try { const data = JSON.parse($(el).html()); if (data['@type']) schemaTypes.push(data['@type']); } catch {} });

    const hasOG = ogTitle.length > 0 || ogDesc.length > 0;
    const hasTwitterCard = twitterCard.length > 0 || twitterTitle.length > 0;
    const isNoindex = robotsMeta.toLowerCase().includes('noindex');
    const isNofollow = robotsMeta.toLowerCase().includes('nofollow');
    const searchIntent = detectSearchIntent(url, title, bodyText);

    const analysis = {
      url: urlInfo,
      title: { text: title, length: title.length, exists: title.length > 0, keywordPresent: keyword ? title.toLowerCase().includes(keyword.toLowerCase()) : false },
      metaDescription: { text: metaDesc, length: metaDesc.length, exists: metaDesc.length > 0, keywordPresent: keyword ? metaDesc.toLowerCase().includes(keyword.toLowerCase()) : false },
      metaKeywords,
      headings: { h1: headings.h1, h2: headings.h2, h3: headings.h3, h4: headings.h4, h5: headings.h5, h6: headings.h6, h1Count: headings.h1.length, h2Count: headings.h2.length, h1KeywordPresent: h1KeywordCheck, h2KeywordPresent: h2KeywordCheck, hasProperHierarchy },
      content: { wordCount, paragraphs, keywordCount: kwAnalysis.count, keywordDensity: kwAnalysis.density, keywordQuality: getKeywordQuality(kwAnalysis.density) },
      images: { total: images.length, withAlt: imagesWithAlt, withoutAlt: images.length - imagesWithAlt, list: images.slice(0, 10) },
      links: { internal: internalLinks, external: externalLinks, total: internalLinks + externalLinks },
      technical: { hasCanonical: canonical.length > 0, canonicalUrl: canonical, hasSchema, schemaTypes, hasOG, ogTitle, ogDesc, ogImage, hasTwitterCard, twitterCard, isNoindex, isNofollow, robotsMeta, hasHttps: urlInfo.hasHttps },
      searchIntent,
      analyzedAt: new Date().toISOString()
    };

    const onSite = calculateOnSiteScore(analysis);
    analysis.onSiteScore = onSite.score;
    analysis.issues = onSite.details;

    const offSite = calculateOffSiteScore(analysis);
    analysis.offSiteScore = offSite.score;
    analysis.offSiteSignals = offSite.signals;

    analysis.score = Math.round((onSite.score * 0.6) + (offSite.score * 0.4));
    analysis.offSiteAnalysis = generateOffSiteAnalysis(analysis);
    analysis.serpIntelligence = generateSerpIntelligence(analysis, keyword);
    analysis.recommendations = generateRecommendations(analysis);
    analysis.competitorGap = generateCompetitorGap(analysis);
    analysis.contentPlan = generateContentPlan(analysis, keyword);
    analysis.actionPlan = generateActionPlan(analysis);

    res.json(analysis);
  } catch (err) {
    console.error('Analysis error:', err.message);
    res.status(500).json({ error: `Failed to analyze page: ${err.message}` });
  }
});

// ============================================
// PDF Export (English)
// ============================================
app.post('/api/export-pdf', (req, res) => {
  const data = req.body;
  if (!data || !data.score) return res.status(400).json({ error: 'Analysis data is required' });
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: 'SEO Analysis Report', Author: 'SEO Intelligence Engine' } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=seo-report.pdf');
  doc.pipe(res);
  doc.font('Helvetica');
  const blue = '#3b82f6'; const dark = '#1e293b';
  doc.fontSize(24).fillColor(blue).text('SEO Intelligence Report', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#64748b').text(`Analysis Date: ${new Date().toLocaleDateString('en-US')}`, { align: 'center' });
  doc.text(`URL: ${data.url?.hostname || 'N/A'}${data.url?.pathname || ''}`, { align: 'center' });
  doc.moveDown(1);
  doc.fontSize(16).fillColor(dark).text('SEO Scores', { align: 'center' });
  const sc = data.score >= 80 ? '#10b981' : data.score >= 60 ? '#f59e0b' : '#ef4444';
  doc.fontSize(36).fillColor(sc).text(`Overall: ${data.score}/100`, { align: 'center' });
  doc.fontSize(14).fillColor(dark).text(`On-Site: ${data.onSiteScore || 0}/100  |  Off-Site: ${data.offSiteScore || 0}/100`, { align: 'center' });
  if (data.serpIntelligence?.rankingProbability) doc.fontSize(12).fillColor('#64748b').text(`Ranking Probability: ${data.serpIntelligence.rankingProbability}%`, { align: 'center' });
  doc.moveDown(1);
  doc.fontSize(14).fillColor(blue).text('Title Tag'); doc.fontSize(10).fillColor(dark);
  doc.text(`Title: ${data.title?.text || 'None'}`); doc.text(`Length: ${data.title?.length || 0} characters`); doc.text(`Keyword: ${data.title?.keywordPresent ? 'Present' : 'Missing'}`); doc.moveDown(0.5);
  doc.fontSize(14).fillColor(blue).text('Meta Description'); doc.fontSize(10).fillColor(dark);
  doc.text(`Content: ${(data.metaDescription?.text || 'None').substring(0, 100)}${(data.metaDescription?.text?.length || 0) > 100 ? '...' : ''}`); doc.text(`Length: ${data.metaDescription?.length || 0} characters`); doc.moveDown(0.5);
  doc.fontSize(14).fillColor(blue).text('Content Analysis'); doc.fontSize(10).fillColor(dark);
  doc.text(`Word Count: ${data.content?.wordCount || 0}`); doc.text(`Keyword Density: ${data.content?.keywordDensity || 0}%`); doc.text(`Quality: ${data.content?.keywordQuality || 'N/A'}`); doc.moveDown(0.5);
  doc.fontSize(14).fillColor(blue).text('Technical SEO'); doc.fontSize(10).fillColor(dark);
  doc.text(`HTTPS: ${data.url?.hasHttps ? 'Yes' : 'No'}`); doc.text(`Canonical: ${data.technical?.hasCanonical ? 'Set' : 'Missing'}`); doc.text(`Schema.org: ${data.technical?.hasSchema ? 'Present' : 'Missing'}`); doc.text(`Open Graph: ${data.technical?.hasOG ? 'Present' : 'Missing'}`); doc.moveDown(1);
  doc.addPage();
  doc.fontSize(18).fillColor(blue).text('Recommendations & Action Plan', { align: 'center' }); doc.moveDown(1);
  if (data.recommendations) { data.recommendations.forEach(rec => { const pc = rec.priority === 'critical' ? '#ef4444' : rec.priority === 'important' ? '#f59e0b' : '#3b82f6'; doc.fontSize(10).fillColor(pc).text(`[${rec.priority.toUpperCase()}] `, { continued: true }); doc.fillColor(dark).text(rec.text); doc.moveDown(0.3); }); }
  doc.end();
});

module.exports = app;
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`SEO Intelligence Engine running: http://localhost:${PORT}`));
}
