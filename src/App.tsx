// src/App.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import QuoteListPage from "./pages/QuoteListPage";
import ContractListPage from "./pages/ContractListPage";
import DeliveryCalendarPage from "./pages/DeliveryCalendarPage";
import html2canvas from "html2canvas";
import TodayTasksPage from "./pages/TodayTasksPage";



// dnd-kit 주석처리
// import {
//   DndContext,
//   closestCenter,
//   PointerSensor,
//   useSensor,
//   useSensors,
//   DragEndEvent,
// } from '@dnd-kit/core';
// import {
//   arrayMove,
//   SortableContext,
//   useSortable,
//   verticalListSortingStrategy,
// } from '@dnd-kit/sortable';
// import { CSS } from '@dnd-kit/utilities';

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
import InventoryPage from "./pages/InventoryPage";


// ✅ 초성 검색 유틸리티
const CHOSUNG_LIST = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

const getChosung = (str: string): string => {
  return str.split('').map(char => {
    const code = char.charCodeAt(0) - 44032;
    if (code < 0 || code > 11171) return char;
    return CHOSUNG_LIST[Math.floor(code / 588)];
  }).join('');
};

const isChosung = (str: string): boolean => {
  return str.split('').every(char => CHOSUNG_LIST.includes(char));
};

const matchKoreanLocal = (target: string, query: string): boolean => {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  
  // 초성만 입력된 경우: 초성 매칭
  if (isChosung(q)) {
    const targetChosung = getChosung(t);
    return targetChosung.includes(q);
  }
  
  // 일반 단어: 포함 여부 확인
  return t.includes(q);
};

// ✅ GAS WebApp URL
export const getWebAppUrl = () => {
  return "https://script.google.com/macros/s/AKfycbyTGGQnxlfFpqP5zS0kf7m9kzSK29MGZbeW8GUMlAja04mRJHRszuRdpraPdmOWxNNr/exec";
};

// ============ 인라인 숫자 편집 셀 ============
function EditableNumberCell({ value, onChange, disabled = false }: { value: number; onChange: (val: number) => void; disabled?: boolean }) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(String(value));
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { if (isEditing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); } }, [isEditing]);
  React.useEffect(() => { setTempValue(String(value)); }, [value]);

  const handleBlur = () => { setIsEditing(false); onChange(Number(tempValue) || 0); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter") handleBlur(); else if (e.key === "Escape") { setTempValue(String(value)); setIsEditing(false); } };

  const fmtNum = (n: number) => (Number(n) || 0).toLocaleString("ko-KR");
  if (disabled) return <span>{fmtNum(value)}</span>;
 if (isEditing) return <input ref={inputRef} type="number" value={tempValue} onChange={(e) => setTempValue(e.target.value)} onBlur={handleBlur} onKeyDown={handleKeyDown} style={{ width: "100%", padding: "2px 4px", textAlign: "right", border: "1px solid #ccc", fontSize: 12, boxSizing: "border-box", outline: "none" }} />;
 return <span onClick={() => { setTempValue(String(value)); setIsEditing(true); }} style={{ cursor: "pointer", padding: 0, display: "block", textAlign: "right", width: "100%" }} title="클릭하여 수정">{fmtNum(value)}</span>; }


// ============ 인라인 규격 편집 셀 ============
// ============ 인라인 규격 편집 셀 ============
// ============ 인라인 규격 편집 셀 ============
function EditableSpecCell({ 
  spec, 
  specText,
  onChange,
  onTextChange
}: { 
  spec: { w: number; l: number; h?: number }; 
  specText?: string;
  onChange: (spec: { w: number; l: number; h?: number }) => void;
  onTextChange?: (text: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  
  // specText가 있으면 그대로 표시, 아니면 spec 객체로 표시
  const displayText = specText !== undefined && specText !== '' 
    ? specText 
    : (spec.w || spec.l || spec.h) 
      ? `${spec.w}×${spec.l}×${spec.h || 0}` 
      : '';
  
  const [tempValue, setTempValue] = useState(displayText);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { 
    if (isEditing && inputRef.current) { 
      inputRef.current.focus(); 
      inputRef.current.select(); 
    } 
  }, [isEditing]);
  
  React.useEffect(() => { 
    setTempValue(displayText); 
  }, [displayText]);

  const handleBlur = () => { 
    setIsEditing(false); 
    
    const trimmed = tempValue.trim();
    
    // 빈 값
    if (!trimmed) {
      if (onTextChange) onTextChange('');
      onChange({ w: 0, l: 0, h: 0 });
      return;
    }
    
    // "3×6×2.6" 또는 "3x6x2.6" 형식인지 확인
    const normalized = trimmed.replace(/x/gi, '×');
    const parts = normalized.split('×').map(s => parseFloat(s.trim()));
    
    // 유효한 숫자 형식이면 spec 객체로 저장
    if (parts.length >= 2 && parts.every(p => !isNaN(p))) {
      onChange({
        w: parts[0] || 0,
        l: parts[1] || 0,
        h: parts[2] || 0
      });
      if (onTextChange) onTextChange('');
    } else {
      // 자유 텍스트로 저장
      if (onTextChange) onTextChange(trimmed);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => { 
    if (e.key === "Enter") handleBlur(); 
    else if (e.key === "Escape") { 
      setTempValue(displayText); 
      setIsEditing(false); 
    } 
  };

  if (isEditing) {
    return (
      <input 
        ref={inputRef} 
        type="text" 
        value={tempValue} 
        onChange={(e) => setTempValue(e.target.value)} 
        onBlur={handleBlur} 
        onKeyDown={handleKeyDown} 
        placeholder="규격 입력"
        style={{ 
    width: "100%", 
    padding: "2px 4px", 
    textAlign: "center",
    border: "none",  // ✅ 테두리 제거
    fontSize: 12, 
    boxSizing: "border-box", 
    outline: "none",
    background: "transparent"
        }} 
      />
    );
  }
  
  return (
    <span 
      onClick={() => { 
        setTempValue(displayText); 
        setIsEditing(true); 
      }} 
      style={{ cursor: "pointer", display: "block", textAlign: "center", width: "100%" }} 
      title="클릭하여 규격 수정"
    >
      {displayText || <span style={{ color: '#ccc' }}>-</span>}
    </span>
  );
}

// ============ 인라인 품목 편집 셀 ============
function InlineItemCell({ item, options, form, onSelectOption, rowIndex, onFocus }: { item: any; options: any[]; form: { w: number; l: number; h: number }; onSelectOption: (item: any, opt: any, calculated: any) => void; rowIndex?: number; onFocus?: (index: number) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const displayText = item.displayName || "";
  
  // ✅ item이 바뀌면 무조건 편집 모드 종료
  const prevKeyRef = React.useRef(item.key);
  React.useEffect(() => {
    if (prevKeyRef.current !== item.key) {
      setIsEditing(false);
      setShowDropdown(false);
      setSearchQuery("");
      prevKeyRef.current = item.key;
    }
  }, [item.key]);

  // ✅ 마운트 시에도 편집 모드 아님을 보장
  React.useEffect(() => {
    setIsEditing(false);
    setShowDropdown(false);
    setSearchQuery("");
  }, []);
  
  const searchQueryRef = React.useRef(searchQuery);
  React.useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  React.useEffect(() => { 
    if (isEditing && inputRef.current) { 
      inputRef.current.focus(); 
      inputRef.current.select(); 
    } 
  }, [isEditing]);

  const filteredOptions = React.useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];
    return options.filter((o: any) => matchKoreanLocal(String(o.option_name || ""), q)).slice(0, 15);
  }, [searchQuery, options]);

  const commitFreeText = useCallback(() => {
    const trimmed = (searchQueryRef.current || "").trim();
    
    setIsEditing(false);
    setShowDropdown(false);
    setSearchQuery("");
    
    if (trimmed) {
      const customOpt = { 
        option_id: `custom_${Date.now()}`, 
        option_name: trimmed,
        unit: 'EA',
        unit_price: 0,
        show_spec: 'n',
        _isDisplayNameOnly: true
      };
      const calculated = calculateOptionLine(customOpt, form.w, form.l, form.h);
      onSelectOption(item, customOpt, calculated);
    }
  }, [item, form, onSelectOption]);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) && inputRef.current && !inputRef.current.contains(e.target as Node)) {
        commitFreeText();
      }
    };
    if (isEditing) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isEditing, commitFreeText]);

  const handleSelect = (opt: any) => {
    setIsEditing(false);
    setShowDropdown(false);
    setSearchQuery("");
    
    const calculated = calculateOptionLine(opt, form.w, form.l, form.h);
    onSelectOption(item, opt, calculated);
  };

  const fmtNum = (n: number) => (Number(n) || 0).toLocaleString("ko-KR");

  // ✅ 편집 모드가 아니면 텍스트만 표시 (이 조건을 먼저!)
 // ✅ 편집 모드가 아니면 텍스트만 표시
if (!isEditing) {
  return (
    <td 
      className="c wrap" 
      onClick={() => { 
        if (onFocus && rowIndex !== undefined) onFocus(rowIndex);
        setSearchQuery('');  // ✅ 빈 문자열로 시작
        setIsEditing(true); 
      }}
      style={{ cursor: "pointer" }} 
      title="클릭하여 품목 변경"
    >
      {displayText || <span style={{ color: '#ccc' }}>품목 선택</span>}
    </td>
  );
}

  return (
    <td className="c wrap" style={{ position: "relative", padding: "4px 8px", overflow: "visible" }}>
      <input 
        ref={inputRef} 
        type="text" 
        value={searchQuery} 
        onChange={(e) => { setSearchQuery(e.target.value); setShowDropdown(true); }} 
        onFocus={() => setShowDropdown(true)} 
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            commitFreeText();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setIsEditing(false);
            setShowDropdown(false);
            setSearchQuery("");
          }
        }}
        placeholder="품목 검색"  
        style={{ 
    width: "100%", 
    padding: "2px 4px", 
    textAlign: "center",
    border: "none",  // ✅ 테두리 제거
    fontSize: 12, 
    boxSizing: "border-box", 
    outline: "none",
    background: "transparent" 
        }} 
      />
      {showDropdown && searchQuery.trim() && (
        <div ref={dropdownRef} style={{ 
          position: "absolute", 
          top: "100%", 
          left: 0, 
          width: "300px",
          maxHeight: 300, 
          overflowY: "auto", 
          background: "#fff", 
          border: "1px solid #ccc", 
          borderRadius: 6,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)", 
          zIndex: 9999 
        }}>
          {filteredOptions.length > 0 ? filteredOptions.map((opt: any) => (
            <div key={opt.option_id} onClick={() => handleSelect(opt)} style={{ padding: "8px 10px", cursor: "pointer", borderBottom: "1px solid #eee", fontSize: 12 }} onMouseEnter={(e) => (e.currentTarget.style.background = "#e3f2fd")} onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}>
              <div style={{ fontWeight: 700 }}>{opt.option_name}</div>
              <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>{opt.unit || "EA"} · {fmtNum(Number(opt.unit_price || 0))}원</div>
            </div>
          )) : <div style={{ padding: "10px", color: "#999", fontSize: 12 }}>검색 결과 없음 (Enter로 자유입력)</div>}
        </div>
      )}
    </td>
  );
}
// ============ 빈 행 클릭 시 품목 추가 ============
// ============ 빈 행 클릭 시 품목 추가 + 현장 검색 ============
function EmptyRowCell({ options, form, onAddItem, onSiteSearch, onAddDelivery, insertIndex, onFocus }: { options: any[]; form: { w: number; l: number; h: number }; onAddItem: (opt: any, calculated: any, insertIndex?: number) => void; onSiteSearch?: (query: string) => Promise<any[]>; onAddDelivery?: (site: any, type: 'delivery' | 'crane', insertIndex?: number) => void; insertIndex?: number; onFocus?: (index: number) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [sites, setSites] = useState<any[]>([]);
  const [isSearchingSite, setIsSearchingSite] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const searchQueryRef = useRef(searchQuery);
  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

const commitFreeText = useCallback(() => {
  console.log("🔴 commitFreeText 호출됨");
  const trimmed = (searchQueryRef.current || "").trim();
  
  console.log("🔴 setIsEditing(false) 실행");
  setIsEditing(false);
  setShowDropdown(false);
  setSearchQuery("");
  setSites([]);
  
  if (trimmed) {
    console.log("🔴 onAddItem 호출:", trimmed);
    const customOpt = { 
      option_id: `custom_${Date.now()}`, 
      option_name: trimmed,
      unit: 'EA',
      unit_price: 0,
      show_spec: 'n'
    };
    onAddItem(customOpt, { qty: 1, unitPrice: 0, amount: 0, unit: 'EA' }, insertIndex);
  }
}, [onAddItem]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return options.filter((o: any) => {
      const name = String(o.option_name || "").toLowerCase();
      return name.includes(q) || matchKoreanLocal(name, q);
    }).slice(0, 10);
  }, [searchQuery, options]);

  useEffect(() => {
    const searchSites = async () => {
      if (!searchQuery.trim() || !onSiteSearch) {
        setSites([]);
        return;
      }
      setIsSearchingSite(true);
      try {
        const results = await onSiteSearch(searchQuery.trim());
        setSites(results.slice(0, 5));
      } catch (e) {
        setSites([]);
      }
      setIsSearchingSite(false);
    };
    const timer = setTimeout(searchSites, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, onSiteSearch]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        commitFreeText();
      }
    };
    if (isEditing) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isEditing, commitFreeText]);

  const handleSelect = (opt: any) => {
    setIsEditing(false);
    setShowDropdown(false);
    setSearchQuery("");
    setSites([]);
    
    const calculated = calculateOptionLine(opt, form.w, form.l, form.h);
   onAddItem(opt, calculated, insertIndex);
  };

  const handleDeliverySelect = (site: any, type: 'delivery' | 'crane') => {
    const regions = String(site.alias || "").split(',').map((r: string) => r.trim());
    const query = searchQuery.toLowerCase();
    const matchedRegion = regions.find((r: string) => r.toLowerCase().includes(query)) || regions[0];
    
    setIsEditing(false);
    setShowDropdown(false);
    setSearchQuery("");
    setSites([]);
    
    if (onAddDelivery) {
      onAddDelivery({ ...site, alias: matchedRegion }, type, insertIndex);
    }
  };

  const fmtNum = (n: number) => (Number(n) || 0).toLocaleString("ko-KR");

 if (!isEditing) {
  return (
    <>
      <td className="c center">&nbsp;</td>
      <td 
        className="c" 
        onClick={() => setIsEditing(true)}
        style={{ cursor: 'pointer' }}
      ></td>
      <td className="c"></td>
      <td className="c"></td>
      <td className="c"></td>
      <td className="c"></td>
      <td className="c"></td>
      <td className="c"></td>
    </>
  );
}

  return (
    <>
      <td className="c center">&nbsp;</td>
      <td className="c" style={{ position: "relative", overflow: "visible", padding: 0 }}>
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              commitFreeText();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setIsEditing(false);
              setShowDropdown(false);
              setSearchQuery("");
              setSites([]);
            }
          }}
          placeholder="검색..."
          style={{ 
            width: "100%", 
            height: "100%",
            padding: "6px 8px",
            margin: 0,
            border: "none", 
            fontSize: 11, 
            outline: "none", 
            background: "transparent",
            boxSizing: "border-box",
          }}
        />
        {showDropdown && searchQuery.trim() && (
          <div 
            ref={dropdownRef} 
            style={{ 
              position: "absolute", 
              top: "100%", 
              left: 0, 
              width: "320px",
              maxHeight: 350, 
              overflowY: "auto", 
              background: "#fff", 
              border: "1px solid #ccc", 
              borderRadius: 6,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)", 
              zIndex: 9999 
            }}
          >
            {sites.length > 0 && (
              <>
                <div style={{ padding: "6px 10px", background: "#f5f5f5", fontSize: 11, fontWeight: 700, color: "#666" }}>운송비</div>
                {sites.map((site: any, idx: number) => (
                  <div key={`site-${idx}`} style={{ padding: "8px 10px", borderBottom: "1px solid #eee" }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>{site.alias}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => handleDeliverySelect(site, 'delivery')} style={{ flex: 1, padding: "6px 8px", background: "#e3f2fd", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>일반 {fmtNum(site.delivery)}원</button>
                      <button onClick={() => handleDeliverySelect(site, 'crane')} style={{ flex: 1, padding: "6px 8px", background: "#fff3e0", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>크레인 {fmtNum(site.crane)}원</button>
                    </div>
                  </div>
                ))}
              </>
            )}
            
            {filteredOptions.length > 0 && (
              <>
                <div style={{ padding: "6px 10px", background: "#f5f5f5", fontSize: 11, fontWeight: 700, color: "#666" }}>품목</div>
                {filteredOptions.map((opt: any) => {
                  const isRent = String(opt.option_name || "").includes("임대");
                  
                  if (isRent) {
                    return (
                      <div key={opt.option_id} style={{ padding: "8px 10px", borderBottom: "1px solid #eee" }}>
                        <div style={{ fontWeight: 700 }}>{opt.option_name}</div>
                        <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>{opt.unit || "EA"} · {fmtNum(Number(opt.unit_price || 0))}원</div>
                        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
                          <input
                            type="number"
                            defaultValue={1}
                            min={1}
                            id={`rent-empty-${opt.option_id}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{ width: 40, padding: "4px", border: "1px solid #ccc", borderRadius: 4, textAlign: "center", fontSize: 11 }}
                          />
                          <span style={{ fontSize: 11 }}>개월</span>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              const input = document.getElementById(`rent-empty-${opt.option_id}`) as HTMLInputElement;
                              const months = Number(input?.value) || 1;
                              
                              setIsEditing(false);
                              setShowDropdown(false);
                              setSearchQuery("");
                              setSites([]);
                              
                              const calculated = calculateOptionLine(opt, form.w, form.l, form.h);
                              onAddItem({ ...opt, _months: months }, calculated);
                            }}
                            style={{ padding: "4px 8px", background: "#e3f2fd", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 700 }}
                          >
                            추가
                          </button>
                        </div>
                      </div>
                    );
                  }
                  
                  return (
                    <div
                      key={opt.option_id}
                      onClick={() => handleSelect(opt)}
                      style={{ padding: "8px 10px", cursor: "pointer", borderBottom: "1px solid #eee", fontSize: 12 }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#e3f2fd")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                    >
                      <div style={{ fontWeight: 700 }}>{opt.option_name}</div>
                      <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>{opt.unit || "EA"} · {fmtNum(Number(opt.unit_price || 0))}원</div>
                    </div>
                  );
                })}
              </>
            )}
            
            {filteredOptions.length === 0 && sites.length === 0 && !isSearchingSite && (
              <div style={{ padding: "10px", color: "#999", fontSize: 12 }}>검색 결과 없음 (Enter로 자유입력)</div>
            )}
            {isSearchingSite && <div style={{ padding: "10px", color: "#999", fontSize: 12 }}>검색 중...</div>}
          </div>
        )}
      </td>
      <td className="c"></td>
      <td className="c"></td>
      <td className="c"></td>
      <td className="c"></td>
      <td className="c"></td>
      <td className="c"></td>
    </>
  );
}
// GAS 호출 래퍼
async function gasCall<T = any>(fn: string, args: any[] = []): Promise<T> {
  const res = await gasRpcRaw(fn, args);
  if (res && typeof res === "object" && "error" in res) throw new Error(String(res.error));
  return res as T;
}

type Bizcard = { id: string; name: string; image_url: string };

export default function App() {
  const [options, setOptions] = useState<SupabaseOptionRow[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [selectedItems, setSelectedItems] = useState<SelectedRow[]>([]);

 const [view, setView] = useState<"rt" | "list" | "contract" | "calendar" | "inventory" | "tasks">(() => {
  const params = new URLSearchParams(window.location.search);
  const v = params.get('view');
  if (v === 'list') return 'list';
  if (v === 'contract') return 'contract';
  if (v === 'calendar') return 'calendar';
  if (v === 'inventory') return 'inventory';
  if (v === 'tasks') return 'tasks';  // ✅ 추가
  return 'rt';
});


// ✅ 이 useEffect 추가
useEffect(() => {
  const url = new URL(window.location.href);
  if (view === 'rt') {
    url.searchParams.delete('view');
  } else {
    url.searchParams.set('view', view);
  }
  window.history.replaceState({}, '', url.toString());
}, [view]);
  
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
    const [focusedRowIndex, setFocusedRowIndex] = useState<number>(-1);

  // 모바일 전체화면 미리보기
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const isMobileDevice = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // ✅ 모바일 스케일 - 화면에 꽉 차게
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
    return matchKoreanLocal(name, q);
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

  
const addOption = (opt: any, isSpecial = false, price = 0, label = "", monthsParam?: number, insertIndex?: number) => {
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
          lineSpec: { w: form.w, l: form.l, h: form.h },
        };
      });

      // ✅ 수정: insertIndex 위치에 삽입
      setSelectedItems((prev: any) => {
        const mapped = newRows.map(recomputeRow);
        if (insertIndex !== undefined && insertIndex >= 0 && insertIndex < prev.length) {
          const newArr = [...prev];
          newArr.splice(insertIndex + 1, 0, ...mapped);
          return newArr;
        }
        return [...prev, ...mapped];
      });
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
const defaultMonths = rent ? (monthsParam || opt._months || 1) : 1;
const displayQty = 1;
const customerUnitPrice = rent ? baseUnitPrice * defaultMonths : baseAmount;

let simplifiedLabel = label;
if (label && form.siteQ) {
  const regions = label.split(',').map((r: string) => r.trim());
  const searchQuery = form.siteQ.toLowerCase();
  const matched = regions.find((r: string) => r.toLowerCase().includes(searchQuery));
  simplifiedLabel = matched || regions[0];
}

// ✅ 수정: _isEmptyRow면 빈 문자열
const displayName = opt._isEmptyRow
  ? ''
  : isSpecial
  ? `${rawName}-${simplifiedLabel}`.replace(/-+$/, "")
  : rent
  ? `${rawName} ${defaultMonths}개월`
  : rawName;

const showSpec = isSpecial ? "y" : String(opt.show_spec || "").toLowerCase();

// ✅ 수정: _isEmptyRow면 optionName도 빈 문자열
const row: any = {
  key: `${String(opt.option_id || rawName)}_${Date.now()}`,
  optionId: String(opt.option_id || rawName),
  optionName: opt._isEmptyRow ? '' : rawName,  // ✅ 여기도 수정
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
  lineSpec: showSpec === 'n' ? { w: 0, l: 0, h: 0 } : { w: form.w, l: form.l, h: form.h },
};
    
    // ✅ 수정: insertIndex 위치에 삽입
    setSelectedItems((prev: any) => {
      const newRow = recomputeRow(row);
      if (insertIndex !== undefined && insertIndex >= 0 && insertIndex < prev.length) {
        const newArr = [...prev];
        newArr.splice(insertIndex + 1, 0, newRow);
        return newArr;
      }
      return [...prev, newRow];
    });
    setForm((prev) => ({ ...prev, optQ: "", siteQ: prev.sitePickedLabel || prev.siteQ }));
    setSites([]);
  };

   

  //const sensors = useSensors(
   // useSensor(PointerSensor, {
   //   activationConstraint: {
      //  distance: 8,
    //  },
  //  })
//  );

//const handleDragEnd = (event: DragEndEvent) => {
  //  const { active, over } = event;
  //  if (over && active.id !== over.id) {
   //   setSelectedItems((items) => {
     //   const oldIndex = items.findIndex((i: any) => i.key === active.id);
     //   const newIndex = items.findIndex((i: any) => i.key === over.id);
     //   return arrayMove(items, oldIndex, newIndex);
  //    });
//    }
//  };

  const deleteRow = (key: string) =>
    setSelectedItems((prev: any) => prev.filter((i: any) => i.key !== key));

 const updateRow = (
  key: string,
  field: "displayName" | "displayQty" | "customerUnitPrice" | "months" | "lineSpec" | "specText",
  value: any
) => {
  setSelectedItems((prev: any) =>
    prev.map((item: any) => {
      if (item.key !== key) return item;

      const rent = isRentRow(item);

      if (field === "displayName") {
        return { ...item, displayName: String(value ?? "") };
      }

      if (field === "lineSpec") {
        return { ...item, lineSpec: value, specText: '' };
      }

      if (field === "specText") {
        return { ...item, specText: String(value ?? "") };
      }

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
    return matchKoreanLocal(alias, val);
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
  specText: r.specText ?? "",  // ✅ 자유입력 규격 저장
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

  // ✅ 캡처 → PDF → 메일 전송
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

// ✅ select를 선택된 텍스트로 교체
const clonedSelects = clonedSheet.querySelectorAll('select');
const originalSelects = originalSheet.querySelectorAll('select');
clonedSelects.forEach((select, idx) => {
  const origSelect = originalSelects[idx] as HTMLSelectElement;
  const selectedText = origSelect.options[origSelect.selectedIndex]?.text || '';
  const span = document.createElement('span');
  span.textContent = selectedText;
  span.style.cssText = 'font-size: 13px;';
  select.parentNode?.replaceChild(span, select);
});

const deleteButtons = clonedSheet.querySelectorAll('button');
deleteButtons.forEach(btn => {
  if (btn.textContent === '✕' || btn.style.color === 'rgb(229, 57, 53)') {
    btn.style.display = 'none';
  }
});

// 검색 input 숨기기
const inputs = clonedSheet.querySelectorAll('.a4Items input');
inputs.forEach(input => {
  (input as HTMLElement).style.display = 'none';
});

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

// ✅ select를 선택된 텍스트로 교체
const clonedSelects = clonedSheet.querySelectorAll('select');
const originalSelects = originalSheet.querySelectorAll('select');
clonedSelects.forEach((select, idx) => {
  const origSelect = originalSelects[idx] as HTMLSelectElement;
  const selectedText = origSelect.options[origSelect.selectedIndex]?.text || '';
  const span = document.createElement('span');
  span.textContent = selectedText;
  span.style.cssText = 'font-size: 13px;';
  select.parentNode?.replaceChild(span, select);
});

// X 버튼 숨기기

// X 버튼 숨기기
// X 버튼 숨기기
const deleteButtons = clonedSheet.querySelectorAll('button');
deleteButtons.forEach(btn => {
  if (btn.textContent === '✕' || btn.style.color === 'rgb(229, 57, 53)') {
    btn.style.display = 'none';
  }
});

// 검색 input 숨기기
const inputs = clonedSheet.querySelectorAll('.a4Items input');
inputs.forEach(input => {
  (input as HTMLElement).style.display = 'none';
});
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

  // ✅ 네비게이션 바 컴포넌트
const NavBar = ({ current }: { current: string }) => (
  <div style={{ padding: 12, borderBottom: "1px solid #eee", background: "#fff", position: "sticky", top: 0, zIndex: 10, display: "flex", gap: 8 }}>
    <button
      className="btn"
      onClick={() => setView("rt")}
      style={current === 'rt' ? { background: '#2e5b86', color: '#fff' } : {}}
    >
      {current !== 'rt' ? '← ' : ''}실시간견적
    </button>
    <button
      className="btn"
      onClick={() => setView("list")}
      style={current === 'list' ? { background: '#2e5b86', color: '#fff' } : {}}
    >
      전체견적
    </button>
    <button
      className="btn"
      onClick={() => setView("contract")}
      style={current === 'contract' ? { background: '#2e5b86', color: '#fff' } : {}}
    >
      계약견적
    </button>
    <button
      className="btn"
      onClick={() => setView("inventory")}
      style={current === 'inventory' ? { background: '#2e5b86', color: '#fff' } : {}}
    >
      재고현황
    </button>
    <button
      className="btn"
      onClick={() => setView("calendar")}
      style={current === 'calendar' ? { background: '#2e5b86', color: '#fff' } : {}}
    >
      출고일정
    </button>
    {/* ✅ 오늘할일 버튼 추가 */}
    <button
      className="btn"
      onClick={() => setView("tasks")}
      style={current === 'tasks' ? { background: '#e53935', color: '#fff' } : { background: '#ffebee', color: '#c62828' }}
    >
      📋 오늘할일
    </button>
  </div>
);

  // ✅ 전체견적 화면
  const listScreen = (
    <div style={{ minHeight: "100vh" }}>
      <NavBar current="list" />
      <QuoteListPage
        onGoLive={() => setView("rt")}
        onConfirmContract={() => setView("contract")}
      />
    </div>
  );

  // ✅ 계약견적 화면
  const contractScreen = (
    <div style={{ minHeight: "100vh" }}>
      <NavBar current="contract" />
      <ContractListPage onBack={() => setView("list")} />
    </div>
  );

  // ✅ 출고일정 화면
  const calendarScreen = (
    <div style={{ minHeight: "100vh" }}>
      <NavBar current="calendar" />
      <DeliveryCalendarPage onBack={() => setView("contract")} />
    </div>
  );

const tasksScreen = (
  <div style={{ minHeight: "100vh" }}>
    <NavBar current="tasks" />
    <TodayTasksPage />
  </div>
);


const inventoryScreen = (
  <div style={{ minHeight: "100vh" }}>
    <NavBar current="inventory" />
    <InventoryPage onBack={() => setView("contract")} />
  </div>
);

  
  const rtScreen = (
  <>
    <NavBar current="rt" />
    
    {isMobileDevice ? (
      // ========== 모바일: 기존 레이아웃 유지 ==========
      <div className="wrap">
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p className="title">상담 입력</p>
              <div className="mini">※ 우측은 A4 양식 미리보기</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="quoteBadge">QUOTE: {currentQuoteId || "-"}</div>
              <div className="muted" style={{ marginTop: 4 }}>VERSION: {currentVersion ? `v${currentVersion}` : "-"}</div>
            </div>
          </div>
          <hr />
          <div className="row"><label>견적제목</label><input value={form.quoteTitle} onChange={(e) => setForm({ ...form, quoteTitle: e.target.value })} placeholder="예: 강릉 3x6" /></div>
          <div className="row"><label>견적일</label><input type="date" value={form.quoteDate} onChange={(e) => setForm({ ...form, quoteDate: e.target.value })} /></div>
          <div className="row"><label>부가세</label><select value={form.vatIncluded ? "included" : "excluded"} onChange={(e) => setForm({ ...form, vatIncluded: e.target.value === "included" })}><option value="included">부가세 포함</option><option value="excluded">부가세 별도</option></select></div>
          <div className="row"><label>고객명</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="row"><label>이메일</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="row"><label>전화번호</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="row"><label>명함</label><select value={selectedBizcardId} onChange={(e) => setSelectedBizcardId(e.target.value)}>{bizcards.length === 0 && <option value="">(명함 없음)</option>}{bizcards.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}</select></div>
          <div className="row" style={{ alignItems: "center" }}>
            <label>규격(m)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>가로:</span><input type="number" value={form.w} onChange={(e) => setForm({ ...form, w: Number(e.target.value) })} style={{ width: 60 }} />
              <span>세로:</span><input type="number" value={form.l} onChange={(e) => setForm({ ...form, l: Number(e.target.value) })} style={{ width: 60 }} />
              <span>높이:</span><input type="number" step="0.1" value={form.h} onChange={(e) => setForm({ ...form, h: Number(e.target.value) })} style={{ width: 60 }} />
            </div>
          </div>
          <hr />
          <div className="row"><label>옵션 검색</label><input value={form.optQ} onChange={(e) => setForm({ ...form, optQ: e.target.value })} placeholder="예: 모노륨, 단열..." /></div>
        {String(form.optQ || "").trim() !== "" && (
  <div className="box">
    {filteredOptions.length > 0 ? filteredOptions.map((o: any) => {
      const isRent = String(o.option_name || "").includes("임대");
      
      if (isRent) {
        return (
          <div key={o.option_id} className="result-item" style={{ cursor: "default" }}>
            <div style={{ fontWeight: 800 }}>{o.option_name}</div>
            <div className="muted">{o.unit || "EA"} · {fmt(Number(o.unit_price || 0))}원</div>
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="number"
                defaultValue={1}
                min={1}
                id={`rent-months-${o.option_id}`}
                onClick={(e) => e.stopPropagation()}
                style={{ width: 50, padding: "4px 6px", border: "1px solid #ccc", borderRadius: 4, textAlign: "center" }}
              />
              <span>개월</span>
              <button 
                className="btn" 
                onClick={(e) => {
                  e.stopPropagation();
                  const input = document.getElementById(`rent-months-${o.option_id}`) as HTMLInputElement;
                  const months = Number(input?.value) || 1;
                  addOption(o, false, 0, "", months);
                }}
                style={{ marginLeft: 4 }}
              >
                추가
              </button>
            </div>
          </div>
        );
      }
      
      return (
        <div key={o.option_id} className="result-item" onClick={() => addOption(o)}>
          <div style={{ fontWeight: 800 }}>{o.option_name}</div>
          <div className="muted">{o.unit || "EA"} · {fmt(Number(o.unit_price || 0))}원</div>
        </div>
      );
    }) : <div className="result-item" style={{ color: "#999" }}>검색 결과 없음</div>}
  </div>
)}
          <hr />
          <div className="row"><label>현장지역</label><input value={form.siteQ} onChange={(e) => handleSiteSearch(e.target.value)} placeholder="운송비 검색" /></div>
          {sites.length > 0 && (
            <div className="box">
              {sites.map((s: any, i: number) => (
                <div key={i} className="result-item" style={{ cursor: "default" }}>
                  <div style={{ fontWeight: 900 }}>{s.alias}</div>
                  <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                    <button className="btn" onClick={() => { setForm((p) => ({ ...p, sitePickedLabel: s.alias, siteQ: s.alias })); addOption({ option_id: "DELIVERY", option_name: "5톤 일반트럭 운송비(하차별도)", show_spec: "y" }, true, s.delivery, s.alias); }}>일반 {fmt(s.delivery)}</button>
                    <button className="btn" onClick={() => { setForm((p) => ({ ...p, sitePickedLabel: s.alias, siteQ: s.alias })); addOption({ option_id: "CRANE", option_name: "크레인 운송비", show_spec: "y" }, true, s.crane, s.alias); }}>크레인 {fmt(s.crane)}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="actions">
            <button className="btn" onClick={handleSaveNew}>신규 저장</button>
            <button className="btn" onClick={handleSaveUpdate} disabled={!currentQuoteId}>수정 저장</button>
            <button className="btn" onClick={handleSend} disabled={!!sendStatus}>{sendStatus || "견적서 보내기"}</button>
            <button className="btn" onClick={downloadJpg}>JPG저장</button>
            <button className="btn" onClick={handlePreview}>인쇄</button>
          </div>
        </div>
        <div id="quotePreviewApp" onClick={() => setMobilePreviewOpen(true)} style={{ cursor: 'pointer', width: Math.floor(800 * getMobileScale()), height: Math.floor(1130 * getMobileScale()), margin: '0 auto', overflow: 'hidden', background: '#f5f6f8', borderRadius: 14, border: '1px solid #e5e7eb', position: 'relative' }}>
          <div style={{ position: 'absolute', bottom: 15, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '6px 12px', borderRadius: 20, fontSize: 11, zIndex: 10 }}>탭하여 크게 보기</div>
          <div style={{ position: 'absolute', top: 0, left: 0, width: 800, transformOrigin: 'top left', transform: `scale(${getMobileScale()})` }}>
            
            <A4Quote form={form} computedItems={computedItems} blankRows={blankRows} fmt={fmt} supply_amount={supply_amount} vat_amount={vat_amount} total_amount={total_amount} bizcardName={selectedBizcard?.name || ""} noTransform noPadding />
          </div>
        </div>
      </div>
    ) : (
   
      // ========== PC: 새 레이아웃 (버튼 + A4 인라인편집) ==========
   
      // ========== PC: 새 레이아웃 (버튼 + A4 인라인편집) ==========
      <div style={{ background: "#f5f6f8", minHeight: "100vh", padding: "16px" }}>
        {/* 버튼 바 */}
        <div style={{ maxWidth: 832, margin: "0 auto 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "#666" }}>
            QUOTE: {currentQuoteId || "-"} | v{currentVersion || "-"}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input 
              value={form.siteQ} 
              onChange={(e) => handleSiteSearch(e.target.value)} 
              placeholder=" 운송비 검색" 
              style={{ padding: "10px 14px", border: "1px solid #ddd", borderRadius: 8, fontSize: 13, width: 160 }} 
            />
            {sites.length > 0 && sites.slice(0, 2).map((s: any, i: number) => (
              <div key={i} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <button onClick={() => { setForm((p) => ({ ...p, sitePickedLabel: s.alias, siteQ: "" })); addOption({ option_id: "DELIVERY", option_name: "5톤 일반트럭 운송비(하차별도)", show_spec: "y" }, true, s.delivery, s.alias); setSites([]); }} style={{ fontSize: 12, padding: "8px 12px", background: "#e3f2fd", border: "none", borderRadius: 6, cursor: "pointer" }}>일반 {fmt(s.delivery)}</button>
                <button onClick={() => { setForm((p) => ({ ...p, sitePickedLabel: s.alias, siteQ: "" })); addOption({ option_id: "CRANE", option_name: "크레인 운송비", show_spec: "y" }, true, s.crane, s.alias); setSites([]); }} style={{ fontSize: 12, padding: "8px 12px", background: "#fff3e0", border: "none", borderRadius: 6, cursor: "pointer" }}>크레인 {fmt(s.crane)}</button>
              </div>
            ))}
            <button className="btn" onClick={handleSaveNew} style={{ background: "#2e5b86", color: "#fff", padding: "10px 20px", fontSize: 14 }}>저장</button>
            <button className="btn" onClick={handleSend} disabled={!!sendStatus} style={{ padding: "10px 20px", fontSize: 14 }}>{sendStatus || "전송"}</button>
            <button className="btn" onClick={downloadJpg} style={{ padding: "10px 20px", fontSize: 14 }}>JPG</button>
            <button className="btn" onClick={handlePreview} style={{ padding: "10px 20px", fontSize: 14 }}>인쇄</button>
          </div>
        </div>

        {/* A4 견적서 (인라인 편집) */}
        <div id="quotePreviewApp" style={{ display: "flex", justifyContent: "center" }}>
      <A4Quote
  form={form}
  setForm={setForm}
  computedItems={computedItems}
  blankRows={blankRows}
  fmt={fmt}
  onUpdateSpec={(key, spec) => updateRow(key, "lineSpec", spec)}
  onUpdateSpecText={(key, text) => updateRow(key, "specText", text)}
  editable={true}
  supply_amount={supply_amount}
  vat_amount={vat_amount}
  total_amount={total_amount}
  bizcardName={selectedBizcard?.name || ""}
  bizcards={bizcards}
  selectedBizcardId={selectedBizcardId}
  setSelectedBizcardId={setSelectedBizcardId}
  options={options}
 onSelectOption={(item, opt, calc) => {
  const rawName = String(opt.option_name || "");
  const rent = rawName.includes("임대");
  
  // displayName만 변경하는 경우 (자유입력)
  if (opt._isDisplayNameOnly) {
    setSelectedItems(prev => prev.map(i => i.key !== item.key ? i : {
      ...i, 
      displayName: rawName
    } as any));
    return;
  }
  
  // 일반 옵션 선택
  const customerUnitPrice = rent ? Number(calc.unitPrice || 0) : Number(calc.amount || 0);
  const existingLineSpec = item.lineSpec || { w: form.w, l: form.l, h: form.h };
  
  setSelectedItems(prev => prev.map(i => i.key !== item.key ? i : recomputeRow({
    ...i, 
    optionId: opt.option_id, 
    optionName: rawName, 
    displayName: rent ? `${rawName} 1개월` : rawName,
    unit: rent ? "개월" : calc.unit || "EA", 
    showSpec: opt.show_spec || "n",
    baseQty: calc.qty || 1, 
    baseUnitPrice: calc.unitPrice || 0, 
    baseAmount: calc.amount || 0,
    displayQty: 1, 
    customerUnitPrice, 
    finalAmount: customerUnitPrice, 
    months: 1,
    lineSpec: existingLineSpec
  } as any)));
}}
  onAddItem={(opt, calc, insertIdx) => addOption(opt, false, 0, "", undefined, insertIdx)}
  onUpdateQty={(key, qty) => updateRow(key, "displayQty", qty)}
  onUpdatePrice={(key, price) => updateRow(key, "customerUnitPrice", price)}
  onDeleteItem={(key) => deleteRow(key)}
  focusedRowIndex={focusedRowIndex}
  setFocusedRowIndex={setFocusedRowIndex}
  onSiteSearch={async (q) => {
    const { list } = await searchSiteRates(q, form.w, form.l);
    return list.filter((s: any) => matchKoreanLocal(String(s.alias || ""), q));
  }}
  onAddDelivery={(site, type, insertIdx) => {
    setForm((p) => ({ ...p, sitePickedLabel: site.alias, siteQ: site.alias }));
    if (type === 'delivery') {
      addOption({ option_id: "DELIVERY", option_name: "5톤 일반트럭 운송비(하차별도)", show_spec: "y" }, true, site.delivery, site.alias, undefined, insertIdx);
    } else {
      addOption({ option_id: "CRANE", option_name: "크레인 운송비", show_spec: "y" }, true, site.crane, site.alias, undefined, insertIdx);
    }
  }}
/>
      
  
</div>
      </div>
    )}
    
{mobilePreviewOpen && (
  <div style={{ position: 'fixed', inset: 0, background: '#fff', zIndex: 10000, display: 'flex', flexDirection: 'column' }}>
    <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ fontWeight: 800, fontSize: 14 }}>견적서 미리보기</div>
      <button onClick={() => setMobilePreviewOpen(false)} style={{ padding: '8px 16px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700 }}>닫기</button>
    </div>
    <div style={{ flex: 1, overflow: 'auto', background: '#f5f6f8', padding: '10px' }}>
      <div style={{ width: Math.floor(800 * Math.min(0.95, (window.innerWidth - 20) / 800)), margin: '0 auto', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: 800, transformOrigin: 'top left', transform: `scale(${Math.min(0.95, (window.innerWidth - 20) / 800)})` }}>
          <A4Quote form={form} computedItems={computedItems} blankRows={blankRows} fmt={fmt} supply_amount={supply_amount} vat_amount={vat_amount} total_amount={total_amount} bizcardName={selectedBizcard?.name || ""} noTransform noPadding />
        </div>
      </div>
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
clonedSheet.style.cssText = 'width: 800px; min-height: 1123px; background: #fff; padding: 16px; box-sizing: border-box;';

// ✅ select를 선택된 텍스트로 교체
const clonedSelects = clonedSheet.querySelectorAll('select');
const originalSelects = originalSheet.querySelectorAll('select');
clonedSelects.forEach((select, idx) => {
  const origSelect = originalSelects[idx] as HTMLSelectElement;
  const selectedText = origSelect.options[origSelect.selectedIndex]?.text || '';
  const span = document.createElement('span');
  span.textContent = selectedText;
  span.style.cssText = 'font-size: 13px;';
  select.parentNode?.replaceChild(span, select);
});

        
        // X 버튼 숨기기
        const deleteButtons = clonedSheet.querySelectorAll('button');
        deleteButtons.forEach(btn => {
          if (btn.textContent === '✕' || btn.style.color === 'rgb(229, 57, 53)') {
            btn.style.display = 'none';
          }
        });
        
        // 검색 input 숨기기
        const inputs = clonedSheet.querySelectorAll('.a4Items input');
        inputs.forEach(input => {
          (input as HTMLElement).style.display = 'none';
        });

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

        const msg = `안녕하세요 현대컨테이너입니다. 문의 주셔서 감사합니다. ${form.name || '고객'}님 견적서를 보내드립니다. 확인하시고 문의사항 있으시면 언제든 연락 주세요. 감사합니다~`;
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

if (view === "list") return listScreen;
if (view === "contract") return contractScreen;
if (view === "calendar") return calendarScreen;
if (view === "inventory") return inventoryScreen;
if (view === "tasks") return tasksScreen;  // ✅ 추가
return rtScreen;
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
  setForm?: React.Dispatch<React.SetStateAction<any>>;
  bizcards?: Bizcard[];
  selectedBizcardId?: string;
  setSelectedBizcardId?: (id: string) => void;
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
  options?: any[];
  onSelectOption?: (item: any, opt: any, calculated: any) => void;
  onAddItem?: (opt: any, calculated: any, insertIndex?: number) => void;  // ✅ 수정
  onUpdateQty?: (key: string, qty: number) => void;
  onUpdatePrice?: (key: string, price: number) => void;
  onDeleteItem?: (key: string) => void;
  onUpdateSpec?: (key: string, spec: { w: number; l: number; h?: number }) => void;
  onUpdateSpecText?: (key: string, text: string) => void;
  editable?: boolean;
  onSiteSearch?: (query: string) => Promise<any[]>;
  onAddDelivery?: (site: any, type: 'delivery' | 'crane', insertIndex?: number) => void;  // ✅ 수정
  focusedRowIndex?: number;  // ✅ 추가
  setFocusedRowIndex?: (index: number) => void;  // ✅ 추가
};


function A4Quote({ form, setForm, computedItems, blankRows, fmt, supply_amount, vat_amount, total_amount, bizcardName, bizcards, selectedBizcardId, setSelectedBizcardId, noTransform, noPadding, quoteDate, options, onSelectOption, onAddItem, onUpdateQty, onUpdatePrice, onDeleteItem, onUpdateSpec, onUpdateSpecText, editable, onSiteSearch, onAddDelivery, focusedRowIndex, setFocusedRowIndex }: A4QuoteProps) {
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
                <td className="v" colSpan={3}>
                  {editable && bizcards && setSelectedBizcardId ? (
                    <select 
                      value={selectedBizcardId || ""} 
                      onChange={(e) => setSelectedBizcardId(e.target.value)}
                      style={{ border: "none", background: "transparent", fontSize: 13, width: "100%", cursor: "pointer" }}
                    >
                      {bizcards.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                    </select>
                  ) : (bizcardName || "")}
                </td>
                <th className="k center">견적일자</th>
                <td className="v">
                  {editable && setForm ? (
                    <input 
                      type="date" 
                      value={ymd} 
                      onChange={(e) => setForm((p: any) => ({ ...p, quoteDate: e.target.value }))}
                      style={{ border: "none", background: "transparent", fontSize: 13, width: "100%" }}
                    />
                  ) : ymd}
                </td>
              </tr>
              <tr>
                <th className="k center">고객명</th>
                <td className="v" colSpan={3}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    {editable && setForm ? (
                      <input 
                        value={form.name || ""} 
                        onChange={(e) => setForm((p: any) => ({ ...p, name: e.target.value }))}
                        placeholder="고객명 입력"
                        style={{ border: "none", background: "transparent", fontSize: 13, flex: 1 }}
                      />
                    ) : <span>{form.name || ""}</span>}
                    <span style={{ fontWeight: 900 }}>귀하</span>
                  </div>
                </td>
                <th className="k center">공급자</th>
                <td className="v">현대컨테이너</td>
              </tr>
              <tr>
                <th className="k center">이메일</th>
                <td className="v" style={{ textAlign: "left", wordBreak: "break-all" }}>
  <input 
    value={form.email || ""} 
    onChange={(e) => setForm((p: any) => ({ ...p, email: e.target.value }))}
    placeholder="이메일 입력"
    style={{ 
      border: "none", 
      background: "transparent", 
      fontSize: 13, 
      width: "100%",
      textAlign: "left",
      marginLeft: 0,
      paddingLeft: 0
    }}
  />
</td>
                <th className="k center">전화</th>
                <td className="v">
                  {editable && setForm ? (
                    <input 
                      value={form.phone || ""} 
                      onChange={(e) => setForm((p: any) => ({ ...p, phone: e.target.value }))}
                      placeholder="전화번호 입력"
                      style={{ 
  border: "none", 
  background: "transparent", 
  fontSize: 13, 
  width: "80%",
  textAlign: "left",
  marginLeft: 0,
  paddingLeft: 0
}}
                    />
                  ) : (form.phone || "")}
                </td>
                <th className="k center">등록번호</th>
                <td className="v">130-41-38154</td>
              </tr>
              <tr>
                <th className="k center">현장</th>
                <td className="v">
                  {editable && setForm ? (
                    <input 
                      value={form.sitePickedLabel || form.siteQ || ""} 
                      onChange={(e) => setForm((p: any) => ({ ...p, sitePickedLabel: e.target.value, siteQ: e.target.value }))}
                      placeholder="현장 입력"
                      style={{ border: "none", background: "transparent", fontSize: 13, width: "100%" }}
                    />
                  ) : siteText}
                </td>
                <th className="k center">규격</th>
                <td className="v">
                  {editable && setForm ? (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0 }}>
    <input type="text" inputMode="decimal" value={form.w} onChange={(e) => setForm((p: any) => ({ ...p, w: Number(e.target.value) || 0 }))} style={{ border: "none", background: "transparent", fontSize: 13, width: 18, textAlign: "center", padding: 0 }} />
    <span>×</span>
    <input type="text" inputMode="decimal" value={form.l} onChange={(e) => setForm((p: any) => ({ ...p, l: Number(e.target.value) || 0 }))} style={{ border: "none", background: "transparent", fontSize: 13, width: 18, textAlign: "center", padding: 0 }} />
    <span>×</span>
    <input type="text" inputMode="decimal" value={form.h} onChange={(e) => setForm((p: any) => ({ ...p, h: Number(e.target.value) || 0 }))} style={{ border: "none", background: "transparent", fontSize: 13, width: 22, textAlign: "center", padding: 0 }} />
  </div>
) : spec}
                </td>
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
    합계금액 : ₩{fmt(form.vatIncluded !== false ? total_amount : supply_amount)} 
    (<select 
      value={form.vatIncluded !== false ? "included" : "excluded"} 
      onChange={(e) => setForm((p: any) => ({ ...p, vatIncluded: e.target.value === "included" }))}
      style={{ 
        border: "none", 
        background: "transparent", 
        fontSize: 14, 
        fontWeight: 900, 
        cursor: "pointer",
        width: "auto",
        display: "inline"
      }}
    >
      <option value="included">부가세 포함</option>
      <option value="excluded">부가세 별도</option>
    </select>)
  </td>
</tr>
            </tbody>
          </table>

          {/* ✅ +품목추가 버튼 */}
         {editable && onAddItem && (
  <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '8px 0 4px', gap: 8 }}>
    <button
      onClick={() => {
        const insertIdx = (focusedRowIndex !== undefined && focusedRowIndex >= 0) 
          ? focusedRowIndex 
          : computedItems.length - 1;
        onAddItem(
          { option_id: `empty_${Date.now()}`, option_name: '(품목선택)', unit: 'EA', unit_price: 0, show_spec: 'n', _isEmptyRow: true },
          { qty: 1, unitPrice: 0, amount: 0, unit: 'EA' },
          insertIdx
        );
      }}
             
                style={{
                  padding: '6px 12px',
                  background: '#e3f2fd',
                  border: '1px solid #90caf9',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#1565c0',
                }}
              >
                + 품목추가
              </button>
            </div>
          )}

          <table className="a4Items">

       
            <colgroup>
              <col style={{ width: "7%" }} />
              <col style={{ width: "31%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "7%" }} />
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
  const rent = String(item.optionName || "").includes("임대");

  return (
  <tr 
      key={item.key ?? idx}
      onClick={() => setFocusedRowIndex && setFocusedRowIndex(idx)}
      style={{ 
        cursor: editable ? 'pointer' : undefined,
        background: (editable && focusedRowIndex === idx) ? '#fff8e1' : undefined
      }}
    >
  <td className="c center">{idx + 1}</td>
 {editable && options && onSelectOption ? (
 <InlineItemCell 
  item={item} 
  options={options} 
  form={form} 
  onSelectOption={onSelectOption}
  rowIndex={idx}
  onFocus={setFocusedRowIndex}
/>
) : (
  <td className="c wrap">{String(item.displayName || "")}</td>
)}
 
<td className="c center">
  {editable && onUpdateSpec ? (
    <EditableSpecCell 
      spec={item.lineSpec || { w: form.w, l: form.l, h: form.h }} 
      specText={item.specText}
      onChange={(newSpec) => onUpdateSpec(item.key, newSpec)} 
      onTextChange={onUpdateSpecText ? (text) => onUpdateSpecText(item.key, text) : undefined}
    />
  ) : (
    item.specText || ((item.lineSpec?.w || form.w) + "×" + (item.lineSpec?.l || form.l) + "×" + (item.lineSpec?.h || form.h))
  )}
</td>
  <td className="c center">
    {editable && onUpdateQty ? (
      <EditableNumberCell value={qty} onChange={(v) => onUpdateQty(item.key, v)} />
    ) : String(qty)}
  </td>
  <td className="c right">
    {editable && onUpdatePrice ? (
      <EditableNumberCell value={unitSupply} onChange={(v) => onUpdatePrice(item.key, v)} disabled={rent} />
    ) : fmt(unitSupply)}
  </td>
  <td className="c right" style={{ whiteSpace: 'nowrap' }}>{fmt(supply)}</td>
  <td className="c right" style={{ whiteSpace: 'nowrap' }}>{fmt(vat)}</td>
  <td className="c center">
    {editable && onDeleteItem ? (
      <button onClick={() => onDeleteItem(item.key)} style={{ color: "#e53935", border: "none", background: "none", cursor: "pointer", fontWeight: "bold", fontSize: 14 }}>✕</button>
    ) : null}
  </td>
</tr>
  );
})}
{blankRows.map((_, i) => (
  // ✅ computedItems.length를 더해주어, 아이템이 추가될 때마다 완전히 새로운 컴포넌트로 리셋시킴
  <tr key={`blank-${computedItems.length + i}`}> 
    {i === 0 && editable && options && onAddItem ? (
      <EmptyRowCell 
  options={options} 
  form={form} 
  onAddItem={onAddItem} 
  onSiteSearch={onSiteSearch} 
  onAddDelivery={onAddDelivery}
  insertIndex={focusedRowIndex !== undefined && focusedRowIndex >= 0 ? focusedRowIndex : computedItems.length - 1}
  onFocus={setFocusedRowIndex}
/> 
    ) : (
      <><td className="c">&nbsp;</td><td className="c"></td><td className="c"></td><td className="c"></td><td className="c"></td><td className="c"></td><td className="c"></td><td className="c"></td></>
    )}
  </tr>
))}
            </tbody>
          </table>

          <table className="a4Bottom">
            <colgroup>
              <col style={{ width: "15%" }} />
              <col style={{ width: "26%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "7%" }} />
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
  *, *:focus, *:focus-visible, *:focus-within, *:active { 
  outline: none !important; 
  box-shadow: none !important; 
  -webkit-tap-highlight-color: transparent !important;
}
td, td:focus, td:focus-visible, td:focus-within,
td input, td input:focus, td input:focus-visible {
  outline: none !important;
  box-shadow: none !important;
}
.a4Items tbody tr td {
  outline: none !important;
}
.a4Items tbody tr td:focus,
.a4Items tbody tr td:focus-visible,
.a4Items tbody tr td:focus-within {
  outline: none !important;
  box-shadow: none !important;
}
 
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
  line-height: 1.4;  /* 추가 */
  min-height: 28px;  /* 추가 */
}

 .k{ background:#fff; font-weight: 900; }
.v{ background:#fff; text-align: left !important; }
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
  vertical-align: middle;  /* top → middle */
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
  vertical-align: middle;  /* top → middle */
  line-height: 1.3;
}

.a4Info input, .a4Info select {
  border: none;
  background: transparent;
  font-size: 13px;
  width: 100%;
  padding: 0;
  margin: 0;
  line-height: 1.4;
  height: auto;
  vertical-align: middle;
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
.a4Items td input[type="text"] {
  border: none !important;
  outline: none !important;
  background: transparent !important;
  width: 100%;
  padding: 0;
  font-size: inherit;
}


  @media print{
    @page {
      size: A4;
      margin: 0;
    }
      *, *::before, *::after {
  background-color: #fff !important;
  box-shadow: none !important;
}

.a4Sheet {
  background: #fff !important;
}
    html, body {
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: #fff !important;
}
  .card {
  border: none !important;
  box-shadow: none !important;
  border-radius: 0 !important;
}
      div[style*="max-width: 832px"] {
    display: none !important;
  }
     .a4Items td:last-child button {
      display: none !important;
    }

    
    /* 검색 input 숨기기 */
    .a4Items input {
      display: none !important;
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
     /* 기본 셀 */
.a4Items td {
  vertical-align: middle !important;
}

/* 품목 셀 - 중앙 정렬 */
.a4Items td.wrap {
  text-align: left !important;
  vertical-align: middle !important;
  line-height: 28px !important;
  padding-left: 8px !important;
}
/* 숫자 셀 - 오른쪽 정렬 */
.a4Items td.right {
  text-align: right !important;
}

/* span 정렬 */
.a4Items td.wrap span {
  display: flex !important;
  align-items: center !important;
  justify-content: flex-start !important;
  height: 100% !important;
  min-height: 28px !important;
}

* {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
  
  }
`;
export { A4Quote };
