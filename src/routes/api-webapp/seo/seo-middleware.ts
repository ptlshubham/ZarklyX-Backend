import { seo } from './seo-model';
function extractDomain(inputUrl: string): string {
  const parsedUrl = new URL(inputUrl);
  return parsedUrl.hostname.replace(/^www\./, '');
}

export async function saveSeoAnalysis(
  url: string,
  analysisType: string,
  analysisData: any
): Promise<void> {
 
    const domain = extractDomain(url);

    const existingSeo = await seo.findOne({
      where: { url: domain }
    });

    if (!existingSeo) {
      await seo.create({
        url: domain,
        isDeleted: false
      });
    }
 
}