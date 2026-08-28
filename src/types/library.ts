export type LibraryAdStatus = 'draft' | 'ready' | 'online';
export type LibraryPriceType = 'FIXED' | 'NEGOTIABLE' | 'GIVE_AWAY';
export type LibraryShippingType = 'PICKUP' | 'SHIPPING';

export interface LibraryAd {
  id: string;
  title: string;
  description: string;
  price: number;
  price_type: LibraryPriceType;
  category: string;
  location_override: string | null;
  shipping_type: LibraryShippingType;
  shipping_costs: number | null;
  shipping_options: string[];
  attributes: Record<string, string>;
  images: string[];
  status: LibraryAdStatus;
  publish_job_id: string | null;
  publish_account_id: string | null;
  publish_account_name: string | null;
  publish_started_at: string | null;
  publish_baseline_ids: number[];
  published_account_id: string | null;
  published_account_name: string | null;
  kleinanzeigen_id: number | null;
  kleinanzeigen_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface LibraryAdInput {
  title: string;
  description: string;
  price: number;
  price_type: LibraryPriceType;
  category: string;
  location_override?: string | null;
  shipping_type: LibraryShippingType;
  shipping_costs?: number | null;
  shipping_options?: string[];
  attributes?: Record<string, string>;
  status: LibraryAdStatus;
}
