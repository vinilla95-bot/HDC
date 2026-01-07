export interface SupabaseOptionRow {
  option_id: string;
  option_name: string;
  unit: string;
  unit_price: number;

  qty_mode?: string;
  price_mode?: string;

  m_min_bill?: number;
  m_min_until?: number;

  unit_price_w3?: number;
  unit_price_w4?: number;

  keywords?: string;
  
}

export interface SupabaseSiteRateRow {
  id: number;
  keyword: string;
  alias: string;

  delivery_36: number;
  delivery_39: number;

  crane_36: number;
  crane_39: number;

  wide_add: number;
  priority?: number;
}

export interface SelectedRow {
  key: string;

  optionId: string;
  optionName: string;

  displayName: string;
  unit: string;

  // 내부 계산 (base)
  baseQty: number;
  baseUnitPrice: number;
  baseAmount: number;

  // 고객 출력/수정
  displayQty: number;
  customerUnitPrice: number;
  finalAmount: number;

  memo: string;
  lineSpec: { w: number; l: number };
}
