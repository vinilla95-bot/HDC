// InlineEditTest.tsx - Supabase 연동 + 인라인 편집 + 전체 기능
import * as React from "react";
const { useState, useRef, useEffect, useMemo } = React;
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
} from "./QuoteService";

// 페이지 import (기존 App.tsx와 동일)
import QuoteListPage from "./pages/QuoteListPage";
import ContractListPage from "./pages/ContractListPage";
import DeliveryCalendarPage from "./pages/DeliveryCalendarPage";
import InventoryPage from "./pages/InventoryPage";

// ✅ GAS WebApp URL
export const getWebAppUrl = () => {
  return "https://script.google.com/macros/s/AKfycbyTGGQnxlfFpqP5zS0kf7m9kzSK29MGZbeW8GUMlAja04mRJHRszuRdpraPdmOWxNNr/exec";
};

// 초성 검색 유틸리티
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
  if (isChosung(q)) {
    const targetChosung = getChosung(t);
    return targetChosung.includes(q);
  }
  return t.includes(q);
};

// 숫자 포맷
const fmt = (n: number) => (Number(n) || 0).toLocaleString("ko-KR");

// 검색어 하이라이트
function highlightMatch(text: string, query: string) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ color: "#e53935", fontWeight: 900 }}>{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

type Bizcard = { id: string; name: string; image_url: string };

// ============ 인라인 품목 편집 셀 ============
function InlineItemCell({
  item,
  options,
  form,
  onSelectOption,
}: {
  item: any;
  options: any[];
  form: { w: number; l: number; h: number };
  onSelectOption: (item: any, opt: any, calculated: any) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];
    const matched = options.filter((o: any) => matchKoreanLocal(String(o.option_name || ""), q));
    const qLower = q.toLowerCase();
    matched.sort((a: any, b: any) => {
      const nameA = String(a.option_name || "").toLowerCase();
      const nameB = String(b.option_name || "").toLowerCase();
      const startsA = nameA.startsWith(qLower) ? 0 : 1;
      const startsB = nameB.startsWith(qLower) ? 0 : 1;
      if (startsA !== startsB) return startsA - startsB;
      return nameA.includes(qLower) ? 0 : 1 - (nameB.includes(qLower) ? 0 : 1);
    });
    return matched.slice(0, 15);
  }, [searchQuery, options]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
        setIsEditing(false);
        setSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (opt: any) => {
    const calculated = calculateOptionLine(opt, form.w, form.l, form.h);
    onSelectOption(item, opt, calculated);
    setShowDropdown(false);
    setIsEditing(false);
    setSearchQuery("");
  };

  if (isEditing) {
    return (
      <td className="c wrap" style={{ position: "relative", padding: 0 }}>
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setShowDropdown(true); }}
          onFocus={() => setShowDropdown(true)}
          placeholder="품목 검색 (초성 가능)..."
          autoFocus
          style={{
            width: "100%",
            padding: "6px 8px",
            border: "2px solid #2e5b86",
            fontSize: 12,
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
              right: 0,
              maxHeight: 250,
              overflowY: "auto",
              background: "#fff",
              border: "1px solid #ccc",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              zIndex: 1000,
            }}
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt: any) => (
                <div
                  key={opt.option_id}
                  onClick={() => handleSelect(opt)}
                  style={{
                    padding: "8px 10px",
                    cursor: "pointer",
                    borderBottom: "1px solid #eee",
                    fontSize: 12,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#e3f2fd")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                >
                  <div style={{ fontWeight: 700 }}>{highlightMatch(opt.option_name, searchQuery)}</div>
                  <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>
                    {opt.unit || "EA"} · {fmt(Number(opt.unit_price || 0))}원
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: "10px", color: "#999", fontSize: 12 }}>검색 결과 없음</div>
            )}
          </div>
        )}
      </td>
    );
  }

  return (
    <td
      className="c wrap"
      onClick={() => setIsEditing(true)}
      style={{ cursor: "pointer", background: "#e3f2fd" }}
      title="클릭하여 품목 변경"
    >
      <span>{String(item.displayName || "")}</span>
    </td>
  );
}

// ============ 빈 행 클릭 시 품목 추가 ============
function EmptyRowCell({
  options,
  form,
  onAddItem,
}: {
  options: any[];
  form: { w: number; l: number; h: number };
  onAddItem: (opt: any, calculated: any) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];
    const matched = options.filter((o: any) => matchKoreanLocal(String(o.option_name || ""), q));
    const qLower = q.toLowerCase();
    matched.sort((a: any, b: any) => {
      const nameA = String(a.option_name || "").toLowerCase();
      const nameB = String(b.option_name || "").toLowerCase();
      const startsA = nameA.startsWith(qLower) ? 0 : 1;
      const startsB = nameB.startsWith(qLower) ? 0 : 1;
      if (startsA !== startsB) return startsA - startsB;
      return nameA.includes(qLower) ? 0 : 1 - (nameB.includes(qLower) ? 0 : 1);
    });
    return matched.slice(0, 15);
  }, [searchQuery, options]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
        setIsEditing(false);
        setSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (opt: any) => {
    const calculated = calculateOptionLine(opt, form.w, form.l, form.h);
    onAddItem(opt, calculated);
    setShowDropdown(false);
    setIsEditing(false);
    setSearchQuery("");
  };

  if (isEditing) {
    return (
      <>
        <td className="c center">&nbsp;</td>
        <td className="c" style={{ position: "relative", padding: 0 }}>
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            placeholder="품목 검색 (초성 가능)..."
            autoFocus
            style={{
              width: "100%",
              padding: "6px 8px",
              border: "2px solid #2e5b86",
              fontSize: 12,
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
                right: 0,
                maxHeight: 250,
                overflowY: "auto",
                background: "#fff",
                border: "1px solid #ccc",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                zIndex: 1000,
              }}
            >
              {filteredOptions.length > 0 ? (
                filteredOptions.map((opt: any) => (
                  <div
                    key={opt.option_id}
                    onClick={() => handleSelect(opt)}
                    style={{
                      padding: "8px 10px",
                      cursor: "pointer",
                      borderBottom: "1px solid #eee",
                      fontSize: 12,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#e3f2fd")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                  >
                    <div style={{ fontWeight: 700 }}>{highlightMatch(opt.option_name, searchQuery)}</div>
                    <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>
                      {opt.unit || "EA"} · {fmt(Number(opt.unit_price || 0))}원
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: "10px", color: "#999", fontSize: 12 }}>검색 결과 없음</div>
              )}
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

  return (
    <>
      <td className="c center">&nbsp;</td>
      <td
        className="c"
        onClick={() => setIsEditing(true)}
        style={{ cursor: "pointer" }}
        title="클릭하여 품목 추가"
      >
        <span style={{ color: "#999", fontSize: 11 }}>+ 클릭하여 품목 추가</span>
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

// ============ 인라인 숫자 편집 셀 ============
function EditableNumberCell({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (val: number) => void;
  disabled?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setTempValue(String(value));
  }, [value]);

  const handleBlur = () => {
    setIsEditing(false);
    onChange(Number(tempValue) || 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleBlur();
    else if (e.key === "Escape") {
      setTempValue(String(value));
      setIsEditing(false);
    }
  };

  if (disabled) {
    return <span>{fmt(value)}</span>;
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        style={{
          width: "100%",
          padding: "2px 4px",
          textAlign: "right",
          border: "2px solid #2e5b86",
          fontSize: 12,
          boxSizing: "border-box",
        }}
      />
    );
  }

  return (
    <span
      onClick={() => { setTempValue(String(value)); setIsEditing(true); }}
      style={{
        cursor: "pointer",
        background: "#e3f2fd",
        padding: "2px 4px",
        display: "block",
        textAlign: "right",
      }}
      title="클릭하여 수정"
    >
      {fmt(value)}
    </span>
  );
}

// ============ 드래그 가능한 행 컴포넌트 ============
function SortableItemRow({
  item,
  idx,
  options,
  form,
  isRentRow,
  handleSelectOption,
  handleUpdateQty,
  handleUpdatePrice,
  handleDelete,
}: any) {
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

  const unitSupply = Number(item.customerUnitPrice ?? 0);
  const qty = Number(item.displayQty ?? 0);
  const supply = unitSupply * qty;
  const vat = Math.round(supply * 0.1);
  const showSpec = String(item.showSpec || "").toLowerCase() === "y";
  const specText = showSpec && item?.lineSpec?.w && item?.lineSpec?.l
    ? `${item.lineSpec.w}x${item.lineSpec.l}${item.lineSpec.h ? 'x' + item.lineSpec.h : ''}`
    : "";
  const rent = isRentRow(item);

  return (
    <tr ref={setNodeRef} style={style}>
      <td className="c center" {...attributes} {...listeners} style={{ cursor: 'grab' }}>
        ☰ {idx + 1}
      </td>
      <InlineItemCell
        item={item}
        options={options}
        form={form}
        onSelectOption={handleSelectOption}
      />
      <td className="c center">{specText}</td>
      <td className="c center">
        <EditableNumberCell
          value={qty}
          onChange={(val) => handleUpdateQty(item.key, val)}
        />
      </td>
      <td className="c right">
        <EditableNumberCell
          value={unitSupply}
          onChange={(val) => handleUpdatePrice(item.key, val)}
          disabled={rent}
        />
      </td>
      <td className="c right">{fmt(supply)}</td>
      <td className="c right">{fmt(vat)}</td>
      <td className="c center">
        <button
          onClick={() => handleDelete(item.key)}
          style={{
            color: "#e53935",
            border: "none",
            background: "none",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: 14,
          }}
          title="삭제"
        >
          ✕
        </button>
      </td>
    </tr>
  );
}

// ============ 메인 컴포넌트 ============
export default function InlineEditTest() {
  // ✅ 뷰 상태 (URL 파라미터 연동)
  const [view, setView] = useState<"rt" | "list" | "contract" | "calendar" | "inventory">(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('view');
    if (v === 'list') return 'list';
    if (v === 'contract') return 'contract';
    if (v === 'calendar') return 'calendar';
    if (v === 'inventory') return 'inventory';
    return 'rt';
  });

  // URL 동기화
  useEffect(() => {
    const url = new URL(window.location.href);
    if (view === 'rt') {
      url.searchParams.delete('view');
    } else {
      url.searchParams.set('view', view);
    }
    window.history.replaceState({}, '', url.toString());
  }, [view]);

  // Supabase에서 데이터 로드
  const [options, setOptions] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [siteQuery, setSiteQuery] = useState("");
  const [bizcards, setBizcards] = useState<Bizcard[]>([]);
  const [selectedBizcardId, setSelectedBizcardId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // 품목 목록
  const [items, setItems] = useState<any[]>([]);

  // QUOTE 상태
  const [currentQuoteId, setCurrentQuoteId] = useState<string>("");
  const [currentVersion, setCurrentVersion] = useState<number>(0);

  // 상태 메시지
  const [statusMsg, setStatusMsg] = useState("");
  const [sendStatus, setSendStatus] = useState("");

  // 모바일 전체화면 미리보기
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const isMobileDevice = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // 폼 데이터
  const [form, setForm] = useState({
    quoteTitle: "",
    name: "",
    email: "",
    phone: "",
    quoteDate: new Date().toISOString().slice(0, 10),
    sitePickedLabel: "",
    vatIncluded: true,
    w: 3,
    l: 6,
    h: 2.6,
  });

  // 드래그 센서
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // 데이터 로드
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      
      // 옵션 로드
      const { data: optData } = await supabase.from("options").select("*");
      setOptions((optData || []) as any[]);

      // 명함 로드
      const { data: cardData } = await supabase.from("bizcards").select("*");
      const cards = (cardData || []) as Bizcard[];
      setBizcards(cards);
      
      // 기본 담당자 설정 (고은희)
      const defaultCard = cards.find((c) => c.name?.includes("고은희"));
      if (defaultCard) setSelectedBizcardId(defaultCard.id);
      else if (cards[0]) setSelectedBizcardId(cards[0].id);

      setLoading(false);
    };
    loadData();
  }, []);

  const selectedBizcard = useMemo(
    () => bizcards.find((b) => b.id === selectedBizcardId),
    [bizcards, selectedBizcardId]
  );

  // 임대 여부 체크
  const isRentRow = (row: any) => String(row?.optionName || "").includes("임대");

  // 모바일 스케일 계산
  const getMobileScale = () => {
    if (typeof window === 'undefined') return 0.45;
    return (window.innerWidth - 32) / 800;
  };

  // 품목 선택 시 (기존 행 변경)
  const handleSelectOption = (item: any, opt: any, calculated: any) => {
    const rawName = String(opt.option_name || "(이름없음)");
    const rent = rawName.includes("임대");
    const baseQty = Number(calculated.qty || 1);
    const baseUnitPrice = Number(calculated.unitPrice || 0);
    const baseAmount = Number(calculated.amount || 0);
    const defaultMonths = 1;
    const displayQty = 1;
    const customerUnitPrice = rent ? baseUnitPrice * defaultMonths : baseAmount;
    const displayName = rent ? `${rawName} ${defaultMonths}개월` : rawName;

    setItems(prev => prev.map(i => {
      if (i.key !== item.key) return i;
      return {
        ...i,
        optionId: String(opt.option_id || rawName),
        optionName: rawName,
        displayName,
        unit: rent ? "개월" : calculated.unit || "EA",
        showSpec: String(opt.show_spec || "").toLowerCase(),
        baseQty,
        baseUnitPrice,
        baseAmount,
        displayQty,
        customerUnitPrice,
        finalAmount: Math.round(displayQty * customerUnitPrice),
        months: defaultMonths,
        memo: calculated.memo || "",
        lineSpec: { w: form.w, l: form.l, h: form.h },
      };
    }));
  };

  // 품목 추가 (빈 행 클릭)
  const handleAddItem = (opt: any, calculated: any) => {
    const rawName = String(opt.option_name || "(이름없음)");
    const rent = rawName.includes("임대");
    const baseQty = Number(calculated.qty || 1);
    const baseUnitPrice = Number(calculated.unitPrice || 0);
    const baseAmount = Number(calculated.amount || 0);
    const defaultMonths = 1;
    const displayQty = 1;
    const customerUnitPrice = rent ? baseUnitPrice * defaultMonths : baseAmount;
    const displayName = rent ? `${rawName} ${defaultMonths}개월` : rawName;

    const newItem = {
      key: `${String(opt.option_id || rawName)}_${Date.now()}`,
      optionId: String(opt.option_id || rawName),
      optionName: rawName,
      displayName,
      unit: rent ? "개월" : calculated.unit || "EA",
      showSpec: String(opt.show_spec || "").toLowerCase(),
      baseQty,
      baseUnitPrice,
      baseAmount,
      displayQty,
      customerUnitPrice,
      finalAmount: Math.round(displayQty * customerUnitPrice),
      months: defaultMonths,
      memo: calculated.memo || "",
      lineSpec: { w: form.w, l: form.l, h: form.h },
    };
    setItems(prev => [...prev, newItem]);
  };

  // 운송비 추가
  const handleAddDelivery = (site: any, type: "일반" | "크레인") => {
    const price = type === "일반" ? site.delivery : site.crane;
    const optName = type === "일반" ? "5톤 일반트럭 운송비(하차별도)" : "크레인 운송비";
    
    const newItem = {
      key: `DELIVERY_${type}_${Date.now()}`,
      optionId: `DELIVERY_${type}`,
      optionName: optName,
      displayName: `${optName}-${site.alias}`,
      unit: "EA",
      showSpec: "y",
      baseQty: 1,
      baseUnitPrice: price,
      baseAmount: price,
      displayQty: 1,
      customerUnitPrice: price,
      finalAmount: price,
      months: 1,
      memo: "",
      lineSpec: { w: form.w, l: form.l, h: form.h },
    };
    setItems(prev => [...prev, newItem]);
    setForm(prev => ({ ...prev, sitePickedLabel: site.alias }));
    setSites([]);
    setSiteQuery("");
  };

  // 현장지역 검색
  const handleSiteSearch = async (val: string) => {
    setSiteQuery(val);
    setForm((prev) => ({ ...prev, sitePickedLabel: "" }));
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

  // 수량 업데이트
  const handleUpdateQty = (key: string, qty: number) => {
    setItems(prev => prev.map(i => {
      if (i.key !== key) return i;
      const newQty = Math.max(0, Math.floor(qty));
      return {
        ...i,
        displayQty: isRentRow(i) ? Math.max(1, newQty) : newQty,
        finalAmount: Math.round(newQty * i.customerUnitPrice),
      };
    }));
  };

  // 단가 업데이트
  const handleUpdatePrice = (key: string, unitPrice: number) => {
    setItems(prev => prev.map(i => {
      if (i.key !== key) return i;
      if (isRentRow(i)) return i;
      const newPrice = Math.max(0, unitPrice);
      return {
        ...i,
        customerUnitPrice: newPrice,
        finalAmount: Math.round(i.displayQty * newPrice),
      };
    }));
  };

  // 삭제
  const handleDelete = (key: string) => {
    setItems(prev => prev.filter(i => i.key !== key));
  };

  // 드래그 끝
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((prevItems) => {
        const oldIndex = prevItems.findIndex((i: any) => i.key === active.id);
        const newIndex = prevItems.findIndex((i: any) => i.key === over.id);
        return arrayMove(prevItems, oldIndex, newIndex);
      });
    }
  };

  // 합계 계산
  const supply_amount = items.reduce((sum, i) => sum + (i.finalAmount || 0), 0);
  const vat_amount = Math.round(supply_amount * 0.1);
  const total_amount = supply_amount + vat_amount;

  // Payload 빌더
  const buildPayload = (quote_id: string, version: number) => {
    const spec = `${form.w}x${form.l}x${form.h}`;
    const title =
      String(form.quoteTitle || "").trim() ||
      `${form.sitePickedLabel || ""} ${spec}`.trim();

    return {
      quote_id,
      version,
      quote_title: title,
      customer_name: form.name,
      customer_phone: form.phone,
      customer_email: form.email,
      site_name: form.sitePickedLabel || "",
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
      items: items.map((r: any) => ({
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

  // 인쇄
  const handlePreview = () => window.print();

  // 신규 저장
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

  // 수정 저장
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

  // 캡처 → PDF → 메일 전송
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

  // JPG 다운로드
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
  const blankCount = Math.max(0, MIN_ROWS - items.length);

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
    </div>
  );

  // ✅ 전체견적 화면
  if (view === "list") {
    return (
      <div style={{ minHeight: "100vh" }}>
        <NavBar current="list" />
        <QuoteListPage
          onGoLive={() => setView("rt")}
          onConfirmContract={() => setView("contract")}
        />
      </div>
    );
  }

  // ✅ 계약견적 화면
  if (view === "contract") {
    return (
      <div style={{ minHeight: "100vh" }}>
        <NavBar current="contract" />
        <ContractListPage onBack={() => setView("list")} />
      </div>
    );
  }

  // ✅ 출고일정 화면
  if (view === "calendar") {
    return (
      <div style={{ minHeight: "100vh" }}>
        <NavBar current="calendar" />
        <DeliveryCalendarPage onBack={() => setView("contract")} />
      </div>
    );
  }

  // ✅ 재고현황 화면
  if (view === "inventory") {
    return (
      <div style={{ minHeight: "100vh" }}>
        <NavBar current="inventory" />
        <InventoryPage onBack={() => setView("contract")} />
      </div>
    );
  }

  // 로딩
  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <p>데이터 로딩 중...</p>
      </div>
    );
  }

  // ✅ 실시간견적 화면
  return (
    <div style={{ background: "#f5f6f8", minHeight: "100vh" }}>
      <style>{a4css}</style>
      
      <NavBar current="rt" />
      
      <div style={{ textAlign: "center", padding: "16px 0 8px" }}>
        <span style={{ background: "#2e5b86", color: "#fff", padding: "8px 16px", borderRadius: 8, fontSize: 14 }}>
          🧪 인라인 편집 테스트 - Supabase 연동
        </span>
        <div style={{ marginTop: 8 }}>
          <span className="quoteBadge" style={{ background: "#f0f0f0", padding: "4px 12px", borderRadius: 4, fontSize: 12 }}>
            QUOTE: {currentQuoteId || "-"} | VERSION: {currentVersion ? `v${currentVersion}` : "-"}
          </span>
        </div>
      </div>

      {/* 상단 입력 폼 */}
      <div style={{ maxWidth: 800, margin: "0 auto 20px", padding: "16px", background: "#fff", borderRadius: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: "#666" }}>견적제목</label>
            <input
              value={form.quoteTitle}
              onChange={(e) => setForm({ ...form, quoteTitle: e.target.value })}
              placeholder="예: 강릉 3x6 / OO업체"
              style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 4 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#666" }}>고객명</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 4 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#666" }}>이메일</label>
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 4 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#666" }}>전화번호</label>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 4 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#666" }}>담당자</label>
            <select
              value={selectedBizcardId}
              onChange={(e) => setSelectedBizcardId(e.target.value)}
              style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 4 }}
            >
              {bizcards.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#666" }}>현장</label>
            <input
              value={form.sitePickedLabel}
              onChange={(e) => setForm({ ...form, sitePickedLabel: e.target.value })}
              style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 4 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#666" }}>견적일</label>
            <input
              type="date"
              value={form.quoteDate}
              onChange={(e) => setForm({ ...form, quoteDate: e.target.value })}
              style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 4 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#666" }}>부가세</label>
            <select
              value={form.vatIncluded ? "included" : "excluded"}
              onChange={(e) => setForm({ ...form, vatIncluded: e.target.value === "included" })}
              style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 4 }}
            >
              <option value="included">부가세 포함</option>
              <option value="excluded">부가세 별도</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: "#666" }}>가로(m)</label>
              <input
                type="number"
                value={form.w}
                onChange={(e) => setForm({ ...form, w: Number(e.target.value) })}
                style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 4 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: "#666" }}>세로(m)</label>
              <input
                type="number"
                value={form.l}
                onChange={(e) => setForm({ ...form, l: Number(e.target.value) })}
                style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 4 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: "#666" }}>높이(m)</label>
              <input
                type="number"
                step="0.1"
                value={form.h}
                onChange={(e) => setForm({ ...form, h: Number(e.target.value) })}
                style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 4 }}
              />
            </div>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
          면적: {(form.w * form.l).toFixed(2)}㎡ | 옵션 {options.length}개 로드됨
        </div>

        {/* 현장지역 검색 */}
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 12, color: "#666" }}>현장지역 (운송비 검색)</label>
          <input
            value={siteQuery}
            onChange={(e) => handleSiteSearch(e.target.value)}
            placeholder="예: 강릉, ㄱㄹ (초성 가능)"
            style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 4, marginTop: 4 }}
          />
          {statusMsg && <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{statusMsg}</div>}
          {sites.length > 0 && (
            <div style={{ marginTop: 8, border: "1px solid #ddd", borderRadius: 4, maxHeight: 200, overflowY: "auto" }}>
              {sites.map((s: any, i: number) => (
                <div key={i} style={{ padding: "8px 12px", borderBottom: "1px solid #eee" }}>
                  <div style={{ fontWeight: 700 }}>{s.alias}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <button
                      onClick={() => handleAddDelivery(s, "일반")}
                      style={{ padding: "4px 8px", fontSize: 11, cursor: "pointer" }}
                    >
                      일반운송 {fmt(s.delivery)}원
                    </button>
                    <button
                      onClick={() => handleAddDelivery(s, "크레인")}
                      style={{ padding: "4px 8px", fontSize: 11, cursor: "pointer" }}
                    >
                      크레인 {fmt(s.crane)}원
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 액션 버튼들 */}
        <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={handleSaveNew}>신규 저장</button>
          <button className="btn" onClick={handleSaveUpdate} disabled={!currentQuoteId}>수정 저장</button>
          <button className="btn" onClick={handleSend} disabled={!!sendStatus}>
            {sendStatus || "견적서 보내기"}
          </button>
          <button className="btn" onClick={downloadJpg}>JPG저장</button>
          <button className="btn" onClick={handlePreview}>인쇄</button>
        </div>
      </div>

      {/* A4 미리보기 */}
      <div id="quotePreviewApp" className="a4Wrap">
        <div className="a4Sheet">
          {/* 헤더 */}
          <div className="a4Header">
            <div className="a4HeaderLeft">
              <img src="https://i.postimg.cc/VvsGvxFP/logo1.jpg" alt="logo" className="a4Logo" />
            </div>
            <div className="a4HeaderCenter">견 적 서</div>
            <div className="a4HeaderRight" />
          </div>

          {/* 정보 테이블 */}
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
                <td className="v" colSpan={3}>{selectedBizcard?.name || ""}</td>
                <th className="k center">견적일자</th>
                <td className="v">{form.quoteDate}</td>
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
                <td className="v">현대컨테이너</td>
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
                <td className="v">{form.sitePickedLabel || ""}</td>
                <th className="k center">견적일</th>
                <td className="v">{new Date(form.quoteDate + 'T00:00:00').toLocaleDateString("ko-KR")}</td>
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
                  합계금액 : ₩{fmt(form.vatIncluded ? total_amount : supply_amount)} ({form.vatIncluded ? "부가세 포함" : "부가세 별도"})
                </td>
              </tr>
            </tbody>
          </table>

          {/* 품목 테이블 */}
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
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <tbody>
                <SortableContext items={items.map((i: any) => i.key)} strategy={verticalListSortingStrategy}>
                  {items.map((item, idx) => (
                    <SortableItemRow
                      key={item.key}
                      item={item}
                      idx={idx}
                      options={options}
                      form={form}
                      isRentRow={isRentRow}
                      handleSelectOption={handleSelectOption}
                      handleUpdateQty={handleUpdateQty}
                      handleUpdatePrice={handleUpdatePrice}
                      handleDelete={handleDelete}
                    />
                  ))}
                </SortableContext>

                {/* 빈 행들 */}
                {Array.from({ length: blankCount }).map((_, i) => (
                  <tr key={`blank-${i}`}>
                    {i === 0 ? (
                      <EmptyRowCell
                        options={options}
                        form={form}
                        onAddItem={handleAddItem}
                      />
                    ) : (
                      <>
                        <td className="c">&nbsp;</td>
                        <td className="c"></td>
                        <td className="c"></td>
                        <td className="c"></td>
                        <td className="c"></td>
                        <td className="c"></td>
                        <td className="c"></td>
                        <td className="c"></td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </DndContext>
          </table>

          {/* 하단 합계 */}
          <table className="a4Bottom">
            <colgroup>
              <col style={{ width: "15%" }} />
              <col style={{ width: "29%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
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
                  *견적서는 견적일로 부터 2주간 유효합니다.<br />
                  1. 하차비 별도(당 지역 지게차 혹은 크레인 이용)<br />
                  2. '주문 제작'시 50퍼센트 입금 후 제작, 완불 후 출고. /임대의 경우 계약금 없이 완불 후 출고<br />
                  *출고 전날 오후 2시 이전 잔금 결제 조건*<br />
                  3. 하차, 회수시 상차 별도(당 지역 지게차 혹은 크레인 이용)
                </td>
              </tr>
              <tr>
                <th className="label">중요사항</th>
                <td className="text" colSpan={7}>
                  *중요사항*<br />
                  1. 인적사항 요구 현장시 운임비 3만원 추가금 발생합니다.<br />
                  2. 기본 전기는 설치 되어 있으나 주택용도 전선관은 추가되어 있지 않습니다.<br />
                  한전/전기안전공사 측에서 전기연결 예정이신 경우 전선관 옵션을 추가하여 주시길 바랍니다.<br />
                  해당사항은 고지의무사항이 아니므로 상담을 통해 확인하시길 바랍니다.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
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
                    {/* 여기에 A4 내용 복제 */}
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
            <button
              onClick={() => { setMobilePreviewOpen(false); handleSend(); }}
              style={{
                flex: 1,
                padding: '12px',
                background: '#111',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              전송
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const a4css = `
  .btn {
    padding: 8px 16px;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
  }
  .btn:hover {
    background: #f5f5f5;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
    vertical-align: middle;
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
    .btn, button { display: none !important; }
    > div:first-child { display: none !important; }
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
