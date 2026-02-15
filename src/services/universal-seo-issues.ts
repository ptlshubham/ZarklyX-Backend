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
      
      let prompt: string;
      
      // Different prompts for different analysis types
      if (analysisType === 'tech-frameworks' || analysisType === 'tech-js') {
        prompt = `You are an expert web performance and SEO analyst. Analyze the JavaScript framework and dependency data below and generate actionable insights.

**Return ONLY a JSON array** in this exact format:
[
  {
    "severity": "critical" | "warning" | "suggestion",
    "category": "SEO Visibility" | "Performance" | "SEO & Performance" | "Performance & Privacy" | "SEO",
    "title": "Short descriptive title (5-8 words)",
    "description": "Detailed description of the issue or observation (20-40 words)",
    "impact": "Specific impact on SEO, performance, or user experience (20-40 words)",
    "recommendation": "Actionable steps to fix or optimize (30-50 words)"
  }
]

**Severity Guidelines:**
- "critical": Issues that severely impact SEO visibility, rendering, or performance (status: critical, scores < 40, <50% content visibility)
- "warning": Issues that moderately impact performance or SEO (status: warning, scores 40-70, CSR without SSR)
- "suggestion": Optimization opportunities that could improve performance (status: good but with room for improvement)

**Focus Areas:**
1. **SEO Visibility**: Content visibility without JS, Googlebot renderability, client-side vs server-side rendering
2. **Performance**: Render-blocking scripts, JS execution time, bundle sizes, DOM Content Loaded time
3. **Dependencies**: Third-party scripts, unused JavaScript, critical file count, dependency score

**Important:**
- Base insights on the actual metric values and status fields in the data
- If contentVisibleWithoutJs status is "critical", this is HIGH PRIORITY
- If googleBotRenderable status is "critical", this is HIGH PRIORITY
- If serverSideRendering is false with CSR detected, recommend SSR implementation
- Mention specific frameworks detected (React, Angular, Vue, etc.) in recommendations
- Include specific numbers from the data (percentages, counts, sizes, times)
- Return empty array [] if all metrics are "good" and no issues found

**Data to analyze:**
${JSON.stringify(sanitizedData, null, 2)}`;
      } else if (analysisType === 'accessibility') {
        prompt = `You are an expert web accessibility and mobile usability analyst. Analyze the accessibility audit data below and generate actionable insights.

**Return ONLY a JSON array** in this exact format:
[
  {
    "severity": "critical" | "warning" | "suggestion",
    "category": "Accessibility" | "Mobile Usability" | "Touch Targets" | "Viewport" | "Responsive Design",
    "title": "Short descriptive title (5-8 words)",
    "description": "Detailed description of the issue or observation (20-40 words)",
    "impact": "Specific impact on accessibility, usability, or user experience (20-40 words)",
    "recommendation": "Actionable steps to fix or improve (30-50 words)"
  }
]

**Severity Guidelines:**
- "critical": Severe accessibility issues (scores < 50, missing viewport, no touch target optimization, WCAG failures)
- "warning": Moderate issues affecting usability (scores 50-80, suboptimal touch targets, limited responsiveness)
- "suggestion": Minor improvements and optimizations (scores > 80 but room for improvement)

**Focus Areas:**
1. **Accessibility Score**: WCAG compliance, aria labels, color contrast, keyboard navigation
2. **Mobile Usability**: Viewport configuration, content width, font sizes
3. **Touch Targets**: Target sizes, spacing between interactive elements
4. **Responsive Design**: Layout adaptation, image scaling, media queries
5. **Interaction**: Visual feedback, zoom capabilities, orientation support

**Important:**
- Base insights on actual audit scores and detected issues
- If accessibility score < 70, this is HIGH PRIORITY
- If mobile usability < 60, this is HIGH PRIORITY
- If touch target score < 70, this is HIGH PRIORITY
- Include specific numbers and percentages from audits
- Reference WCAG guidelines when relevant
- Provide specific recommendations with examples
- Return empty array [] if all scores are excellent (> 90) and no issues found

**Data to analyze:**
${JSON.stringify(sanitizedData, null, 2)}`;
      } else {
        // Default prompt for general SEO analysis
        prompt = `Analyze SEO data and return ONLY issues in this exact JSON format:
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
      }
      
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