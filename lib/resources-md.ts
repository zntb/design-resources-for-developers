import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { slugify } from './utils';

function resolveResourcesFilePath(): string {
  let currentDir = process.cwd();

  while (true) {
    const candidate = join(currentDir, 'resources.md');
    if (existsSync(candidate)) {
      return candidate;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return join(process.cwd(), 'resources.md');
}

const RESOURCES_FILE = resolveResourcesFilePath();

interface ResourcesMDEntry {
  title: string;
  url: string;
  description?: string;
}

interface CategorySection {
  name: string;
  slug: string;
  startLine: number;
  endLine: number;
}

function isCategorySectionHeading(lines: string[], index: number): boolean {
  const header = lines[index]?.trim().toLowerCase();
  return Boolean(
    header?.startsWith('## ') && header !== '## table of contents',
  );
}

function logVerification(message: string): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] VERIFIED: ${message}`);
}

/**
 * Parse the resources.md file and extract category sections
 */
function parseCategorySections(content: string): CategorySection[] {
  const lines = content.split('\n');
  const sections: CategorySection[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/^##\s+(.+)$/);
    if (headerMatch && isCategorySectionHeading(lines, i)) {
      const name = headerMatch[1].trim();
      const slug = slugify(name);
      sections.push({
        name,
        slug,
        startLine: i,
        endLine: -1,
      });
    }
  }

  for (let i = 0; i < sections.length; i++) {
    if (i < sections.length - 1) {
      sections[i].endLine = sections[i + 1].startLine - 1;
    } else {
      sections[i].endLine = lines.length - 1;
    }
  }

  return sections;
}

/**
 * Find a category section by slug
 */
function findCategorySection(
  sections: CategorySection[],
  categorySlug: string,
): CategorySection | undefined {
  const normalizedSlug = slugify(decodeURIComponent(categorySlug).trim());

  return sections.find(section => {
    const sectionSlug = slugify(section.slug.trim());
    const sectionNameSlug = slugify(section.name.trim());

    return (
      sectionSlug === normalizedSlug ||
      sectionNameSlug === normalizedSlug ||
      sectionSlug.includes(normalizedSlug) ||
      normalizedSlug.includes(sectionSlug)
    );
  });
}

function findCategorySectionBySlugOrName(
  sections: CategorySection[],
  categorySlug: string,
  categoryName?: string,
): CategorySection | undefined {
  const bySlug = findCategorySection(sections, categorySlug);
  if (bySlug) {
    return bySlug;
  }

  if (!categoryName) {
    return undefined;
  }

  const normalizedNameSlug = slugify(categoryName.trim());
  return sections.find(
    section =>
      slugify(section.name.trim()) === normalizedNameSlug ||
      slugify(section.slug.trim()) === normalizedNameSlug,
  );
}

/**
 * Find the first data row line in a section (after the table separator row).
 *
 * The resources.md table structure is:
 *   ## Section
 *   (blank)
 *   > description (optional)
 *   (blank)
 *   | Header | Description |
 *   | --- | --- |              <-- separator row
 *   | [First entry](...) | ... |   <-- we want to insert HERE
 *
 * We locate the separator row by looking for a line that starts with `|`
 * and contains `---`, then return the index immediately after it.
 */
function findFirstDataRowLine(
  lines: string[],
  startLine: number,
  endLine: number,
): number {
  for (let i = startLine + 1; i <= endLine; i++) {
    const trimmed = lines[i]?.trim() ?? '';
    if (trimmed.startsWith('|') && trimmed.includes('---')) {
      return i + 1; // first data row is right after the separator
    }
  }

  // Fallback: no table separator found – return just past the start line
  return startLine + 1;
}

/**
 * Check if an entry already exists in a section
 */
function entryExistsInSection(
  lines: string[],
  startLine: number,
  endLine: number,
  title: string,
  url: string,
): boolean {
  const firstDataRow = findFirstDataRowLine(lines, startLine, endLine);
  for (let i = firstDataRow; i <= endLine; i++) {
    const line = lines[i];
    if (line.includes(`[${title}](${url})`)) {
      return true;
    }
  }
  return false;
}

/**
 * Format a link entry for the markdown table
 */
function formatLinkEntry(entry: ResourcesMDEntry): string {
  const title = entry.title;
  const url = entry.url;
  const description = entry.description || '';
  return `| [${title}](${url}) | ${description} |`;
}

/**
 * Add a new link entry to a category section.
 *
 * The entry is inserted right after the table separator row so it becomes
 * the first row in the table, keeping the markdown table valid.
 */
export function addLinkToResourcesMD(
  categoryId: string,
  categorySlug: string,
  categoryName: string | undefined,
  link: ResourcesMDEntry,
): { success: boolean; error?: string; message?: string } {
  try {
    if (!existsSync(RESOURCES_FILE)) {
      return { success: false, error: 'resources.md file not found' };
    }

    const content = readFileSync(RESOURCES_FILE, 'utf-8').replace(/\r/g, '');
    const lines = content.split('\n');
    const sections = parseCategorySections(content);

    // Find the category section
    const section = findCategorySectionBySlugOrName(
      sections,
      categorySlug,
      categoryName,
    );

    if (!section) {
      return {
        success: false,
        error: `Category section "${categorySlug}" not found in resources.md`,
      };
    }

    // Check for duplicates
    if (
      entryExistsInSection(
        lines,
        section.startLine,
        section.endLine,
        link.title,
        link.url,
      )
    ) {
      return {
        success: false,
        error: `Link "${link.title}" already exists in resources.md`,
      };
    }

    // Find the insertion point: right after the table separator row (| --- |)
    const insertIndex = findFirstDataRowLine(
      lines,
      section.startLine,
      section.endLine,
    );

    if (insertIndex <= section.startLine || insertIndex > section.endLine + 1) {
      return {
        success: false,
        error: `Could not locate table separator row in section "${categorySlug}"`,
      };
    }

    // Insert the new entry
    const newEntry = formatLinkEntry(link);
    lines.splice(insertIndex, 0, newEntry);

    // Write back to file
    writeFileSync(RESOURCES_FILE, lines.join('\n'), 'utf-8');

    // Verify write
    const updatedContent = readFileSync(RESOURCES_FILE, 'utf-8');
    if (!updatedContent.includes(`[${link.title}](${link.url})`)) {
      return {
        success: false,
        error: `Verification failed for link "${link.title}"`,
      };
    }
    logVerification(
      `Added link "${link.title}" to category "${categorySlug}" in resources.md`,
    );

    const timestamp = new Date().toISOString();
    console.log(
      `[${timestamp}] Added link "${link.title}" to category "${categorySlug}" in resources.md`,
    );

    return {
      success: true,
      message: `Added link "${link.title}" to category "${categorySlug}"`,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to add link to resources.md: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/**
 * Add a new category section to resources.md
 */
export function addCategoryToResourcesMD(category: {
  name: string;
  description?: string;
}): { success: boolean; error?: string; message?: string } {
  try {
    if (!existsSync(RESOURCES_FILE)) {
      return { success: false, error: 'resources.md file not found' };
    }

    const content = readFileSync(RESOURCES_FILE, 'utf-8').replace(/\r/g, '');
    const lines = content.split('\n');
    const sections = parseCategorySections(content);

    const categorySlug = slugify(category.name);

    // Check if category already exists
    if (findCategorySection(sections, categorySlug)) {
      return {
        success: false,
        error: `Category "${category.name}" already exists in resources.md`,
      };
    }

    // Find the "Others" section or the last section to insert before
    let insertIndex = lines.length;
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].slug === 'others') {
        insertIndex = sections[i].startLine;
        break;
      }
    }

    if (insertIndex === lines.length) {
      if (sections.length > 0) {
        insertIndex = sections[sections.length - 1].endLine + 1;
      } else {
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('## ')) {
            insertIndex = i;
            break;
          }
        }
      }
    }

    const newSection = [
      '',
      `## ${category.name}`,
      '',
      category.description ? `> ${category.description}` : '',
      '',
      `| Website&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; | Description |`,
      `| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |`,
      '',
      `<div align="right">`,
      `    <b><a href="#table-of-contents">↥ Back To Top</a></b>`,
      `</div>`,
      '',
    ];

    lines.splice(insertIndex, 0, ...newSection);

    const tocStartIndex = lines.findIndex(
      l => l.trim() === '## Table of Contents',
    );
    if (tocStartIndex !== -1) {
      const tocEntry = `- [${category.name}](#${categorySlug})`;
      let tocInsertIndex = tocStartIndex + 1;
      while (
        tocInsertIndex < lines.length &&
        lines[tocInsertIndex].trim().startsWith('- [')
      ) {
        tocInsertIndex++;
      }
      if (!lines.slice(tocStartIndex, tocInsertIndex).includes(tocEntry)) {
        lines.splice(tocInsertIndex, 0, tocEntry);
      }
    }

    writeFileSync(RESOURCES_FILE, lines.join('\n'), 'utf-8');

    const updatedContent = readFileSync(RESOURCES_FILE, 'utf-8');
    if (!updatedContent.includes(`## ${category.name}`)) {
      return {
        success: false,
        error: `Verification failed for category "${category.name}"`,
      };
    }
    logVerification(`Added category "${category.name}" to resources.md`);

    const timestamp = new Date().toISOString();
    console.log(
      `[${timestamp}] Added category "${category.name}" to resources.md`,
    );

    return {
      success: true,
      message: `Added category "${category.name}" to resources.md`,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to add category to resources.md: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/**
 * Update the table of contents in resources.md
 */
export function updateTableOfContents(): { success: boolean; error?: string } {
  try {
    if (!existsSync(RESOURCES_FILE)) {
      return { success: false, error: 'resources.md file not found' };
    }

    const content = readFileSync(RESOURCES_FILE, 'utf-8').replace(/\r/g, '');
    const lines = content.split('\n');
    const sections = parseCategorySections(content);

    const tocStart = lines.findIndex(l => l.includes('## Table of Contents'));
    if (tocStart === -1) {
      return { success: false, error: 'Table of contents not found' };
    }

    let tocEnd = tocStart + 1;
    while (tocEnd < lines.length && !lines[tocEnd].startsWith('## ')) {
      tocEnd++;
    }

    const tocEntries = sections.map(s => `- [${s.name}](#${s.slug})`);

    const newLines = [
      ...lines.slice(0, tocStart + 1),
      '',
      ...tocEntries,
      '',
      ...lines.slice(tocEnd),
    ];

    writeFileSync(RESOURCES_FILE, newLines.join('\n'), 'utf-8');

    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

/**
 * Update a link entry in resources.md
 */
export function updateLinkInResourcesMD(
  categorySlug: string,
  categoryName: string | undefined,
  oldTitle: string,
  oldUrl: string,
  newLink: ResourcesMDEntry,
): { success: boolean; error?: string; message?: string } {
  try {
    if (!existsSync(RESOURCES_FILE)) {
      return { success: false, error: 'resources.md file not found' };
    }

    const content = readFileSync(RESOURCES_FILE, 'utf-8').replace(/\r/g, '');
    const lines = content.split('\n');
    const sections = parseCategorySections(content);

    const section = findCategorySectionBySlugOrName(
      sections,
      categorySlug,
      categoryName,
    );

    if (!section) {
      return {
        success: false,
        error: `Category section "${categorySlug}" not found in resources.md`,
      };
    }

    let found = false;
    const firstDataRow = findFirstDataRowLine(
      lines,
      section.startLine,
      section.endLine,
    );
    for (let i = firstDataRow; i <= section.endLine; i++) {
      const line = lines[i];
      if (line.includes(`[${oldTitle}](${oldUrl})`)) {
        lines[i] = formatLinkEntry(newLink);
        found = true;
        break;
      }
    }

    if (!found) {
      return {
        success: false,
        error: `Link "${oldTitle}" not found in resources.md`,
      };
    }

    writeFileSync(RESOURCES_FILE, lines.join('\n'), 'utf-8');

    const timestamp = new Date().toISOString();
    console.log(
      `[${timestamp}] Updated link "${oldTitle}" to "${newLink.title}" in category "${categorySlug}" in resources.md`,
    );

    return {
      success: true,
      message: `Updated link "${oldTitle}" to "${newLink.title}" in category "${categorySlug}"`,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to update link in resources.md: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/**
 * Delete a link entry from resources.md
 */
export function deleteLinkFromResourcesMD(
  categorySlug: string,
  categoryName: string | undefined,
  title: string,
  url: string,
): { success: boolean; error?: string; message?: string } {
  try {
    if (!existsSync(RESOURCES_FILE)) {
      return { success: false, error: 'resources.md file not found' };
    }

    const content = readFileSync(RESOURCES_FILE, 'utf-8').replace(/\r/g, '');
    const lines = content.split('\n');
    const sections = parseCategorySections(content);

    const section = findCategorySectionBySlugOrName(
      sections,
      categorySlug,
      categoryName,
    );

    if (!section) {
      return {
        success: false,
        error: `Category section "${categorySlug}" not found in resources.md`,
      };
    }

    let found = false;
    const firstDataRow = findFirstDataRowLine(
      lines,
      section.startLine,
      section.endLine,
    );
    for (let i = firstDataRow; i <= section.endLine; i++) {
      const line = lines[i];
      if (line.includes(`[${title}](${url})`)) {
        lines.splice(i, 1);
        found = true;
        break;
      }
    }

    if (!found) {
      return {
        success: false,
        error: `Link "${title}" not found in resources.md`,
      };
    }

    writeFileSync(RESOURCES_FILE, lines.join('\n'), 'utf-8');

    const timestamp = new Date().toISOString();
    console.log(
      `[${timestamp}] Deleted link "${title}" from category "${categorySlug}" in resources.md`,
    );

    return {
      success: true,
      message: `Deleted link "${title}" from category "${categorySlug}"`,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to delete link from resources.md: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/**
 * Update a category section in resources.md
 */
export function updateCategoryInResourcesMD(
  oldSlug: string,
  oldName: string | undefined,
  newCategory: { name: string; description?: string },
): { success: boolean; error?: string; message?: string } {
  try {
    if (!existsSync(RESOURCES_FILE)) {
      return { success: false, error: 'resources.md file not found' };
    }

    const content = readFileSync(RESOURCES_FILE, 'utf-8');
    const lines = content.split('\n');
    const sections = parseCategorySections(content);

    const section = findCategorySectionBySlugOrName(sections, oldSlug, oldName);

    if (!section) {
      return {
        success: false,
        error: `Category section "${oldSlug}" not found in resources.md`,
      };
    }

    const newSlug = slugify(newCategory.name);

    lines[section.startLine] = `## ${newCategory.name}`;

    const descIndex = section.startLine + 1;
    if (lines[descIndex]?.trim().startsWith('>')) {
      if (newCategory.description) {
        lines[descIndex] = `> ${newCategory.description}`;
      } else {
        lines.splice(descIndex, 1);
      }
    } else if (newCategory.description) {
      lines.splice(descIndex, 0, `> ${newCategory.description}`);
    }

    const tocIndex = lines.findIndex(l =>
      l.includes(`- [${section.name}](#${oldSlug})`),
    );
    if (tocIndex !== -1) {
      lines[tocIndex] = `- [${newCategory.name}](#${newSlug})`;
    }

    writeFileSync(RESOURCES_FILE, lines.join('\n'), 'utf-8');

    const timestamp = new Date().toISOString();
    console.log(
      `[${timestamp}] Updated category "${section.name}" to "${newCategory.name}" in resources.md`,
    );

    return {
      success: true,
      message: `Updated category "${section.name}" to "${newCategory.name}"`,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to update category in resources.md: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/**
 * Delete a category section from resources.md
 */
export function deleteCategoryFromResourcesMD(categorySlug: string): {
  success: boolean;
  error?: string;
  message?: string;
} {
  try {
    if (!existsSync(RESOURCES_FILE)) {
      return { success: false, error: 'resources.md file not found' };
    }

    const content = readFileSync(RESOURCES_FILE, 'utf-8').replace(/\r/g, '');
    const lines = content.split('\n');
    const sections = parseCategorySections(content);

    const section = findCategorySectionBySlugOrName(
      sections,
      categorySlug,
      undefined,
    );

    if (!section) {
      return {
        success: false,
        error: `Category section "${categorySlug}" not found in resources.md`,
      };
    }

    const categoryName = section.name;

    lines.splice(section.startLine, section.endLine - section.startLine + 1);

    const tocIndex = lines.findIndex(l =>
      l.includes(`- [${categoryName}](#${categorySlug})`),
    );
    if (tocIndex !== -1) {
      lines.splice(tocIndex, 1);
    }

    writeFileSync(RESOURCES_FILE, lines.join('\n'), 'utf-8');

    const timestamp = new Date().toISOString();
    console.log(
      `[${timestamp}] Deleted category "${categoryName}" from resources.md`,
    );

    return {
      success: true,
      message: `Deleted category "${categoryName}" from resources.md`,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(
      `Failed to delete category from resources.md: ${errorMessage}`,
    );
    return { success: false, error: errorMessage };
  }
}
