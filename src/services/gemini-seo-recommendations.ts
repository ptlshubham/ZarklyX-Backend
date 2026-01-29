import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();
const api: string = "AIzaSyCBEa6aiK2e6etGfwaDd__Dh4Cr4UcmKkk";
const genAI = new GoogleGenerativeAI(api);

interface SeoRecommendation {
  issueName: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  recommendation: string;
  implementation: string;
  expectedImpact: string;
}

function safeJsonParse(text: string): SeoRecommendation[] {
  try {
    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function generateSeoRecommendations(issues: any[]): Promise<SeoRecommendation[]> {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { temperature: 0.1 }
    });

   const prompt = `
You are a senior cybersecurity consultant with practical expertise in web application SEO, infrastructure hardening, and secure software development.

Your task is to generate **precise, actionable, and implementation-ready security recommendations** for the provided security issues.

STRICT OUTPUT RULES:
- Return **ONLY valid JSON**
- Do **NOT** include explanations, comments, markdown, emojis, or extra text
- Follow the exact output schema provided
- Each recommendation must be:
  - Directly mapped to the reported issue
  - Simple to implement
  - Technically accurate and realistic
- Avoid vague guidance (e.g., "improve security", "follow best practices")
- Assume execution by a developer, DevOps engineer, or security engineer

CONTENT RULES:
- Clearly state **what must be fixed**
- Recommendations must reference **real configuration changes or code-level actions**
- Expected impact must describe **tangible risk reduction**
- If the issue involves:
  - HTTP security headers
  - SSL/TLS configuration
  - Authentication or authorization
  - Input validation
  - Server or cloud configuration
  - Dependency vulnerabilities  
  → Include **exact controls, settings, or enforcement mechanisms**

IMPLEMENTATION RULES (MANDATORY):
- Implementation must contain **exactly 3 or 4 steps**
- Steps must be **comma-separated in a single sentence**
- Steps must be **practical and commonly used in production**
- Do NOT include unusual, experimental, or non-standard actions
- Do NOT include numbering or bullet symbols
- Implementation must Be user readable language
- give all url where to Implement

OUTPUT FORMAT (STRICT):
[
  {
    "issueName": "Issue name from input",
    "severity": "Critical | High | Medium | Low",
    "recommendation": "Concrete and actionable SEO fix",
    "implementation": "Step one, step two, step three, step four (if applicable) add all IMPLEMENTATION RULES",
    "expectedImpact": "Clear and measurable SEO improvement"
  }
]

SEO ISSUES INPUT:
${JSON.stringify(issues)}
`;


    const result = await model.generateContent(prompt);
    return safeJsonParse(result.response.text());
  } catch (error) {
    console.error('Gemini recommendation failed:', error);
    return [];
  }
}