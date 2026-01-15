import { createClient } from '@supabase/supabase-js';
import type { SupabaseOptionRow, SupabaseSiteRateRow } from './types';

const SB_URL = 'https://tssndwlbeogehtfinqek.supabase.co';
const SB_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzc25kd2xiZW9nZWh0ZmlucWVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxMDI4MzMsImV4cCI6MjA4MjY3ODgzM30.1Op9V2bWQaysLh1H1Df4eo_l0qt0QHoz6eZu4PBwCTo';

export const supabase = createClient(SB_URL, SB_KEY);

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
  h: number = 2.6,
  overrides: any = {}
) => {
  w = Number(w || 0);
  l = Number(l || 0);
  h = Number(h || 2.6);
  let qty = overrides.qty !== undefined ? Number(overrides.qty) : 1;
  let unitPrice = Number(opt.unit_price || 0);

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

  // ✅ 높이 3m 배수 계산 함수
  const getHeightMultiplier = () => {
    if (h < 3) return 1;
    if (w >= 4) return 1.7;
    if (w <= 3 && l <= 4) return 1.6;
    return 1.5;
  };

  // ✅ "신품 컨테이너"에만 적용
  const isContainerOption = rawName.includes('신품') && rawName.includes('컨테이너');

  // ✅ 신품 컨테이너 단가 설정 (DB에서 가져옴)
  if (isContainerOption) {
    const smallPrice = Number(opt.unit_price_small || 0);
    const largePrice = Number(opt.unit_price_large || 0);
    if (smallPrice > 0 || largePrice > 0) {
      unitPrice = (w <= 3 && l <= 4) ? smallPrice : largePrice;
    }
  }
  
  // ✅ 높이 배수
  const heightMultiplier = (isContainerOption && h >= 3) ? getHeightMultiplier() : 1;

  if (isRent) {
    const months = Math.max(1, Math.floor(Number(qty || 1)));
    unitPrice = rentUnitPriceBySpec(w, l);
    
    if (heightMultiplier > 1) {
      unitPrice = Math.round(unitPrice * heightMultiplier);
      memo = `${months}개월 임대 (${w}x${l}x${h}m, ${heightMultiplier}배)`;
    } else {
      memo = `${months}개월 임대 (${w}x${l})`;
    }
    
    let amount = Math.round(months * unitPrice);
    amount = roundToTenThousand(amount);
    return { qty: months, unit: '개월', unitPrice, amount, memo };
  }

  if (qtyMode === 'AUTO_PYEONG') {
    const p = (w * l) / 3.3;
    qty = Math.ceil(p);
    memo = `자동계산(평): ${w}×${l}=${(w * l).toFixed(2)}㎡ / 3.3 = ${p.toFixed(2)} → ${qty}평`;
  }

  if (isMeterUnit && qtyMode !== 'AUTO_PYEONG') {
    // ✅ 모노륨은 평 계산 안 함 - 4미터여도 m 단위 유지하고 1.5배 적용
    const isMonoleum = rawName.includes('모노륨');
    
    if (w >= 4 && !hasWPrice && !isMonoleum) {
      const area = w * l;
      const pyeong = area / 3.3;
      qty = Math.round(pyeong * 10) / 10;
      unit = '평';
      let finalUnitPrice = Math.round(unitPrice * heightMultiplier);
      let amount = pyeong * finalUnitPrice;
      amount = roundToTenThousand(amount);
      memo = `평계산: ${w}×${l}=${area}㎡ ÷ 3.3 = ${pyeong.toFixed(1)}평`;
      if (heightMultiplier > 1) memo += ` (높이 ${h}m, ${heightMultiplier}배)`;
      return { qty, unit, unitPrice: finalUnitPrice, amount, memo };
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
    
    // ✅ 모노륨 4미터 1.5배 적용
    let finalUnitPrice = unitPrice;
    if (isMonoleum && w >= 4) {
      finalUnitPrice = Math.round(unitPrice * 1.5);
      memo += ` (4m 광폭 1.5배)`;
    } else if (heightMultiplier > 1) {
      finalUnitPrice = Math.round(unitPrice * heightMultiplier);
      memo += ` (높이 ${h}m, ${heightMultiplier}배)`;
    }
    
    let amount = qty * finalUnitPrice;
    amount = roundToTenThousand(amount);
    return { qty, unit, unitPrice: finalUnitPrice, amount, memo };
  }

  if (overrides.unitPrice !== undefined) unitPrice = Number(overrides.unitPrice);
  
  // ✅ 컨테이너 옵션에 높이 배수 적용
  if (heightMultiplier > 1) {
    unitPrice = Math.round(unitPrice * heightMultiplier);
    memo = `높이 ${h}m (${heightMultiplier}배)`;
  }
  
  let amount = qty * unitPrice;
  if (overrides.amount !== undefined) amount = Number(overrides.amount);
  amount = roundToTenThousand(amount);
  return { qty, unit, unitPrice, amount, memo };
};

export const searchSiteRates = async (keyword: string, w: number, l: number, h: number = 2.6) => {
  const kw = normNoSpace(keyword);
  if (!kw) return { list: [] };

  const W = Number(w || 0);
  const L = Number(l || 0);
  const H = Number(h || 2.6);
  const bucket = W > 0 && L > 0 && W <= 3 && L <= 6 ? '36' : '39';

  const { data, error } = await supabase.from('site_rates').select('*');
  if (error || !data) return { list: [] };

  // ✅ 높이 3m 이상이면 1.5배
  const heightMultiplier = H >= 3 ? 1.5 : 1;

  const list: any[] = [];
  for (const r of data as any[]) {
    const k = r.keyword || '';
    const a = r.alias || '';
    if (!k && !a) continue;

    const hay = `${k} ${a}`;
    if (!matchKorean(hay, kw)) continue;

    // 기본 운송비 (세로 길이 기준)
    const isLong = L >= 9;
    const deliveryBase = isLong ? Number(r.delivery_39 || 0) : Number(r.delivery_36 || 0);
    
    // 광폭(4미터) 추가금: 4x6은 wide_add, 4x9는 wide_39
    let wideAdd = 0;
    if (W >= 4) {
      wideAdd = isLong ? Number(r.wide_39 || 0) : Number(r.wide_add || 0);
    }
    
    // ✅ 높이 배수 적용
    const delivery = Math.round((deliveryBase + wideAdd) * heightMultiplier);
    
    const priority = Number(r.priority || 9999);

    list.push({
      id: r.id,
      keyword: k,
      alias: a,
      bucket,
      wideAdd,
      priority,
      delivery,
      crane: 0,
      heightMultiplier,
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
