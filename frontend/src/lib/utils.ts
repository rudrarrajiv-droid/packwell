import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Builds a display label for a customer that disambiguates same-named
 * customer records (e.g. two "SHAKTI APIFOODS" rows created on different
 * dates). If the customer's name is unique within `allCustomers`, the
 * plain name is returned unchanged. Otherwise the creation date is
 * appended, e.g. "SHAKTI APIFOODS (created 2026-08-01)".
 */
export function getCustomerDisplayLabel(
  customer: { name?: string; createdAt?: any } | null | undefined,
  allCustomers: { name?: string }[] = []
): string {
  if (!customer) return '';
  const name = (customer.name || '').trim();
  if (!name) return 'Unnamed Customer';
  const normalized = name.toLowerCase();
  const duplicateCount = (allCustomers || []).filter(
    c => c && (c.name || '').trim().toLowerCase() === normalized
  ).length;

  if (duplicateCount <= 1) return name;

  const raw = customer.createdAt;
  const date = raw?.toDate ? raw.toDate() : (raw ? new Date(raw) : null);
  const dateStr = date && !isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : 'unknown date';

  return `${name} (created ${dateStr})`;
}
