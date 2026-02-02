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

// ✅ 신품 컨테이너 고정 가격표 (3m 폭 기준)
const CONTAINER_FIXED_PRICES_W3: Record<number, number> = {
  3: 1650000,   // 3x3
  4: 1750000,   // 3x4
  5: 2200000,   // 3x5
  6: 2250000,   // 3x6
  7: 2600000,   // 3x7
  8: 3150000,   // 3x8
  9: 3250000,   // 3x9
  10: 3650000,  // 3x10
  12: 4400000,  // 3x12
};

// ✅ 고정가격 가져오기 (1순위: 고정가, 없으면 null → m당 계산)
const getContainerFixedPrice = (w: number, l: number): number | null => {
  if (w <= 3) {
    return CONTAINER_FIXED_PRICES_W3[l] || null;
  } else if (w >= 4) {
    // 4m 폭은 3m 가격의 1.7배
    const basePrice = CONTAINER_FIXED_PRICES_W3[l];
    if (basePrice) {
      return Math.round(basePrice * 1.7);
    }
    return null;
  }
  return null;
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
  
  // ✅ 쉼표나 공백으로 분리된 단어 중 하나라도 키워드로 시작하면 매칭
  const words = t.split(/[,\s]+/);
  for (const word of words) {
    if (word.toLowerCase().startsWith(k.toLowerCase())) return true;
  }
  
  // 초성 검색
  const tc = getChosung(t);
  const kc = getChosung(k);
  
  // ✅ 초성도 단어 시작 기준으로 매칭
  const tcWords = tc.split(/[,\s]+/);
  for (const tcWord of tcWords) {
    if (tcWord.startsWith(kc)) return true;
  }
  
  return false;
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

  // ✅ 신품 컨테이너 가격 계산 (1순위: 고정가, 2순위: m당 계산)
  if (isContainerOption) {
    const fixedPrice = getContainerFixedPrice(w, l);
    
    if (fixedPrice) {
      // 1순위: 고정 가격표에서 찾음
      unitPrice = fixedPrice;
      memo = `${w}x${l} 고정가`;
    } else {
      // 2순위: m당 계산 (DB의 unit_price 사용)
      const perMeterPrice = Number(opt.unit_price || 0);
      if (w <= 3) {
        unitPrice = Math.round(perMeterPrice * l);
        memo = `${w}x${l} (${l}m × ${perMeterPrice.toLocaleString()}원/m)`;
      } else {
        // 4m 폭: m당 가격 × 길이 × 1.7배
        unitPrice = Math.round(perMeterPrice * l * 1.7);
        memo = `${w}x${l} (${l}m × ${perMeterPrice.toLocaleString()}원/m × 1.7)`;
      }
    }
    
    // 높이 3m 이상이면 배수 적용
    if (h >= 3) {
      const hMult = getHeightMultiplier();
      unitPrice = Math.round(unitPrice * hMult);
      memo += ` (높이${h}m, ${hMult}배)`;
    }
    
    const amount = roundToTenThousand(unitPrice * qty);
    return { qty, unit, unitPrice, amount, memo };
  }

  // ✅ 높이 배수 (신품 컨테이너 외 다른 옵션용)
  const heightMultiplier = (h >= 3) ? getHeightMultiplier() : 1;

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
  const keywords = String(opt.keywords || '').toLowerCase();
  const isFloor = keywords.includes('바닥');  // 바닥류
  const isWall = keywords.includes('벽면');   // 벽면류
  
  // ✅ 바닥류: 3m 초과시 평 계산
  if (isFloor && w > 3) {
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
  
  // ✅ 그 외 M 단위: 길이 × 단가
  qty = l;
  memo = `길이계산: ${l}m`;
  
  const mMinBill = Number(opt.m_min_bill || 0);
  const mMinUntil = Number(opt.m_min_until || 0);
  if (mMinBill > 0 && mMinUntil > 0) {
    if (qty > 0 && qty < mMinUntil) {
      const before = qty;
      qty = Math.max(qty, mMinBill);
      memo += ` (최소청구: ${before}m → ${qty}m)`;
    }
  }
  
  // ✅ 벽면류: 3m 초과시 1.5배
  let finalUnitPrice = unitPrice;
  if (isWall && w > 3) {
    finalUnitPrice = Math.round(unitPrice * 1.5);
    memo += ` (4m 폭 1.5배)`;
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
  let kw = normNoSpace(keyword);
  if (!kw) return { list: [] };

  // ✅ 마침표로 끝나면 정확한 단어 매칭
  const exactMatch = kw.endsWith('.');
  if (exactMatch) {
    kw = kw.slice(0, -1); // 마침표 제거
  }

  const W = Number(w || 0);
  const L = Number(l || 0);
  const H = Number(h || 2.6);
  const bucket = W > 0 && L > 0 && W <= 3 && L <= 6 ? '36' : '39';

  const { data, error } = await supabase.from('site_rates').select('*');
  if (error || !data) return { list: [] };

  const heightMultiplier = H >= 3 ? 1.5 : 1;

  const list: any[] = [];
  for (const r of data as any[]) {
    const k = r.keyword || '';
    const a = r.alias || '';
    if (!k && !a) continue;

    const hay = `${k} ${a}`;
    
    // ✅ 정확한 매칭 vs 부분 매칭
    let matched = false;
    if (exactMatch) {
      // 쉼표나 공백으로 분리된 단어 중 정확히 일치하는지 확인
      const words = hay.split(/[,\s]+/).map(w => w.trim().toLowerCase());
      matched = words.includes(kw.toLowerCase());
    } else {
      matched = matchKorean(hay, kw);
    }
    
    if (!matched) continue;

    const isLong = L >= 9;
    const deliveryBase = isLong ? Number(r.delivery_39 || 0) : Number(r.delivery_36 || 0);
    
    let wideAdd = 0;
    if (W >= 4) {
      wideAdd = isLong ? Number(r.wide_39 || 0) : Number(r.wide_add || 0);
    }
    
    const delivery = Math.round((deliveryBase + wideAdd) * heightMultiplier);

    // ✅ 크레인 운송비 계산
    const craneBase = isLong ? Number(r.crane_39 || 0) : Number(r.crane_36 || 0);
    const crane = Math.round(craneBase * heightMultiplier);

    const priority = Number(r.priority || 9999);

    list.push({
      id: r.id,
      keyword: k,
      alias: a,
      bucket,
      wideAdd,
      priority,
      delivery,
      crane,
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
