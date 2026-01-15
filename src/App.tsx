// src/App_pc_edit.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import QuoteListPage from "./pages/QuoteListPage";
import html2canvas from "html2canvas";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import {
  supabase,
  calculateOptionLine,
  searchSiteRates,
  saveQuoteToDb,
  insertNextVersionToDb,
  matchKorean,
} from "./QuoteService";

import { gasRpc as gasRpcRaw } from "./lib/gasRpc";

import type { SelectedRow, SupabaseOptionRow } from "./types";
import "./index.css";

// ✅ GAS WebApp URL
export const getWebAppUrl = () => {
  return "https://script.google.com/macros/s/AKfycbyTGGQnxlfFpqP5zS0kf7m9kzSK29MGZbeW8GUMlAja04mRJHRszuRdpraPdmOWxNNr/exec";
};

// GAS 호출 래퍼
async function gasCall<T = any>(fn: string, args: any[] = []): Promise<T> {
  const res = await gasRpcRaw(fn, args);
  if (res && typeof res === "object" && "error" in res) throw new Error(String(res.error));
  return res as T;
}

type Bizcard = { id: string; name: string; image_url: string };

// ✅ PC 품목 추가 팝업 컴포넌트
function PcAddItemModal({ 
  isOpen, 
  onClose, 
  onAdd, 
  options, 
  form,
  searchSiteRates,
  calculateOptionLine,
  matchKorean,
  fmt 
}: {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (item: any) => void;
  options: SupabaseOptionRow[];
  form: any;
  searchSiteRates: any;
  calculateOptionLine: any;
  matchKorean: any;
  fmt: (n: number) => string;
}) {
  const [optQ, setOptQ] = useState("");
  const [selectedOpt, setSelectedOpt] = useState<any>(null);
  const [w, setW] = useState(form.w || 3);
  const [l, setL] = useState(form.l || 6);
  const [h, setH] = useState(form.h || 2.6);
  const [siteQ, setSiteQ] = useState("");
  const [sites, setSites] = useState<any[]>([]);
  const [selectedSite, setSelectedSite] = useState<any>(null);
  const [calculatedPrice, setCalculatedPrice] = useState(0);
  const [itemType, setItemType] = useState<"option" | "delivery" | "crane">("option");

  // 옵션 검색 결과
  const filteredOptions = useMemo(() => {
    const q = String(optQ || "").trim();
    if (!q) return [];

    const matched = options.filter((o: any) => {
      const name = String(o.option_name || "");
      return matchKorean(name, q);
    });

    const qLower = q.toLowerCase();
    matched.sort((a: any, b: any) => {
      const nameA = String(a.option_name || "").toLowerCase();
      const nameB = String(b.option_name || "").toLowerCase();
      const startsA = nameA.startsWith(qLower) ? 0 : 1;
      const startsB = nameB.startsWith(qLower) ? 0 : 1;
      if (startsA !== startsB) return startsA - startsB;
      return 0;
    });

    return matched.slice(0, 10);
  }, [optQ, options, matchKorean]);

  // 규격 변경 시 단가 재계산
  useEffect(() => {
    if (selectedOpt && itemType === "option") {
      const res = calculateOptionLine(selectedOpt, w, l, h);
      setCalculatedPrice(res.amount || res.unitPrice || 0);
    }
  }, [selectedOpt, w, l, h, itemType, calculateOptionLine]);

  // 현장 검색
  const handleSiteSearch = async (val: string) => {
    setSiteQ(val);
    setSelectedSite(null);
    if (!val) {
      setSites([]);
      return;
    }
    const { list } = await searchSiteRates(val, w, l, h);
    setSites(list.slice(0, 10));
  };

  // 옵션 선택
  const handleSelectOption = (opt: any) => {
    setSelectedOpt(opt);
    setOptQ(opt.option_name);
    setItemType("option");
    const res = calculateOptionLine(opt, w, l, h);
    setCalculatedPrice(res.amount || res.unitPrice || 0);
  };

  // 현장 선택 (일반운송)
  const handleSelectSiteDelivery = (site: any) => {
    setSelectedSite(site);
    setSiteQ(site.alias);
    setSites([]);
    setItemType("delivery");
    setCalculatedPrice(site.delivery);
  };

  // 현장 선택 (크레인)
  const handleSelectSiteCrane = (site: any) => {
    setSelectedSite(site);
    setSiteQ(site.alias);
    setSites([]);
    setItemType("crane");
    setCalculatedPrice(site.crane);
  };

  // 추가 버튼
  const handleAdd = () => {
    if (itemType === "option" && selectedOpt) {
      const res = calculateOptionLine(selectedOpt, w, l, h);
      const rawName = String(selectedOpt.option_name || "");
      const rent = rawName.includes("임대");

      const row: any = {
        key: `${selectedOpt.option_id}_${Date.now()}`,
        optionId: String(selectedOpt.option_id),
        optionName: rawName,
        displayName: rent ? `${rawName} 1개월` : rawName,
        unit: rent ? "개월" : res.unit || "EA",
        showSpec: String(selectedOpt.show_spec || "").toLowerCase(),
        baseQty: Number(res.qty || 1),
        baseUnitPrice: Number(res.unitPrice || 0),
        baseAmount: Number(res.amount || 0),
        displayQty: 1,
        customerUnitPrice: Number(res.amount || res.unitPrice || 0),
        finalAmount: Number(res.amount || res.unitPrice || 0),
        months: 1,
        memo: res.memo || "",
        lineSpec: { w, l, h },
      };
      onAdd(row);
    } else if (itemType === "delivery" && selectedSite) {
      const regions = selectedSite.alias.split(',').map((r: string) => r.trim());
      const matched = regions.find((r: string) => r.toLowerCase().includes(siteQ.toLowerCase())) || regions[0];

      const row: any = {
        key: `DELIVERY_${Date.now()}`,
        optionId: "DELIVERY",
        optionName: "5톤 일반트럭 운송비(하차별도)",
        displayName: `5톤 일반트럭 운송비(하차별도)-${matched}`,
        unit: "EA",
        showSpec: "y",
        baseQty: 1,
        baseUnitPrice: selectedSite.delivery,
        baseAmount: selectedSite.delivery,
        displayQty: 1,
        customerUnitPrice: selectedSite.delivery,
        finalAmount: selectedSite.delivery,
        months: 1,
        memo: "",
        lineSpec: { w, l, h },
      };
      onAdd(row);
    } else if (itemType === "crane" && selectedSite) {
      const regions = selectedSite.alias.split(',').map((r: string) => r.trim());
      const matched = regions.find((r: string) => r.toLowerCase().includes(siteQ.toLowerCase())) || regions[0];

      const row: any = {
        key: `CRANE_${Date.now()}`,
        optionId: "CRANE",
        optionName: "크레인 운송비",
        displayName: `크레인 운송비-${matched}`,
        unit: "EA",
        showSpec: "y",
        baseQty: 1,
        baseUnitPrice: selectedSite.crane,
        baseAmount: selectedSite.crane,
        displayQty: 1,
        customerUnitPrice: selectedSite.crane,
        finalAmount: selectedSite.crane,
        months: 1,
        memo: "",
        lineSpec: { w, l, h },
      };
      onAdd(row);
    }

    // 초기화
    setOptQ("");
    setSelectedOpt(null);
    setSiteQ("");
    setSites([]);
    setSelectedSite(null);
    setCalculatedPrice(0);
    setItemType("option");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
    }} onClick={onClose}>
      <div style={{
        background: '#fff',
        borderRadius: 12,
        padding: 24,
        width: 500,
        maxHeight: '80vh',
        overflow: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>품목 추가</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {/* 옵션 검색 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>옵션</label>
          <input
            value={optQ}
            onChange={(e) => { setOptQ(e.target.value); setSelectedOpt(null); }}
            placeholder="검색 (예: 모노륨, 단열, 도어...)"
            style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
          />
          {filteredOptions.length > 0 && !selectedOpt && (
            <div style={{ border: '1px solid #eee', borderRadius: 6, marginTop: 4, maxHeight: 200, overflow: 'auto' }}>
              {filteredOptions.map((o: any) => (
                <div
                  key={o.option_id}
                  onClick={() => handleSelectOption(o)}
                  style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f9f9f9')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                >
                  <div style={{ fontWeight: 700 }}>{o.option_name}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{o.unit || "EA"} · {fmt(Number(o.unit_price || 0))}원</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 규격 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>규격 (m)</label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: 12, color: '#666' }}>가로</span>
              <input
                type="number"
                value={w}
                onChange={(e) => setW(Number(e.target.value))}
                style={{ width: 60, padding: 8, border: '1px solid #ddd', borderRadius: 6, marginLeft: 4 }}
              />
            </div>
            <span style={{ fontSize: 18 }}>×</span>
            <div>
              <span style={{ fontSize: 12, color: '#666' }}>세로</span>
              <input
                type="number"
                value={l}
                onChange={(e) => setL(Number(e.target.value))}
                style={{ width: 60, padding: 8, border: '1px solid #ddd', borderRadius: 6, marginLeft: 4 }}
              />
            </div>
            <span style={{ fontSize: 18 }}>×</span>
            <div>
              <span style={{ fontSize: 12, color: '#666' }}>높이</span>
              <input
                type="number"
                step="0.1"
                value={h}
                onChange={(e) => setH(Number(e.target.value))}
                style={{ width: 60, padding: 8, border: '1px solid #ddd', borderRadius: 6, marginLeft: 4 }}
              />
            </div>
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: '#666' }}>
            → <strong>{w}x{l}x{h}</strong>
          </div>
        </div>

        {/* 단가 (옵션 선택 시) */}
        {selectedOpt && itemType === "option" && (
          <div style={{ marginBottom: 16, padding: 12, background: '#f9f9f9', borderRadius: 8 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>단가</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#2e5b86' }}>{fmt(calculatedPrice)}원</div>
          </div>
        )}

        {/* 현장 검색 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>현장 (운송비 추가용)</label>
          <input
            value={siteQ}
            onChange={(e) => handleSiteSearch(e.target.value)}
            placeholder="검색 (예: 화성, 인천...)"
            style={{ width: '100%', padding: 10, border: '1px solid #ddd', borderRadius: 6, fontSize: 14 }}
          />
          {sites.length > 0 && (
            <div style={{ border: '1px solid #eee', borderRadius: 6, marginTop: 4, maxHeight: 250, overflow: 'auto' }}>
              {sites.map((s: any, i: number) => (
                <div key={i} style={{ padding: '10px 12px', borderBottom: '1px solid #f5f5f5' }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{s.alias}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleSelectSiteDelivery(s)}
                      style={{
                        padding: '6px 12px',
                        background: '#2e5b86',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      일반운송 {fmt(s.delivery)}원
                    </button>
                    <button
                      onClick={() => handleSelectSiteCrane(s)}
                      style={{
                        padding: '6px 12px',
                        background: '#444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      크레인 {fmt(s.crane)}원
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 선택된 운송비 표시 */}
        {selectedSite && (itemType === "delivery" || itemType === "crane") && (
          <div style={{ marginBottom: 16, padding: 12, background: '#f0f7ff', borderRadius: 8 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              {itemType === "delivery" ? "일반운송비" : "크레인운송비"}
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#2e5b86' }}>{fmt(calculatedPrice)}원</div>
            <div style={{ fontSize: 12, color: '#666' }}>{selectedSite.alias}</div>
          </div>
        )}

        {/* 버튼 */}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: 12,
              background: '#f5f5f5',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            취소
          </button>
          <button
            onClick={handleAdd}
            disabled={!selectedOpt && !selectedSite}
            style={{
              flex: 1,
              padding: 12,
              background: (selectedOpt || selectedSite) ? '#2e5b86' : '#ccc',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              cursor: (selectedOpt || selectedSite) ? 'pointer' : 'not-allowed',
            }}
          >
            추가
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [options, setOptions] = useState<SupabaseOptionRow[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [selectedItems, setSelectedItems] = useState<SelectedRow[]>([]);
  
  // ✅ PC 품목 추가 팝업 상태
  const [pcAddModalOpen, setPcAddModalOpen] = useState(false);
  const isPcDevice = typeof window !== 'undefined' && window.innerWidth >= 768;

  const [view, setView] = useState<"rt" | "list">(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('view');
    if (v === 'list') return 'list';
    if (v === 'rt') return 'rt';
    return 'rt';
  });

  const [bizcards, setBizcards] = useState<Bizcard[]>([]);
  const [selectedBizcardId, setSelectedBizcardId] = useState<string>("");

  const [currentQuoteId, setCurrentQuoteId] = useState<string>("");
  const [currentVersion, setCurrentVersion] = useState<number>(0);

  const [form, setForm] = useState({
    quoteTitle: "",
    name: "",
    email: "",
    phone: "",
    w: 3,
    l: 6,
    h: 2.6,
    siteQ: "",
    sitePickedLabel: "",
    optQ: "",
    quoteDate: new Date().toISOString().slice(0, 10),
    vatIncluded: true,
  });

  const [statusMsg, setStatusMsg] = useState("");
  const [sendStatus, setSendStatus] = useState("");

  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const isMobileDevice = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const getMobileScale = () => {
    if (typeof window === 'undefined') return 0.45;
    return (window.innerWidth - 32) / 800;
  };

  const getMobileHeight = () => {
    const scale = getMobileScale();
    return Math.round(1130 * scale);
  };

  const fmt = (n: number) => (Number(n) || 0).toLocaleString("ko-KR");
  const isRentRow = (row: SelectedRow) => String((row as any)?.optionName || "").includes("임대");

  useEffect(() => {
    supabase
      .from("options")
      .select("*")
      .then(({ data }) => setOptions((data || []) as any));

    supabase
      .from("bizcards")
      .select("*")
      .then(({ data }) => {
        const list = (data || []) as any[];
        setBizcards(list);
        const goeunhee = list.find((x: any) => String(x.name || "").includes("고은희"));
        if (goeunhee?.id) setSelectedBizcardId(goeunhee.id);
        else if (list[0]?.id) setSelectedBizcardId(list[0].id);
      });
  }, []);

  const selectedBizcard = useMemo(
    () => bizcards.find((b) => b.id === selectedBizcardId),
    [bizcards, selectedBizcardId]
  );

  const recomputeRow = (r: SelectedRow): SelectedRow => {
    const rent = isRentRow(r);

    const baseQty = Number((r as any).baseQty || 1);
    const baseUnitPrice = Number((r as any).baseUnitPrice || 0);
    const baseAmount = Number((r as any).baseAmount || baseQty * baseUnitPrice);

    const displayQty = Math.max(0, Math.floor(Number((r as any).displayQty ?? 1)));

    const months = Number((r as any).months ?? 1);
    let customerUnitPrice: number;

    if (rent) {
      customerUnitPrice = Math.max(0, Math.round(baseUnitPrice * months));
    } else {
      customerUnitPrice = Math.max(0, Math.round(Number((r as any).customerUnitPrice ?? 0)));
    }

    const finalAmount = Math.round(displayQty * customerUnitPrice);

    return {
      ...(r as any),
      baseQty,
      baseUnitPrice,
      baseAmount,
      displayQty: rent ? Math.max(1, displayQty) : displayQty,
      customerUnitPrice,
      finalAmount,
      months: rent ? Math.max(1, months) : months,
      displayName: (r as any).displayName ?? (r as any).optionName,
    } as any;
  };

  const computedItems = useMemo(() => selectedItems.map(recomputeRow), [selectedItems]);

  const filteredOptions = useMemo(() => {
    const q = String(form.optQ || "").trim();
    if (!q) return [];

    const matched = options.filter((o: any) => {
      const name = String(o.option_name || "");
      return matchKorean(name, q);
    });

    const qLower = q.toLowerCase();
    matched.sort((a: any, b: any) => {
      const nameA = String(a.option_name || "").toLowerCase();
      const nameB = String(b.option_name || "").toLowerCase();

      const startsA = nameA.startsWith(qLower) ? 0 : 1;
      const startsB = nameB.startsWith(qLower) ? 0 : 1;
      if (startsA !== startsB) return startsA - startsB;

      const includesA = nameA.includes(qLower) ? 0 : 1;
      const includesB = nameB.includes(qLower) ? 0 : 1;
      return includesA - includesB;
    });

    return matched.slice(0, 12);
  }, [form.optQ, options]);

  const addOption = (opt: any, isSpecial = false, price = 0, label = "") => {
    if (opt.sub_items && Array.isArray(opt.sub_items) && opt.sub_items.length > 0) {
      const newRows = opt.sub_items.map((sub: any, idx: number) => {
        const qty = sub.qty || 0;
        const unitPrice = sub.unitPrice || 0;
        const amount = qty * unitPrice;

        return {
          key: `${opt.option_id}_${Date.now()}_${idx}`,
          optionId: `${opt.option_id}_${idx}`,
          optionName: sub.name,
          displayName: sub.name,
          unit: sub.unit || "EA",
          showSpec: "n",
          baseQty: qty,
          baseUnitPrice: unitPrice,
          baseAmount: amount,
          displayQty: qty,
          customerUnitPrice: unitPrice,
          finalAmount: amount,
          memo: "",
          months: 1,
          lineSpec: { w: form.w, l: form.l },
        };
      });

      setSelectedItems((prev: any) => [...prev, ...newRows.map(recomputeRow)]);
      setForm((prev) => ({ ...prev, optQ: "" }));
      setSites([]);
      return;
    }

    const res = calculateOptionLine(opt, form.w, form.l, form.h);
    const rawName = String(opt.option_name || opt.optionName || "(이름없음)");
    const rent = rawName.includes("임대");

    const baseQty = isSpecial ? 1 : Number(res.qty || 1);
    const baseUnitPrice = isSpecial ? Number(price) : Number(res.unitPrice || 0);
    const baseAmount = isSpecial ? Number(price) : Number(res.amount || 0);

    const defaultMonths = rent ? 1 : 1;
    const displayQty = 1;
    const customerUnitPrice = rent ? baseUnitPrice * defaultMonths : baseAmount;

    let simplifiedLabel = label;
    if (label && form.siteQ) {
      const regions = label.split(',').map((r: string) => r.trim());
      const searchQuery = form.siteQ.toLowerCase();
      const matched = regions.find((r: string) => r.toLowerCase().includes(searchQuery));
      simplifiedLabel = matched || regions[0];
    }

    const displayName = isSpecial
      ? `${rawName}-${simplifiedLabel}`.replace(/-+$/, "")
      : rent
      ? `${rawName} ${defaultMonths}개월`
      : rawName;

    const showSpec = isSpecial ? "y" : String(opt.show_spec || "").toLowerCase();

    const row: any = {
      key: `${String(opt.option_id || rawName)}_${Date.now()}`,
      optionId: String(opt.option_id || rawName),
      optionName: rawName,
      displayName,
      unit: rent ? "개월" : res.unit || "EA",
      showSpec,
      baseQty,
      baseUnitPrice,
      baseAmount,
      displayQty,
      customerUnitPrice,
      finalAmount: Math.round(displayQty * customerUnitPrice),
      months: defaultMonths,
      memo: res.memo || "",
      lineSpec: { w: form.w, l: form.l, h: form.h },
    };

    setSelectedItems((prev: any) => [...prev, recomputeRow(row)]);
    setForm((prev) => ({ ...prev, optQ: "", siteQ: prev.sitePickedLabel || prev.siteQ }));
    setSites([]);
  };

  // ✅ PC 팝업에서 품목 추가
  const handlePcAddItem = (row: any) => {
    setSelectedItems((prev: any) => [...prev, recomputeRow(row)]);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSelectedItems((items) => {
        const oldIndex = items.findIndex((i: any) => i.key === active.id);
        const newIndex = items.findIndex((i: any) => i.key === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const deleteRow = (key: string) =>
    setSelectedItems((prev: any) => prev.filter((i: any) => i.key !== key));

  const updateRow = (
    key: string,
    field: "displayName" | "displayQty" | "customerUnitPrice" | "months",
    value: any
  ) => {
    setSelectedItems((prev: any) =>
      prev.map((item: any) => {
        if (item.key !== key) return item;

        const rent = isRentRow(item);

        if (field === "displayName") return { ...item, displayName: String(value ?? "") };

        if (field === "months" && rent) {
          const months = Math.max(1, Math.floor(Number(value || 1)));
          const newUnitPrice = item.baseUnitPrice * months;
          const baseName = String(item.optionName || "").replace(/\s*\d+개월$/, "").trim();
          return recomputeRow({
            ...item,
            months,
            customerUnitPrice: newUnitPrice,
            displayName: `${baseName} ${months}개월`,
          });
        }

        if (field === "displayQty") {
          const qty = Math.max(0, Math.floor(Number(value || 0)));
          if (rent) {
            return recomputeRow({ ...item, displayQty: Math.max(1, qty) });
          }
          return recomputeRow({ ...item, displayQty: qty });
        }

        if (field === "customerUnitPrice") {
          if (rent) return item;
          const p = Math.max(0, Number(value || 0));
          return recomputeRow({ ...item, customerUnitPrice: p });
        }

        return item;
      })
    );
  };

  const handleSiteSearch = async (val: string) => {
    setForm((prev) => ({ ...prev, siteQ: val, sitePickedLabel: "" }));
    if (!val) {
      setSites([]);
      setStatusMsg("");
      return;
    }
    setStatusMsg("검색 중...");
    const { list } = await searchSiteRates(val, form.w, form.l);

    const filtered = list.filter((s: any) => {
      const alias = String(s.alias || "");
      return matchKorean(alias, val);
    });

    const qLower = val.toLowerCase();
    filtered.sort((a: any, b: any) => {
      const aliasA = String(a.alias || "").toLowerCase();
      const aliasB = String(b.alias || "").toLowerCase();

      const regionsA = aliasA.split(',').map((r: string) => r.trim());
      const regionsB = aliasB.split(',').map((r: string) => r.trim());

      const startsA = regionsA.some((r: string) => r.startsWith(qLower)) ? 0 : 1;
      const startsB = regionsB.some((r: string) => r.startsWith(qLower)) ? 0 : 1;
      if (startsA !== startsB) return startsA - startsB;

      const includesA = regionsA.some((r: string) => r.includes(qLower)) ? 0 : 1;
      const includesB = regionsB.some((r: string) => r.includes(qLower)) ? 0 : 1;
      return includesA - includesB;
    });

    setSites(filtered);
    setStatusMsg(`검색 결과 ${filtered.length}개`);
  };

  const supply_amount = computedItems.reduce((acc: number, cur: any) => acc + Number(cur.finalAmount || 0), 0);
  const vat_amount = Math.round(supply_amount * 0.1);
  const total_amount = supply_amount + vat_amount;

  const buildPayload = (quote_id: string, version: number) => {
    const spec = `${form.w}x${form.l}x${form.h}`;
    const title =
      String(form.quoteTitle || "").trim() ||
      `${form.sitePickedLabel || form.siteQ || ""} ${spec}`.trim();

    return {
      quote_id,
      version,
      quote_title: title,
      customer_name: form.name,
      customer_phone: form.phone,
      customer_email: form.email,
      site_name: form.sitePickedLabel || form.siteQ || "",
      site_addr: "",
      spec,
      w: form.w,
      l: form.l,
      product: "",
      qty: 1,
      memo: "",
      contract_start: "",
      supply_amount,
      vat_amount,
      total_amount,
      pdf_url: "",
      statement_url: "",
      bizcard_id: selectedBizcardId || null,
      items: computedItems.map((r: any) => ({
        optionId: r.optionId,
        optionName: r.optionName,
        itemName: r.displayName || r.optionName,
        unit: r.unit || "EA",
        qty: Number(r.displayQty || 0),
        unitPrice: Number(r.customerUnitPrice || 0),
        amount: Number(r.finalAmount || 0),
        memo: r.memo || "",
        baseQty: r.baseQty,
        baseUnitPrice: r.baseUnitPrice,
        baseAmount: r.baseAmount,
        lineSpec: r.lineSpec,
        showSpec: r.showSpec,
        months: r.months,
      })),
      updated_at: new Date().toISOString(),
    };
  };

  const handlePreview = () => window.print();

  const handleSaveNew = async (): Promise<string | null> => {
    if (!String(form.name || "").trim()) {
      alert("고객명을 입력해주세요.");
      return null;
    }

    setStatusMsg("신규 저장 중...");

    const quote_id = `Q_${Date.now()}`;
    const version = 1;

    const payload = buildPayload(quote_id, version);
    const { error } = await saveQuoteToDb(payload);

    if (error) {
      alert("저장 실패: " + error.message);
      setStatusMsg("저장 실패");
      return null;
    }

    setCurrentQuoteId(quote_id);
    setCurrentVersion(version);

    alert(`신규 저장 완료! (QUOTE: ${quote_id}, v${version})`);
    setStatusMsg("신규 저장 완료");
    return quote_id;
  };

  const handleSaveUpdate = async () => {
    if (!currentQuoteId) return alert("수정할 QUOTE가 없습니다. 먼저 신규 저장하세요.");

    setStatusMsg("수정 저장(새 버전) 중...");

    const { error } = await insertNextVersionToDb(
      currentQuoteId,
      buildPayload(currentQuoteId, currentVersion + 1)
    );

    if (error) {
      alert("수정 실패: " + error.message);
      setStatusMsg("수정 실패");
      return;
    }

    setCurrentVersion((v) => v + 1);

    alert("수정 저장 완료! (새 버전 추가)");
    setStatusMsg("수정 저장 완료");
  };

  const handleSend = async () => {
    if (!form.email) return alert("이메일을 입력해주세요.");

    try {
      setSendStatus("전송 준비 중...");

      let quoteId = currentQuoteId;
      if (!quoteId) {
        setSendStatus("견적서 저장 중...");
        const newId = await handleSaveNew();
        if (!newId) {
          setSendStatus("");
          return;
        }
        quoteId = newId;
      }

      setSendStatus("PDF 생성 중...");

      const originalSheet = document.querySelector("#quotePreviewApp .a4Sheet") as HTMLElement;
      if (!originalSheet) {
        throw new Error("견적서를 찾을 수 없습니다.");
      }

      const captureContainer = document.createElement('div');
      captureContainer.style.cssText = 'position: fixed; top: -9999px; left: -9999px; width: 800px; background: #fff; z-index: -1;';
      document.body.appendChild(captureContainer);

      const styleTag = document.querySelector('#quotePreviewApp style');
      if (styleTag) {
        captureContainer.appendChild(styleTag.cloneNode(true));
      }

      const clonedSheet = originalSheet.cloneNode(true) as HTMLElement;
      clonedSheet.style.cssText = 'width: 800px; min-height: 1123px; background: #fff; padding: 16px; box-sizing: border-box;';
      captureContainer.appendChild(clonedSheet);

      await new Promise(r => setTimeout(r, 300));

      const canvas = await html2canvas(clonedSheet, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        width: 800,
        windowWidth: 800,
      });

      document.body.removeChild(captureContainer);

      const imgData = canvas.toDataURL("image/jpeg", 0.92);

      const bizcard = bizcards.find(b => b.id === selectedBizcardId);
      const bizcardImageUrl = bizcard?.image_url || "";

      setSendStatus("메일 전송 중...");

      const GAS_URL = getWebAppUrl();

      const response = await fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify({
          fn: "sendQuoteEmailWithPdf",
          args: [quoteId, form.email, imgData, bizcardImageUrl, form.name]
        })
      });

      const result = await response.json();
      if (result.ok === false) throw new Error(result.message || "전송 실패");

      setSendStatus("전송 완료!");
      alert("견적서가 성공적으로 전송되었습니다.");

      setTimeout(() => setSendStatus(""), 2000);
    } catch (e: any) {
      setSendStatus("전송 실패");
      alert("전송 실패: " + (e?.message || String(e)));
      console.error("handleSend error:", e);
    }
  };

  const downloadJpg = async () => {
    const originalSheet = document.querySelector("#quotePreviewApp .a4Sheet") as HTMLElement;
    if (!originalSheet) {
      alert("캡처 대상을 찾을 수 없습니다.");
      return;
    }

    setStatusMsg("JPG 생성 중...");

    try {
      const captureContainer = document.createElement('div');
      captureContainer.id = 'captureContainer';
      captureContainer.style.cssText = 'position: fixed; top: -9999px; left: -9999px; width: 800px; background: #fff; z-index: -1;';
      document.body.appendChild(captureContainer);

      const styleTag = document.querySelector('#quotePreviewApp style');
      if (styleTag) {
        captureContainer.appendChild(styleTag.cloneNode(true));
      }

      const clonedSheet = originalSheet.cloneNode(true) as HTMLElement;
      clonedSheet.style.cssText = 'width: 800px; min-height: 1123px; background: #fff; border: 1px solid #cfd3d8; padding: 16px; box-sizing: border-box;';
      captureContainer.appendChild(clonedSheet);

      await new Promise(r => setTimeout(r, 300));

      const canvas = await html2canvas(clonedSheet, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        allowTaint: true,
        width: 800,
        windowWidth: 800,
      });

      document.body.removeChild(captureContainer);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `QUOTE_${currentQuoteId || Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setStatusMsg("다운로드 완료");
      setTimeout(() => setStatusMsg(""), 2000);
    } catch (e: any) {
      setStatusMsg("JPG 생성 실패");
      const container = document.getElementById('captureContainer');
      if (container) document.body.removeChild(container);
      alert("JPG 생성 실패: " + (e?.message || String(e)));
    }
  };

  const MIN_ROWS = 12;
  const blanksCount = Math.max(0, MIN_ROWS - computedItems.length);
  const blankRows = Array.from({ length: blanksCount });

  const listScreen = (
    <div style={{ minHeight: "100vh" }}>
      <div
        style={{
          padding: 12,
          borderBottom: "1px solid #eee",
          background: "#fff",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <button className="btn" onClick={() => setView("rt")}>
          ← 실시간견적
        </button>
      </div>

      <QuoteListPage onGoLive={() => setView("rt")} />
    </div>
  );

  const rtScreen = (
    <>
      {/* ✅ PC 품목 추가 팝업 */}
      <PcAddItemModal
        isOpen={pcAddModalOpen}
        onClose={() => setPcAddModalOpen(false)}
        onAdd={handlePcAddItem}
        options={options}
        form={form}
        searchSiteRates={searchSiteRates}
        calculateOptionLine={calculateOptionLine}
        matchKorean={matchKorean}
        fmt={fmt}
      />

      <div style={{ padding: 12, display: "flex", justifyContent: "flex-end" }}>
        <button className="btn" onClick={() => window.location.href = "/?view=list"}>
          견적목록
        </button>
      </div>

      <div className="wrap">
        {/* LEFT */}
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p className="title">상담 입력</p>
              <div className="mini">※ 우측은 A4 양식 미리보기</div>
              <div className="mini">※ 고객 출력은 "사용자 수정값(수량/단가)" 기준</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="quoteBadge">QUOTE: {currentQuoteId || "-"}</div>
              <div className="muted" style={{ marginTop: 4 }}>
                VERSION: {currentVersion ? `v${currentVersion}` : "-"}
              </div>
            </div>
          </div>

          <hr />

          <div className="row">
            <label>견적제목</label>
            <input
              value={form.quoteTitle}
              onChange={(e) => setForm({ ...form, quoteTitle: e.target.value })}
              placeholder="예: 강릉 3x6 / OO업체 39"
            />
          </div>
          <div className="row">
            <label>견적일</label>
            <input
              type="date"
              value={form.quoteDate}
              onChange={(e) => setForm({ ...form, quoteDate: e.target.value })}
            />
          </div>
          <div className="row">
            <label>부가세</label>
            <select
              value={form.vatIncluded ? "included" : "excluded"}
              onChange={(e) => setForm({ ...form, vatIncluded: e.target.value === "included" })}
            >
              <option value="included">부가세 포함</option>
              <option value="excluded">부가세 별도</option>
            </select>
          </div>

          <div className="row">
            <label>고객명</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="row">
            <label>이메일</label>
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="row">
            <label>전화번호</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>

          <div className="row">
            <label>명함</label>
            <select value={selectedBizcardId} onChange={(e) => setSelectedBizcardId(e.target.value)}>
              {bizcards.length === 0 && <option value="">(명함 없음)</option>}
              {bizcards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="row" style={{ alignItems: "center" }}>
            <label>규격(m)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>가로:</span>
              <input
                type="number"
                value={form.w}
                onChange={(e) => setForm({ ...form, w: Number(e.target.value) })}
                style={{ width: 60 }}
              />
              <span>세로:</span>
              <input
                type="number"
                value={form.l}
                onChange={(e) => setForm({ ...form, l: Number(e.target.value) })}
                style={{ width: 60 }}
              />
              <span>높이:</span>
              <input
                type="number"
                step="0.1"
                value={form.h}
                onChange={(e) => setForm({ ...form, h: Number(e.target.value) })}
                style={{ width: 60 }}
              />
            </div>
          </div>
          <p className="muted" style={{ textAlign: "right" }}>
            면적: {(form.w * form.l).toFixed(2)}㎡
          </p>

          <hr />

          <div className="row" style={{ justifyContent: "space-between" }}>
            <p className="title" style={{ margin: 0 }}>
              옵션
            </p>
            <span className="pill">{computedItems.length}개</span>
          </div>

          <div className="row">
            <label>옵션 검색</label>
            <input
              value={form.optQ}
              onChange={(e) => setForm({ ...form, optQ: e.target.value })}
              placeholder="예: 모노륨, 단열, 도어... (초성검색 가능)"
            />
          </div>

          {String(form.optQ || "").trim() !== "" && (
            <div className="box">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((o: any) => (
                  <div
                    key={o.option_id}
                    className="result-item"
                    onClick={() => {
                      addOption(o);
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>{o.option_name}</div>
                    <div className="muted">
                      {o.unit || "EA"} · {fmt(Number(o.unit_price || 0))}원
                    </div>
                  </div>
                ))
              ) : (
                <div className="result-item" style={{ cursor: "default", color: "#999" }}>
                  검색 결과 없음
                </div>
              )}
            </div>
          )}

          <hr />

          <div className="row">
            <label>현장지역</label>
            <input
              value={form.siteQ}
              onChange={(e) => handleSiteSearch(e.target.value)}
              placeholder="예:단가 조회는 초성 검색,운송비 추가는 단어검색 추천 "
            />
          </div>
          <div className="status">{statusMsg}</div>

          {sites.length > 0 && (
            <div className="box">
              {sites.map((s: any, i: number) => (
                <div key={i} className="result-item" style={{ cursor: "default" }}>
                  <div style={{ fontWeight: 900 }}>{s.alias}</div>
                  <div className="muted">
                    {s.bucket} {s.wideAdd > 0 ? "· 광폭" : ""}
                  </div>

                  <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button
                      className="btn"
                      onClick={() => {
                        const regions = s.alias.split(',').map((r: string) => r.trim());
                        const searchQuery = form.siteQ.toLowerCase();
                        const matched = regions.find((r: string) => r.toLowerCase().includes(searchQuery)) || regions[0];

                        setForm((p) => ({ ...p, sitePickedLabel: matched, siteQ: matched }));
                        addOption({ option_id: "DELIVERY", option_name: "5톤 일반트럭 운송비(하차별도)", unit_price: 0, show_spec: "y" }, true, s.delivery, s.alias);
                      }}
                    >
                      일반운송 추가 · {fmt(s.delivery)}
                    </button>

                    <button
                      className="btn"
                      onClick={() => {
                        const regions = s.alias.split(',').map((r: string) => r.trim());
                        const searchQuery = form.siteQ.toLowerCase();
                        const matched = regions.find((r: string) => r.toLowerCase().includes(searchQuery)) || regions[0];

                        setForm((p) => ({ ...p, sitePickedLabel: matched, siteQ: matched }));
                        addOption({ option_id: "CRANE", option_name: "크레인 운송비", unit_price: 0, show_spec: "y" }, true, s.crane, s.alias);
                      }}
                    >
                      크레인운송 추가 · {fmt(s.crane)}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            className="btn"
            style={{ marginTop: 8, width: "100%" }}
            onClick={() => {
              const newRow: any = {
                key: `CUSTOM_${Date.now()}`,
                optionId: `CUSTOM_${Date.now()}`,
                optionName: "",
                displayName: "",
                unit: "EA",
                showSpec: "n",
                baseQty: 1,
                baseUnitPrice: 0,
                baseAmount: 0,
                displayQty: 1,
                customerUnitPrice: 0,
                finalAmount: 0,
                memo: "",
                months: 1,
                lineSpec: { w: form.w, l: form.l },
              };
              setSelectedItems((prev: any) => [...prev, newRow]);
            }}
          >
            + 품목 추가
          </button>

          <div style={{ height: 10 }} />
          <div className="mini" style={{ marginBottom: 6 }}>
            좌측에서 수량/단가 수정 → 우측 A4 미리보기/저장에 동일 반영
          </div>
          <div className="box" style={{ marginTop: 10 }}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: "5%" }}></th>
                    <th style={{ width: "30%" }}>품명(수정)</th>
                    <th style={{ width: "8%" }}>단위</th>
                    <th className="right" style={{ width: "12%" }}>개월</th>
                    <th className="right" style={{ width: "12%" }}>수량</th>
                    <th className="right" style={{ width: "18%" }}>단가</th>
                    <th className="right" style={{ width: "10%" }}>금액</th>
                    <th className="right" style={{ width: "5%" }}></th>
                  </tr>
                </thead>
                <tbody>
                  <SortableContext items={computedItems.map((i: any) => i.key)} strategy={verticalListSortingStrategy}>
                    {computedItems.map((item: any, index: number) => (
                      <SortableRow
                        key={item.key}
                        item={item}
                        index={index}
                        rent={isRentRow(item)}
                        fmt={fmt}
                        updateRow={updateRow}
                        deleteRow={deleteRow}
                      />
                    ))}
                  </SortableContext>
                  {computedItems.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: "center", padding: 20, color: "#ccc" }}>
                        항목이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </DndContext>
          </div>

          <div className="actions">
            <button className="btn" onClick={handleSaveNew}>
              신규 저장
            </button>
            <button className="btn" onClick={handleSaveUpdate} disabled={!currentQuoteId}>
              수정 저장
            </button>
            <button className="btn" onClick={handleSend} disabled={!!sendStatus}>
              {sendStatus || "견적서 보내기"}
            </button>
            <button className="btn" onClick={downloadJpg}>
              JPG저장
            </button>
            <button className="btn" onClick={handlePreview}>
              인쇄
            </button>
          </div>
        </div>

        {/* RIGHT - PC/모바일 분기 */}
        {isMobileDevice ? (
          (() => {
            const scale = getMobileScale();
            const scaledWidth = Math.floor(800 * scale);
            const scaledHeight = Math.floor(1130 * scale);

            return (
              <div
                id="quotePreviewApp"
                onClick={() => setMobilePreviewOpen(true)}
                style={{
                  cursor: 'pointer',
                  width: scaledWidth,
                  height: scaledHeight,
                  margin: '0 auto',
                  overflow: 'hidden',
                  background: '#f5f6f8',
                  borderRadius: 14,
                  border: '1px solid #e5e7eb',
                  position: 'relative',
                }}
              >
                <div style={{
                  position: 'absolute',
                  bottom: 15,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(0,0,0,0.7)',
                  color: '#fff',
                  padding: '6px 12px',
                  borderRadius: 20,
                  fontSize: 11,
                  zIndex: 10,
                  pointerEvents: 'none'
                }}>
                  탭하여 크게 보기
                </div>
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: 800,
                  transformOrigin: 'top left',
                  transform: `scale(${scale})`,
                }}>
                  <A4Quote
                    form={form}
                    computedItems={computedItems}
                    blankRows={blankRows}
                    fmt={fmt}
                    supply_amount={supply_amount}
                    vat_amount={vat_amount}
                    total_amount={total_amount}
                    bizcardName={selectedBizcard?.name || ""}
                    noTransform={true}
                    noPadding={true}
                    quoteDate={form.quoteDate}
                  />
                </div>
              </div>
            );
          })()
        ) : (
          <div id="quotePreviewApp">
            <A4Quote
              form={form}
              computedItems={computedItems}
              blankRows={blankRows}
              fmt={fmt}
              supply_amount={supply_amount}
              vat_amount={vat_amount}
              total_amount={total_amount}
              bizcardName={selectedBizcard?.name || ""}
              onBlankRowClick={() => setPcAddModalOpen(true)}  // ✅ PC에서 빈 행 클릭 시 팝업
              isPc={!isMobileDevice}
            />
          </div>
        )}
      </div>

      {/* 모바일 전체화면 미리보기 */}
      {mobilePreviewOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: '#fff',
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid #eee',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#fff',
            flexShrink: 0,
          }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>견적서 미리보기</div>
            <button
              onClick={() => setMobilePreviewOpen(false)}
              style={{
                padding: '8px 16px',
                background: '#111',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              닫기
            </button>
          </div>
          <div style={{
            flex: 1,
            overflow: 'auto',
            WebkitOverflowScrolling: 'touch',
            background: '#f5f6f8',
            padding: '10px',
          }}>
            {(() => {
              const scale = Math.min(0.95, (window.innerWidth - 20) / 800);
              const scaledWidth = Math.floor(800 * scale);
              const scaledHeight = Math.floor(1130 * scale);
              return (
                <div
                  style={{
                    width: scaledWidth,
                    height: scaledHeight,
                    margin: '0 auto',
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: 800,
                      transformOrigin: 'top left',
                      transform: `scale(${scale})`,
                    }}
                  >
                    <A4Quote
                      form={form}
                      computedItems={computedItems}
                      blankRows={blankRows}
                      fmt={fmt}
                      supply_amount={supply_amount}
                      vat_amount={vat_amount}
                      total_amount={total_amount}
                      bizcardName={selectedBizcard?.name || ""}
                      noTransform={true}
                      noPadding={true}
                    />
                  </div>
                </div>
              );
            })()}
          </div>
          <div style={{
            padding: '10px 16px',
            borderTop: '1px solid #eee',
            display: 'flex',
            gap: 8,
            background: '#fff',
            position: 'relative',
            flexShrink: 0,
          }}>
            <button
              onClick={() => { setMobilePreviewOpen(false); downloadJpg(); }}
              style={{
                flex: 1,
                padding: '12px',
                background: '#fff',
                border: '1px solid #ddd',
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              JPG 저장
            </button>
            <div style={{ flex: 1, position: 'relative' }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const menu = document.getElementById('sendMenuApp');
                  if (menu) menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#111',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                전송 ▼
              </button>
              <div
                id="sendMenuApp"
                style={{
                  display: 'none',
                  position: 'absolute',
                  bottom: '100%',
                  left: 0,
                  right: 0,
                  marginBottom: 8,
                  background: '#fff',
                  borderRadius: 10,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  border: '1px solid #e5e7eb',
                }}
              >
                {form.email && (
                  <button
                    onClick={() => {
                      document.getElementById('sendMenuApp')!.style.display = 'none';
                      setMobilePreviewOpen(false);
                      handleSend();
                    }}
                    style={{
                      padding: '14px 16px',
                      background: '#fff',
                      border: 'none',
                      borderBottom: '1px solid #eee',
                      fontSize: 14,
                      fontWeight: 600,
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    ✉️ 이메일 전송
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{form.email}</div>
                  </button>
                )}
                {form.phone && (
                  <button
                    onClick={async () => {
                      document.getElementById('sendMenuApp')!.style.display = 'none';

                      const originalSheet = document.querySelector('#quotePreviewApp .a4Sheet') as HTMLElement;
                      if (!originalSheet) {
                        alert('견적서를 찾을 수 없습니다.');
                        return;
                      }

                      try {
                        setStatusMsg('이미지 생성 중...');

                        const captureContainer = document.createElement('div');
                        captureContainer.id = 'captureContainerSms';
                        captureContainer.style.cssText = 'position: fixed; top: -9999px; left: -9999px; width: 800px; background: #fff; z-index: -1;';
                        document.body.appendChild(captureContainer);

                        const styleTag = document.querySelector('#quotePreviewApp style');
                        if (styleTag) {
                          captureContainer.appendChild(styleTag.cloneNode(true));
                        }

                        const clonedSheet = originalSheet.cloneNode(true) as HTMLElement;
                        clonedSheet.style.cssText = 'width: 800px; min-height: 1123px; background: #fff; border: 1px solid #cfd3d8; padding: 16px; box-sizing: border-box;';
                        captureContainer.appendChild(clonedSheet);

                        await new Promise(r => setTimeout(r, 300));

                        const canvas = await html2canvas(clonedSheet, {
                          scale: 1.5,
                          backgroundColor: '#ffffff',
                          useCORS: true,
                          allowTaint: true,
                          width: 800,
                          windowWidth: 800,
                        });

                        document.body.removeChild(captureContainer);

                        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

                        const msg = `안녕하세요 현대컨테이너입니다 문의 주셔서 감사합니다 ${form.name || '고객'}님 견적서를 보내드립니다.확인하시고 문의사항 있으시면 언제든 연락 주세요 감사합니다~`;
                        const phone = form.phone.replace(/[^0-9]/g, '');

                        const a = document.createElement('a');
                        a.href = dataUrl;
                        a.download = `견적서_${form.name || 'quote'}.jpg`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);

                        setStatusMsg('');
                        setMobilePreviewOpen(false);

                        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
                        const separator = isIOS ? '&' : '?';

                        setTimeout(() => {
                          window.location.href = `sms:${phone}${separator}body=${encodeURIComponent(msg)}`;
                        }, 1500);

                      } catch (e) {
                        console.error(e);
                        setStatusMsg('');
                        const container = document.getElementById('captureContainerSms');
                        if (container) document.body.removeChild(container);
                        alert('이미지 생성 실패: ' + (e as any)?.message);
                      }
                    }}
                    style={{
                      padding: '14px 16px',
                      background: '#fff',
                      border: 'none',
                      fontSize: 14,
                      fontWeight: 600,
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    📱 문자 전송
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{form.phone}</div>
                  </button>
                )}
                {!form.email && !form.phone && (
                  <div style={{ padding: '14px 16px', color: '#888', fontSize: 13 }}>
                    이메일 또는 전화번호를 입력해주세요
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return view === "list" ? listScreen : rtScreen;
}

type A4QuoteProps = {
  form: {
    quoteTitle: string;
    name: string;
    email: string;
    phone: string;
    w: number;
    l: number;
    h: number;
    siteQ: string;
    sitePickedLabel: string;
    optQ: string;
    quoteDate?: string;
    vatIncluded?: boolean;
  };
  computedItems: any[];
  blankRows: any[];
  fmt: (n: number) => string;
  supply_amount: number;
  vat_amount: number;
  total_amount: number;
  bizcardImageUrl?: string;
  bizcardName?: string;
  noTransform?: boolean;
  noPadding?: boolean;
  quoteDate?: string;
  onBlankRowClick?: () => void;  // ✅ PC 빈 행 클릭 핸들러
  isPc?: boolean;  // ✅ PC 여부
};

function SortableRow({ item, index, rent, fmt, updateRow, deleteRow }: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    background: isDragging ? '#f0f0f0' : '#fff',
  };

  return (
    <tr ref={setNodeRef} style={style}>
      <td {...attributes} {...listeners} style={{ cursor: 'grab', textAlign: 'center' }}>
        ☰
      </td>
      <td>
        <div className="muted" style={{ fontSize: 10, marginBottom: 4 }}>
          내부: {item.baseQty}{item.unit} × {fmt(item.baseUnitPrice)} = {fmt(item.baseAmount)}
        </div>
        <input
          value={item.displayName}
          onChange={(e) => updateRow(item.key, "displayName", e.target.value)}
          style={{ width: "100%", fontSize: 12, padding: 4, border: "1px solid #ddd" }}
        />
      </td>
      <td style={{ textAlign: "center" }}>{item.unit}</td>
      <td className="right">
        {rent ? (
          <input
            type="number"
            min={1}
            step={1}
            value={item.months || 1}
            onChange={(e) => updateRow(item.key, "months", e.target.value)}
            style={{ width: 50, padding: 2, textAlign: "right" }}
          />
        ) : (
          <span style={{ color: "#ccc" }}>-</span>
        )}
      </td>
      <td className="right">
        <input
          type="number"
          min={0}
          step={1}
          value={item.displayQty === 0 ? "" : item.displayQty}
          onChange={(e) => updateRow(item.key, "displayQty", e.target.value)}
          style={{ width: 50, padding: 2, textAlign: "right" }}
        />
      </td>
      <td className="right">
        {rent ? (
          <span style={{ fontWeight: 700 }}>{fmt(item.customerUnitPrice)}</span>
        ) : (
          <input
            type="number"
            min={0}
            step={1}
            value={item.customerUnitPrice === 0 ? "" : item.customerUnitPrice}
            onChange={(e) => updateRow(item.key, "customerUnitPrice", e.target.value)}
            style={{ width: 100, padding: 2, textAlign: "right" }}
          />
        )}
      </td>
      <td className="right" style={{ fontWeight: 900 }}>
        {fmt(item.finalAmount)}
      </td>
      <td className="right">
        <button
          onClick={() => deleteRow(item.key)}
          style={{
            color: "red",
            border: "none",
            background: "none",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          X
        </button>
      </td>
    </tr>
  );
}

function A4Quote({ form, computedItems, blankRows, fmt, supply_amount, vat_amount, total_amount, bizcardName, noTransform, noPadding, quoteDate, onBlankRowClick, isPc }: A4QuoteProps) {
  const ymd = form.quoteDate || new Date().toISOString().slice(0, 10);

  const spec = `${form.w}x${form.l}x${form.h}`;
  const siteText = String(form.sitePickedLabel || form.siteQ || "").trim();

  return (
    <div className="card" style={noPadding ? { padding: 0, margin: 0, border: 'none', background: 'transparent' } : undefined}>
      <style>{a4css}</style>

      <div className="a4Wrap" style={noTransform ? { transform: 'none', padding: 0, background: '#fff', display: 'block' } : undefined}>
        <div className="a4Sheet">
          <div className="a4Header">
            <div className="a4HeaderLeft">
              <img src="https://i.postimg.cc/VvsGvxFP/logo1.jpg" alt="logo" className="a4Logo" />
            </div>
            <div className="a4HeaderCenter">견 적 서</div>
            <div className="a4HeaderRight" />
          </div>

          <table className="a4Info">
            <colgroup>
              <col style={{ width: "15%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "22%" }} />
            </colgroup>
            <tbody>
              <tr>
                <th className="k center">담당자</th>
                <td className="v" colSpan={3}>{bizcardName || ""}</td>
                <th className="k center">견적일자</th>
                <td className="v">{ymd}</td>
              </tr>
              <tr>
                <th className="k center">고객명</th>
                <td className="v" colSpan={3}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{form.name || ""}</span>
                    <span style={{ fontWeight: 900 }}>귀하</span>
                  </div>
                </td>
                <th className="k center">공급자</th>
                <td className="v ">현대컨테이너</td>
              </tr>
              <tr>
                <th className="k center">이메일</th>
                <td className="v">{form.email || ""}</td>
                <th className="k center">전화</th>
                <td className="v">{form.phone || ""}</td>
                <th className="k center">등록번호</th>
                <td className="v">130-41-38154</td>
              </tr>
              <tr>
                <th className="k center">현장</th>
                <td className="v">{siteText}</td>
                <th className="k center">견적일</th>
                <td className="v">{new Date(ymd + 'T00:00:00').toLocaleDateString("ko-KR")}</td>
                <th className="k center">주소</th>
                <td className="v">경기도 화성시<br />향남읍 구문천안길16</td>
              </tr>
              <tr>
                <td className="msg" colSpan={4}>
                  견적요청에 감사드리며 아래와 같이 견적합니다.
                </td>
                <th className="k center">대표전화</th>
                <td className="v">1688-1447</td>
              </tr>
              <tr>
                <td className="sum" colSpan={6}>
                  합계금액 : ₩{fmt(form.vatIncluded !== false ? total_amount : supply_amount)} ({form.vatIncluded !== false ? "부가세 포함" : "부가세 별도"})
                </td>
              </tr>
            </tbody>
          </table>

          <table className="a4Items">
            <colgroup>
              <col style={{ width: "7%" }} />
              <col style={{ width: "31%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
            </colgroup>
            <thead>
              <tr>
                <th className="h">순번</th>
                <th className="h">품목</th>
                <th className="h">규격</th>
                <th className="h">수량</th>
                <th className="h">단가</th>
                <th className="h">공급가</th>
                <th className="h">세액</th>
                <th className="h">비고</th>
              </tr>
            </thead>
            <tbody>
              {computedItems.map((item: any, idx: number) => {
                const unitSupply = Number(item.customerUnitPrice ?? 0);
                const qty = Number(item.displayQty ?? 0);
                const supply = unitSupply * qty;
                const vat = Math.round(supply * 0.1);
                const showSpec = String(item.showSpec || "").toLowerCase() === "y";
                const specText = showSpec && item?.lineSpec?.w && item?.lineSpec?.l
                  ? `${item.lineSpec.w}x${item.lineSpec.l}${item.lineSpec.h ? 'x' + item.lineSpec.h : ''}`
                  : "";

                return (
                  <tr key={item.key ?? idx}>
                    <td className="c center">{idx + 1}</td>
                    <td className="c wrap">{String(item.displayName || "")}</td>
                    <td className="c center">{specText}</td>
                    <td className="c center">{String(item.displayQty ?? "")}</td>
                    <td className="c right">{fmt(unitSupply)}</td>
                    <td className="c right">{fmt(supply)}</td>
                    <td className="c right">{fmt(vat)}</td>
                    <td className="c"></td>
                  </tr>
                );
              })}
              {/* ✅ PC에서 빈 행 클릭 시 품목 추가 팝업 */}
              {blankRows.map((_, i) => (
                <tr 
                  key={`blank-${i}`}
                  onClick={isPc && onBlankRowClick ? onBlankRowClick : undefined}
                  style={isPc && onBlankRowClick ? { cursor: 'pointer' } : undefined}
                  onMouseEnter={isPc && onBlankRowClick ? (e) => (e.currentTarget.style.background = '#f5f9ff') : undefined}
                  onMouseLeave={isPc && onBlankRowClick ? (e) => (e.currentTarget.style.background = '#fff') : undefined}
                >
                  <td className="c">{isPc && i === 0 ? <span style={{ color: '#aaa', fontSize: 11 }}>+</span> : '\u00A0'}</td>
                  <td className="c">{isPc && i === 0 ? <span style={{ color: '#aaa', fontSize: 11 }}>클릭하여 품목 추가</span> : ''}</td>
                  <td className="c"></td>
                  <td className="c"></td>
                  <td className="c"></td>
                  <td className="c"></td>
                  <td className="c"></td>
                  <td className="c"></td>
                </tr>
              ))}
            </tbody>
          </table>

          <table className="a4Bottom">
            <colgroup>
              <col style={{ width: "15%" }} />
              <col style={{ width: "29%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "11%" }} />
            </colgroup>
            <tbody>
              <tr className="sumRow">
                <td className="sumLeft" colSpan={5}>
                  합계: {fmt(total_amount)}원
                </td>
                <td className="sumNum right">{fmt(supply_amount)}</td>
                <td className="sumNum right">{fmt(vat_amount)}</td>
                <td className="sumNum right"></td>
              </tr>
              <tr>
                <th className="label">결제조건</th>
                <td className="text" colSpan={7}>
                  계약금 50%입금 후 도면제작 및 확인/착수, 선 완불 후 출고
                </td>
              </tr>
              <tr>
                <th className="label">주의사항</th>
                <td className="text" colSpan={7}>
                  *견적서는 견적일로 부터 2주간 유효합니다.
                  <br />
                  1. 하차비 별도(당 지역 지게차 혹은 크레인 이용)
                  <br />
                  2. '주문 제작'시 50퍼센트 입금 후 제작, 완불 후 출고. /임대의 경우 계약금 없이 완불 후 출고
                  <br />
                  *출고 전날 오후 2시 이전 잔금 결제 조건*
                  <br />
                  3. 하차, 회수시 상차 별도(당 지역 지게차 혹은 크레인 이용)
                </td>
              </tr>
              <tr>
                <th className="label">중요사항</th>
                <td className="text" colSpan={7}>
                  *중요사항*
                  <br />
                  1. 인적사항 요구 현장시 운임비 3만원 추가금 발생합니다.
                  <br />
                  2. 기본 전기는 설치 되어 있으나 주택용도 전선관은 추가되어 있지 않습니다.
                  <br />
                  한전/전기안전공사 측에서 전기연결 예정이신 경우 전선관 옵션을 추가하여 주시길 바랍니다.
                  <br />
                  해당사항은 고지의무사항이 아니므로 상담을 통해 확인하시길 바랍니다.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const a4css = `
  .a4Wrap{
    display:flex;
    justify-content:center;
    padding: 14px 0;
    background:#f5f6f8;
  }
  .a4Sheet {
    width: 800px;
    min-height: 1123px;
    background: #fff;
    border: 1px solid #cfd3d8;
    padding: 16px;
    box-sizing: border-box;
  }
  .a4Header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    padding: 6px 2px 10px;
    border-bottom: 2px solid #2e5b86;
    margin-bottom: 10px;
  }
  .a4HeaderLeft{
    display:flex;
    align-items:center;
    gap: 10px;
  }
  .a4Logo {
    width: 160px;
    height: 140px;
    display: block;
  }
  .a4Info {
    margin-top: 0;
  }
  .a4HeaderCenter{
    flex:1;
    text-align:center;
    font-size: 34px;
    font-weight: 900;
    letter-spacing: 6px;
  }
  .a4HeaderRight{ width: 140px; }

  table{ 
    width: 100% !important; 
    max-width: 100% !important;
    border-collapse: collapse; 
    table-layout: fixed;
  }
  .a4Info, .a4Items{
    width: 100% !important;
    max-width: 100% !important;
    table-layout: fixed;
    border: 1px solid #333;
    margin-top: 8px;
  }
  .a4Bottom{
  width: 100% !important;
  max-width: 100% !important;
  table-layout: fixed;
  border: 1px solid #333;
  margin-top: 10px;
}

  .a4Info th, .a4Info td,
  .a4Items th, .a4Items td,
  .a4Bottom th, .a4Bottom td{
    border: 1px solid #333;
    padding: 6px 8px;
    font-size: 13px;
    vertical-align: middle;
  }

  .k{ background:#fff; font-weight: 900; }
  .v{ background:#fff; }
  .center{ text-align:center; }
  .right{ text-align:right; }

  .msg{
    font-size: 13px;
    font-weight: 700;
    text-align:center;
    background:#fff;
  }
  .sum{
    font-size: 14px;
    font-weight: 900;
    background:#fff;
  }

  .a4Items thead th{
    background:#e6e6e6;
    font-weight:900;
    text-align:center;
  }
  
  .h{
    background:#e6e6e6;
    font-weight:900;
    text-align:center;
  }

  .a4Items tbody td.c{ 
    background:#fff;
    padding: 4px 8px;
    vertical-align: top;
  }
  .a4Items .wrap{
    display: block;
    white-space: normal;
    word-break: break-word;
    overflow-wrap: break-word;
    line-height: 1.3;
    font-size: 11px;
    max-height: 65px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .a4Items tbody td{
    padding: 6px 8px;
    vertical-align: middle;
    min-height: 28px;
    max-height: 70px;
  }
  
  .a4Items tbody td.wrap{
    vertical-align: top;
    line-height: 1.3;
  }

  .a4Bottom .sumRow td{
    background:#e6e6e6;
    font-weight:900;
  }
  .a4Bottom .sumLeft{
    text-align:left;
  }
  .a4Bottom .sumNum{
    text-align:right;
    white-space: nowrap;
  }
  .a4Bottom .label{
    background:#e6e6e6;
    font-weight:900;
    text-align:center;
    white-space: nowrap;
  }
  .a4Bottom .text{
    font-size: 12px;
    line-height:1.55;
    white-space: normal;
    word-break: break-word;
    overflow-wrap:anywhere;
  }

  @media print{
    @page {
      size: A4;
      margin: 0;
    }
    html, body {
      margin: 0;
      padding: 0;
      overflow: hidden;
    }
    .wrap > .card:first-child { display: none !important; }
    .wrap { display: block !important; margin: 0 !important; padding: 0 !important; }
    .wrap > .card:last-child { margin: 0 !important; padding: 0 !important; }
    .btn, .actions { display: none !important; }
    .a4Wrap{ 
      background:#fff; 
      padding:0;
      margin: 0;
      zoom: 1;
      overflow: hidden;
      transform: none;
    }
    .a4Sheet{ 
      border:none; 
      width: 200mm;
      min-height: auto;
      height: auto;
      padding: 0mm;
      margin: 0;
      box-shadow: none;
      overflow: hidden;
      transform: none;
    }
    * {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
`;
