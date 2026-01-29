import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();
const api : string=process.env.GEMINI_API || "";
const genAI = new GoogleGenerativeAI(api);

function safeJsonParse(text: string): any {
  try {
    // Remove markdown code blocks
    let cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    
    // Try direct parse first
    try {
      return JSON.parse(cleaned);
    } catch {
      // Extract JSON array or object
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
      const objectMatch = cleaned.match(/\{[\s\S]*\}/);
      
      if (arrayMatch) {
        return JSON.parse(arrayMatch[0]);
      } else if (objectMatch) {
        return JSON.parse(objectMatch[0]);
      }
      
      // Fallback: return empty array
      return [];
    }
  } catch (err) {
    console.error('JSON parse error:', err);
    return [];
  }
}

function sanitizeDataForGemini(data: any): any {
  const maxStringLength = 500;
  const maxArrayLength = 10;
  const maxObjectDepth = 3;
  
  function truncateString(str: string): string {
    return str.length > maxStringLength ? str.substring(0, maxStringLength) + '...' : str;
  }
  
  function sanitizeValue(value: any, depth: number = 0): any {
    if (depth > maxObjectDepth) return '[Object too deep]';
    
    if (typeof value === 'string') {
      return truncateString(value);
    }
    
    if (Array.isArray(value)) {
      return value.slice(0, maxArrayLength).map(item => sanitizeValue(item, depth + 1));
    }
    
    if (value && typeof value === 'object') {
      const sanitized: any = {};
      let count = 0;
      for (const [key, val] of Object.entries(value)) {
        if (count >= 20) break;
        sanitized[key] = sanitizeValue(val, depth + 1);
        count++;
      }
      return sanitized;
    }
    
    return value;
  }
  
  return sanitizeValue(data);
}

export async function generateSeoIssues(seoJson: object, analysisType: string = 'general'): Promise<any> {
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash", 
      generationConfig: { 
        temperature: 0.1
      } 
    });
    
    const sanitizedData = sanitizeDataForGemini(seoJson);
    const prompt = `Analyze SEO data and return issues as JSON array:
[{"issueid":"id","name":"issue","priority":"High","affected_url":"url"}]

Data: ${JSON.stringify(sanitizedData).substring(0, 3000)}`;
    
    const result = await model.generateContent(prompt);
    const parsed = safeJsonParse(result.response.text());
    
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Gemini API error:', error);
    return [];
  }
}

export async function generateSecurityAudit(seoJson: object): Promise<any> {
  return await generateSeoIssues(seoJson, 'security');
}

export async function generateMobileAudit(seoJson: object): Promise<any> {
  return await generateSeoIssues(seoJson, 'mobile');
}

export async function generateComprehensiveAudit(seoJson: object): Promise<any> {
  return await generateSeoIssues(seoJson, 'comprehensive');
}

export async function generateLighthouseAudit(seoJson: object): Promise<any> {
  return await generateSeoIssues(seoJson, 'lighthouse');
}

export async function generateIndexingAudit(seoJson: object): Promise<any> {
  return await generateSeoIssues(seoJson, 'indexing');
}

export async function generateDomainAuthorityAudit(seoJson: object): Promise<any> {
  return await generateSeoIssues(seoJson, 'domain-authority');
}

export async function generateTechFrameworksAudit(seoJson: object): Promise<any> {
  return await generateSeoIssues(seoJson, 'tech-frameworks');
}

export async function generateIntegratedAudit(seoJson: object): Promise<any> {
  return await generateSeoIssues(seoJson, 'integrated');
}

export async function generateSiteWideAudit(seoJson: object): Promise<any> {
  return await generateSeoIssues(seoJson, 'site-wide');
}

export async function generateKeywordRankingAudit(seoJson: object): Promise<any> {
  return await generateSeoIssues(seoJson, 'keyword-ranking');
}

export async function generateSitemapAudit(seoJson: object): Promise<any> {
  return await generateSeoIssues(seoJson, 'sitemap');
}