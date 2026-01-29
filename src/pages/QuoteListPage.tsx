import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import html2canvas from "html2canvas";
import { supabase } from "../lib/supabase";
import { gasRpc as gasRpcRaw } from "../lib/gasRpc";
import { matchKorean, calculateOptionLine, searchSiteRates } from "../QuoteService";
import { A4Quote } from "../App";  // ✅ A4Quote import 추가

type SupabaseOptionRow = {
  option_id: string;
  option_name: string;
  unit?: string;
  unit_price?: number;
  keywords?: string;
};

type QuoteRow = {
  quote_id: string;
  version: string | number | null;
  quote_title: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  site_name: string | null;
  site_addr: string | null;
  spec: string | null;
  w: number | null;
  l: number | null;
  product: string | null;
  qty: number | null;
  memo: string | null;
  contract_start: string | null;
  supply_amount: number | null;
  vat_amount: number | null;
  total_amount: number | null;
  pdf_url: string | null;
  statement_url: string | null;
  created_at: string | null;
  updated_at: string | null;
  items: any;
  bizcard_id: string | null;
  vat_included?: boolean;
};

type QuoteItem = {
  CATEGORY?: any;
  ITEM_NAME?: any;
  UNIT?: any;
  QTY?: any;
  UNIT_PRICE?: any;
  AMOUNT?: any;
  NOTE?: any;
  category?: any;
  item_name?: any;
  unit?: any;
  qty?: any;
  unit_price?: any;
  amount?: any;
  note?: any;
  itemName?: any;
  optionName?: any;
  displayName?: any;
  unitPrice?: any;
  months?: number;
};

type DocTab = "quote" | "statement" | "rental";

function money(n: any) {
  const num = Number(n || 0);
  return num.toLocaleString("ko-KR");
}

function escapeHtml(s: any) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatKoDate(v: any) {
  if (!v) return "";
  const d = new Date(String(v));
  if (!isNaN(d.getTime())) {
    const wk = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day} (${wk})`;
  }
  return String(v);
}

function pickItems(row: QuoteRow | null): QuoteItem[] {
  if (!row) return [];
  const p = (row as any).payload || {};
  const fromPayload = p.items || p.lineItems || p.rows;
  if (Array.isArray(fromPayload)) return fromPayload;
  const fromRow = (row as any).items;
  if (Array.isArray(fromRow)) return fromRow;
  if (typeof fromRow === "string") {
    try {
      const parsed = JSON.parse(fromRow);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.items)) return parsed.items;
    } catch (e) {}
  }
  return [];
}

function normItem(it: QuoteItem) {
  const category = it.CATEGORY ?? it.category ?? "";
  const name = it.ITEM_NAME ?? it.itemName ?? it.optionName ?? it.displayName ?? it.item_name ?? "";
  const unit = it.UNIT ?? it.unit ?? "";
  const qty = Number(it.QTY ?? it.qty ?? 0);
  const unitPrice = Number(it.UNIT_PRICE ?? it.unitPrice ?? it.unit_price ?? 0);
  const amount = Number(it.AMOUNT ?? it.amount ?? (qty * unitPrice));
  const note = it.NOTE ?? it.note ?? "";
  const months = Number(it.months ?? 1);
  return { category, name, unit, qty, unitPrice, amount, note, months };
}

async function gasCall<T = any>(fn: string, args: any[] = []): Promise<T> {
  const res: any = await gasRpcRaw(fn, args);
  if (res && res.ok === false) {
    throw new Error(res.message || "GAS error");
  }
  return res && typeof res === "object" && "value" in res ? (res.value as T) : (res as T);
}

export default function QuoteListPage({ onGoLive, onConfirmContract }: { 
  onGoLive?: () => void;
  onConfirmContract?: (quote: QuoteRow) => void;
}) {
  const [q, setQ] = useState("");
  const [dateFilter, setDateFilter] = useState("");  
  const [list, setList] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState<QuoteRow | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editItems, setEditItems] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<DocTab>("quote");
  const [sendOpen, setSendOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [sendTo, setSendTo] = useState("");
  const [sendStatus, setSendStatus] = useState("");
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(-1);
  
  const [rentalForm, setRentalForm] = useState({
    contractStart: "",
    contractEnd: "",
    months: 3,
    companyName: "",
    regNo: "",
    ceo: "",
    siteAddr: "",
    phone: "",
    officePhone: "",
    fax: "",
    email: "",
  });

  const [editForm, setEditForm] = useState<any>(null);
  const [options, setOptions] = useState<SupabaseOptionRow[]>([]);
  const [optQ, setOptQ] = useState("");
  const [bizcards, setBizcards] = useState<any[]>([]);
  const [selectedBizcardId, setSelectedBizcardId] = useState("");
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const getMobileScale = () => {
    if (typeof window === 'undefined') return 0.45;
    return (window.innerWidth - 32) / 794;
  };

  const toastRef = useRef<HTMLDivElement | null>(null);
  const toastTimer = useRef<number | null>(null);

  function toast(msg: string) {
    const el = toastRef.current;
    if (!el) return;
    el.textContent = msg;
    el.style.display = "block";
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      el.style.display = "none";
    }, 2200);
  }

  function requireCurrent() {
    if (!current?.quote_id) {
      toast("먼저 견적을 선택해주세요.");
      throw new Error("no current quote");
    }
  }

  // ✅ A4Quote용 form 객체 생성
  const quoteForm = useMemo(() => ({
    quoteTitle: current?.quote_title || "",
    name: editForm?.customer_name ?? current?.customer_name ?? "",
    email: editForm?.customer_email ?? current?.customer_email ?? "",
    phone: editForm?.customer_phone ?? current?.customer_phone ?? "",
    w: current?.w || 3,
    l: current?.l || 6,
    h: 2.6,
    siteQ: editForm?.site_name ?? current?.site_name ?? "",
    sitePickedLabel: editForm?.site_name ?? current?.site_name ?? "",
    optQ: "",
    quoteDate: current?.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    vatIncluded: current?.vat_included !== false,
  }), [current, editForm]);

  // ✅ A4Quote용 setForm 함수
  const setQuoteForm = useCallback((fn: any) => {
    const newForm = typeof fn === 'function' ? fn(quoteForm) : fn;
    setEditForm((prev: any) => ({
      ...prev,
      customer_name: newForm.name,
      customer_email: newForm.email,
      customer_phone: newForm.phone,
      site_name: newForm.sitePickedLabel || newForm.siteQ,
    }));
    
    // vatIncluded 변경 시 DB 업데이트
    if (newForm.vatIncluded !== quoteForm.vatIncluded && current) {
      supabase.from("quotes").update({ vat_included: newForm.vatIncluded }).eq("quote_id", current.quote_id);
      setCurrent({ ...current, vat_included: newForm.vatIncluded });
    }
  }, [quoteForm, current]);

  // ✅ computedItems 변환 (A4Quote 형식에 맞게)
  const computedItems = useMemo(() => {
    return editItems.map((item: any) => {
      const isRent = item.unit === "개월" || String(item.optionName || "").includes("임대");
      return {
        ...item,
        key: item.key,
        optionId: item.optionId,
        optionName: item.optionName || item.displayName,
        displayName: item.displayName,
        unit: item.unit || "EA",
        displayQty: item.qty || 1,
        customerUnitPrice: item.unitPrice || 0,
        finalAmount: (item.qty || 1) * (item.unitPrice || 0),
        months: item.months || 3,
        lineSpec: item.lineSpec || { w: current?.w || 3, l: current?.l || 6, h: 2.6 },
        showSpec: item.showSpec || "n",
        specText: item.specText || "",
        baseUnitPrice: item.baseUnitPrice || (isRent ? Math.round(item.unitPrice / (item.months || 3)) : item.unitPrice),
        _isRent: isRent,
        _isCustomFreeText: item._isCustomFreeText || false,
      };
    });
  }, [editItems, current]);

  // ✅ 금액 계산
  const supply_amount = computedItems.reduce((acc: number, item: any) => acc + (item.finalAmount || 0), 0);
  const vat_amount = Math.round(supply_amount * 0.1);
  const total_amount = supply_amount + vat_amount;

  // ✅ 빈 행 계산
  const MIN_ROWS = 12;
  const blankRows = useMemo(() => {
    return Array.from({ length: Math.max(1, MIN_ROWS - computedItems.length) });
  }, [computedItems.length]);

  // ✅ 품목 업데이트 함수들 (A4Quote에서 호출)
  const handleUpdateQty = useCallback((key: string, qty: number) => {
    setEditItems(prev => prev.map(item => 
      item.key === key 
        ? { ...item, qty, amount: qty * item.unitPrice }
        : item
    ));
  }, []);

  const handleUpdatePrice = useCallback((key: string, price: number) => {
    setEditItems(prev => prev.map(item => 
      item.key === key 
        ? { ...item, unitPrice: price, amount: item.qty * price }
        : item
    ));
  }, []);

  const handleDeleteItem = useCallback((key: string) => {
    setEditItems(prev => prev.filter(item => item.key !== key));
  }, []);

  const handleUpdateSpec = useCallback((key: string, spec: { w: number; l: number; h?: number }) => {
    setEditItems(prev => prev.map(item => {
      if (item.key !== key) return item;
      
      const isRent = item.unit === "개월" || String(item.optionName || "").includes("임대");
      
      if (isRent) {
        // 규격별 월 임대료
        const rentPrices: Record<string, number> = {
          '3x3': 140000,
          '3x4': 130000,
          '3x6': 150000,
          '3x9': 200000,
        };
        const specKey = `${spec.w}x${spec.l}`;
        const baseMonthlyPrice = rentPrices[specKey] || 150000;
        const months = item.months || 3;
        const newUnitPrice = baseMonthlyPrice * months;
        
        return {
          ...item,
          lineSpec: spec,
          specText: '',
          unitPrice: newUnitPrice,
          amount: (item.qty || 1) * newUnitPrice,
        };
      }
      
      // 일반 품목은 옵션에서 재계산
      const opt = options.find((o: any) => o.option_id === item.optionId);
      if (opt) {
        const calculated = calculateOptionLine(opt as any, spec.w, spec.l);
        return {
          ...item,
          lineSpec: spec,
          specText: '',
          unitPrice: calculated.amount,
          amount: (item.qty || 1) * calculated.amount,
        };
      }
      
      return { ...item, lineSpec: spec, specText: '' };
    }));
  }, [options]);

  const handleUpdateSpecText = useCallback((key: string, text: string) => {
    setEditItems(prev => prev.map(item => 
      item.key === key 
        ? { ...item, specText: text, showSpec: text ? 'y' : 'n' }
        : item
    ));
  }, []);

  // ✅ 옵션 선택 핸들러 (A4Quote에서 호출)
const handleSelectOption = useCallback((targetItem: any, opt: any, calculated: any) => {
  let rawName = String(opt.option_name || "");
  const rent = rawName.includes("임대") && !opt._isCustomFreeText;
  const months = opt._months || 3;
  
  // ✅ rawName에서 기존 개월 정보 제거 (중복 방지)
  if (rent) {
    rawName = rawName.replace(/\s*\/?\s*\d+개월.*$/, "").replace(/\s+\d+개월.*$/, "").trim();
  }
    
    // displayName만 변경하는 경우
    if (opt._isDisplayNameOnly) {
      setEditItems(prev => prev.map(item => 
        item.key === targetItem.key 
          ? { ...item, displayName: rawName }
          : item
      ));
      return;
    }
    
    const customerUnitPrice = rent 
      ? Number(calculated.unitPrice || 0) * months 
      : Number(calculated.amount || 0);
    
   const displayName = rent ? `${rawName} / ${months}개월` : rawName;
    
    setEditItems(prev => prev.map(item => 
      item.key === targetItem.key 
        ? {
            ...item,
            optionId: opt.option_id,
            optionName: rawName,
            displayName,
            unit: rent ? "개월" : (calculated.unit || "EA"),
            qty: 1,
            unitPrice: customerUnitPrice,
            amount: customerUnitPrice,
            showSpec: opt.show_spec || "n",
            months,
            baseUnitPrice: Number(calculated.unitPrice || 0),
            _isRent: rent,
            _isCustomFreeText: opt._isCustomFreeText || false,
          }
        : item
    ));
  }, []);

  // ✅ 품목 추가 핸들러 (A4Quote에서 호출)
  const handleAddItem = useCallback((opt: any, calculated: any, insertIndex?: number) => {
    const rawName = String(opt.option_name || "");
    const rent = rawName.includes("임대") && !opt._isCustomFreeText && !opt._isEmptyRow;
    const months = opt._months || 3;
    
    const customerUnitPrice = rent 
      ? Number(calculated.unitPrice || 0) * months 
      : Number(calculated.amount || 0);
    
    const displayName = opt._isEmptyRow ? '' : (rent ? `${rawName} ${months}개월` : rawName);
    
    const newItem = {
      key: `item_${Date.now()}`,
      optionId: opt.option_id,
      optionName: opt._isEmptyRow ? '' : rawName,
      displayName,
      unit: rent ? "개월" : (calculated.unit || "EA"),
      qty: 1,
      unitPrice: customerUnitPrice,
      amount: customerUnitPrice,
      showSpec: opt.show_spec || "n",
      lineSpec: { w: current?.w || 3, l: current?.l || 6, h: 2.6 },
      specText: "",
      months,
      baseUnitPrice: Number(calculated.unitPrice || 0),
      _isRent: rent,
      _isCustomFreeText: opt._isCustomFreeText || false,
    };
    
    setEditItems(prev => {
      if (insertIndex !== undefined && insertIndex >= 0 && insertIndex < prev.length) {
        const newArr = [...prev];
        newArr.splice(insertIndex + 1, 0, newItem);
        return newArr;
      }
      return [...prev, newItem];
    });
  }, [current]);

  // ✅ 운송비 추가 핸들러
  const handleAddDelivery = useCallback((site: any, type: 'delivery' | 'crane', insertIndex?: number) => {
    const price = type === 'delivery' ? site.delivery : site.crane;
    const name = type === 'delivery' 
      ? `5톤 일반트럭 운송비(하차별도)-${site.alias}` 
      : `크레인 운송비-${site.alias}`;
    
    const newItem = {
      key: `item_${Date.now()}`,
      optionId: type === 'delivery' ? 'DELIVERY' : 'CRANE',
      optionName: name,
      displayName: name,
      unit: "EA",
      qty: 1,
      unitPrice: price,
      amount: price,
      showSpec: "y",
      lineSpec: { w: current?.w || 3, l: current?.l || 6, h: 2.6 },
      specText: "",
    };
    
    setEditItems(prev => {
      if (insertIndex !== undefined && insertIndex >= 0 && insertIndex < prev.length) {
        const newArr = [...prev];
        newArr.splice(insertIndex + 1, 0, newItem);
        return newArr;
      }
      return [...prev, newItem];
    });
  }, [current]);

  // ✅ 지역 검색 핸들러
  const handleSiteSearch = useCallback(async (query: string) => {
    if (!query.trim()) return [];
    const { list } = await searchSiteRates(query.trim(), current?.w || 3, current?.l || 6);
    return list.filter((s: any) => {
      const alias = String(s.alias || "").toLowerCase();
      return alias.includes(query.toLowerCase()) || matchKorean(alias, query);
    });
  }, [current]);

  // ✅ 저장 함수
  async function saveEditMode() {
    if (!current) return;

    try {
      toast("저장 중...");

      const itemsToSave = editItems.map((it: any, idx: number) => ({
        optionId: it.optionId || `ITEM_${idx + 1}`,
        optionName: it.optionName || it.displayName || "",
        displayName: it.displayName || "",
        itemName: it.displayName || "",
        unit: it.unit || "EA",
        qty: Number(it.qty) || 0,
        unitPrice: Number(it.unitPrice) || 0,
        amount: Number(it.qty * it.unitPrice) || 0,
        showSpec: it.showSpec || "n",
        lineSpec: it.lineSpec,
        specText: it.specText ?? "",
        months: it.months,
      }));

      const supply = itemsToSave.reduce((acc: number, it: any) => acc + Number(it.amount || 0), 0);
      const vat = Math.round(supply * 0.1);
      const total = supply + vat;

      const { error, data } = await supabase
        .from("quotes")
        .update({
          items: itemsToSave,
          supply_amount: supply,
          vat_amount: vat,
          total_amount: total,
          updated_at: new Date().toISOString(),
          customer_name: editForm?.customer_name ?? current.customer_name,
          customer_email: editForm?.customer_email ?? current.customer_email,
          customer_phone: editForm?.customer_phone ?? current.customer_phone,
          site_name: editForm?.site_name ?? current.site_name,
          spec: editForm?.spec ?? current.spec,
        })
        .eq("quote_id", current.quote_id)
        .select();

      if (error) throw error;

      toast("저장 완료!");
      setEditMode(false);
      await loadList(q);
      if (data && data[0]) setCurrent(data[0] as QuoteRow);
    } catch (e: any) {
      toast("저장 실패: " + (e?.message || String(e)));
    }
  }

  async function handleCopyQuote() {
    requireCurrent();
    
    try {
      toast("견적 복사 중...");
      
      const now = new Date();
      const ymd = now.toISOString().slice(2, 10).replace(/-/g, "");
      const hms = now.toTimeString().slice(0, 8).replace(/:/g, "");
      const newQuoteId = `Q${ymd}-${hms}`;
      
      const { error } = await supabase.from("quotes").insert({
        quote_id: newQuoteId,
        quote_title: current!.quote_title,
        customer_name: current!.customer_name,
        customer_phone: current!.customer_phone,
        customer_email: current!.customer_email,
        site_name: current!.site_name,
        site_addr: current!.site_addr,
        spec: current!.spec,
        w: current!.w,
        l: current!.l,
        product: current!.product,
        qty: current!.qty,
        memo: current!.memo,
        items: current!.items,
        supply_amount: current!.supply_amount,
        vat_amount: current!.vat_amount,
        total_amount: current!.total_amount,
        bizcard_id: current!.bizcard_id,
        vat_included: current!.vat_included,
        created_at: new Date().toISOString(),
      });
      
      if (error) throw error;
      
      toast("견적 복사 완료!");
      await loadList(q);
    } catch (e: any) {
      toast("복사 실패: " + (e?.message || String(e)));
    }
  }

  async function handleConfirmContract() {
    requireCurrent();
    const confirmed = window.confirm(
      `이 견적을 계약 확정하시겠습니까?\n\n견적번호: ${current!.quote_id}\n고객명: ${current!.customer_name || ""}\n금액: ${money(current!.total_amount)}원`
    );
    if (!confirmed) return;

    try {
      toast("계약 확정 중...");
      
      const items = pickItems(current);
      let contractType = "order";
      
      for (const it of items) {
        const name = (it.optionName || it.displayName || it.item_name || "").toString();
        if (name.includes("임대")) {
          contractType = "rental";
          break;
        } else if (name.includes("중고")) {
          contractType = "used";
          break;
        }
      }
      
      const { error, data } = await supabase
        .from("quotes")
        .update({ 
          status: "confirmed",
          contract_type: contractType,
          contract_date: new Date().toISOString().slice(0, 10)
        })
        .eq("quote_id", current!.quote_id)
        .select();

      if (error) throw error;
      toast("계약 확정 완료!");
      
      if (onConfirmContract) {
        onConfirmContract(current!);
      }
      
      await loadList(q);
      
      if (data && data[0]) {
        setCurrent(data[0] as QuoteRow);
      }
    } catch (e: any) {
      toast("계약 확정 실패: " + (e?.message || String(e)));
    }
  }

  async function loadList(keyword = ""): Promise<void> {
    setLoading(true);
    try {
      const selectCols = [
        "quote_id", "version", "quote_title", "customer_name", "customer_phone",
        "customer_email", "site_name", "site_addr", "spec", "w", "l", "product",
        "qty", "memo", "contract_start", "supply_amount", "vat_amount", "total_amount",
        "pdf_url", "statement_url", "created_at", "updated_at", "items", "bizcard_id","vat_included",
      ].join(",");

      let query = supabase
        .from("quotes")
        .select(selectCols)
        .or("source.is.null,source.eq.통화녹음")
        .not("quote_id", "like", "SCHEDULE_%")
        .not("quote_id", "like", "KAKAO_%")
        .order("created_at", { ascending: false })
        .limit(200);

      const kw = (keyword || "").trim();
      if (kw) {
        const like = `%${kw}%`;
        query = query.or([
          `quote_id.ilike.${like}`,
          `customer_name.ilike.${like}`,
          `spec.ilike.${like}`,
          `quote_title.ilike.${like}`,
          `site_name.ilike.${like}`,
        ].join(","));
      }

      if (dateFilter) {
        const startOfDay = `${dateFilter}T00:00:00`;
        const endOfDay = `${dateFilter}T23:59:59`;
        query = query.gte("created_at", startOfDay).lte("created_at", endOfDay);
      }

      const { data, error } = await query;
      if (error) throw error;
      setList(((data ?? []) as unknown) as QuoteRow[]);
    } catch (e: any) {
      console.error(e);
      toast("목록 로드 실패: " + (e?.message || String(e)));
      setList([]);
    } finally {
      setLoading(false);
    }
  }

  const getDocTitle = () => {
    switch (activeTab) {
      case "quote": return "견적서";
      case "statement": return "거래명세서";
      case "rental": return "임대차계약서";
    }
  };

  async function handleSendEmail() {
    requireCurrent();
    
    const quoteId = current!.quote_id;
    const to = sendTo.trim() || (current!.customer_email || "").trim();

    if (!to) {
      setSendStatus("수신 이메일이 비어있습니다.");
      return;
    }

    try {
      setSendStatus("PDF 생성 중...");

      const sheetEl = document.querySelector(".a4Sheet") as HTMLElement;
      if (!sheetEl) {
        throw new Error("문서를 찾을 수 없습니다.");
      }

      const isStatement = activeTab === 'statement';
      const captureWidth = isStatement ? 1100 : 794;
      const captureHeight = isStatement ? 600 : 1123;

      const captureContainer = document.createElement('div');
      captureContainer.style.cssText = `position: fixed; top: -9999px; left: -9999px; width: ${captureWidth}px; background: #fff; z-index: -1;`;
      document.body.appendChild(captureContainer);

      const styleTag = document.querySelector('#docPreview style');
      if (styleTag) {
        captureContainer.appendChild(styleTag.cloneNode(true));
      }

      const clonedSheet = sheetEl.cloneNode(true) as HTMLElement;
      clonedSheet.style.cssText = `width: ${captureWidth}px; min-height: ${captureHeight}px; background: #fff; padding: 16px; box-sizing: border-box;`;

      const clonedSelects = clonedSheet.querySelectorAll('select');
      const originalSelects = sheetEl.querySelectorAll('select');
      clonedSelects.forEach((select, idx) => {
        const origSelect = originalSelects[idx] as HTMLSelectElement;
        const selectedText = origSelect.options[origSelect.selectedIndex]?.text || '';
        const span = document.createElement('span');
        span.textContent = selectedText;
        span.style.cssText = 'font-size: 13px;';
        select.parentNode?.replaceChild(span, select);
      });

      captureContainer.appendChild(clonedSheet);

      await new Promise(r => setTimeout(r, 300));

      const canvas = await html2canvas(clonedSheet, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        width: captureWidth,
        windowWidth: captureWidth,
      });

      document.body.removeChild(captureContainer);

      const imgData = canvas.toDataURL("image/jpeg", 0.92);

      const selectedBizcard = bizcards.find((b: any) => b.id === selectedBizcardId);
      const bizcardImageUrl = selectedBizcard?.image_url || "";
      const customerName = current!.customer_name || "고객";

      setSendStatus("메일 전송 중...");

      await gasCall("sendDocEmailWithPdf", [
        quoteId,
        to,
        imgData,
        bizcardImageUrl,
        customerName,
        getDocTitle()
      ]);

      setSendStatus("전송 완료!");
      toast(`${getDocTitle()} 메일 전송 완료`);
      setSendOpen(false);
      loadList(q);
    } catch (e: any) {
      setSendStatus("전송 실패: " + (e?.message || String(e)));
      toast("메일 전송 실패");
    }
  }

  async function downloadJpg() {
    requireCurrent();

    const sheetEl = document.querySelector(".a4Sheet") as HTMLElement;
    if (!sheetEl) {
      toast("캡처 대상을 찾을 수 없습니다.");
      return;
    }

    toast("JPG 생성 중...");

    try {
      const isStatement = activeTab === 'statement';
      const captureWidth = isStatement ? 1100 : 794;
      const captureHeight = isStatement ? 600 : 1123;

      const captureContainer = document.createElement('div');
      captureContainer.style.cssText = `position: fixed; top: -9999px; left: -9999px; width: ${captureWidth}px; background: #fff; z-index: -1;`;
      document.body.appendChild(captureContainer);

      const styleTag = document.querySelector('#docPreview style');
      if (styleTag) {
        captureContainer.appendChild(styleTag.cloneNode(true));
      }

      const clonedSheet = sheetEl.cloneNode(true) as HTMLElement;
      clonedSheet.style.cssText = `width: ${captureWidth}px; min-height: ${captureHeight}px; background: #fff; padding: 16px; box-sizing: border-box;`;

      const clonedSelects = clonedSheet.querySelectorAll('select');
      const originalSelects = sheetEl.querySelectorAll('select');
      clonedSelects.forEach((select, idx) => {
        const origSelect = originalSelects[idx] as HTMLSelectElement;
        const selectedText = origSelect.options[origSelect.selectedIndex]?.text || '';
        const span = document.createElement('span');
        span.textContent = selectedText;
        span.style.cssText = 'font-size: 13px;';
        select.parentNode?.replaceChild(span, select);
      });

      captureContainer.appendChild(clonedSheet);
      await new Promise(r => setTimeout(r, 300));

      const canvas = await html2canvas(clonedSheet, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        allowTaint: true,
        width: captureWidth,
        windowWidth: captureWidth,
      });

      document.body.removeChild(captureContainer);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${getDocTitle()}_${current!.quote_id}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      toast("다운로드 완료");
    } catch (e: any) {
      toast("JPG 생성 실패: " + (e?.message || String(e)));
    }
  }

  function handlePrint() {
    requireCurrent();
    window.print();
  }

  async function handleDelete() {
    requireCurrent();
    const confirmed = window.confirm(
      `정말 삭제하시겠습니까?\n\n견적번호: ${current!.quote_id}\n고객명: ${current!.customer_name || ""}\n\n이 작업은 되돌릴 수 없습니다.`
    );
    if (!confirmed) return;

    try {
      toast("삭제 중...");
      const { error } = await supabase.from("quotes").delete().eq("quote_id", current!.quote_id);
      if (error) throw error;
      toast("삭제 완료!");
      setCurrent(null);
      await loadList(q);
    } catch (e: any) {
      toast("삭제 실패: " + (e?.message || String(e)));
    }
  }

  function openSendModal() {
    requireCurrent();
    setSendTo("");
    setSendStatus("");
    setSendOpen(true);
  }

  useEffect(() => {
    if (current) {
      const items = pickItems(current);
      const rentalItem = items.find(it => {
        const name = it.optionName || it.displayName || it.item_name || "";
        return String(name).includes("임대");
      });
      const months = rentalItem?.months || 3;

      const today = new Date();
      const startDate = current.contract_start || today.toISOString().slice(0, 10);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + months);

      setRentalForm({
        contractStart: startDate.replace(/-/g, '/').slice(2),
        contractEnd: endDate.toISOString().slice(2, 10).replace(/-/g, '/'),
        months: months,
        companyName: "",
        regNo: "",
        ceo: "",
        siteAddr: current.site_addr || "",
        phone: current.customer_phone || "",
        officePhone: "",
        fax: "",
        email: current.customer_email || "",
      });

      setEditForm({
        customer_name: current.customer_name || "",
        customer_email: current.customer_email || "",
        customer_phone: current.customer_phone || "",
        site_name: current.site_name || "",
        spec: current.spec || "",
      });
    }
  }, [current]);

  useEffect(() => {
    loadList("");
    supabase.from("options").select("*").then(({ data }) => setOptions((data || []) as any));
    supabase.from("bizcards").select("*").then(({ data }) => {
      const list = (data || []) as any[];
      setBizcards(list);
      const goeunhee = list.find((x: any) => String(x.name || "").includes("고은희"));
      if (goeunhee?.id) setSelectedBizcardId(goeunhee.id);
      else if (list[0]?.id) setSelectedBizcardId(list[0].id);
    });
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => loadList(q), 200);
    return () => window.clearTimeout(t);
  }, [q, dateFilter]);

  useEffect(() => {
    if (current) {
      setEditItems(pickItems(current).map((raw, idx) => {
        const it = normItem(raw);
        return {
          key: `item_${idx}_${Date.now()}`,
          optionId: (raw as any).optionId || "",
          optionName: it.name,
          displayName: it.name,
          unit: it.unit,
          qty: it.qty,
          unitPrice: it.unitPrice,
          amount: it.amount,
          showSpec: (raw as any).showSpec || "n",
          lineSpec: (raw as any).lineSpec || { w: current.w || 3, l: current.l || 6, h: 2.6 },
          specText: (raw as any).specText ?? "",
          months: (raw as any).months || 3,
        };
      }));
      setEditMode(false);
    }
  }, [current]);

  const selectedBizcard = useMemo(() => 
    bizcards.find((b: any) => b.id === selectedBizcardId),
    [bizcards, selectedBizcardId]
  );

  // ============ 거래명세서 미리보기 ============
  const statementPreviewHtml = useMemo(() => {
    if (!current) return null;

    const items = pickItems(current);
    const customerName = current.customer_name ?? "";
    const customerPhone = current.customer_phone ?? "";
    const supplyAmount = current.supply_amount ?? 0;
    const vatAmount = current.vat_amount ?? 0;
    const totalAmount = current.total_amount ?? 0;

    const today = new Date();
    const ymd = today.toISOString().slice(0, 10);

    const MIN_ROWS = 12;

    const thStyle: React.CSSProperties = { 
      border: '1px solid #5b9bd5', 
      padding: '4px 8px', 
      background: '#d6eaf8', 
      color: '#1a5276',
      fontWeight: 700,
      fontSize: 11,
      textAlign: 'center' as const,
      whiteSpace: 'nowrap' as const,
      width: 60,
    };
    const tdStyle: React.CSSProperties = { 
      border: '1px solid #5b9bd5', 
      padding: '4px 8px', 
      background: '#fff',
      fontSize: 11,
    };
    const itemThStyle: React.CSSProperties = {
      border: '1px solid #5b9bd5',
      padding: '6px 4px',
      background: '#d6eaf8',
      color: '#1a5276',
      fontWeight: 700,
      fontSize: 11,
      textAlign: 'center' as const,
    };
    const itemTdStyle: React.CSSProperties = {
      border: '1px solid #5b9bd5',
      padding: '4px 6px',
      background: '#fff',
      fontSize: 11,
      height: 24,
    };

    return (
      <div className="a4Sheet statementSheet" style={{ background: '#fff', padding: 30, width: 1100, minHeight: 500 }}>
        <div style={{ textAlign: 'center', marginBottom: 5 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#1a5276', letterSpacing: 8 }}>거래명세서</div>
          <div style={{ fontSize: 11, color: '#666' }}>[ 공급받는자 보관용 ]</div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
          <table style={{ borderCollapse: 'collapse', width: '45%' }}>
            <tbody>
              <tr><th style={{ ...thStyle, width: '80px' }}>일자</th><td style={tdStyle}>{ymd}</td></tr>
              <tr><th style={{ ...thStyle, width: '80px' }}>거래처</th><td style={tdStyle}>{customerName}</td></tr>
              <tr><th style={{ ...thStyle, width: '80px' }}>등록번호</th><td style={tdStyle}></td></tr>
              <tr><th style={{ ...thStyle, width: '80px' }}>주소</th><td style={tdStyle}></td></tr>
              <tr><th style={{ ...thStyle, width: '80px' }}>전화번호</th><td style={tdStyle}>{customerPhone}</td></tr>
            </tbody>
          </table>

          <table style={{ borderCollapse: 'collapse', width: '55%' }}>
            <tbody>
              <tr>
                <th style={thStyle}>등록번호</th><td style={tdStyle}>130-41-38154</td>
                <th style={thStyle}>성명</th><td style={tdStyle}>류창석</td>
              </tr>
              <tr>
                <th style={thStyle}>상호</th>
                <td style={tdStyle}>현대컨테이너 <span style={{ display: 'inline-block', width: 18, height: 18, border: '2px solid #c0392b', borderRadius: '50%', color: '#c0392b', fontSize: 9, textAlign: 'center', lineHeight: '16px', marginLeft: 5 }}>印</span></td>
                <th style={thStyle}>주소</th><td style={tdStyle}>화성시구문천안길16</td>
              </tr>
              <tr>
                <th style={thStyle}>업태</th><td style={tdStyle}>컨테이너 판매 임대</td>
                <th style={thStyle}>종목</th><td style={tdStyle}>제조업,도소매</td>
              </tr>
              <tr>
                <th style={thStyle}>전화번호</th><td style={tdStyle}>010-4138-9268</td>
                <th style={thStyle}>팩스번호</th><td style={tdStyle}>031-359-8246</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', background: '#fff', border: '1px solid #5b9bd5', padding: '8px 12px', marginBottom: 8 }}>
          <span style={{ fontWeight: 900, color: '#1a5276', marginRight: 10 }}>합계금액:</span>
          <span style={{ fontSize: 18, fontWeight: 900, marginRight: 30 }}>{money(totalAmount)}</span>
          <span style={{ fontSize: 11, marginLeft: 'auto' }}>기업은행 465-096127-04-015 현대컨테이너 류창석</span>
        </div>

        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...itemThStyle, width: '8%' }}>월일</th>
              <th style={{ ...itemThStyle, width: '32%' }}>품목명</th>
              <th style={{ ...itemThStyle, width: '8%' }}>수량</th>
              <th style={{ ...itemThStyle, width: '12%' }}>단가</th>
              <th style={{ ...itemThStyle, width: '14%' }}>공급가액</th>
              <th style={{ ...itemThStyle, width: '12%' }}>세액</th>
              <th style={{ ...itemThStyle, width: '14%' }}>비고</th>
            </tr>
          </thead>
          <tbody>
            {items.map((raw, idx) => {
              const it = normItem(raw);
              const supply = it.unitPrice * it.qty;
              const vat = Math.round(supply * 0.1);
              const monthDay = `${today.getMonth() + 1}/${today.getDate()}`;
              return (
                <tr key={idx}>
                  <td style={{ ...itemTdStyle, textAlign: 'center' }}>{monthDay}</td>
                  <td style={itemTdStyle}>{it.name}</td>
                  <td style={{ ...itemTdStyle, textAlign: 'center' }}>{it.qty}</td>
                  <td style={{ ...itemTdStyle, textAlign: 'right' }}>{money(it.unitPrice)}</td>
                  <td style={{ ...itemTdStyle, textAlign: 'right' }}>{money(supply)}</td>
                  <td style={{ ...itemTdStyle, textAlign: 'right' }}>{money(vat)}</td>
                  <td style={itemTdStyle}></td>
                </tr>
              );
            })}
            {Array.from({ length: Math.max(0, MIN_ROWS - items.length) }).map((_, i) => (
              <tr key={`blank-${i}`}>
                <td style={{ ...itemTdStyle, textAlign: 'center' }}>&nbsp;</td>
                <td style={itemTdStyle}></td>
                <td style={itemTdStyle}></td>
                <td style={itemTdStyle}></td>
                <td style={itemTdStyle}></td>
                <td style={itemTdStyle}></td>
                <td style={itemTdStyle}></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} style={{ ...itemTdStyle, textAlign: 'center', fontWeight: 900, background: '#d6eaf8' }}>총금액</td>
              <td style={{ ...itemTdStyle, textAlign: 'right', fontWeight: 900 }}>{money(supplyAmount)}</td>
              <td style={{ ...itemTdStyle, textAlign: 'right', fontWeight: 900 }}>{money(vatAmount)}</td>
              <td style={itemTdStyle}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }, [current]);

  // ============ 임대차계약서 미리보기 ============
  const rentalPreviewHtml = useMemo(() => {
    if (!current) return null;

    const items = editItems;
    const customerName = current.customer_name ?? "";
    const customerPhone = current.customer_phone ?? "";
    const customerEmail = current.customer_email ?? "";
    const spec = current.spec ?? "3*6";
    const siteName = current.site_name ?? "";

    const today = new Date();
    const ymd = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;
    
    const cutoffIndex = items.findIndex((it: any) => {
      const name = it.displayName || it.optionName || "";
      return String(name).includes("임대 계약시 필요한 정보");
    });
    const rentalItems = cutoffIndex === -1 ? items : items.slice(0, cutoffIndex);

    const totalAmount = rentalItems.reduce((acc: number, raw: any) => {
      const it = normItem(raw);
      return acc + (it.unitPrice * it.qty);
    }, 0);

    const MIN_ROWS = 8;

    const thStyle: React.CSSProperties = {
      border: '1px solid #999', padding: '6px 4px', background: '#fff', fontWeight: 700, fontSize: 11, textAlign: 'center' as const,
    };
    const tdStyle: React.CSSProperties = {
      border: '1px solid #999', padding: '6px 4px', fontSize: 11, height: 22,
    };
    const conditionThStyle: React.CSSProperties = {
      border: '1px solid #2e86de', padding: '6px 8px', background: '#fff', fontWeight: 700, fontSize: 11, textAlign: 'center' as const,
    };
    const conditionTdStyle: React.CSSProperties = {
      border: '1px solid #2e86de', padding: '6px 8px', fontSize: 11, textAlign: 'center' as const,
    };
    const partyThStyle: React.CSSProperties = {
      border: '1px solid #999', padding: '5px 8px', background: '#fff', fontWeight: 400, fontSize: 11, textAlign: 'center' as const, width: 30,
    };
    const partyTdStyle: React.CSSProperties = {
      border: '1px solid #999', padding: '5px 8px', fontSize: 11,
    };
    const partyHeaderStyle: React.CSSProperties = {
      border: '1px solid #999', padding: '8px', background: '#fff', fontWeight: 900, fontSize: 12, textAlign: 'center' as const,
    };

    return (
      <div className="a4Sheet" style={{ background: '#fff', padding: '30px 40px', width: 794 }}>
        <div style={{ position: 'relative', textAlign: 'center', marginBottom: 20 }}>
          <img src="https://i.postimg.cc/VvsGvxFP/logo1.jpg" alt="logo" style={{ position: 'absolute', left: 0, top: 0, width: 110, height: 'auto' }} />
          <div style={{ fontSize: 30, fontWeight: 900, color: '#000', letterSpacing: 14, paddingTop: 5 }}>임 대 차 계 약 서</div>
        </div>

        <div style={{ textAlign: 'center', fontSize: 11, lineHeight: 1.8, marginBottom: 20, color: '#333' }}>
          "임대인(공급 하는 자)과, 임차인(공급 받는 자)이라 하여<br />아래와 같이 임대차 계약을 체결한다."
        </div>

        <div style={{ borderTop: '2px solid #2e86de', marginBottom: 15 }}></div>

        <table style={{ borderCollapse: 'collapse', width: '90%', margin: '0 auto', marginBottom: 5 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: '30%' }}>품목</th>
              <th style={{ ...thStyle, width: '8%' }}>규격</th>
              <th style={{ ...thStyle, width: '8%' }}>개월</th>
              <th style={{ ...thStyle, width: '15%' }}>단가</th>
              <th style={{ ...thStyle, width: '8%' }}>수량</th>
              <th style={{ ...thStyle, width: '15%' }}>금액</th>
            </tr>
          </thead>
          <tbody>
            {rentalItems.length > 0 ? rentalItems.map((item: any, idx: number) => {
              const name = item.displayName || item.optionName || "";
              const isContainerRental = String(name).includes("컨테이너 임대");
              const isDelivery = String(name).includes("5톤 일반 트럭 운송비") || String(name).includes("크레인 운송비");
              const showSpec = isContainerRental || isDelivery;
              const months = isContainerRental ? (item.months || rentalForm.months) : "";
              
              return (
                <tr key={item.key || idx}>
                  <td style={tdStyle}>{name}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{showSpec ? spec : ""}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{months}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{money(item.unitPrice)}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{item.qty}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{money(item.qty * item.unitPrice)}</td>
                </tr>
              );
            }) : (
              <tr>
                <td style={tdStyle}>컨테이너 임대</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>{spec}</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>{rentalForm.months}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>450,000</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>1</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>450,000</td>
              </tr>
            )}
            {Array.from({ length: Math.max(0, MIN_ROWS - rentalItems.length) }).map((_, i) => (
              <tr key={`blank-${i}`}>
                <td style={tdStyle}>&nbsp;</td>
                <td style={tdStyle}></td>
                <td style={tdStyle}></td>
                <td style={tdStyle}></td>
                <td style={tdStyle}></td>
                <td style={tdStyle}></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 700, margin: '8px 0 15px 0' }}>
          합계(VAT별도) {money(totalAmount)}원
        </div>

        <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 900, marginBottom: 8 }}>임대 조건</div>
        <table style={{ borderCollapse: 'collapse', width: '70%', margin: '0 auto 12px auto' }}>
          <tbody>
            <tr>
              <th style={{ ...conditionThStyle, width: '10%' }}>임대기간</th>
              <td style={{ ...conditionTdStyle, width: '20%' }}>{rentalForm.contractStart}~{rentalForm.contractEnd}</td>
              <td style={{ ...conditionTdStyle, width: '10%' }}>{rentalForm.contractStart?.slice(3, 8)}</td>
              <th style={{ ...conditionThStyle, width: '8%' }}>로부터</th>
              <td style={{ ...conditionTdStyle, width: '10%' }}>{rentalForm.months}</td>
              <th style={{ ...conditionThStyle, width: '8%' }}>개월</th>
            </tr>
          </tbody>
        </table>

        <div style={{ fontSize: 11, lineHeight: 1.7, marginBottom: 15, textAlign: 'left' }}>
          <p style={{ margin: '2px 0' }}>※ 컨테이너 입고/회수 시, 하차/상차 작업은 임차인이 제공한다.</p>
          <p style={{ margin: '2px 0' }}>※ 계약기간의 연장 시 임차인은 만료 5일 전까지 통보해야 하며, 재 계약서를 작성하지 않고 연장하였을 시 본 계약서로서 대체한다.</p>
          <p style={{ margin: '2px 0' }}>※ 임대 계약기간 만료 전에 컨테이너를 회수하여도 임대료는 환불되지 않는다.</p>
          <p style={{ margin: '2px 0' }}>※ 임대기간 중 컨테이너를 임의대로 매매, 임대할 수 없다.</p>
          <p style={{ margin: '2px 0' }}>※ 냉난방기/에어컨 임대 사용시, 6개월 이후 냉난방기/에어컨 사용료 매월 5만원 청구됩니다.</p>
          <p style={{ margin: '2px 0' }}>"※ 계약서에 명시된 임대차 기간이 만료되면, 임차인과 연락이 안 될 경우 임대인이 임의대로 컨테이너를 회수하여도 무방하다. 컨테이너에 있는 내용물은 운반 도중 내용물이 파손되거나, 7일 이내 임의대로 처리하여도 민, 형사상 책임을 지지 않는다."</p>
          <p style={{ margin: '2px 0' }}>※ 임차인의 귀책사유로 컨테이너에 파손 및 훼손의 피해가 있을 경우 손해배상 청구할 수 있다.</p>
          <p style={{ margin: '2px 0' }}>※ 컨테이너 입고/회수 시, 하차/상차 작업은 임차인이 제공한다.</p>
        </div>

        <div style={{ textAlign: 'center', fontSize: 12, marginBottom: 15 }}>{ymd}</div>

        <table style={{ borderCollapse: 'collapse', width: '80%', margin: '0 auto 15px auto' }}>
          <colgroup>
            <col style={{ width: '12%' }} />
            <col style={{ width: '38%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '38%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={partyHeaderStyle} colSpan={2}>임대인</th>
              <th style={partyHeaderStyle} colSpan={2}>임차인</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th style={partyThStyle}>상호:</th><td style={partyTdStyle}>현대 컨테이너</td>
              <th style={partyThStyle}>상호:</th><td style={partyTdStyle}>{rentalForm.companyName}</td>
            </tr>
            <tr>
              <th style={partyThStyle}>등록번호:</th><td style={partyTdStyle}>130-41-38154</td>
              <th style={partyThStyle}>등록번호:</th><td style={partyTdStyle}>{rentalForm.regNo}</td>
            </tr>
            <tr>
              <th style={partyThStyle}>대표:</th><td style={partyTdStyle}>류창석&nbsp;&nbsp;&nbsp;&nbsp;(인)</td>
              <th style={partyThStyle}>대표:</th><td style={partyTdStyle}>{rentalForm.ceo}</td>
            </tr>
            <tr>
              <th style={partyThStyle}>주소:</th><td style={partyTdStyle}>화성시 향남읍 구문천안길16</td>
              <th style={partyThStyle}>현장주소:</th><td style={partyTdStyle}>{rentalForm.siteAddr || siteName}</td>
            </tr>
            <tr>
              <th style={partyThStyle}>연락처:</th><td style={partyTdStyle}>010-4775-7557</td>
              <th style={partyThStyle}>연락처:</th><td style={partyTdStyle}>{customerPhone}</td>
            </tr>
            <tr>
              <th style={partyThStyle}>연락처:</th><td style={partyTdStyle}>010-4138-9268</td>
              <th style={partyThStyle}>사무실:</th><td style={partyTdStyle}>{rentalForm.officePhone}</td>
            </tr>
            <tr>
              <th style={partyThStyle}>팩스:</th><td style={partyTdStyle}>0504-392-4298</td>
              <th style={partyThStyle}>팩스:</th><td style={partyTdStyle}>{rentalForm.fax}</td>
            </tr>
            <tr>
              <th style={partyThStyle}>메일:</th><td style={partyTdStyle}><a href="mailto:hdcon20@naver.com" style={{ color: '#2e86de', textDecoration: 'underline' }}>hdcon20@naver.com</a></td>
              <th style={partyThStyle}>메일:</th><td style={partyTdStyle}>{rentalForm.email || customerEmail}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ textAlign: 'center', fontSize: 11, color: '#333' }}>
          서명하시고 fax 0504-392-4298이나 이메일<a href="mailto:hdcon20@naver.com" style={{ color: '#2e86de', textDecoration: 'underline' }}>hdcon20@naver.com</a>으로 회신부탁드립니다.
        </div>
      </div>
    );
  }, [current, rentalForm, editItems]);

  return (
    <div className="quoteListPage">
      <style>{css}</style>

      <div className="app">
        {/* LEFT - 목록 */}
        <div className="panel">
          <div className="hdr">
            <h1>견적 목록</h1>
            <span className="spacer" />
            <span className="badge">{loading ? "..." : String(list.length)}</span>
          </div>

          <div className="search">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="견적 검색 (견적번호/고객/규격/제목/현장)" />
            <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} style={{ marginTop: 8 }} />
            {dateFilter && (
              <button onClick={() => setDateFilter("")} style={{ marginTop: 4, fontSize: 11, padding: '4px 8px' }}>날짜 필터 해제</button>
            )}
          </div>
          
          <div className="list">
            {!loading && list.length === 0 && (
              <div style={{ padding: 12 }} className="muted">검색 결과 없음</div>
            )}
            {list.map((it) => (
              <div
                key={it.quote_id}
                className={`item ${current?.quote_id === it.quote_id ? 'active' : ''}`}
                onClick={() => {
                  setCurrent(it);
                  if (it.bizcard_id) setSelectedBizcardId(it.bizcard_id);
                }}
              >
                <div className="top">
                  <span className="badge">{it.quote_title || ""}</span>
                  <span className="muted">{formatKoDate(it.created_at || "")}</span>
                </div>
                <div className="mid">{it.customer_name || it.quote_id || ""}</div>
                <div className="bot">
                  <span>{it.spec ? "· " + it.spec : ""}</span>
                  <span><b>{money(it.total_amount)}</b>원</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT - 미리보기 */}
        <div className="right">
          {/* 탭 버튼 */}
          <div className="tabBar">
            <button className={`tabBtn ${activeTab === 'quote' ? 'active' : ''}`} onClick={() => setActiveTab('quote')}>견적서</button>
            <button className={`tabBtn ${activeTab === 'statement' ? 'active' : ''}`} onClick={() => setActiveTab('statement')}>거래명세서</button>
            <button className={`tabBtn ${activeTab === 'rental' ? 'active' : ''}`} onClick={() => setActiveTab('rental')}>임대차계약서</button>
          </div>

          {/* 액션 버튼 */}
          <div className="actions">
            <button onClick={() => (window.location.href = "/?view=rt")}>실시간견적</button>
            <button className="primary" onClick={openSendModal}>{getDocTitle()} 보내기</button>
            <button onClick={downloadJpg}>JPG저장</button>
            <button onClick={handlePrint}>인쇄</button>
            <button onClick={handleCopyQuote}>복사</button>
            <button onClick={() => {
              if (editMode) {
                saveEditMode();
              } else {
                setEditMode(true);
              }
            }}>
              {editMode ? "수정완료" : "견적수정"}
            </button>
            <button onClick={handleConfirmContract} style={{ background: '#059669', color: '#fff', borderColor: '#059669' }}>계약확정</button>
            <button className="danger" onClick={handleDelete}>삭제</button>
          </div>

          {/* 임대차 폼 (임대차 탭일 때만) */}
          {activeTab === 'rental' && current && (
            <div className="rentalFormBox">
              <div className="formRow">
                <label>계약시작</label>
                <input value={rentalForm.contractStart} onChange={(e) => setRentalForm({ ...rentalForm, contractStart: e.target.value })} placeholder="26/01/15" />
                <label>개월</label>
                <input
                  type="number"
                  value={rentalForm.months}
                  onChange={(e) => {
                    const m = Number(e.target.value) || 1;
                    const start = rentalForm.contractStart;
                    let endDate = "";
                    if (start) {
                      try {
                        const [y, mo, d] = start.split('/').map(Number);
                        const dt = new Date(2000 + y, mo - 1 + m, d);
                        endDate = `${String(dt.getFullYear()).slice(2)}/${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}`;
                      } catch (e) {}
                    }
                    setRentalForm({ ...rentalForm, months: m, contractEnd: endDate });
                  }}
                  style={{ width: 60 }}
                />
              </div>
              <div className="formRow">
                <label>회사명</label>
                <input value={rentalForm.companyName} onChange={(e) => setRentalForm({ ...rentalForm, companyName: e.target.value })} />
                <label>사업자번호</label>
                <input value={rentalForm.regNo} onChange={(e) => setRentalForm({ ...rentalForm, regNo: e.target.value })} />
              </div>
              <div className="formRow">
                <label>대표자</label>
                <input value={rentalForm.ceo} onChange={(e) => setRentalForm({ ...rentalForm, ceo: e.target.value })} />
                <label>현장주소</label>
                <input value={rentalForm.siteAddr} onChange={(e) => setRentalForm({ ...rentalForm, siteAddr: e.target.value })} />
                <label>연락처</label>
                <input value={rentalForm.phone} onChange={(e) => setRentalForm({ ...rentalForm, phone: e.target.value })} />
                <label>사무실</label>
                <input value={rentalForm.officePhone} onChange={(e) => setRentalForm({ ...rentalForm, officePhone: e.target.value })} />
              </div>
              <div className="formRow">
                <label>팩스</label>
                <input value={rentalForm.fax} onChange={(e) => setRentalForm({ ...rentalForm, fax: e.target.value })} />
                <label>메일</label>
                <input value={rentalForm.email} onChange={(e) => setRentalForm({ ...rentalForm, email: e.target.value })} />
              </div>
            </div>
          )}

          {/* ✅ 미리보기 - A4Quote 컴포넌트 사용 */}
          <div className="content">
            <div className="previewWrap" id="docPreview">
              {activeTab === 'quote' && current ? (
                <A4Quote
                  form={quoteForm}
                  setForm={setQuoteForm}
                  computedItems={computedItems}
                  blankRows={blankRows}
                  fmt={money}
                  supply_amount={supply_amount}
                  vat_amount={vat_amount}
                  total_amount={total_amount}
                  bizcardName={selectedBizcard?.name || ""}
                  bizcards={bizcards}
                  selectedBizcardId={selectedBizcardId}
                  setSelectedBizcardId={setSelectedBizcardId}
                  options={options}
                  editable={editMode}
                  onSelectOption={handleSelectOption}
                  onAddItem={handleAddItem}
                  onUpdateQty={handleUpdateQty}
                  onUpdatePrice={handleUpdatePrice}
                  onDeleteItem={handleDeleteItem}
                  onUpdateSpec={handleUpdateSpec}
                  onUpdateSpecText={handleUpdateSpecText}
                  onSiteSearch={handleSiteSearch}
                  onAddDelivery={handleAddDelivery}
                  focusedRowIndex={focusedRowIndex}
                  setFocusedRowIndex={setFocusedRowIndex}
                  noPadding
                />
              ) : activeTab === 'statement' ? (
                statementPreviewHtml
              ) : activeTab === 'rental' ? (
                rentalPreviewHtml
              ) : (
                <div className="a4Sheet" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                  왼쪽에서 견적을 선택하세요.
                </div>
              )}
            </div>
          </div>

          {/* 전송 모달 */}
          {sendOpen && (
            <div className="modal" onMouseDown={() => setSendOpen(false)}>
              <div className="modalCard" onMouseDown={(e) => e.stopPropagation()}>
                <div className="modalHdr">
                  <div style={{ fontWeight: 800 }}>{getDocTitle()} 메일 전송</div>
                  <span className="spacer" />
                  <button onClick={() => setSendOpen(false)}>닫기</button>
                </div>
                <div className="modalBody">
                  <div className="muted" style={{ marginBottom: 8 }}>비워두면 견적에 등록된 이메일로 전송합니다.</div>
                  <div className="row" style={{ marginBottom: 10 }}>
                    <input
                      value={sendTo}
                      onChange={(e) => setSendTo(e.target.value)}
                      placeholder="수신 이메일"
                      style={{ flex: 1, padding: "10px 12px", border: "1px solid #d7dbe2", borderRadius: 10 }}
                    />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div className="muted" style={{ marginBottom: 4 }}>명함 선택</div>
                    <select
                      value={selectedBizcardId}
                      onChange={(e) => setSelectedBizcardId(e.target.value)}
                      style={{ width: "100%", padding: "10px 12px", border: "1px solid #d7dbe2", borderRadius: 10 }}
                    >
                      {bizcards.length === 0 && <option value="">(명함 없음)</option>}
                      {bizcards.map((b: any) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                    </select>
                  </div>
                  <div className="row">
                    <span className="spacer" />
                    <button className="primary" onClick={handleSendEmail}>전송</button>
                  </div>
                  <div className="muted" style={{ marginTop: 10 }}>{sendStatus}</div>
                </div>
              </div>
            </div>
          )}

          <div className="toast" ref={toastRef} />
        </div>
      </div>
    </div>
  );
}

const css = `
input[type="number"]::-webkit-outer-spin-button,
input[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
input[type="number"] {
  -moz-appearance: textfield;
}
.quoteListPage {
  margin: 0;
  background: #f6f7fb;
  font-family: Arial, "Noto Sans KR", sans-serif;
  color: #111;
}

.app {
  display: grid;
  grid-template-columns: 340px 1fr;
  height: 100vh;
  gap: 12px;
  padding: 12px;
  box-sizing: border-box;
}

.panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.hdr {
  padding: 12px;
  border-bottom: 1px solid #eef0f3;
  display: flex;
  gap: 10px;
  align-items: center;
}

.hdr h1 { font-size: 14px; margin: 0; }

.search { padding: 10px 12px; border-bottom: 1px solid #eef0f3; }
.search input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d7dbe2;
  border-radius: 10px;
  outline: none;
}

.list { overflow: auto; flex: 1; }

.item {
  padding: 10px 12px;
  border-bottom: 1px solid #f0f2f6;
  cursor: pointer;
}
.item:hover { background: #fafbff; }
.item.active { background: #e8f0fe; }

.item .top { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; }
.item .mid { margin-top: 4px; font-size: 13px; font-weight: 700; }
.item .bot { margin-top: 4px; font-size: 12px; color: #666; display: flex; justify-content: space-between; }

.badge {
  font-size: 11px;
  padding: 2px 8px;
  border: 1px solid #d7dbe2;
  border-radius: 999px;
  color: #444;
  background: #fff;
}

.right { display: flex; flex-direction: column; gap: 10px; }

.tabBar {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
}

.tabBtn {
  flex: 1;
  padding: 12px;
  border: 1px solid #d7dbe2;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  font-weight: 700;
  font-size: 13px;
  transition: all 0.2s;
}
.tabBtn:hover { background: #f7f8fd; }
.tabBtn.active {
  background: #111;
  color: #fff;
  border-color: #111;
}

.actions {
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #fff;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

button {
  padding: 9px 14px;
  border: 1px solid #d7dbe2;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  font-weight: 700;
  font-size: 12px;
}
button:hover { background: #f7f8fd; }
button.primary { background: #111; color: #fff; border-color: #111; }
button.primary:hover { background: #222; }
button.danger { background: #fee; border-color: #f99; color: #c00; }

.rentalFormBox {
  padding: 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
}
.formRow {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.formRow:last-child { margin-bottom: 0; }
.formRow label {
  font-size: 12px;
  font-weight: 700;
  min-width: 60px;
}
.formRow input {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid #d7dbe2;
  border-radius: 8px;
  font-size: 12px;
}

.content { flex: 1; overflow: auto; }

.previewWrap {
  background: #f5f6f8;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  overflow: auto;
  padding: 14px;
  display: flex;
  justify-content: center;
}

.muted { color: #666; font-size: 12px; }
.row { display: flex; gap: 8px; align-items: center; }
.spacer { flex: 1; }

.toast {
  position: fixed;
  right: 16px;
  bottom: 16px;
  background: #111;
  color: #fff;
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 12px;
  display: none;
  max-width: 340px;
  z-index: 9999;
}

.modal {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  z-index: 9998;
}

.modalCard {
  width: min(500px, 96vw);
  max-height: 92vh;
  overflow: auto;
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e5e7eb;
}

.modalHdr {
  padding: 12px;
  border-bottom: 1px solid #eef0f3;
  display: flex;
  gap: 8px;
  align-items: center;
}

.modalBody { padding: 12px; }

@media (max-width: 768px) {
  .app {
    grid-template-columns: 1fr;
    height: auto;
    padding: 8px;
  }
  .panel { max-height: 200px; }
  .tabBar { flex-wrap: wrap; }
  .tabBtn { flex: 1 1 30%; font-size: 11px; padding: 10px 8px; }
  .actions { flex-wrap: wrap; }
  .actions button { flex: 1 1 auto; min-width: 80px; }
  .previewWrap { overflow-x: auto; }
}

@media print {
  .panel, 
  .tabBar, 
  .actions, 
  .rentalFormBox, 
  .modal, 
  .toast,
  button {
    display: none !important;
    visibility: hidden !important;
  }
  
  .app { 
    display: block !important; 
    padding: 0 !important;
    margin: 0 !important;
    gap: 0 !important;
  }
  
  .right { 
    display: block !important;
    padding: 0 !important;
    margin: 0 !important;
    gap: 0 !important;
  }
  
  .content { 
    overflow: visible !important;
    padding: 0 !important;
    margin: 0 !important;
  }
  
  .previewWrap { 
    border: none !important; 
    padding: 0 !important; 
    margin: 0 !important;
    background: #fff !important;
    border-radius: 0 !important;
  }
  
  body, html, .quoteListPage { 
    background: #fff !important; 
    margin: 0 !important; 
    padding: 0 !important; 
  }
}

@page {
  size: A4;
  margin: 0;
}
`;
