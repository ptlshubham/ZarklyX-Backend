import fs from "fs/promises";
import path from "path";

type AnalyzeEntry = {
  seoData: any;
  date: string;
  updatedAt: string;
};

function getFilePath(url: string, category: string): string {
  const safeUrl = url.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const safeCategory = category.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  return path.join(
    process.cwd(),
    "public/seo-scans",
    `${safeUrl}_${safeCategory}.json`
  );
}

/* -------- APPEND/UPDATE ENTRY -------- */

export async function appendAnalyzeState(
  url: string,
  category: string,
  seoData: any
): Promise<void> {
  const filePath = getFilePath(url, category);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  let entries: AnalyzeEntry[] = [];

  try {
    const fileContent = await fs.readFile(filePath, "utf-8");
    if (fileContent) {
      entries = JSON.parse(fileContent);
    }
  } catch {
    entries = [];
  }

  entries.push({
    seoData,
    date: new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString(),
  });

  await fs.writeFile(filePath, JSON.stringify(entries, null, 2), "utf-8");
  console.log("Written to:", filePath);
}

/* -------- READ ALL DATA -------- */

export async function readAnalyzeData(
  url: string,
  category: string
): Promise<AnalyzeEntry[] | null> {
  try {
    const filePath = getFilePath(url, category);
    const fileContent = await fs.readFile(filePath, "utf-8");
    return JSON.parse(fileContent);
  } catch {
    return null;
  }
}

/* -------- FIND LATEST ENTRY -------- */

export async function findLatestEntry(
  url: string,
  category: string
): Promise<AnalyzeEntry | null> {
  const entries = await readAnalyzeData(url, category);
  if (!entries || entries.length === 0) return null;
  return entries[entries.length - 1];
}

/* -------- DELETE FILE -------- */

export async function deleteAnalyzeFile(
  url: string,
  category: string
): Promise<boolean> {
  try {
    await fs.rm(getFilePath(url, category), { force: true });
    return true;
  } catch {
    return false;
  }
}

/* -------- CREATE FILE -------- */

export async function createAnalyzeFile(
  url: string,
  category: string
): Promise<boolean> {
  try {
    const filePath = getFilePath(url, category);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify([], null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

/* -------- LIST ALL CATEGORIES FOR A URL -------- */

export async function listCategoriesForUrl(url: string): Promise<string[]> {
  try {
    const safeUrl = url.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const dirPath = path.join(process.cwd(), "public/seo-scans");
    const files = await fs.readdir(dirPath);

    const categories = files
      .filter((file) => file.startsWith(safeUrl + "_") && file.endsWith(".json"))
      .map((file) => {
        const match = file.match(new RegExp(`^${safeUrl}_(.+)\\.json$`));
        return match ? match[1] : null;
      })
      .filter(Boolean) as string[];

    return categories;
  } catch {
    return [];
  }
}

/* -------- CHECK IF FILE EXISTS -------- */

export async function fileExists(url: string, category: string): Promise<boolean> {
  try {
    const filePath = getFilePath(url, category);
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}