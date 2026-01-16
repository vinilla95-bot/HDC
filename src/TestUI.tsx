
// TestInlineQuote.tsx
// 경리나라 스타일 - 견적서 내 인라인 편집 + 드롭다운 검색
// GitHub에 src/TestInlineQuote.tsx 로 추가하고
// App.tsx 대신 이 파일을 import 해서 테스트

import React, { useEffect, useMemo, useRef, useState } from "react";
import QuoteListPage from "./pages/QuoteListPage";
import ContractListPage from "./pages/ContractListPage";
import DeliveryCalendarPage from "./pages/DeliveryCalendarPage";
import InventoryPage from "./pages/InventoryPage";
import html2canvas from "html2canvas";

import {
  supabase,
  calculateOptionLine,
  searchSiteRates,
  saveQuoteToDb,
  insertNextVersionToDb,
} from "./QuoteService";

import type { SelectedRow, SupabaseOptionRow } from "./types";
import "./index.css";

// 초성 검색
const CHOSUNG_LIST = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const getChosung = (str: string): string => str.split('').map(c => { const code = c.charCodeAt(0) - 44032; return code < 0 || code > 11171 ? c : CHOSUNG_LIST[Math.floor(code / 588)]; }).join('');
const isChosung = (str: string): boolean => str.split('').every(c => CHOSUNG_LIST.includes(c));
const matchKorean = (target: string, query: string): boolean => {
  if (!query) return true;
  const q = query.toLowerCase(), t = target.toLowerCase();
  return isChosung(q) ? getChosung(t).includes(q) : t.includes(q);
};

const getWebAppUrl = () => "https://script.google.com/macros/s/AKfycbyTGGQnxlfFpqP5zS0kf7m9kzSK29MGZbeW8GUMlAja04mRJHRszuRdpraPdmOWxNNr/exec";

type Bizcard = { id: string; name: string; image_url: string };
const fmt = (n: number) => (Number(n) || 0).toLocaleString("ko-KR");

export default function TestInlineQuote() {
  const [options, setOptions] = useState<SupabaseOptionRow[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [selectedItems, setSelectedItems] = useState<SelectedRow[]>([]);
  const [bizcards, setBizcards] = useState<Bizcard[]>([]);
  const [selectedBizcardId, setSelectedBizcardId] = useState<string>("");
  const [currentQuoteId, setCurrentQuoteId] = useState<string>("");
  const [currentVersion, setCurrentVersion] = useState<number>(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [sendStatus, setSendStatus] = useState("");

  const [view, setView] = useState<"rt"|"list"|"contract"|"calendar"|"inventory">(() => {
    const v = new URLSearchParams(window.location.search).get('view');
    if (v === 'list') return 'list';
    if (v === 'contract') return 'contract';
    if (v === 'calendar') return 'calendar';
    if (v === 'inventory') return 'inventory';
    return 'rt';
  });

  const [form, setForm] = useState({
    quoteTitle: "", name: "", email: "", phone: "",
    w: 3, l: 6, h: 2.6,
    siteQ: "", sitePickedLabel: "", optQ: "",
    quoteDate: new Date().toISOString().slice(0, 10),
    vatIncluded: true,
  });

  const [showBizcardDropdown, setShowBizcardDropdown] = useState(false);
  const [showSiteDropdown, setShowSiteDropdown] = useState(false);
  const bizcardRef = useRef<HTMLDivElement>(null);
  const siteRef = useRef<HTMLTableCellElement>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    view === 'rt' ? url.searchParams.delete('view') : url.searchParams.set('view', view);
    window.history.replaceState({}, '', url.toString());
  }, [view]);

  useEffect(() => {
    supabase.from("options").select("*").then(({ data }) => setOptions((data || []) as any));
    supabase.from("bizcards").select("*").then(({ data }) => {
      const list = (data || []) as any[];
      setBizcards(list);
      const gh = list.find((x: any) => String(x.name || "").includes("고은희"));
      setSelectedBizcardId(gh?.id || list[0]?.id || "");
    });
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bizcardRef.current && !bizcardRef.current.contains(e.target as Node)) setShowBizcardDropdown(false);
      if (siteRef.current && !siteRef.current.contains(e.target as Node)) { setShowSiteDropdown(false); setSites([]); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedBizcard = useMemo(() => bizcards.find(b => b.id === selectedBizcardId), [bizcards, selectedBizcardId]);
  const isRentRow = (row: any) => String(row?.optionName || "").includes("임대");

  const recomputeRow = (r: any): any => {
    const rent = isRentRow(r);
    const baseQty = Number(r.baseQty || 1);
    const baseUnitPrice = Number(r.baseUnitPrice || 0);
    const baseAmount = Number(r.baseAmount || baseQty * baseUnitPrice);
    const displayQty = Math.max(0, Math.floor(Number(r.displayQty ?? 1)));
    const months = Number(r.months ?? 1);
    const customerUnitPrice = rent ? Math.round(baseUnitPrice * months) : Math.round(Number(r.customerUnitPrice ?? 0));
    const finalAmount = Math.round(displayQty * customerUnitPrice);
    return { ...r, baseQty, baseUnitPrice, baseAmount, displayQty: rent ? Math.max(1, displayQty) : displayQty, customerUnitPrice, finalAmount, months: rent ? Math.max(1, months) : months, displayName: r.displayName ?? r.optionName };
  };

  const computedItems = useMemo(() => selectedItems.map(recomputeRow), [selectedItems]);

  const getFilteredOptions = (query: string) => {
    const q = String(query || "").trim();
    if (!q) return [];
    const matched = options.filter((o: any) => matchKorean(String(o.option_name || ""), q));
    matched.sort((a: any, b: any) => {
      const qL = q.toLowerCase();
      return (String(a.option_name || "").toLowerCase().startsWith(qL) ? 0 : 1) - (String(b.option_name || "").toLowerCase().startsWith(qL) ? 0 : 1);
    });
    return matched.slice(0, 10);
  };

  const addEmptyRow = () => {
    const newRow: any = { key: `EMPTY_${Date.now()}`, optionId: "", optionName: "", displayName: "", unit: "EA", showSpec: "n", baseQty: 1, baseUnitPrice: 0, baseAmount: 0, displayQty: 1, customerUnitPrice: 0, finalAmount: 0, memo: "", months: 1, lineSpec: { w: form.w, l: form.l } };
    setSelectedItems(prev => [...prev, newRow]);
  };

  const deleteRow = (key: string) => setSelectedItems(prev => prev.filter((i: any) => i.key !== key));

  const updateRow = (key: string, field: string, value: any) => {
    setSelectedItems(prev => prev.map((item: any) => {
      if (item.key !== key) return item;
      const rent = isRentRow(item);
      if (field === "displayName") return { ...item, displayName: String(value ?? "") };
      if (field === "months" && rent) { const m = Math.max(1, Math.floor(Number(value || 1))); return recomputeRow({ ...item, months: m, customerUnitPrice: item.baseUnitPrice * m, displayName: `${String(item.optionName || "").replace(/\s*\d+개월$/, "").trim()} ${m}개월` }); }
      if (field === "displayQty") return recomputeRow({ ...item, displayQty: Math.max(0, Math.floor(Number(value || 0))) });
      if (field === "customerUnitPrice" && !rent) return recomputeRow({ ...item, customerUnitPrice: Math.max(0, Number(value || 0)) });
      return item;
    }));
  };

  const handleSiteSearch = async (val: string) => {
    setForm(prev => ({ ...prev, siteQ: val, sitePickedLabel: "" }));
    if (!val) { setSites([]); return; }
    const { list } = await searchSiteRates(val, form.w, form.l);
    setSites(list.filter((s: any) => matchKorean(String(s.alias || ""), val)));
    setShowSiteDropdown(true);
  };

  const supply_amount = computedItems.reduce((acc, cur: any) => acc + Number(cur.finalAmount || 0), 0);
  const vat_amount = Math.round(supply_amount * 0.1);
  const total_amount = supply_amount + vat_amount;

  const buildPayload = (quote_id: string, version: number) => {
    const spec = `${form.w}x${form.l}x${form.h}`;
    const title = String(form.quoteTitle || "").trim() || `${form.sitePickedLabel || form.siteQ || ""} ${spec}`.trim();
    return { quote_id, version, quote_title: title, customer_name: form.name, customer_phone: form.phone, customer_email: form.email, site_name: form.sitePickedLabel || form.siteQ || "", site_addr: "", spec, w: form.w, l: form.l, product: "", qty: 1, memo: "", contract_start: "", supply_amount, vat_amount, total_amount, pdf_url: "", statement_url: "", bizcard_id: selectedBizcardId || null, items: computedItems.map((r: any) => ({ optionId: r.optionId, optionName: r.optionName, itemName: r.displayName || r.optionName, unit: r.unit || "EA", qty: Number(r.displayQty || 0), unitPrice: Number(r.customerUnitPrice || 0), amount: Number(r.finalAmount || 0), memo: r.memo || "", baseQty: r.baseQty, baseUnitPrice: r.baseUnitPrice, baseAmount: r.baseAmount, lineSpec: r.lineSpec, showSpec: r.showSpec, months: r.months })), updated_at: new Date().toISOString() };
  };

  const handleSaveNew = async (): Promise<string | null> => {
    if (!String(form.name || "").trim()) { alert("고객명을 입력해주세요."); return null; }
    setStatusMsg("신규 저장 중...");
    const quote_id = `Q_${Date.now()}`, version = 1;
    const { error } = await saveQuoteToDb(buildPayload(quote_id, version));
    if (error) { alert("저장 실패: " + error.message); setStatusMsg("저장 실패"); return null; }
    setCurrentQuoteId(quote_id); setCurrentVersion(version);
    alert(`신규 저장 완료! (QUOTE: ${quote_id}, v${version})`); setStatusMsg("신규 저장 완료");
    return quote_id;
  };

  const handleSaveUpdate = async () => {
    if (!currentQuoteId) return alert("수정할 QUOTE가 없습니다.");
    setStatusMsg("수정 저장 중...");
    const { error } = await insertNextVersionToDb(currentQuoteId, buildPayload(currentQuoteId, currentVersion + 1));
    if (error) { alert("수정 실패: " + error.message); setStatusMsg("수정 실패"); return; }
    setCurrentVersion(v => v + 1); alert("수정 저장 완료!"); setStatusMsg("수정 저장 완료");
  };

  const handleSend = async () => {
    if (!form.email) return alert("이메일을 입력해주세요.");
    try {
      setSendStatus("전송 준비 중...");
      let quoteId = currentQuoteId;
      if (!quoteId) { setSendStatus("저장 중..."); const newId = await handleSaveNew(); if (!newId) { setSendStatus(""); return; } quoteId = newId; }
      setSendStatus("PDF 생성 중...");
      const sheet = document.querySelector(".inline-quote-sheet") as HTMLElement;
      if (!sheet) throw new Error("견적서를 찾을 수 없습니다.");
      const canvas = await html2canvas(sheet, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      const bizcard = bizcards.find(b => b.id === selectedBizcardId);
      setSendStatus("메일 전송 중...");
      const res = await fetch(getWebAppUrl(), { method: "POST", body: JSON.stringify({ fn: "sendQuoteEmailWithPdf", args: [quoteId, form.email, imgData, bizcard?.image_url || "", form.name] }) });
      const result = await res.json();
      if (result.ok === false) throw new Error(result.message || "전송 실패");
      setSendStatus("전송 완료!"); alert("전송 완료!"); setTimeout(() => setSendStatus(""), 2000);
    } catch (e: any) { setSendStatus("전송 실패"); alert("전송 실패: " + (e?.message || String(e))); }
  };

  const downloadJpg = async () => {
    const sheet = document.querySelector(".inline-quote-sheet") as HTMLElement;
    if (!sheet) return alert("견적서를 찾을 수 없습니다.");
    setStatusMsg("JPG 생성 중...");
    try {
      const canvas = await html2canvas(sheet, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const a = document.createElement("a"); a.href = canvas.toDataURL("image/jpeg", 0.92); a.download = `QUOTE_${currentQuoteId || Date.now()}.jpg`; document.body.appendChild(a); a.click(); a.remove();
      setStatusMsg("다운로드 완료"); setTimeout(() => setStatusMsg(""), 2000);
    } catch (e: any) { setStatusMsg("JPG 생성 실패"); alert("JPG 생성 실패: " + (e?.message || String(e))); }
  };

  const handlePrint = () => window.print();

  // NavBar
  const NavBar = ({ current }: { current: string }) => (
    <div style={{ padding: 12, borderBottom: "1px solid #eee", background: "#fff", position: "sticky", top: 0, zIndex: 100, display: "flex", gap: 8 }}>
      {['rt', 'list', 'contract', 'inventory', 'calendar'].map(v => (
        <button key={v} className="btn" onClick={() => setView(v as any)} style={current === v ? { background: '#2e5b86', color: '#fff' } : {}}>
          {v === 'rt' ? '실시간견적' : v === 'list' ? '전체견적' : v === 'contract' ? '계약견적' : v === 'inventory' ? '재고현황' : '출고일정'}
        </button>
      ))}
    </div>
  );

  // InlineDropdown
  const InlineDropdown = ({ show, items, onSelect, renderItem, style = {} }: { show: boolean; items: any[]; onSelect: (item: any) => void; renderItem: (item: any) => React.ReactNode; style?: React.CSSProperties }) => {
    if (!show || items.length === 0) return null;
    return (
      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #333', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 1000, maxHeight: 250, overflowY: 'auto', ...style }}>
        {items.map((item, idx) => (
          <div key={idx} onClick={() => onSelect(item)} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #eee', fontSize: 13 }} onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'} onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
            {renderItem(item)}
          </div>
        ))}
      </div>
    );
  };

  // ItemRow
  const ItemRow = ({ item, index }: { item: any; index: number }) => {
    const [localQuery, setLocalQuery] = useState(item.displayName || "");
    const [showDropdown, setShowDropdown] = useState(false);
    const rowRef = useRef<HTMLTableRowElement>(null);
    const filteredOpts = useMemo(() => getFilteredOptions(localQuery), [localQuery, options]);

    const handleSelectOption = (opt: any) => {
      const res = calculateOptionLine(opt, form.w, form.l, form.h);
      const rawName = String(opt.option_name || "");
      const rent = rawName.includes("임대");
      const baseQty = Number(res.qty || 1), baseUnitPrice = Number(res.unitPrice || 0), baseAmount = Number(res.amount || 0);
      const customerUnitPrice = rent ? baseUnitPrice : baseAmount;
      setSelectedItems(prev => prev.map(r => (r as any).key !== item.key ? r : recomputeRow({ ...r, optionId: opt.option_id, optionName: rawName, displayName: rawName, unit: rent ? "개월" : res.unit || "EA", baseQty, baseUnitPrice, baseAmount, customerUnitPrice, displayQty: 1, finalAmount: customerUnitPrice } as any)));
      setLocalQuery(rawName); setShowDropdown(false);
    };

    useEffect(() => {
      const handler = (e: MouseEvent) => { if (rowRef.current && !rowRef.current.contains(e.target as Node)) setShowDropdown(false); };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => { setLocalQuery(item.displayName || ""); }, [item.displayName]);

    const unitSupply = Number(item.customerUnitPrice ?? 0), qty = Number(item.displayQty ?? 0);
    const supply = unitSupply * qty, vat = Math.round(supply * 0.1);
    const showSpec = String(item.showSpec || "").toLowerCase() === "y";
    const specText = showSpec && item?.lineSpec?.w && item?.lineSpec?.l ? `${item.lineSpec.w}x${item.lineSpec.l}${item.lineSpec.h ? 'x' + item.lineSpec.h : ''}` : "";

    return (
      <tr ref={rowRef}>
        <td className="c center">{index + 1}</td>
        <td className="c" style={{ position: 'relative', padding: 0 }}>
          <div style={{ position: 'relative' }}>
            <input value={localQuery} onChange={e => { setLocalQuery(e.target.value); setShowDropdown(true); if (!e.target.value) updateRow(item.key, "displayName", ""); }} onFocus={() => localQuery && setShowDropdown(true)} onBlur={() => setTimeout(() => { if (localQuery !== item.displayName) updateRow(item.key, "displayName", localQuery); }, 200)} placeholder="품목 검색 (초성 가능)" style={{ width: '100%', border: 'none', padding: '6px 8px', fontSize: 12, background: 'transparent', outline: 'none', boxSizing: 'border-box' }} />
            <InlineDropdown show={showDropdown && filteredOpts.length > 0} items={filteredOpts} onSelect={handleSelectOption} renderItem={opt => (<div><div style={{ fontWeight: 600, color: '#c00' }}>{opt.option_name}</div><div style={{ fontSize: 11, color: '#666' }}>{fmt(opt.unit_price)}원</div></div>)} style={{ minWidth: 350 }} />
          </div>
        </td>
        <td className="c center">{specText}</td>
        <td className="c center"><input type="number" value={qty || ""} onChange={e => updateRow(item.key, "displayQty", e.target.value)} style={{ width: 50, textAlign: 'center', border: 'none', background: '#fffde7' }} /></td>
        <td className="c right"><input type="number" value={unitSupply || ""} onChange={e => updateRow(item.key, "customerUnitPrice", e.target.value)} style={{ width: 80, textAlign: 'right', border: 'none', background: '#fffde7' }} /></td>
        <td className="c right">{fmt(supply)}</td>
        <td className="c right">{fmt(vat)}</td>
        <td className="c center"><button onClick={() => deleteRow(item.key)} style={{ color: 'red', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 'bold' }}>✕</button></td>
      </tr>
    );
  };

  const MIN_ROWS = 10;
  const blanksCount = Math.max(0, MIN_ROWS - computedItems.length);

  // 경리나라 스타일 견적서
  const InlineQuoteSheet = () => (
    <div className="inline-quote-sheet" style={{ width: 900, margin: '0 auto', background: '#fff', border: '1px solid #ccc', padding: 20, fontFamily: 'Malgun Gothic, sans-serif' }}>
      <style>{inlineCss}</style>
      {/* 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 12 }}><span style={{ fontWeight: 700 }}>NO.</span> <input value={form.quoteTitle || `${form.quoteDate.replace(/-/g, '')}-D001`} onChange={e => setForm({ ...form, quoteTitle: e.target.value })} style={{ border: '1px solid #999', padding: '2px 6px', width: 150 }} /></div>
        <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: 8, margin: 0, textDecoration: 'underline' }}>견 적 서</h1>
        <div style={{ fontSize: 11, color: '#666' }}>PAGE: 1 / 1</div>
      </div>

      {/* 메인 정보 */}
      <div style={{ display: 'flex', gap: 0, border: '2px solid #333' }}>
        {/* 좌측 */}
        <div style={{ flex: 1, borderRight: '2px solid #333' }}>
          <table className="info-table"><tbody>
            <tr><th>거 래 처 명</th><td colSpan={3}><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="고객명 입력" style={{ width: '90%' }} /></td></tr>
            <tr><th>견 적 일 자</th><td><input type="date" value={form.quoteDate} onChange={e => setForm({ ...form, quoteDate: e.target.value })} style={{ width: '100%' }} /></td><th>규격(m)</th><td><div style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="number" value={form.w} onChange={e => setForm({ ...form, w: Number(e.target.value) })} style={{ width: 40, textAlign: 'center' }} />x<input type="number" value={form.l} onChange={e => setForm({ ...form, l: Number(e.target.value) })} style={{ width: 40, textAlign: 'center' }} />x<input type="number" step="0.1" value={form.h} onChange={e => setForm({ ...form, h: Number(e.target.value) })} style={{ width: 40, textAlign: 'center' }} /></div></td></tr>
            <tr><th>전 화 번 호</th><td><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="010-0000-0000" style={{ width: '90%' }} /></td><th>이메일</th><td><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" style={{ width: '100%' }} /></td></tr>
            <tr><th>현장/프로젝트</th><td colSpan={3} ref={siteRef} style={{ position: 'relative' }}><input value={form.siteQ} onChange={e => handleSiteSearch(e.target.value)} onFocus={() => form.siteQ && setShowSiteDropdown(true)} placeholder="현장 검색 (초성 가능)" style={{ width: '90%' }} /><InlineDropdown show={showSiteDropdown && sites.length > 0} items={sites} onSelect={s => { setForm(prev => ({ ...prev, sitePickedLabel: s.alias, siteQ: s.alias })); setShowSiteDropdown(false); setSites([]); }} renderItem={s => (<div><div style={{ fontWeight: 600 }}>{s.alias}</div><div style={{ fontSize: 11, color: '#666' }}>일반운송: {fmt(s.delivery)} / 크레인: {fmt(s.crane)}</div></div>)} /></td></tr>
            <tr><td colSpan={4} style={{ color: '#c00', fontWeight: 600, fontSize: 12, padding: '8px 10px' }}>견적요청에 감사드리며 아래와 같이 견적합니다.</td></tr>
          </tbody></table>
        </div>
        {/* 우측 */}
        <div style={{ width: 320 }}>
          <table className="info-table"><tbody>
            <tr><th rowSpan={5} style={{ width: 30, writingMode: 'vertical-rl', textAlign: 'center', background: '#f5f5f5' }}>공급자</th><th>등록번호</th><td>130-41-38154</td></tr>
            <tr><th>상 호</th><td style={{ position: 'relative' }} ref={bizcardRef as any}><div onClick={() => setShowBizcardDropdown(!showBizcardDropdown)} style={{ cursor: 'pointer', padding: '2px 0' }}>현대컨테이너 <span style={{ fontSize: 11, color: '#666' }}>({selectedBizcard?.name || '담당자'})</span> ▼</div><InlineDropdown show={showBizcardDropdown} items={bizcards} onSelect={b => { setSelectedBizcardId(b.id); setShowBizcardDropdown(false); }} renderItem={b => <span>{b.name}</span>} /></td></tr>
            <tr><th>주 소</th><td style={{ fontSize: 11 }}>경기도 화성시 향남읍 구문천안길16</td></tr>
            <tr><th>업 태</th><td>컨테이너 판매 임대</td></tr>
            <tr><th>전화번호</th><td>1688-1447</td></tr>
          </tbody></table>
        </div>
      </div>

      {/* 합계 */}
      <div style={{ background: '#fff', border: '2px solid #333', borderTop: 'none', padding: '10px 15px', fontSize: 15, fontWeight: 900, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>합 계 금 액 : 일금 ₩{fmt(form.vatIncluded ? total_amount : supply_amount)}</span>
        <select value={form.vatIncluded ? "included" : "excluded"} onChange={e => setForm({ ...form, vatIncluded: e.target.value === "included" })} style={{ padding: '4px 8px', fontSize: 12 }}><option value="excluded">부가세 별도</option><option value="included">부가세 포함</option></select>
      </div>

      {/* 품목 테이블 */}
      <table className="items-table" style={{ marginTop: 10 }}>
        <thead><tr><th style={{ width: '5%' }}>순번</th><th style={{ width: '35%' }}>품목</th><th style={{ width: '10%' }}>규격</th><th style={{ width: '8%' }}>수량</th><th style={{ width: '13%' }}>단가</th><th style={{ width: '13%' }}>공급가액</th><th style={{ width: '10%' }}>세액</th><th style={{ width: '6%' }}>비고</th></tr></thead>
        <tbody>
          {computedItems.map((item, idx) => <ItemRow key={(item as any).key} item={item} index={idx} />)}
          {Array.from({ length: blanksCount }).map((_, i) => <tr key={`blank-${i}`}><td className="c center">&nbsp;</td><td className="c"></td><td className="c"></td><td className="c"></td><td className="c"></td><td className="c"></td><td className="c"></td><td className="c"></td></tr>)}
        </tbody>
        <tfoot><tr className="sum-row"><td colSpan={5} style={{ textAlign: 'left', fontWeight: 900 }}>합계: {fmt(total_amount)}원</td><td style={{ textAlign: 'right', fontWeight: 900 }}>{fmt(supply_amount)}</td><td style={{ textAlign: 'right', fontWeight: 900 }}>{fmt(vat_amount)}</td><td></td></tr></tfoot>
      </table>

      {/* 버튼 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}><button className="btn" onClick={addEmptyRow}>+ 행 추가</button></div>

      {/* 하단 조건 */}
      <table className="info-table" style={{ marginTop: 10 }}><tbody>
        <tr><th style={{ width: 100 }}>결제조건</th><td>계약금 50%입금 후 도면제작 및 확인/착수, 선 완불 후 출고</td></tr>
        <tr><th>주의사항</th><td style={{ fontSize: 11, lineHeight: 1.6 }}>*견적서는 견적일로 부터 2주간 유효합니다.<br />1. 하차비 별도(당 지역 지게차 혹은 크레인 이용)<br />2. 주문 제작시 50% 입금 후 제작, 완불 후 출고 / 임대의 경우 계약금 없이 완불 후 출고<br />*출고 전날 오후 2시 이전 잔금 결제 조건*</td></tr>
      </tbody></table>
    </div>
  );

  // 실시간 견적 화면
  const rtScreen = (
    <>
      <NavBar current="rt" />
      <div style={{ padding: '12px 20px', background: '#f8f9fa', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={handleSaveNew}>신규 저장</button>
          <button className="btn" onClick={handleSaveUpdate} disabled={!currentQuoteId}>수정 저장</button>
          <button className="btn" onClick={handleSend} disabled={!!sendStatus}>{sendStatus || "견적서 보내기"}</button>
          <button className="btn" onClick={downloadJpg}>JPG저장</button>
          <button className="btn" onClick={handlePrint}>인쇄</button>
        </div>
        <div style={{ fontSize: 12, color: '#666' }}>
          <span style={{ marginRight: 10 }}>QUOTE: {currentQuoteId || "-"}</span>
          <span>VERSION: {currentVersion ? `v${currentVersion}` : "-"}</span>
          {statusMsg && <span style={{ marginLeft: 10, color: '#2e5b86' }}>{statusMsg}</span>}
        </div>
      </div>
      <div style={{ padding: 20, background: '#e8e8e8', minHeight: 'calc(100vh - 120px)' }}><InlineQuoteSheet /></div>
    </>
  );

  if (view === "list") return <div style={{ minHeight: "100vh" }}><NavBar current="list" /><QuoteListPage onGoLive={() => setView("rt")} onConfirmContract={() => setView("contract")} /></div>;
  if (view === "contract") return <div style={{ minHeight: "100vh" }}><NavBar current="contract" /><ContractListPage onBack={() => setView("list")} /></div>;
  if (view === "calendar") return <div style={{ minHeight: "100vh" }}><NavBar current="calendar" /><DeliveryCalendarPage onBack={() => setView("contract")} /></div>;
  if (view === "inventory") return <div style={{ minHeight: "100vh" }}><NavBar current="inventory" /><InventoryPage onBack={() => setView("contract")} /></div>;
  return rtScreen;
}

const inlineCss = `
  .info-table { width: 100%; border-collapse: collapse; }
  .info-table th, .info-table td { border: 1px solid #333; padding: 6px 10px; font-size: 12px; vertical-align: middle; }
  .info-table th { background: #f5f5f5; font-weight: 700; text-align: center; white-space: nowrap; }
  .info-table input { border: none; background: transparent; outline: none; font-size: 12px; padding: 2px; }
  .info-table input:focus { background: #fffde7; }
  .items-table { width: 100%; border-collapse: collapse; border: 2px solid #333; }
  .items-table th { background: #e6e6e6; border: 1px solid #333; padding: 8px; font-size: 12px; font-weight: 900; text-align: center; }
  .items-table td { border: 1px solid #333; padding: 4px 8px; font-size: 12px; vertical-align: middle; }
  .items-table td.c { background: #fff; }
  .items-table td input { border: none; background: transparent; outline: none; font-size: 12px; }
  .items-table td input:focus { background: #fffde7; }
  .items-table .sum-row td { background: #e6e6e6; padding: 8px; }
  .center { text-align: center; }
  .right { text-align: right; }
  @media print { .btn, button { display: none !important; } body { margin: 0; padding: 0; } }
`;
