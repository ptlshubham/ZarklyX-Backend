import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();
const api: string = process.env.GEMINI_API || "";
const genAI = new GoogleGenerativeAI(api);

function safeJsonParse(text: string): any {
  try {
    let cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    
    try {
      return JSON.parse(cleaned);
    } catch {
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
      const objectMatch = cleaned.match(/\{[\s\S]*\}/);
      
      if (arrayMatch) {
        return JSON.parse(arrayMatch[0]);
      } else if (objectMatch) {
        return JSON.parse(objectMatch[0]);
      }
      
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

export async function generateUniversalSeoIssues(seoJson: object, analysisType: string = 'general'): Promise<any> {
  const maxRetries = 3;
  const retryDelay = 2000;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash", 
        generationConfig: { 
          temperature: 0.1
        } 
      });
      
      const sanitizedData = sanitizeDataForGemini(seoJson);
      const prompt = `Analyze SEO data and return ONLY issues in this exact JSON format:
[
  {
    "category": "Structure | URLs | Indexing | Protocol | Accessibility | Organization | Performance | Content | Security | Mobile | Technical",
    "severity": "Critical | High | Medium | Low",
    "issue": "Specific issue description",
    "url": "Specific URL where this issue was found",
    "evidence": "Data supporting this finding",
    "impact": "Effect on search engine crawling and indexing efficiency"
  }
]

Return empty array [] if no issues found.
Data: ${JSON.stringify(sanitizedData).substring(0, 3000)}`;
      
      const result = await model.generateContent(prompt);
      const parsed = safeJsonParse(result.response.text());
      
      return Array.isArray(parsed) ? parsed : [];
    } catch (error: any) {
      console.error(`Gemini attempt ${attempt} failed:`, error.message);
      
      if (error.message?.includes('503') && attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        continue;
      }
      
      return [];
    }
  }
  
  return [];
}