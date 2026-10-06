"use client";
import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AdminProduct } from "@restaurant-os/types";
import { ErrorState, Skeleton } from "@restaurant-os/ui";
import { ProductForm } from "@/components/product-form";
import { errorMessage } from "@/lib/api";
import { useSession, useTenantKey } from "@/lib/session";

export default function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { request } = useSession();
  const product = useQuery({ queryKey: useTenantKey("product", id), queryFn: () => request<AdminProduct>(`/v1/admin/products/${id}`), staleTime: 0 });
  if (product.isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-96" /></div>;
  if (product.error || !product.data) return <ErrorState description={errorMessage(product.error)} onRetry={() => void product.refetch()} />;
  return <ProductForm key={product.data.updatedAt} product={product.data} />;
}
