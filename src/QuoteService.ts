import { createClient } from '@supabase/supabase-js';
import type { SupabaseOptionRow, SupabaseSiteRateRow } from './types';

const SB_URL = 'https://tssndwlbeogehtfinqek.supabase.co';
const SB_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzc25kd2xiZW9nZWh0ZmlucWVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxMDI4MzMsImV4cCI6MjA4MjY3ODgzM30.1Op9V2bWQaysLh1H1Df4eo_l0qt0QHoz6eZu4PBwCTo';

export const supabase = createClient(SB_URL, SB_KEY);

export const calculateOptionLine = (
  opt: SupabaseOptionRow,
  w: number,
  l: number,
  overrides: any = {}
) => {
  // ✅ 디버깅 로그 추가
  console.log('calculateOptionLine:', {
    name: opt.option_name,
    qty_mode: opt.qty_mode,
    w, l
  });

export const roundToTenThousand = (val: number) => {
  const n = Number(val || 0);
  return Math.round(n / 10000) * 10000;
};

const CHO_ = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

export const getChosung = (str: string) => {
  str = String(str ?? '');
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str.charAt(i);
    const code = ch.charCodeAt(0) - 44032;
    if (code >= 0 && code <= 11171) out += CHO_[Math.floor(code / 588)];
    else out += ch;
  }
  return out;
};

const normNoSpace = (s: string) =>
  String(s ?? '').replace(/\u00A0/g, ' ').replace(/\s+/g, '').trim();

export const matchKorean = (target: string, keyword: string) => {
  const t = normNoSpace(target);
  const k = normNoSpace(keyword);
  if (!k) return true;
  if (t.toLowerCase().includes(k.toLowerCase())) return true;
  const tc = getChosung(t);
  const kc = getChosung(k);
  return tc.includes(kc);
};

const rentUnitPriceBySpec = (w: number, l: number) => {
  const key = `${Number(w)}x${Number(l)}`;
  const map: Record<string, number> = { '3x6': 150000, '3x3': 130000, '3x9': 200000 };
  const v = Number(map[key] || 0);
  return v || 150000;
};

export const calculateOptionLine = (
  opt: SupabaseOptionRow,
  w: number,
  l: number,
  overrides: any = {}
) => {
  w = Number(w || 0);
  l = Number(l || 0);
  let qty = overrides.qty !== undefined ? Number(overrides.qty) : 1;
  let unitPrice = Number(opt.unit_price || 0);

  // ✅ w별 단가 확인
  const hasWPrice = opt.unit_price_w3 || opt.unit_price_w4;
  if (w <= 3 && opt.unit_price_w3) {
    unitPrice = Number(opt.unit_price_w3);
  } else if (w >= 4 && opt.unit_price_w4) {
    unitPrice = Number(opt.unit_price_w4);
  }

  let memo = '';
  let unit = opt.unit || 'EA';
  const rawName = opt.option_name || '';
  const isRent = rawName.trim() === '임대';
  const qtyMode = String(opt.qty_mode || '').toUpperCase();
  const unitRaw = String(opt.unit || '').toUpperCase();
  const isMeterUnit =
    unitRaw.includes('M') ||
    unitRaw.includes('METER') ||
    unitRaw.includes('METRE') ||
    opt.unit === 'm';

  if (isRent) {
    const months = Math.max(1, Math.floor(Number(qty || 1)));
    unitPrice = rentUnitPriceBySpec(w, l);
    let amount = Math.round(months * unitPrice);
    amount = roundToTenThousand(amount);
    return {
      qty: months,
      unit: '개월',
      unitPrice,
      amount,
      memo: `${months}개월 임대 (${w}x${l})`,
    };
  }

  if (qtyMode === 'AUTO_PYEONG') {
    const p = (w * l) / 3.3;
    qty = Math.ceil(p);
    memo = `자동계산(평): ${w}×${l}=${(w * l).toFixed(2)}㎡ / 3.3 = ${p.toFixed(2)} → ${qty}평`;
  }

  if (isMeterUnit && qtyMode !== 'AUTO_PYEONG') {
    // ✅ w별 단가가 있으면 평 계산 안 하고 미터로 계산
    if (w >= 4 && !hasWPrice) {
      const area = w * l;
      const pyeong = area / 3.3;
      qty = Math.round(pyeong * 10) / 10;
      unit = '평';
      let amount = pyeong * unitPrice;
      amount = roundToTenThousand(amount);
      memo = `평계산: ${w}×${l}=${area}㎡ ÷ 3.3 = ${pyeong.toFixed(1)}평`;
      return { qty, unit, unitPrice, amount, memo };
    }
    
    qty = l;
    memo = `자동계산(m): 길이 ${l}m`;
    const mMinBill = Number(opt.m_min_bill || 0);
    const mMinUntil = Number(opt.m_min_until || 0);
    if (mMinBill > 0 && mMinUntil > 0) {
      if (qty > 0 && qty < mMinUntil) {
        const before = qty;
        qty = Math.max(qty, mMinBill);
        memo += `\n최소청구: ${before}m → ${qty}m`;
      }
    }
    
    let amount = qty * unitPrice;
    amount = roundToTenThousand(amount);
    return { qty, unit, unitPrice, amount, memo };
  }

  if (overrides.unitPrice !== undefined) unitPrice = Number(overrides.unitPrice);
  let amount = qty * unitPrice;
  if (overrides.amount !== undefined) amount = Number(overrides.amount);
  amount = roundToTenThousand(amount);
  return { qty, unit, unitPrice, amount, memo };
};

export const searchSiteRates = async (keyword: string, w: number, l: number) => {
  const kw = normNoSpace(keyword);
  if (!kw) return { list: [] };

  const W = Number(w || 0);
  const L = Number(l || 0);
  const bucket = W > 0 && L > 0 && W <= 3 && L <= 6 ? '36' : '39';

  const { data, error } = await supabase.from('site_rates').select('*');
  if (error || !data) return { list: [] };

  const list: any[] = [];
  for (const r of data as any[]) {
    const k = r.keyword || '';
    const a = r.alias || '';
    if (!k && !a) continue;

    const hay = `${k} ${a}`;
    if (!matchKorean(hay, kw)) continue;

    const deliveryBase = bucket === '36' ? Number(r.delivery_36 || 0) : Number(r.delivery_39 || 0);
    const craneBase = bucket === '36' ? Number(r.crane_36 || 0) : Number(r.crane_39 || 0);
    const wideAdd = Number(r.wide_add || 0);
    const add = W >= 4 ? wideAdd : 0;
    const priority = Number(r.priority || 9999);

    list.push({
      id: r.id,
      keyword: k,
      alias: a,
      bucket,
      wideAdd,
      priority,
      delivery: deliveryBase + add,
      crane: craneBase + add,
    });

    if (list.length >= 50) break;
  }

  list.sort((a, b) => a.priority - b.priority);
  return { list };
};

export const loadBizcards = async () => {
  const { data, error } = await supabase.from('business_cards').select('*').order('created_at', { ascending: true });
  if (error) return { list: [] as any[] };
  return { list: data || [] };
};

const sanitizeItems = (items: any[]): any[] => {
  if (!Array.isArray(items)) return [];
  
  return items.map((item) => ({
    optionId: String(item.optionId || ''),
    optionName: String(item.optionName || ''),
    itemName: String(item.itemName || item.displayName || ''),
    displayName: String(item.displayName || item.itemName || ''),
    unit: String(item.unit || 'EA'),
    qty: Number(item.qty || 0),
    unitPrice: Number(item.unitPrice || 0),
    amount: Number(item.amount || 0),
    memo: String(item.memo || ''),
    baseQty: Number(item.baseQty || 0),
    baseUnitPrice: Number(item.baseUnitPrice || 0),
    baseAmount: Number(item.baseAmount || 0),
    lineSpec: item.lineSpec || null,
    showSpec: item.showSpec || 'n',
  }));
};

export const saveQuoteToDb = async (payload: any) => {
  const dataToSave = {
    ...payload,
    items: sanitizeItems(payload.items || [])
  };
  return await supabase.from('quotes').insert([dataToSave]).select();
};

export const insertNextVersionToDb = async (quote_id: string, payload: any) => {
  const { data: rows } = await supabase
    .from('quotes')
    .select('version')
    .eq('quote_id', quote_id)
    .order('version', { ascending: false })
    .limit(1);

  const latest = rows && rows[0] ? Number((rows[0] as any).version || 1) : 1;
  const nextVersion = latest + 1;

  const row = { 
    ...payload, 
    quote_id, 
    version: nextVersion, 
    updated_at: new Date().toISOString(),
    items: sanitizeItems(payload.items || [])
  };
  
  return await supabase.from('quotes').insert([row]).select();
};

