import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const api: string = process.env.GEMINI_API || "";
const genAI = new GoogleGenerativeAI(api);

interface SeoIssue {
  issueName: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  affectedUrls: string[];
}

function safeJsonParse(text: string): SeoIssue[] {
  try {
    const cleaned = text
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function generateSeoIssues(seoData: any): Promise<SeoIssue[]> {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        temperature: 0.1,
      },
    });

    const prompt = `
You are a senior technical SEO auditor.

Analyze the provided SEO audit data and identify actionable SEO issues.

STRICT RULES:
- Return ONLY valid JSON
- Do NOT include explanations, comments, or markdown
- Do NOT wrap the response in \`\`\`
- If no issues exist, return an empty array: []
- Do NOT invent URLs that are not in the data
- Each issue must be specific, actionable, and non-duplicated
- Priority must be one of: Critical, High, Medium, Low

OUTPUT FORMAT (STRICT):
[
  {
    "issueName": "Clear and concise SEO issue description",
    "priority": "Critical | High | Medium | Low",
    "affectedUrls": ["https://example.com/page-1"]
  }
]

PRIORITY DEFINITIONS:
- Critical: Prevents indexing, crawling, or causes severe ranking loss
- High: Major impact on rankings, crawl efficiency, or site health
- Medium: Optimization issues affecting relevance or performance
- Low: Minor improvements or best-practice recommendations

ANALYSIS SCOPE:
- Indexing and crawlability
- Technical SEO (status codes, redirects, canonical, pagination)
- On-page SEO (title tags, meta descriptions, headings)
- Internal linking issues
- Duplicate or thin content
- Page performance and Core Web Vitals
- Mobile usability
- Structured data issues (if present)
- Security issues impacting SEO (mixed content, HTTPS issues)

SEO AUDIT DATA:
${JSON.stringify(seoData)}

IMPORTANT:
If the response cannot be represented as valid JSON, return [] only.
`;

    const result = await model.generateContent(prompt);
    return safeJsonParse(result.response.text());
  } catch (error) {
    console.error("Gemini SEO analysis failed:", error);
    return [];
  }
}
