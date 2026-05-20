'use server';

import {
  categorySchema,
  linkSchema,
  updateCategorySchema,
  updateLinkSchema,
  deleteSchema,
} from '@/lib/schemas';
import {
  getCategories,
  getCategoryBySlug,
  getCategoryWithLinks,
  getCategoryWithLinksCount,
  getAllCategoriesWithLinks,
  getAllCategoriesWithLinksCount,
  getAllLinksCount,
  getAllLinksPaginated,
  createCategory as createCategoryData,
  updateCategory as updateCategoryData,
  deleteCategory as deleteCategoryData,
  createLink as createLinkData,
  updateLink as updateLinkData,
  deleteLink as deleteLinkData,
  getLinkById,
  searchLinks,
  searchLinksByCategory,
  searchLinksWithCategorySlug,
  incrementLinkClicks,
  getCategoryById,
  SortOrder,
} from '@/lib/data';
import { revalidatePath } from 'next/cache';
import { getCurrentAdminEmail } from '@/lib/admin-auth';
import {
  addLinkToResourcesMD,
  addCategoryToResourcesMD,
  updateLinkInResourcesMD,
  updateCategoryInResourcesMD,
  deleteLinkFromResourcesMD,
  deleteCategoryFromResourcesMD,
} from '@/lib/resources-md';

async function ensureAdmin() {
  const adminEmail = await getCurrentAdminEmail();
  if (!adminEmail) {
    throw new Error('Unauthorized');
  }
}
// Category Actions
export async function getCategoriesAction() {
  return getCategories();
}

export async function getCategoryBySlugAction(slug: string) {
  return getCategoryBySlug(slug);
}

export async function getCategoryWithLinksAction(
  slug: string,
  options?: { limit?: number; skip?: number; sortBy?: SortOrder },
) {
  return getCategoryWithLinks(slug, options);
}

export async function getCategoryWithLinksCountAction(slug: string) {
  return getCategoryWithLinksCount(slug);
}

export async function getAllCategoriesWithLinksAction(options?: {
  limit?: number;
  skip?: number;
}) {
  return getAllCategoriesWithLinks(options);
}

export async function getAllCategoriesWithLinksCountAction() {
  return getAllCategoriesWithLinksCount();
}

export async function getAllLinksCountAction() {
  return getAllLinksCount();
}

export async function getAllLinksPaginatedAction(options?: {
  limit?: number;
  skip?: number;
  sortBy?: SortOrder;
}) {
  return getAllLinksPaginated(options);
}

export async function createCategory(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureAdmin();
    const data = {
      name: formData.get('name') as string,
      description: formData.get('description') || undefined,
      icon: formData.get('icon') || undefined,
      color: formData.get('color') || undefined,
    };

    const validated = categorySchema.parse(data);
    const category = await createCategoryData(validated);

    // Update resources.md
    const mdResult = addCategoryToResourcesMD({
      name: category.name,
      description: category.description,
    });

    if (!mdResult.success) {
      console.warn(`Failed to update resources.md: ${mdResult.error}`);
    }

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Failed to create category' };
  }
}

export async function updateCategoryAction(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureAdmin();
    const data = {
      id: formData.get('id') as string,
      name: formData.get('name') || undefined,
      description: formData.get('description') || undefined,
      icon: formData.get('icon') || undefined,
      color: formData.get('color') || undefined,
    };

    const validated = updateCategorySchema.parse(data);

    // Get the old category to find its slug
    const oldCategory = await getCategoryById(validated.id);
    const oldSlug = oldCategory?.slug;

    await updateCategoryData(validated.id, validated);

    // Update resources.md
    if (oldSlug && (validated.name || validated.description !== undefined)) {
      const mdResult = updateCategoryInResourcesMD(oldSlug, oldCategory.name, {
        name: validated.name || oldCategory.name,
        description: validated.description,
      });

      if (!mdResult.success) {
        console.warn(`Failed to update resources.md: ${mdResult.error}`);
      }
    }

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Failed to update category' };
  }
}

export async function deleteCategoryAction(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureAdmin();
    const data = {
      id: formData.get('id') as string,
    };

    const validated = deleteSchema.parse(data);

    // Get the category to find its slug before deletion
    const category = await getCategoryById(validated.id);
    const categorySlug = category?.slug;

    await deleteCategoryData(validated.id);

    // Update resources.md
    if (categorySlug) {
      const mdResult = deleteCategoryFromResourcesMD(categorySlug);
      if (!mdResult.success) {
        console.warn(`Failed to update resources.md: ${mdResult.error}`);
      }
    }

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Failed to delete category' };
  }
}

// Link Actions
export async function createLink(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureAdmin();
    const data = {
      title: formData.get('title') as string,
      url: formData.get('url') as string,
      description: formData.get('description') || undefined,
      icon: formData.get('icon') || undefined,
      categoryId: formData.get('categoryId') as string,
    };

    const validated = linkSchema.parse(data);
    const link = await createLinkData(validated);

    // Get category to find its slug
    const category = await getCategoryById(validated.categoryId);
    if (category) {
      // Update resources.md
      const mdResult = addLinkToResourcesMD(
        category.id,
        category.slug,
        category.name,
        {
        title: link.title,
        url: link.url,
        description: link.description,
      },
      );

      if (!mdResult.success) {
        console.warn(`Failed to update resources.md: ${mdResult.error}`);
      }
    }

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Failed to create link' };
  }
}

export async function updateLinkAction(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureAdmin();
    const data = {
      id: formData.get('id') as string,
      title: formData.get('title') || undefined,
      url: formData.get('url') || undefined,
      description: formData.get('description') || undefined,
      icon: formData.get('icon') || undefined,
      categoryId: formData.get('categoryId') as string,
    };

    const validated = updateLinkSchema.parse(data);

    // Get the old link to find its details before update
    const oldLink = await getLinkById(validated.id);
    const oldTitle = oldLink?.title;
    const oldUrl = oldLink?.url;
    const categoryId = validated.categoryId || oldLink?.categoryId;
    const category = categoryId ? await getCategoryById(categoryId) : null;
    const categorySlug = category?.slug;

    await updateLinkData(validated.id, validated);

    // Update resources.md
    if (oldTitle && oldUrl && categorySlug) {
      const mdResult = updateLinkInResourcesMD(
        categorySlug,
        category?.name,
        oldTitle,
        oldUrl,
        {
          title: validated.title || oldTitle,
          url: validated.url || oldUrl,
          description: validated.description ?? oldLink?.description,
        },
      );

      if (!mdResult.success) {
        console.warn(`Failed to update resources.md: ${mdResult.error}`);
      }
    }

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Failed to update link' };
  }
}

export async function deleteLinkAction(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureAdmin();
    const data = {
      id: formData.get('id') as string,
    };

    const validated = deleteSchema.parse(data);

    // Get the link to find its details before deletion
    const link = await getLinkById(validated.id);
    const linkTitle = link?.title;
    const linkUrl = link?.url;
    const category = link?.categoryId
      ? await getCategoryById(link.categoryId)
      : null;
    const categorySlug = category?.slug;

    await deleteLinkData(validated.id);

    // Update resources.md
    if (linkTitle && linkUrl && categorySlug) {
      const mdResult = deleteLinkFromResourcesMD(
        categorySlug,
        category?.name,
        linkTitle,
        linkUrl,
      );
      if (!mdResult.success) {
        console.warn(`Failed to update resources.md: ${mdResult.error}`);
      }
    }

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Failed to delete link' };
  }
}

export async function searchLinksAction(query: string) {
  try {
    return { success: true, data: await searchLinks(query) };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Failed to search links' };
  }
}

export async function searchLinksByCategoryAction(
  query: string,
  categorySlug: string,
) {
  try {
    return {
      success: true,
      data: await searchLinksByCategory(query, categorySlug),
    };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Failed to search links' };
  }
}

export async function trackLinkClick(linkId: string) {
  await incrementLinkClicks(linkId);
}

// Autocomplete Suggestions
export async function getAutocompleteSuggestionsAction(
  query: string,
  categorySlug?: string,
) {
  try {
    if (!query || query.trim().length < 2) {
      return { success: true, data: [] };
    }
    const suggestions = await searchLinksWithCategorySlug(
      query.trim(),
      categorySlug,
    );
    // Limit to 8 suggestions for autocomplete
    const limitedSuggestions = suggestions.slice(0, 8);
    return { success: true, data: limitedSuggestions };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Failed to get suggestions' };
  }
}
