import { prisma } from '../lib/db';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Export database data to resources.md format
 * This script generates a markdown file from the database contents
 */
async function exportToMarkdown() {
  console.log('Starting export to resources.md...');

  // Get all categories with their links
  const categories = await prisma.category.findMany({
    orderBy: { order: 'asc' },
    include: {
      links: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  const reservedCategorySlugs = new Set(['table-of-contents']);
  const reservedCategoryNames = new Set([
    'Table of Contents',
    'Please read [`contributing guidelines`](./contributing.md) before submitting new resources.',
  ]);
  const contentCategories = categories.filter(
    category =>
      !reservedCategorySlugs.has(category.slug) &&
      !reservedCategoryNames.has(category.name),
  );

  // Build the markdown content
  const lines: string[] = [];

  // Header with banner and sponsorship
  lines.push('![Repository Banner](headerimage.png)');
  lines.push('');
  lines.push('<div align="center" markdown="1">');
  lines.push('   <sup>Special thanks to:</sup>');
  lines.push('   <br>');
  lines.push('   <br>');
  lines.push('   <a href="https://www.warp.dev/windebloat">');
  lines.push(
    '      <img alt="Warp sponsorship" src="https://github.com/user-attachments/assets/c21102f7-bab9-4344-a731-0cf6b341cab2">',
  );
  lines.push('   </a>');
  lines.push('');
  lines.push('Warp, the intelligent terminal for developers');
  lines.push('Available for MacOS, Linux, & Windows<br>');
  lines.push('');
  lines.push('</div>');
  lines.push('<hr>');
  lines.push('');
  lines.push(
    '#### Please read [`contributing guidelines`](./contributing.md) before submitting new resources.',
  );
  lines.push('');

  // Table of Contents
  lines.push('## Table of Contents');
  lines.push('');
  lines.push('- [Table of Contents](#table-of-contents)');

  // Table of contents entries
  for (const category of contentCategories) {
    lines.push(`- [${category.name}](#${category.slug})`);
  }
  lines.push('');

  // Category sections
  for (const category of contentCategories) {
    lines.push(`## ${category.name}`);
    lines.push('');

    if (category.description) {
      lines.push(`> ${category.description}`);
      lines.push('');
    }

    // Table header
    lines.push(
      '| Website&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; | Description |',
    );
    lines.push(
      '| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |',
    );
    // lines.push('');

    // Table rows
    for (const link of category.links) {
      const title = link.title;
      const url = link.url;
      const description = link.description || '';
      lines.push(`| [${title}](${url}) | ${description} |`);
    }

    lines.push('');
    lines.push('<div align="right">');
    lines.push('    <b><a href="#table-of-contents">↥ Back To Top</a></b>');
    lines.push('</div>');
    lines.push('');
  }

  // Write to file
  const outputPath = path.join(process.cwd(), 'resources.md');
  const content = lines.join('\n');

  fs.writeFileSync(outputPath, content, 'utf-8');

  console.log(`✅ Successfully exported to ${outputPath}`);
  console.log(
    `   Categories: ${contentCategories.length}, Links: ${contentCategories.reduce(
      (sum, cat) => sum + cat.links.length,
      0,
    )}`,
  );
}

// Run the export
exportToMarkdown()
  .catch(async error => {
    console.error('Export failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
