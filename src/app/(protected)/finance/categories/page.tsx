import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import { getCategories } from "@/modules/finance";
import { PageHeader } from "@/components/ui/page-header";
import { AddCategoryDialog } from "./add-category-dialog";

export const metadata: Metadata = {
  title: "Categories — Personal Life OS",
};

export default async function CategoriesPage() {
  await requireUser();
  const categories = getCategories();

  return (
    <>
      <PageHeader
        title="Categories"
        description="Income and expense categories used to classify transactions."
      />

      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium">All categories</h2>
        <AddCategoryDialog />
      </div>

      {categories.length > 0 && (
        <p className="text-muted-foreground text-sm">{categories.map((c) => c.name).join(", ")}</p>
      )}
    </>
  );
}
