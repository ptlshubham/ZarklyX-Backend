import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { generateSeoIssues } from '../../../../services/gemini-seo-issues';
import dotenv from 'dotenv';
dotenv.config()
const api : string="AIzaSyCBEa6aiK2e6etGfwaDd__Dh4Cr4UcmKkk";
const genAI = new GoogleGenerativeAI(api);

async function askGroq(question: string): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash"
  });

  const result = await model.generateContent(question);
  return result.response.text();
}



const STOPWORDS = new Set([
  'and','or','the','with','for','to','from','of','in','on','at',
  'a','an','is','are','was','were','be','by','as','that','this',
  'it','we','you','your','our','their','they','around','near'
]);

function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOPWORDS.has(word));
}

function generatePhrases(words: string[], maxLength = 3): string[] {
  const phrases: string[] = [];
  for (let i = 0; i < words.length; i++) {
    for (let len = 2; len <= maxLength; len++) {
      const phrase = words.slice(i, i + len).join(' ');
      if (phrase.split(' ').length === len) {
        phrases.push(phrase);
      }
    }
  }
  return phrases;
}

export async function fetchKeywords(url: string) {
  const { data: html } = await axios.get(url, {
    headers: { 'User-Agent': 'SEO-BOT' }
  });

  const $ = cheerio.load(html);
  const keywordSet = new Set<string>();

  const sources = [
    $('title').text(),
    $('meta[name="keywords"]').attr('content') || '',
    $('meta[name="description"]').attr('content') || '',
    $('h1').text()
  ];

  for (const source of sources) {
    const words = normalize(source);
    words.forEach(w => keywordSet.add(w));

    generatePhrases(words).forEach(p => keywordSet.add(p));
  }

  return Array.from(keywordSet);
}

let keywords: string[];

interface RankResult {
  keyword: string;
  position: number | string;
  page: number | string;
}

const RESULTS_PER_PAGE = 10;
const MAX_PAGES = 1;

async function fetchSerp(keyword: string, page: number): Promise<string> {
  const offset = (page - 1) * RESULTS_PER_PAGE;
  const url = `https://duckduckgo.com/lite/?q=${encodeURIComponent(keyword)}&s=${offset}`;

  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html',
      'Referer': 'https://duckduckgo.com/'
    },
    timeout: 10000
  });

  return res.data;
}

async function getRank(keyword: string, domain: string): Promise<RankResult> {
  let positionCounter = 1;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const html = await fetchSerp(keyword, page);
    const $ = cheerio.load(html);
    const links = $('a.result-link');

    for (let i = 0; i < links.length; i++) {
      const url = $(links[i]).attr('href') || '';
      if (url.includes(domain)) {
        return { keyword, position: positionCounter, page };
      }
      positionCounter++;
    }
    await new Promise(r => setTimeout(r, 3000));
  }

  return { keyword, position: "not found", page: "not found" };
}


export async function keywordRenkChecker(url: string) {
  keywords = await fetchKeywords(url);
  const rawKeywords = keywords;
  console.log(rawKeywords);

  const prompt = `
You are an SEO keyword analyst specializing in search intent classification and optimization for the domain: ${url}

OBJECTIVE:
Analyze the provided list of keywords and identify those with high commercial value. Selected keywords must satisfy ALL of the following conditions:

1.  **Direct Relevance:** The keyword must align directly with the core products, services, or solutions offered by ${url}.
2.  **Clear Intent:** The keyword must demonstrate unambiguous commercial, transactional, or commercial-investigative intent (e.g., seeking to purchase, hire, or compare specific services/products).
3.  **Conversion Potential:** The keyword must represent a realistic opportunity for user conversion, such as a lead, quote request, or sale.

SELECTION CRITERIA:
- **Retain Keywords That:** Contain strong buying signals (e.g., "buy," "price," "service," "order"), denote problem-solving with a commercial outcome (e.g., "fix [issue]," "repair [product]"), or are specific, actionable service/product queries.
- **Exclude Keywords That:** Are purely informational ("what is," "how to," "guide," "definition"), overly broad or generic, irrelevant to the domain's business model, or are duplicate/near-duplicate variants of a selected keyword.

CONSTRAINTS:
- Output a maximum of 50 keywords. This limit should only be reached if the input list contains sufficient high-quality, high-intent terms.
- Prioritize keyword quality and intent strength over quantity.
- Do not modify, paraphrase, or create new keywords. Use only the exact phrasing provided in the input list.
- Output only the selected keywords as a comma-separated list. Do not include any introductory text, explanations, numbering, or formatting.
- Special consideration: If the provided keyword list is empty, generate and output a comma-separated list of up to 50 keywords with strong commercial intent appropriate for the domain ${url}.

INPUT KEYWORDS:
${rawKeywords}
`;

  const groqText = await askGroq(prompt);
  const refinedKeywords = groqText
    .split(',')
    .map(k => k.trim())
    .filter(Boolean);
  console.log(refinedKeywords);

  const report: RankResult[] = [];
  const domain: string = url.split("://")[1];

  for (const keyword of refinedKeywords) {
    console.log(`🔍 Checking rank for: ${keyword}`);
    const result = await getRank(keyword, domain);
    report.push(result);
  }

  console.log(JSON.stringify(report, null, 2));

  const analysisData = {
    url,
    keywords: refinedKeywords,
    rankings: report,
    timestamp: new Date().toISOString()
  };



  const geminiIssues = await generateSeoIssues(analysisData);

  return {
    success: true,
    ...analysisData,
    issues: geminiIssues
  };
}

