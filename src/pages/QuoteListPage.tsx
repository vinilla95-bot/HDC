import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import html2canvas from "html2canvas";
import { supabase } from "../lib/supabase";
import { gasRpc as gasRpcRaw } from "../lib/gasRpc";
import { matchKorean, calculateOptionLine, searchSiteRates } from "../QuoteService";
import { A4Quote } from "../App";

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
// ============ 인라인 숫자 편집 셀 ============
function EditableNumberCell({ value, onChange, editable = true }: { value: number; onChange: (val: number) => void; editable?: boolean }) {
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
    console.log("🟢 키 입력:", e.key);  // ← 이거 찍혀요?
    if (e.key === "Enter") {
      handleBlur();
    } else if (e.key === "Escape") {
      setTempValue(String(value));
      setIsEditing(false);
    }
  };

  if (!editable) {
    return <span style={{ display: "block", textAlign: "right", width: "100%" }}>{money(value)}</span>;
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
        style={{ width: "100%", padding: "2px 4px", textAlign: "right", border: "1px solid #2e5b86", fontSize: 12, outline: "none" }} 
      />
    );
  }
  
  return (
    <span 
      onClick={() => setIsEditing(true)} 
      style={{ cursor: "pointer", display: "block", textAlign: "right", width: "100%" }} 
      title="클릭하여 수정"
    >
      {money(value)}
    </span>
  );
}

function InlineItemSearchCell({
  item,
  options,
  onSelectOption,
  onUpdateName,
  onDelete,
  editable = true,
}: {
  item: any;
  options: any[];
  onSelectOption: (opt: any) => void;
  onUpdateName: (name: string) => void;
  onDelete: () => void;
  editable?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ✅ 최신 값 참조용
  const searchQueryRef = useRef(searchQuery);
  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  const filteredOpts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return options
      .filter((o: any) => {
        const name = String(o.option_name || "").toLowerCase();
        return name.includes(q) || matchKorean(name, q);
      })
      .slice(0, 15);
  }, [searchQuery, options]);

  const commitCustomText = useCallback(() => {
    const trimmed = (searchQueryRef.current || "").trim();
    if (trimmed) {
      onUpdateName(trimmed); // ✅ 자유 입력 저장
    }
    setShowDropdown(false);
    setIsEditing(false);
    setSearchQuery("");
  }, [onUpdateName]);

  const cancelEdit = useCallback(() => {
    setShowDropdown(false);
    setIsEditing(false);
    setSearchQuery("");
  }, []);

  // ✅ Enter/Tab 저장, ESC 취소
 const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter" || e.key === "Tab") {
    e.preventDefault();
    e.stopPropagation();   // ✅ 이거 추가
    commitCustomText();
  } else if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();   // ✅ 이것도
    cancelEdit();
  }
};


  // ✅ blur(다른 곳 클릭)도 저장되게
  const handleBlur = () => {
    // blur가 dropdown 클릭 때문에 먼저 발생하는 케이스 방어:
    // dropdown 안을 클릭하면 mousedown에서 onSelectOption이 실행되고,
    // 그 뒤 blur가 오더라도 이미 isEditing=false로 바뀌거나 query reset 되어서 문제 없음.
    commitCustomText();
  };

  // ✅ editing 중 바깥 클릭하면 저장(=blur 유도) + dropdown도 닫힘
  useEffect(() => {
    if (!isEditing) return;

    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      const inInput = inputRef.current?.contains(t);
      const inDrop = dropdownRef.current?.contains(t);

      // input/dropdown 밖 클릭이면 → 저장 + 닫기
      if (!inInput && !inDrop) {
        commitCustomText();
      }
    };

    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [isEditing, commitCustomText]);

  if (!editable) {
    return (
      <span style={{ display: "block", width: "100%", textAlign: "left" }}>
        {item.displayName || "(-)"}
      </span>
    );
  }

  if (isEditing) {
    return (
      <div style={{ position: "relative", textAlign: "left", width: "100%" }}>
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setShowDropdown(true);
          }}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={() => setShowDropdown(true)}
          placeholder="품목명 입력..."
          autoFocus
          style={{
            width: "100%",
            padding: "4px 6px",
            border: "1px solid #2e5b86",
            borderRadius: 4,
            fontSize: 12,
            outline: "none",
            textAlign: "left",
            boxSizing: "border-box",
          }}
        />

        {showDropdown && searchQuery.trim() && filteredOpts.length > 0 && (
          <div
            ref={dropdownRef}
            style={{
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
              zIndex: 99999,
              textAlign: "left",
            }}
          >
            {filteredOpts.map((opt: any) => {
              const rawName = String(opt.option_name || "");
              const isRent = rawName.includes("임대");

              if (isRent) {
                return (
                  <div
                    key={opt.option_id}
                    style={{
                      padding: "10px 12px",
                      borderBottom: "1px solid #eee",
                      textAlign: "left",
                      background: "#fff",
                    }}
                    // ✅ dropdown 클릭 시 blur 먼저 와도 옵션 선택이 우선되게 mousedown 사용
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <div style={{ fontWeight: 700 }}>{rawName}</div>
                    <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>
                      {opt.unit || "EA"} · {money(opt.unit_price || 0)}원
                    </div>

                    <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
                      <input
                        type="number"
                        defaultValue={1}
                        min={1}
                        id={`rent-inline-${opt.option_id}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: 40,
                          padding: "4px",
                          border: "1px solid #ccc",
                          borderRadius: 4,
                          textAlign: "center",
                          fontSize: 11,
                        }}
                      />
                      <span style={{ fontSize: 11 }}>개월</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const input = document.getElementById(
                            `rent-inline-${opt.option_id}`
                          ) as HTMLInputElement;
                          const months = Number(input?.value) || 1;

                          onSelectOption({ ...opt, _months: months });

                          // ✅ 선택했으면 편집 종료
                          setShowDropdown(false);
                          setIsEditing(false);
                          setSearchQuery("");
                        }}
                        style={{
                          padding: "4px 8px",
                          background: "#e3f2fd",
                          border: "none",
                          borderRadius: 4,
                          cursor: "pointer",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        선택
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={opt.option_id}
                  // ✅ blur 전에 먼저 실행되게 mousedown
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelectOption(opt);

                    setShowDropdown(false);
                    setIsEditing(false);
                    setSearchQuery("");
                  }}
                  style={{
                    padding: "10px 12px",
                    cursor: "pointer",
                    borderBottom: "1px solid #eee",
                    fontSize: 12,
                    textAlign: "left",
                    background: "#fff",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#e3f2fd")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                >
                  <div style={{ fontWeight: 700, textAlign: "left" }}>{rawName}</div>
                  <div style={{ fontSize: 10, color: "#888", marginTop: 2, textAlign: "left" }}>
                    {opt.unit || "EA"} · {money(opt.unit_price || 0)}원
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <span
      onClick={() => {
        setSearchQuery(item.displayName || "");
        setIsEditing(true);
        // focus는 input에서 autoFocus로 처리
      }}
      style={{ cursor: "pointer", display: "block", width: "100%", textAlign: "left" }}
      title="클릭하여 수정"
    >
      {item.displayName || " "}
    </span>
  );
}
function EmptyRowSearchCell({ 
  options, 
  current,
  onAddItem 
}: { 
  options: any[]; 
  current: QuoteRow | null;
  onAddItem: (item: any) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [sites, setSites] = useState<any[]>([]);
  const [isSearchingSite, setIsSearchingSite] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ✅ 최신 값 참조용 ref 추가
  const searchQueryRef = useRef(searchQuery);
  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  // ✅ 자유 입력 저장 함수
  const commitFreeText = useCallback(() => {
    const trimmed = (searchQueryRef.current || "").trim();
    if (trimmed) {
      onAddItem({
        key: `item_${Date.now()}`,
        optionId: null,
        optionName: trimmed,
        displayName: trimmed,
        unit: "EA",
        qty: 1,
        unitPrice: 0,
        amount: 0,
        showSpec: "n",
        lineSpec: { w: current?.w || 3, l: current?.l || 6, h: 2.6 },
      });
    }
    setShowDropdown(false);
    setIsEditing(false);
    setSearchQuery("");
    setSites([]);
  }, [onAddItem, current]);

  const filteredOpts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return options.filter((o: any) => {
      const name = String(o.option_name || "").toLowerCase();
      return name.includes(q) || matchKorean(name, q);
    }).slice(0, 10);
  }, [searchQuery, options]);

  useEffect(() => {
    const searchSites = async () => {
      if (!searchQuery.trim()) {
        setSites([]);
        return;
      }
      setIsSearchingSite(true);
      try {
        const w = current?.w || 3;
        const l = current?.l || 6;
        const { list } = await searchSiteRates(searchQuery.trim(), w, l);
        const q = searchQuery.trim().toLowerCase();
        const filtered = list.filter((s: any) => {
          const alias = String(s.alias || "").toLowerCase();
          return alias.includes(q) || matchKorean(alias, q);
        });
        setSites(filtered.slice(0, 5));
      } catch (e) {
        setSites([]);
      }
      setIsSearchingSite(false);
    };
    const timer = setTimeout(searchSites, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, current]);

useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        // ✅ 바깥 클릭 시 자유입력 저장
        commitFreeText();
      }
    };
    if (isEditing) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isEditing, commitFreeText]);

  const handleSelectOption = (opt: any) => {
    const w = current?.w || 3;
    const l = current?.l || 6;
    const res = calculateOptionLine(opt, w, l);
    const rawName = String(opt.option_name || "");
    const rent = rawName.includes("임대");
    const months = opt._months || 1;
    const customerUnitPrice = rent ? Number(res.unitPrice || 0) * months : Number(res.amount || 0);
    
    onAddItem({
      key: `item_${Date.now()}`,
      optionId: opt.option_id,
      optionName: rawName,
      displayName: rent ? `${rawName} ${months}개월` : rawName,
      unit: rent ? "개월" : (res.unit || "EA"),
      qty: 1,
      unitPrice: customerUnitPrice,
      amount: customerUnitPrice,
      showSpec: opt.show_spec || "n",
      lineSpec: { w, l, h: 2.6 },
      months: months,
    });
    
    setShowDropdown(false);
    setIsEditing(false);
    setSearchQuery("");
    setSites([]);
  };

  const handleSelectDelivery = (site: any, type: 'delivery' | 'crane') => {
    const price = type === 'delivery' ? site.delivery : site.crane;
    const name = type === 'delivery' ? `5톤 일반트럭 운송비-${site.alias}` : `크레인 운송비-${site.alias}`;
    
    onAddItem({
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
    });
    
    setShowDropdown(false);
    setIsEditing(false);
    setSearchQuery("");
    setSites([]);
  };

  if (!isEditing) {
    return (
      <span
        onClick={() => setIsEditing(true)}
        style={{ cursor: 'pointer', display: 'block', width: '100%', color: '#999' }}
      >
        + 품목/운송비 추가
      </span>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
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
            commitFreeText();  // ✅ Enter로 자유입력 저장
          } else if (e.key === "Escape") {
            e.preventDefault();
            setShowDropdown(false);
            setIsEditing(false);
            setSearchQuery("");
            setSites([]);
          }
        }}
        placeholder="품목 또는 지역 검색..."
        autoFocus
        style={{ 
          width: '100%', 
          padding: '4px 6px', 
          border: '1px solid #2e5b86', 
          borderRadius: 4,
          fontSize: 12, 
          outline: 'none',
        }}
      />
      {showDropdown && searchQuery.trim() && (
        <div 
          ref={dropdownRef}
          style={{ 
            position: 'absolute', 
            top: '100%', 
            left: 0, 
            width: '320px',
            maxHeight: 350, 
            overflowY: 'auto', 
            background: '#fff', 
            border: '1px solid #ccc',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)', 
            zIndex: 99999,
          }}
        >
          {/* 운송비 섹션 */}
          {sites.length > 0 && (
            <>
              <div style={{ padding: '6px 10px', background: '#f5f5f5', fontSize: 11, fontWeight: 700, color: '#666' }}>운송비</div>
              {sites.map((site: any, idx: number) => (
                <div key={`site-${idx}`} style={{ padding: '8px 10px', borderBottom: '1px solid #eee' }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{site.alias}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button 
                      onClick={() => handleSelectDelivery(site, 'delivery')} 
                      style={{ flex: 1, padding: '6px 8px', background: '#e3f2fd', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}
                    >
                      일반 {money(site.delivery)}원
                    </button>
                    <button 
                      onClick={() => handleSelectDelivery(site, 'crane')} 
                      style={{ flex: 1, padding: '6px 8px', background: '#fff3e0', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}
                    >
                      크레인 {money(site.crane)}원
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
          
          {/* 품목 섹션 */}
          {filteredOpts.length > 0 && (
            <>
              <div style={{ padding: '6px 10px', background: '#f5f5f5', fontSize: 11, fontWeight: 700, color: '#666' }}>품목</div>
              {filteredOpts.map((opt: any) => {
                const isRent = String(opt.option_name || "").includes("임대");
                
                if (isRent) {
                  return (
                    <div key={opt.option_id} style={{ padding: '8px 10px', borderBottom: '1px solid #eee' }}>
                      <div style={{ fontWeight: 700 }}>{opt.option_name}</div>
                      <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{opt.unit || 'EA'} · {money(opt.unit_price || 0)}원</div>
                      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input
                          type="number"
                          defaultValue={1}
                          min={1}
                          id={`rent-empty-${opt.option_id}`}
                          onClick={(e) => e.stopPropagation()}
                          style={{ width: 40, padding: '4px', border: '1px solid #ccc', borderRadius: 4, textAlign: 'center', fontSize: 11 }}
                        />
                        <span style={{ fontSize: 11 }}>개월</span>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            const input = document.getElementById(`rent-empty-${opt.option_id}`) as HTMLInputElement;
                            const months = Number(input?.value) || 1;
                            handleSelectOption({ ...opt, _months: months });
                          }}
                          style={{ padding: '4px 8px', background: '#e3f2fd', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
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
                    onClick={() => handleSelectOption(opt)}
                    style={{ 
                      padding: '8px 10px', 
                      cursor: 'pointer', 
                      borderBottom: '1px solid #eee', 
                      fontSize: 12,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#e3f2fd')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                  >
                    <div style={{ fontWeight: 700 }}>{opt.option_name}</div>
                    <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
                      {opt.unit || 'EA'} · {money(opt.unit_price || 0)}원
                    </div>
                  </div>
                );
              })}
            </>
          )}
          
          {filteredOpts.length === 0 && sites.length === 0 && !isSearchingSite && (
            <div style={{ padding: '10px', color: '#999', fontSize: 12 }}>검색 결과 없음</div>
          )}
          {isSearchingSite && <div style={{ padding: '10px', color: '#999', fontSize: 12 }}>검색 중...</div>}
        </div>
      )}
    </div>
  );
}
// ============ 인라인 텍스트 편집 셀 ============
function EditableTextCell({ value, onChange, editable = true }: { value: string; onChange: (val: string) => void; editable?: boolean }) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { 
    if (isEditing && inputRef.current) { 
      inputRef.current.focus(); 
      inputRef.current.select(); 
    } 
  }, [isEditing]);
  
  useEffect(() => { 
    setTempValue(value); 
  }, [value]);

  const handleBlur = () => { 
    setIsEditing(false); 
    onChange(tempValue); 
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleBlur();
    } else if (e.key === "Escape") {
      setTempValue(String(value));
      setIsEditing(false);
    }
  };

  if (!editable) {
    return <span style={{ display: "block", width: "100%", textAlign: "left" }}>{value || "(-)"}</span>;
  }

  if (isEditing) {
    return (
      <input 
        ref={inputRef} 
        type="text" 
        value={tempValue} 
        onChange={(e) => setTempValue(e.target.value)} 
        onBlur={handleBlur} 
        onKeyDown={handleKeyDown} 
        style={{ width: "100%", padding: "2px 4px", border: "1px solid #2e5b86", fontSize: 12, outline: "none", textAlign: "left" }} 
      />
    );
  }
  
  return (
    <span 
      onClick={() => setIsEditing(true)} 
      style={{ cursor: "pointer", display: "block", width: "100%", textAlign: "left" }} 
      title="클릭하여 수정"
    >
      {value || "(-)"}
    </span>
  );
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



// ✅ 자유입력/옵션선택 모두에서 "이름 변경"은 이것 하나만 사용
const updateEditItemName = useCallback((itemKey: string, name: string) => {
  const rawName = (name || "").trim();
  if (!rawName) return;

  setEditItems(prev =>
    prev.map(i => {
      if (i.key !== itemKey) return i;

      const isRent = i.unit === "개월";
      const qty = Number(i.qty || 1);
      const unitPrice = Number(i.unitPrice || 0);
      const months = Number(i.months || 1);

      return {
        ...i,
        optionId: null, // ✅ 자유입력은 옵션ID 제거
        optionName: rawName,
        displayName: isRent ? `${rawName} ${months}개월` : rawName,
        amount: qty * unitPrice,
      };
    })
  );
}, []);



  const updateEditItemQty = (key: string, newQty: number) => {
    setEditItems(prev => prev.map(item => 
      item.key === key 
        ? { ...item, qty: newQty, amount: newQty * item.unitPrice }
        : item
    ));
  };

  const updateEditItemPrice = (key: string, newPrice: number) => {
    setEditItems(prev => prev.map(item => 
      item.key === key 
        ? { ...item, unitPrice: newPrice, amount: item.qty * newPrice }
        : item
    ));
  };

 

  const deleteEditItem = (key: string) => {
    setEditItems(prev => prev.filter(item => item.key !== key));
  };

const addEditItemFromOption = (opt: any) => {
  if (!current) return;
  const w = current.w || 3;
  const l = current.l || 6;
  const res = calculateOptionLine(opt, w, l);
  const rawName = String(opt.option_name || "(이름없음)");
  const rent = rawName.includes("임대");
  const months = opt._months || 1;
  
  setEditItems(prev => [...prev, {
    key: `item_${Date.now()}`,
    optionId: opt.option_id,
    optionName: rawName,
    displayName: rent ? `${rawName} ${months}개월` : rawName,
    unit: rent ? "개월" : (res.unit || "EA"),
    qty: 1,
    unitPrice: rent ? Number(res.unitPrice || 0) * months : Number(res.amount || 0),
    amount: rent ? Number(res.unitPrice || 0) * months : Number(res.amount || 0),
    showSpec: opt.show_spec || "n",
    lineSpec: { w, l, h: 2.6 },
    months: months,
  }]);
  setOptQ("");
};
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
    }));

    const supply_amount = itemsToSave.reduce((acc: number, it: any) => acc + Number(it.amount || 0), 0);
    const vat_amount = Math.round(supply_amount * 0.1);
    const total_amount = supply_amount + vat_amount;

    const { error, data } = await supabase
      .from("quotes")
      .update({
        items: itemsToSave,
        supply_amount,
        vat_amount,
        total_amount,
        updated_at: new Date().toISOString(),
        // ✅ editForm 정보도 함께 저장
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
      
      const { error } = await supabase
        .from("quotes")
        .update({ 
          status: "confirmed",
          contract_type: contractType,
          contract_date: new Date().toISOString().slice(0, 10)
        })
        .eq("quote_id", current!.quote_id);

      if (error) throw error;
      toast("계약 확정 완료!");
      
      if (onConfirmContract) {
        onConfirmContract(current!);
      }
      
      await loadList(q);
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
        .is("source", null)
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
    // ✅ 디버깅 추가
    
    console.log('=== 명함 디버깅 ===');
    console.log('selectedBizcardId:', selectedBizcardId);
    const selectedBizcard = bizcards.find((b: any) => b.id === selectedBizcardId);
    console.log('selectedBizcard:', selectedBizcard);
    console.log('bizcardImageUrl:', selectedBizcard?.image_url);
    
    
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

// ✅ select를 선택된 텍스트로 교체
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

// ✅ select를 선택된 텍스트로 교체
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

    // ✅ editForm 초기화 추가
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
        };
      }));
      setEditMode(false);
    }
  }, [current]);

  // ✅ 옵션 검색 결과 필터링 (한 번만 정의)
  const filteredOptions = useMemo(() => {
    const query = String(optQ || "").trim();
    if (!query) return [];

    const matched = options.filter((o: any) => {
      const name = String(o.option_name || "");
      return matchKorean(name, query);
    });

    const qLower = query.toLowerCase();
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
  }, [optQ, options]);
  
// ✅ 견적서 미리보기 HTML
// ✅ 견적서 미리보기 HTML
const quotePreviewHtml = useMemo(() => {
  if (!current) return null;

  // ✅ 항상 editItems 사용 (실시간 편집)
  const items = editItems;

  const customerName = editForm?.customer_name ?? current.customer_name ?? "";
  const customerEmail = editForm?.customer_email ?? current.customer_email ?? "";
  const customerPhone = editForm?.customer_phone ?? current.customer_phone ?? "";
  const siteName = editForm?.site_name ?? current.site_name ?? "";
  const spec = editForm?.spec ?? current.spec ?? "";
  
  const supplyAmount = editItems.reduce((acc, it) => acc + (it.qty * it.unitPrice), 0);
  const vatAmount = Math.round(supplyAmount * 0.1);
  const totalAmount = supplyAmount + vatAmount;

  const ymd = current.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const selectedBizcard = bizcards.find((b: any) => b.id === selectedBizcardId);
  const bizcardName = selectedBizcard?.name || "";
  const vatIncluded = current.vat_included !== false;
  const displayTotal = vatIncluded ? totalAmount : supplyAmount;
  const vatLabel = vatIncluded ? "부가세 포함" : "부가세 별도";
  const MIN_ROWS = 12;

  return (
    <div className="a4Sheet quoteSheet" id="a4SheetCapture">

      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 2px 10px', borderBottom: '2px solid #2e5b86', marginBottom: 10 }}>
        <img src="https://i.postimg.cc/VvsGvxFP/logo1.jpg" alt="logo" style={{ width: 160, height: 140 }} />
        <div style={{ flex: 1, textAlign: 'center', fontSize: 34, fontWeight: 900, letterSpacing: 6 }}>견 적 서</div>
        <div style={{ width: 140 }}></div>
      </div>

      {/* 기본 정보 테이블 - 수정 부분 */}
<table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #333', marginTop: 8 }}>
  <tbody>
    <tr>
      <th style={{ border: '1px solid #333', padding: 6, fontWeight: 900, textAlign: 'center', width: '15%' }}>담당자</th>
      <td style={{ border: '1px solid #333', padding: 6 }} colSpan={3}>
        <select value={selectedBizcardId} onChange={(e) => setSelectedBizcardId(e.target.value)} style={{ border: 'none', background: 'transparent', fontSize: 13, width: '100%', cursor: 'pointer' }}>
          {bizcards.map((b: any) => (<option key={b.id} value={b.id}>{b.name}</option>))}
        </select>
      </td>
      <th style={{ border: '1px solid #333', padding: 6, fontWeight: 900, textAlign: 'center', width: '15%' }}>견적일자</th>
      <td style={{ border: '1px solid #333', padding: 6 }}>{ymd}</td>
    </tr>
   <tr>
  <th style={{ border: '1px solid #333', padding: 6, fontWeight: 900, textAlign: 'center' }}>고객명</th>
  <td style={{ border: '1px solid #333', padding: 6 }} colSpan={3}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ flex: 1 }}>
        <EditableTextCell 
          value={customerName} 
          onChange={(val) => setEditForm((p: any) => ({ ...p, customer_name: val }))} 
        />
      </span>
      <span style={{ fontWeight: 900, marginLeft: 8, flexShrink: 0 }}>귀하</span>
    </div>
  </td>
  <th style={{ border: '1px solid #333', padding: 6, fontWeight: 900, textAlign: 'center' }}>공급자</th>
  <td style={{ border: '1px solid #333', padding: 6 }}>현대컨테이너</td>
</tr>
   <tr>
  <th style={{ border: '1px solid #333', padding: 6, fontWeight: 900, textAlign: 'center' }}>이메일</th>
  <td style={{ border: '1px solid #333', padding: 6, wordBreak: 'break-all' }}>
    <EditableTextCell 
      value={customerEmail} 
      onChange={(val) => setEditForm((p: any) => ({ ...p, customer_email: val }))} 
    />
  </td>
      <th style={{ border: '1px solid #333', padding: 6, fontWeight: 900, textAlign: 'center' }}>전화</th>
      <td style={{ border: '1px solid #333', padding: 6 }}>
        <EditableTextCell 
          value={customerPhone} 
          onChange={(val) => setEditForm((p: any) => ({ ...p, customer_phone: val }))} 
        />
      </td>
      <th style={{ border: '1px solid #333', padding: 6, fontWeight: 900, textAlign: 'center' }}>등록번호</th>
      <td style={{ border: '1px solid #333', padding: 6 }}>130-41-38154</td>
    </tr>
    <tr>
      <th style={{ border: '1px solid #333', padding: 6, fontWeight: 900, textAlign: 'center' }}>현장</th>
      <td style={{ border: '1px solid #333', padding: 6 }}>
        <EditableTextCell 
          value={siteName} 
          onChange={(val) => setEditForm((p: any) => ({ ...p, site_name: val }))} 
        />
      </td>
      <th style={{ border: '1px solid #333', padding: 6, fontWeight: 900, textAlign: 'center' }}>규격</th>
      <td style={{ border: '1px solid #333', padding: 6 }}>
        <EditableTextCell 
          value={spec} 
          onChange={(val) => setEditForm((p: any) => ({ ...p, spec: val }))} 
        />
      </td>
      <th style={{ border: '1px solid #333', padding: 6, fontWeight: 900, textAlign: 'center' }}>주소</th>
      <td style={{ border: '1px solid #333', padding: 6 }}>경기도 화성시 향남읍 구문천안길16</td>
    </tr>
  <tr>
  <td style={{ border: '1px solid #333', padding: 6, fontWeight: 900, fontSize: 14 }} colSpan={6}>
    합계금액 : ₩{money(current.vat_included !== false ? totalAmount : supplyAmount)} (<select 
      value={current.vat_included !== false ? "included" : "excluded"} 
      onChange={async (e) => {
        const newValue = e.target.value === "included";
        await supabase.from("quotes").update({ vat_included: newValue }).eq("quote_id", current.quote_id);
        setCurrent({ ...current, vat_included: newValue });
      }}
      style={{ 
        border: 'none', 
        background: 'transparent', 
        fontSize: 14, 
        fontWeight: 900, 
        cursor: 'pointer',
        width: 'auto',
        display: 'inline'
      }}
    ><option value="included">부가세 포함</option><option value="excluded">부가세 미포함</option></select>)
  </td>
</tr>
  </tbody>
</table>

    {/* 옵션 검색 (편집 모드) */}


      {/* 품목 테이블 */}
{/* 품목 테이블 */}
<table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #333', marginTop: 8, overflow: 'visible' }}>
  <thead>
    <tr>
      <th style={{ border: '1px solid #333', padding: 6, background: '#e6e6e6', fontWeight: 900, width: '5%' }}>순번</th>
      <th style={{ border: '1px solid #333', padding: 6, background: '#e6e6e6', fontWeight: 900, width: '33%' }}>품목</th>
      <th style={{ border: '1px solid #333', padding: 6, background: '#e6e6e6', fontWeight: 900, width: '10%' }}>규격</th>
      <th style={{ border: '1px solid #333', padding: 6, background: '#e6e6e6', fontWeight: 900, width: '8%' }}>수량</th>
      <th style={{ border: '1px solid #333', padding: 6, background: '#e6e6e6', fontWeight: 900, width: '13%' }}>단가</th>
      <th style={{ border: '1px solid #333', padding: 6, background: '#e6e6e6', fontWeight: 900, width: '13%' }}>공급가</th>
      <th style={{ border: '1px solid #333', padding: 6, background: '#e6e6e6', fontWeight: 900, width: '10%' }}>세액</th>
      <th style={{ border: '1px solid #333', padding: 6, background: '#e6e6e6', fontWeight: 900, width: '8%' }}>비고</th>
    </tr>
  </thead>
  <tbody>
{items.map((item: any, idx: number) => {
  const supply = item.qty * item.unitPrice;
  const vat = Math.round(supply * 0.1);
  const showSpec = String(item.showSpec || "").toLowerCase() === "y";
  const specText = showSpec && item.lineSpec ? `${item.lineSpec.w}x${item.lineSpec.l}x${item.lineSpec.h || 2.6}` : "";

  return (
    <tr key={item.key || idx}>
      <td style={{ border: '1px solid #333', padding: '2px 6px', textAlign: 'center', height: 24, maxHeight: 24, overflow: 'hidden' }}>{idx + 1}</td>
     <td style={{ border: '1px solid #333', padding: '2px 6px', textAlign: 'left', height: 24, maxHeight: 24, overflow: 'visible', position: 'relative' }}>

        <InlineItemSearchCell
          item={item}
          options={options}
          onSelectOption={(opt) => {
            const w = current?.w || 3;
            const l = current?.l || 6;
            const res = calculateOptionLine(opt, w, l);
            const rawName = String(opt.option_name || "");
            const rent = rawName.includes("임대");
            const customerUnitPrice = rent ? Number(res.unitPrice || 0) : Number(res.amount || 0);
            
            setEditItems(prev => prev.map(i => i.key !== item.key ? i : {
              ...i,
              optionId: opt.option_id,
              optionName: rawName,
              displayName: rent ? `${rawName} 1개월` : rawName,
              unit: rent ? "개월" : (res.unit || "EA"),
              qty: 1,
              unitPrice: customerUnitPrice,
              amount: customerUnitPrice,
              showSpec: opt.show_spec || "n",
              lineSpec: { w, l, h: 2.6 },
            }));
          }}
          onUpdateName={(name) => updateEditItemName(item.key, name)}
          onDelete={() => deleteEditItem(item.key)}
          editable={editMode}
        />
      </td>
      <td style={{ border: '1px solid #333', padding: '2px 6px', textAlign: 'center', height: 24, maxHeight: 24, overflow: 'hidden' }}>
        <EditableTextCell 
          value={specText} 
          onChange={(val) => {
            const parts = val.split('x').map(s => parseFloat(s.trim()));
            if (parts.length >= 2) {
              setEditItems(prev => prev.map(it => it.key !== item.key ? it : {
                ...it,
                lineSpec: { 
                  w: parts[0] || it.lineSpec?.w || 3, 
                  l: parts[1] || it.lineSpec?.l || 6, 
                  h: parts[2] || it.lineSpec?.h || 2.6 
                },
                showSpec: 'y'
              }));
            } else if (val.trim() === '') {
              setEditItems(prev => prev.map(it => it.key !== item.key ? it : {
                ...it,
                showSpec: 'n'
              }));
            }
          }}
          editable={editMode}
        />
      </td>
      <td style={{ border: '1px solid #333', padding: '2px 6px', textAlign: 'center', height: 24, maxHeight: 24, overflow: 'hidden' }}>
        <EditableNumberCell value={item.qty} onChange={(val) => updateEditItemQty(item.key, val)} editable={editMode} />
      </td>
      <td style={{ border: '1px solid #333', padding: '2px 6px', textAlign: 'right', height: 24, maxHeight: 24, overflow: 'hidden' }}>
        <EditableNumberCell value={item.unitPrice} onChange={(val) => updateEditItemPrice(item.key, val)} editable={editMode} />
      </td>
      <td style={{ border: '1px solid #333', padding: '2px 6px', textAlign: 'right', height: 24, maxHeight: 24, overflow: 'hidden', whiteSpace: 'nowrap' }}>{money(supply)}</td>
      <td style={{ border: '1px solid #333', padding: '2px 6px', textAlign: 'right', height: 24, maxHeight: 24, overflow: 'hidden', whiteSpace: 'nowrap' }}>{money(vat)}</td>
      <td style={{ border: '1px solid #333', padding: '2px 6px', textAlign: 'center', height: 24, maxHeight: 24, overflow: 'hidden' }}>
        {editMode && (
          <button onClick={() => deleteEditItem(item.key)} style={{ color: '#e53935', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 'bold', padding: 0, margin: 0, lineHeight: 1, fontSize: 12 }}>✕</button>
        )}
      </td>
    </tr>
  );
})}
{Array.from({ length: Math.max(0, MIN_ROWS - items.length) }).map((_, i) => (
  <tr key={`blank-${i}`}>
    {i === 0 && editMode ? (
      <>
        <td style={{ border: '1px solid #333', padding: '2px 6px', textAlign: 'center', height: 24 }}>{items.length + 1}</td>
        <td style={{ border: '1px solid #333', padding: '2px 6px', textAlign: 'left', height: 24, overflow: 'visible', position: 'relative' }}>
          <EmptyRowSearchCell
            options={options}
            current={current}
            onAddItem={(newItem) => setEditItems(prev => [...prev, newItem])}
          />
        </td>
        <td style={{ border: '1px solid #333', padding: '2px 6px', height: 24 }}></td>
        <td style={{ border: '1px solid #333', padding: '2px 6px', height: 24 }}></td>
        <td style={{ border: '1px solid #333', padding: '2px 6px', height: 24 }}></td>
        <td style={{ border: '1px solid #333', padding: '2px 6px', height: 24 }}></td>
        <td style={{ border: '1px solid #333', padding: '2px 6px', height: 24 }}></td>
        <td style={{ border: '1px solid #333', padding: '2px 6px', height: 24 }}></td>
      </>
    ) : (
      <>
        <td style={{ border: '1px solid #333', padding: '2px 6px', height: 24 }}>&nbsp;</td>
        <td style={{ border: '1px solid #333', padding: '2px 6px', height: 24 }}></td>
        <td style={{ border: '1px solid #333', padding: '2px 6px', height: 24 }}></td>
        <td style={{ border: '1px solid #333', padding: '2px 6px', height: 24 }}></td>
        <td style={{ border: '1px solid #333', padding: '2px 6px', height: 24 }}></td>
        <td style={{ border: '1px solid #333', padding: '2px 6px', height: 24 }}></td>
        <td style={{ border: '1px solid #333', padding: '2px 6px', height: 24 }}></td>
        <td style={{ border: '1px solid #333', padding: '2px 6px', height: 24 }}></td>
      </>
    )}
  </tr>
))}
  </tbody>
</table>


{/* 하단 합계/조건 테이블 1 - 합계 행 */}
<table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #333', marginTop: 8 }}>
  <colgroup>
    <col style={{ width: '5%' }} />
    <col style={{ width: '31%' }} />
    <col style={{ width: '10%' }} />
    <col style={{ width: '8%' }} />
    <col style={{ width: '13%' }} />
    <col style={{ width: '13%' }} />
    <col style={{ width: '10%' }} />
    <col style={{ width: '8%' }} />
  </colgroup>
  <tbody>
    <tr>
      <td style={{ border: '1px solid #333', padding: 6, background: '#e6e6e6', fontWeight: 900 }} colSpan={5}>
        합계: {money(current.vat_included !== false ? totalAmount : supplyAmount)}원 ({current.vat_included !== false ? "부가세 포함" : "부가세 별도"})
      </td>
      <td style={{ border: '1px solid #333', padding: 6, background: '#e6e6e6', fontWeight: 900, textAlign: 'right' }}>{money(supplyAmount)}</td>
      <td style={{ border: '1px solid #333', padding: 6, background: '#e6e6e6', fontWeight: 900, textAlign: 'right' }}>{money(vatAmount)}</td>
      <td style={{ border: '1px solid #333', padding: 6, background: '#e6e6e6' }}></td>
    </tr>
  </tbody>
</table>

{/* 하단 조건 테이블 2 - 결제조건/주의사항/중요사항 */}
<table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #333', borderTop: 'none' }}>
  <colgroup>
    <col style={{ width: '12%' }} />
    <col style={{ width: '88%' }} />
  </colgroup>
  <tbody>
  <tr>
  <th style={{ border: '1px solid #333', padding: '8px 10px', background: '#e6e6e6', fontWeight: 900, textAlign: 'center', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>결제조건</th>
  <td style={{ border: '1px solid #333', padding: '8px 10px', fontSize: 12, lineHeight: 1.6, verticalAlign: 'middle' }}>계약금 50%입금 후 도면제작 및 확인/착수, 선 완불 후 출고</td>
</tr>
<tr>
  <th style={{ border: '1px solid #333', padding: '8px 10px', background: '#e6e6e6', fontWeight: 900, textAlign: 'center', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>주의사항</th>
  <td style={{ border: '1px solid #333', padding: '8px 10px', fontSize: 12, lineHeight: 1.6, verticalAlign: 'top' }}>
    *견적서는 견적일로 부터 2주간 유효합니다.<br />
    1. 하차비 별도(당 지역 지게차 혹은 크레인 이용)<br />
    2. 주문 제작시 50퍼센트 입금 후 제작, 완불 후 출고. /임대의 경우 계약금 없이 완불 후 출고<br />
    *출고 전날 오후 2시 이전 잔금 결제 조건*<br />
    3. 하차, 회수시 상차 별도(당 지역 지게차 혹은 크레인 이용)
  </td>
</tr>
<tr>
  <th style={{ border: '1px solid #333', padding: '8px 10px', background: '#e6e6e6', fontWeight: 900, textAlign: 'center', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>중요사항</th>
  <td style={{ border: '1px solid #333', padding: '8px 10px', fontSize: 12, lineHeight: 1.6, verticalAlign: 'top' }}>
    1. 인적사항 요구 현장시 운임비 3만원 추가금 발생합니다.<br />
    2. 기본 전기는 설치 되어 있으나 주택용도 전선관은 추가되어 있지 않습니다.<br />
    한전/전기안전공사 측에서 전기연결 예정이신 경우 전선관 옵션을 추가하여 주시길 바랍니다.<br />
    해당사항은 고지의무사항이 아니므로 상담을 통해 확인하시길 바랍니다.
  </td>
</tr>
  </tbody>
</table>
    </div>
  );
}, [current, bizcards, selectedBizcardId, editMode, editItems, editForm, optQ, filteredOptions, options]);

// ✅ 거래명세서 미리보기 - HTML 디자인에 맞춤
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

    // 스타일 정의
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
        {/* 제목 */}
        <div style={{ textAlign: 'center', marginBottom: 5 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#1a5276', letterSpacing: 8 }}>거래명세서</div>
          <div style={{ fontSize: 11, color: '#666' }}>[ 공급받는자 보관용 ]</div>
        </div>

        {/* 상단 정보 영역 */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
          {/* 왼쪽 - 거래처 정보 */}
          <table style={{ borderCollapse: 'collapse', width: '45%' }}>
  <tbody>
    <tr>
      <th style={{ ...thStyle, width: '80px' }}>일자</th>
      <td style={tdStyle}>{ymd}</td>
    </tr>
    <tr>
      <th style={{ ...thStyle, width: '80px' }}>거래처</th>
      <td style={tdStyle}>{customerName}</td>
    </tr>
    <tr>
      <th style={{ ...thStyle, width: '80px' }}>등록번호</th>
      <td style={tdStyle}></td>
    </tr>
    <tr>
      <th style={{ ...thStyle, width: '80px' }}>주소</th>
      <td style={tdStyle}></td>
    </tr>
    <tr>
      <th style={{ ...thStyle, width: '80px' }}>전화번호</th>
      <td style={tdStyle}>{customerPhone}</td>
    </tr>
  </tbody>
</table>

          {/* 오른쪽 - 공급자 정보 */}
          <table style={{ borderCollapse: 'collapse', width: '55%' }}>
            <tbody>
              <tr>
                <th style={thStyle}>등록번호</th>
                <td style={tdStyle}>130-41-38154</td>
                <th style={thStyle}>성명</th>
                <td style={tdStyle}>류창석</td>
              </tr>
              <tr>
                <th style={thStyle}>상호</th>
                <td style={tdStyle}>
                  현대컨테이너 
                  <span style={{ 
                    display: 'inline-block', 
                    width: 18, 
                    height: 18, 
                    border: '2px solid #c0392b', 
                    borderRadius: '50%', 
                    color: '#c0392b', 
                    fontSize: 9, 
                    textAlign: 'center', 
                    lineHeight: '16px',
                    marginLeft: 5,
                  }}>印</span>
                </td>
                <th style={thStyle}>주소</th>
                <td style={tdStyle}>화성시구문천안길16</td>
              </tr>
              <tr>
                <th style={thStyle}>업태</th>
                <td style={tdStyle}>컨테이너 판매 임대</td>
                <th style={thStyle}>종목</th>
                <td style={tdStyle}>제조업,도소매</td>
              </tr>
              <tr>
                <th style={thStyle}>전화번호</th>
                <td style={tdStyle}>010-4138-9268</td>
                <th style={thStyle}>팩스번호</th>
                <td style={tdStyle}>031-359-8246</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 합계금액 줄 */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          background: '#fff', 
          border: '1px solid #5b9bd5',
          padding: '8px 12px',
          marginBottom: 8,
        }}>
          <span style={{ fontWeight: 900, color: '#1a5276', marginRight: 10 }}>합계금액:</span>
          <span style={{ fontSize: 18, fontWeight: 900, marginRight: 30 }}>{money(totalAmount)}</span>
          <span style={{ fontSize: 11, marginLeft: 'auto' }}>기업은행 465-096127-04-015 현대컨테이너 류창석</span>
        </div>

        {/* 품목 테이블 */}
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
                <td style={itemTdStyle}>&nbsp;</td>
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
  }, [current, bizcards, selectedBizcardId]);

  // ✅ 임대차계약서 미리보기 - HTML 양식에 맞춤
  const rentalPreviewHtml = useMemo(() => {
    if (!current) return null;

    const items = pickItems(current);
    const customerName = current.customer_name ?? "";
    const customerPhone = current.customer_phone ?? "";
    const customerEmail = current.customer_email ?? "";
    const spec = current.spec ?? "3*6";
    const siteName = current.site_name ?? "";

    const today = new Date();
    const ymd = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;

    // 임대 품목 + 운송 품목
    const rentalItems = items.filter(it => {
      const name = it.optionName || it.displayName || it.item_name || "";
      return String(name).includes("임대") || String(name).includes("운송");
    });

    // 합계 계산 (VAT 별도)
    const totalAmount = rentalItems.reduce((acc, raw) => {
      const it = normItem(raw);
      return acc + (it.unitPrice * it.qty);
    }, 0);

    const MIN_ROWS = 8;

    // 스타일 정의
    const thStyle: React.CSSProperties = {
      border: '1px solid #999',
      padding: '6px 4px',
      background: '#fff',
      fontWeight: 700,
      fontSize: 11,
      textAlign: 'center' as const,
    };
    const tdStyle: React.CSSProperties = {
      border: '1px solid #999',
      padding: '6px 4px',
      fontSize: 11,
      height: 22,
    };
    const conditionThStyle: React.CSSProperties = {
      border: '1px solid #2e86de',
      padding: '6px 8px',
      background: '#fff',
      fontWeight: 700,
      fontSize: 11,
      textAlign: 'center' as const,
    };
    const conditionTdStyle: React.CSSProperties = {
      border: '1px solid #2e86de',
      padding: '6px 8px',
      fontSize: 11,
      textAlign: 'center' as const,
    };
    const partyThStyle: React.CSSProperties = {
      border: '1px solid #999',
      padding: '5px 8px',
      background: '#fff',
      fontWeight: 400,
      fontSize: 11,
      textAlign: 'center' as const,
      width: 30,
    };
    const partyTdStyle: React.CSSProperties = {
      border: '1px solid #999',
      padding: '5px 8px',
      fontSize: 11,
    };
    const partyHeaderStyle: React.CSSProperties = {
      border: '1px solid #999',
      padding: '8px',
      background: '#fff',
      fontWeight: 900,
      fontSize: 12,
      textAlign: 'center' as const,
    };

    return (
      <div className="a4Sheet" style={{ background: '#fff', padding: '30px 40px', width: 794 }}>
        {/* 헤더 */}
        <div style={{ position: 'relative', textAlign: 'center', marginBottom: 20 }}>
          <img 
            src="https://i.postimg.cc/VvsGvxFP/logo1.jpg" 
            alt="logo" 
            style={{ position: 'absolute', left: 0, top: 0, width: 110, height: 'auto' }} 
          />
          <div style={{ fontSize: 30, fontWeight: 900, color: '#000', letterSpacing: 14, paddingTop: 5 }}>
            임 대 차 계 약 서
          </div>
        </div>

        {/* 소개 문구 */}
        <div style={{ textAlign: 'center', fontSize: 11, lineHeight: 1.8, marginBottom: 20, color: '#333' }}>
          "임대인(공급 하는 자)과, 임차인(공급 받는 자)이라 하여<br />
          아래와 같이 임대차 계약을 체결한다."
        </div>

        {/* 파란선 */}
        <div style={{ borderTop: '2px solid #2e86de', marginBottom: 15 }}></div>

        {/* 품목 테이블 */}
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
           {rentalItems.length > 0 ? rentalItems.map((raw, idx) => {
  const it = normItem(raw);
  const amount = it.unitPrice * it.qty;
  const isRental = String(it.name).includes("임대");
  return (
    <tr key={idx}>
      <td style={tdStyle}>{it.name}</td>
      <td style={{ ...tdStyle, textAlign: 'center' }}>{spec}</td>
      <td style={{ ...tdStyle, textAlign: 'center' }}>{isRental ? rentalForm.months : ""}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{money(it.unitPrice)}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{it.qty}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{money(amount)}</td>
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
            {/* 빈 행 추가 */}
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

        {/* 합계 */}
        <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 700, margin: '8px 0 15px 0' }}>
          합계(VAT별도) {money(totalAmount)}원
        </div>

        {/* 임대 조건 */}
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

        {/* 주의사항 */}
       {/* 주의사항 */}
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

        {/* 날짜 */}
        <div style={{ textAlign: 'center', fontSize: 12, marginBottom: 15 }}>{ymd}</div>

        {/* 임대인/임차인 정보 */}
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
              <th style={partyThStyle}>상호:</th>
              <td style={partyTdStyle}>현대 컨테이너</td>
              <th style={partyThStyle}>상호:</th>
              <td style={partyTdStyle}>{rentalForm.companyName}</td>
            </tr>
            <tr>
              <th style={partyThStyle}>등록번호:</th>
              <td style={partyTdStyle}>130-41-38154</td>
              <th style={partyThStyle}>등록번호:</th>
              <td style={partyTdStyle}>{rentalForm.regNo}</td>
            </tr>
            <tr>
              <th style={partyThStyle}>대표:</th>
              <td style={partyTdStyle}>류창석&nbsp;&nbsp;&nbsp;&nbsp;(인)</td>
              <th style={partyThStyle}>대표:</th>
              <td style={partyTdStyle}>{rentalForm.ceo}</td>
            </tr>
            <tr>
              <th style={partyThStyle}>주소:</th>
              <td style={partyTdStyle}>화성시 향남읍 구문천안길16</td>
              <th style={partyThStyle}>현장주소:</th>
              <td style={partyTdStyle}>{rentalForm.siteAddr || siteName}</td>
            </tr>
            <tr>
              <th style={partyThStyle}>연락처:</th>
              <td style={partyTdStyle}>010-4775-7557</td>
              <th style={partyThStyle}>연락처:</th>
              <td style={partyTdStyle}>{customerPhone}</td>
            </tr>
            <tr>
              <th style={partyThStyle}>연락처:</th>
              <td style={partyTdStyle}>010-4138-9268</td>
              <th style={partyThStyle}>사무실:</th>
              <td style={partyTdStyle}>{rentalForm.officePhone}</td>
            </tr>
            <tr>
              <th style={partyThStyle}>팩스:</th>
              <td style={partyTdStyle}>0504-392-4298</td>
              <th style={partyThStyle}>팩스:</th>
              <td style={partyTdStyle}>{rentalForm.fax}</td>
            </tr>
            <tr>
              <th style={partyThStyle}>메일:</th>
              <td style={partyTdStyle}><a href="mailto:hdcon20@naver.com" style={{ color: '#2e86de', textDecoration: 'underline' }}>hdcon20@naver.com</a></td>
              <th style={partyThStyle}>메일:</th>
             <td style={partyTdStyle}>{rentalForm.email || customerEmail}</td>
            </tr>
          </tbody>
        </table>

        {/* 푸터 */}
        <div style={{ textAlign: 'center', fontSize: 11, color: '#333' }}>
          서명하시고 fax 0504-392-4298이나 이메일<a href="mailto:hdcon20@naver.com" style={{ color: '#2e86de', textDecoration: 'underline' }}>hdcon20@naver.com</a>으로 회신부탁드립니다.
        </div>
      </div>
    );
  }, [current, rentalForm, bizcards, selectedBizcardId]);
  // 현재 탭에 따른 미리보기 컴포넌트
  const currentPreview = useMemo(() => {
    if (!current) {
      return (
        <div className="a4Sheet" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
          왼쪽에서 견적을 선택하세요.
        </div>
      );
    }

    switch (activeTab) {
      case "quote":
        return quotePreviewHtml;
      case "statement":
        return statementPreviewHtml;
      case "rental":
        return rentalPreviewHtml;
      default:
        return quotePreviewHtml;
    }
  }, [activeTab, current, quotePreviewHtml, statementPreviewHtml, rentalPreviewHtml]);
// 옵션 검색 결과 필터링



function addOptionFromSearch(opt: any) {
  if (!editForm) return;

  if (opt.sub_items && Array.isArray(opt.sub_items) && opt.sub_items.length > 0) {
    const newRows = opt.sub_items.map((sub: any) => ({
      category: "",
      name: sub.name || "",
      unit: sub.unit || "",
      qty: sub.qty || 0,
      unitPrice: sub.unitPrice || 0,
      amount: (sub.qty || 0) * (sub.unitPrice || 0),
      note: "",
      showSpec: "n",
    }));
    setEditForm((prev: any) => ({ ...prev, items: [...prev.items, ...newRows] }));
    setOptQ("");
    return;
  }

  const w = Number(editForm.w) || 3;
  const l = Number(editForm.l) || 6;
  const res = calculateOptionLine(opt, w, l);
  const rawName = String(opt.option_name || "(이름없음)");
  const rent = rawName.trim() === "임대";
  const baseQty = Number(res.qty || 1);
  const baseUnitPrice = Number(res.unitPrice || 0);
  const baseAmount = Number(res.amount || baseQty * baseUnitPrice);
  const displayQty = rent ? baseQty : 1;
  const customerUnitPrice = rent ? baseUnitPrice : baseAmount;
  const finalAmount = Math.round(displayQty * customerUnitPrice);
  const showSpec = String(opt.show_spec || "").toLowerCase();

  setEditForm((prev: any) => ({
    ...prev,
    items: [
      ...prev.items,
      {
        category: "",
        name: rawName,
        unit: rent ? "개월" : (res.unit || "EA"),
        qty: displayQty,
        unitPrice: customerUnitPrice,
        amount: finalAmount,
        note: res.memo || "",
        showSpec,
      },
    ],
  }));
  setOptQ("");
}

function addItem() {
  setEditForm((prev: any) => ({
    ...prev,
    items: [...prev.items, { category: "", name: "", unit: "EA", qty: 1, unitPrice: 0, amount: 0, note: "" }],
  }));
}

function removeItem(index: number) {
  setEditForm((prev: any) => ({
    ...prev,
    items: prev.items.filter((_: any, i: number) => i !== index),
    vat_included: current!.vat_included !== false,
  }));
}

function updateItem(index: number, field: string, value: any) {
  setEditForm((prev: any) => {
    const newItems = [...prev.items];
    newItems[index] = { ...newItems[index], [field]: value };
    if (field === "qty" || field === "unitPrice") {
      const qty = Number(newItems[index].qty) || 0;
      const unitPrice = Number(newItems[index].unitPrice) || 0;
      newItems[index].amount = qty * unitPrice;
    }
    return { ...prev, items: newItems };
  });
}

function openEditModal() {
  requireCurrent();
  const items = pickItems(current).map((raw) => {
    const it = normItem(raw);
    return {
      category: it.category,
      name: it.name,
      unit: it.unit,
      qty: it.qty,
      unitPrice: it.unitPrice,
      amount: it.amount,
      note: it.note,
    };
  });

  setEditForm({
    quote_title: current!.quote_title || "",
    bizcard_id: current!.bizcard_id || "",
    customer_name: current!.customer_name || "",
    customer_phone: current!.customer_phone || "",
    customer_email: current!.customer_email || "",
    site_name: current!.site_name || "",
    site_addr: current!.site_addr || "",
    spec: current!.spec || "",
    w: current!.w || 0,
    l: current!.l || 0,
    product: current!.product || "",
    qty: current!.qty || 1,
    memo: current!.memo || "",
    created_at: current!.created_at ? current!.created_at.slice(0, 10) : "",  // ✅ 추가
    items: items,
  });
  setOptQ("");
  setEditOpen(true);
}
async function saveEdit() {
  if (!current || !editForm) return;

  try {
    toast("저장 중...");

    const itemsToSave = editForm.items.map((it: any, idx: number) => ({
      optionId: it.optionId || `ITEM_${idx + 1}`,
      optionName: it.name || "",
      itemName: it.name || "",
      unit: it.unit || "EA",
      qty: Number(it.qty) || 0,
      unitPrice: Number(it.unitPrice) || 0,
      amount: Number(it.amount) || 0,
      memo: it.note || "",
    }));

    const supply_amount = itemsToSave.reduce((acc: number, it: any) => acc + Number(it.amount || 0), 0);
    const vat_amount = Math.round(supply_amount * 0.1);
    const total_amount = supply_amount + vat_amount;

    // ✅ created_at 포함
    const updateData: any = {
      quote_title: editForm.quote_title,
      customer_name: editForm.customer_name,
      customer_phone: editForm.customer_phone,
      customer_email: editForm.customer_email,
      site_name: editForm.site_name,
      site_addr: editForm.site_addr,
      spec: editForm.spec,
      w: Number(editForm.w) || null,
      l: Number(editForm.l) || null,
      product: editForm.product,
      qty: Number(editForm.qty) || 1,
      memo: editForm.memo,
      items: itemsToSave,
      supply_amount,
      vat_amount,
      total_amount,
      bizcard_id: editForm.bizcard_id || null,
      updated_at: new Date().toISOString(),
      vat_included: editForm.vat_included,
    };

    // ✅ 날짜가 변경됐으면 created_at도 업데이트
    if (editForm.created_at) {
      updateData.created_at = new Date(editForm.created_at).toISOString();
    }

    const { error, data } = await supabase
      .from("quotes")
      .update(updateData)
      .eq("quote_id", current.quote_id)
      .select();

    if (error) throw error;

    toast("저장 완료!");
    setOptQ("");
    setEditOpen(false);
    if (data && data[0]?.bizcard_id) {
      setSelectedBizcardId(data[0].bizcard_id);
    }
    await loadList(q);
    if (data && data[0]) setCurrent(data[0] as QuoteRow);
  } catch (e: any) {
    toast("저장 실패: " + (e?.message || String(e)));
  }
}
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
            <input
    value={q}
    onChange={(e) => setQ(e.target.value)}
    placeholder="견적 검색 (견적번호/고객/규격/제목/현장)"
  />
  <input
    type="date"
    value={dateFilter}
    onChange={(e) => setDateFilter(e.target.value)}
    style={{ marginTop: 8 }}
  />
  {dateFilter && (
    <button 
      onClick={() => setDateFilter("")}
      style={{ marginTop: 4, fontSize: 11, padding: '4px 8px' }}
    >
      날짜 필터 해제
    </button>
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
          {/* ✅ 탭 버튼 */}
          <div className="tabBar">
            <button
              className={`tabBtn ${activeTab === 'quote' ? 'active' : ''}`}
              onClick={() => setActiveTab('quote')}
            >
              견적서
            </button>
            <button
              className={`tabBtn ${activeTab === 'statement' ? 'active' : ''}`}
              onClick={() => setActiveTab('statement')}
            >
              거래명세서
            </button>
            <button
              className={`tabBtn ${activeTab === 'rental' ? 'active' : ''}`}
              onClick={() => setActiveTab('rental')}
            >
              임대차계약서
            </button>
          </div>

          {/* 액션 버튼 */}
         <div className="actions">
  <button onClick={() => (window.location.href = "/?view=rt")}>실시간견적</button>
  <button className="primary" onClick={openSendModal}>{getDocTitle()} 보내기</button>
  <button onClick={downloadJpg}>JPG저장</button>
  <button onClick={handlePrint}>인쇄</button>
 <button onClick={() => {
  if (editMode) {
    saveEditMode();  // 수정 완료 시 저장
  } else {
    setEditMode(true);  // 수정 모드 진입
  }
}}>
  {editMode ? "수정완료" : "견적수정"}
</button>
  <button 
    onClick={handleConfirmContract}
    style={{ background: '#059669', color: '#fff', borderColor: '#059669' }}
  >
    계약확정
  </button>
  <button className="danger" onClick={handleDelete}>삭제</button>
</div>

          {/* ✅ 임대차 폼 (임대차 탭일 때만 표시) */}
          {activeTab === 'rental' && current && (
            <div className="rentalFormBox">
              <div className="formRow">
                <label>계약시작</label>
                <input
                  value={rentalForm.contractStart}
                  onChange={(e) => setRentalForm({ ...rentalForm, contractStart: e.target.value })}
                  placeholder="26/01/15"
                />
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
                <input
                  value={rentalForm.companyName}
                  onChange={(e) => setRentalForm({ ...rentalForm, companyName: e.target.value })}
                />
                <label>사업자번호</label>
                <input
                  value={rentalForm.regNo}
                  onChange={(e) => setRentalForm({ ...rentalForm, regNo: e.target.value })}
                />
              </div>
              <div className="formRow">
                <label>대표자</label>
                <input
                  value={rentalForm.ceo}
                  onChange={(e) => setRentalForm({ ...rentalForm, ceo: e.target.value })}
                />
                <label>현장주소</label>
                <input
                  value={rentalForm.siteAddr}
                  onChange={(e) => setRentalForm({ ...rentalForm, siteAddr: e.target.value })}
                />
                <label>연락처</label>
      <input
        value={rentalForm.phone}
        onChange={(e) => setRentalForm({ ...rentalForm, phone: e.target.value })}
      />
      <label>사무실</label>
      <input
        value={rentalForm.officePhone}
        onChange={(e) => setRentalForm({ ...rentalForm, officePhone: e.target.value })}
      />
    </div>
    <div className="formRow">
      <label>팩스</label>
      <input
        value={rentalForm.fax}
        onChange={(e) => setRentalForm({ ...rentalForm, fax: e.target.value })}
      />
      <label>메일</label>
      <input
        value={rentalForm.email}
        onChange={(e) => setRentalForm({ ...rentalForm, email: e.target.value })}
      />
    </div>
  </div>
)}
          
          
       {/* 미리보기 */}
<div className="content">
  <div className="previewWrap" id="docPreview">
    {activeTab === 'quote' ? (
      quotePreviewHtml
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
              <div className="muted" style={{ marginBottom: 8 }}>
                비워두면 견적에 등록된 이메일로 전송합니다.
              </div>
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
                  {bizcards.map((b: any) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
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


{/* ✅ 견적 수정 모달 */}
{editOpen && editForm && (
  <div className="modal" style={{ display: "flex" }} onMouseDown={() => { setOptQ(""); setEditOpen(false); }}>
    <div className="modalCard" style={{ maxWidth: "1200px" }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="modalHdr">
        <div style={{ fontWeight: 800 }}>견적 수정</div>
        <span className="spacer" />
       <button onClick={() => setEditMode(!editMode)}>
  {editMode ? "수정완료" : "견적수정"}
</button>
      </div>
      <div className="modalBody" style={{ maxHeight: "80vh", overflow: "auto" }}>
        {/* 기본 정보 */}
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>기본 정보</h3>
          <div className="row" style={{ gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
  <input
    value={editForm.quote_title}
    onChange={(e) => setEditForm({ ...editForm, quote_title: e.target.value })}
    placeholder="견적 제목"
    style={{ flex: "1 1 200px", padding: "10px 12px", border: "1px solid #d7dbe2", borderRadius: 10 }}
  />
  <input
    type="date"
    value={editForm.created_at}
    onChange={(e) => setEditForm({ ...editForm, created_at: e.target.value })}
    style={{ flex: "0 0 150px", padding: "10px 12px", border: "1px solid #d7dbe2", borderRadius: 10 }}
  />
</div>
          <select
  value={editForm.vat_included ? "included" : "excluded"}
  onChange={(e) => setEditForm({ ...editForm, vat_included: e.target.value === "included" })}
  style={{ flex: "0 0 130px", padding: "10px 12px", border: "1px solid #d7dbe2", borderRadius: 10 }}
>
  <option value="included">부가세 포함</option>
  <option value="excluded">부가세 별도</option>
</select>
          <div className="row" style={{ gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <input
              value={editForm.customer_name}
              onChange={(e) => setEditForm({ ...editForm, customer_name: e.target.value })}
              placeholder="고객명"
              style={{ flex: "1 1 220px", padding: "10px 12px", border: "1px solid #d7dbe2", borderRadius: 10 }}
            />
            <input
              value={editForm.customer_phone}
              onChange={(e) => setEditForm({ ...editForm, customer_phone: e.target.value })}
              placeholder="연락처"
              style={{ flex: "1 1 220px", padding: "10px 12px", border: "1px solid #d7dbe2", borderRadius: 10 }}
            />
            <input
              value={editForm.customer_email}
              onChange={(e) => setEditForm({ ...editForm, customer_email: e.target.value })}
              placeholder="이메일"
              style={{ flex: "1 1 220px", padding: "10px 12px", border: "1px solid #d7dbe2", borderRadius: 10 }}
            />
          </div>
          <div className="row" style={{ gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <input
              value={editForm.site_name}
              onChange={(e) => setEditForm({ ...editForm, site_name: e.target.value })}
              placeholder="현장명"
              style={{ flex: "1 1 220px", padding: "10px 12px", border: "1px solid #d7dbe2", borderRadius: 10 }}
            />
            <input
              value={editForm.site_addr}
              onChange={(e) => setEditForm({ ...editForm, site_addr: e.target.value })}
              placeholder="현장 주소"
              style={{ flex: "1 1 400px", padding: "10px 12px", border: "1px solid #d7dbe2", borderRadius: 10 }}
            />
          </div>
          <div className="row" style={{ gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <input
              value={editForm.spec}
              onChange={(e) => setEditForm({ ...editForm, spec: e.target.value })}
              placeholder="규격"
              style={{ flex: "1 1 150px", padding: "10px 12px", border: "1px solid #d7dbe2", borderRadius: 10 }}
            />
            <input
              type="number"
              value={editForm.w}
              onChange={(e) => setEditForm({ ...editForm, w: e.target.value })}
              placeholder="폭 (W)"
              style={{ flex: "0 0 100px", padding: "10px 12px", border: "1px solid #d7dbe2", borderRadius: 10 }}
            />
            <input
              type="number"
              value={editForm.l}
              onChange={(e) => setEditForm({ ...editForm, l: e.target.value })}
              placeholder="길이 (L)"
              style={{ flex: "0 0 100px", padding: "10px 12px", border: "1px solid #d7dbe2", borderRadius: 10 }}
            />
            <input
              value={editForm.product}
              onChange={(e) => setEditForm({ ...editForm, product: e.target.value })}
              placeholder="품목"
              style={{ flex: "1 1 150px", padding: "10px 12px", border: "1px solid #d7dbe2", borderRadius: 10 }}
            />
            <input
              type="number"
              value={editForm.qty}
              onChange={(e) => setEditForm({ ...editForm, qty: e.target.value })}
              placeholder="수량"
              style={{ flex: "0 0 100px", padding: "10px 12px", border: "1px solid #d7dbe2", borderRadius: 10 }}
            />
          </div>
          <textarea
            value={editForm.memo}
            onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })}
            placeholder="메모"
            style={{ width: "100%", minHeight: 60, padding: "10px 12px", border: "1px solid #d7dbe2", borderRadius: 10, resize: "vertical" }}
          />
        </div>

        {/* 품목 리스트 */}
        <div>
          <div className="row" style={{ marginBottom: 8 }}>
            <h3 style={{ fontSize: 14, margin: 0 }}>품목</h3>
            <span className="spacer" />
            <button onClick={addItem}>+ 빈 품목 추가</button>
          </div>

          {/* 옵션 검색 */}
          <div style={{ marginBottom: 12, position: "relative" }}>
            <input
              value={optQ}
              onChange={(e) => setOptQ(e.target.value)}
              placeholder="옵션 검색 (예: 모노륨, 단열, 도어... 초성검색 가능)"
              style={{ width: "100%", padding: "10px 12px", border: "1px solid #d7dbe2", borderRadius: 10 }}
            />
            {optQ.trim() && filteredOptions.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #d7dbe2", borderRadius: 10, maxHeight: 250, overflow: "auto", zIndex: 100, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                {filteredOptions.map((o: any) => (
                  <div
                    key={o.option_id}
                    onClick={() => addOptionFromSearch(o)}
                    style={{ padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid #eef0f3" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f7f8fd")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                  >
                    <div style={{ fontWeight: 700 }}>{o.option_name}</div>
                    <div style={{ fontSize: 12, color: "#666" }}>{o.unit || "EA"} · {Number(o.unit_price || 0).toLocaleString()}원</div>
                  </div>
                ))}
              </div>
            )}
            {optQ.trim() && filteredOptions.length === 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #d7dbe2", borderRadius: 10, padding: "10px 12px", color: "#999", zIndex: 100 }}>
                검색 결과 없음
              </div>
            )}
          </div>

          {editForm.items.map((item: any, idx: number) => (
            <div key={idx} style={{ marginBottom: 12, padding: 12, border: "1px solid #eef0f3", borderRadius: 10 }}>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <input value={item.category} onChange={(e) => updateItem(idx, "category", e.target.value)} placeholder="구분" style={{ flex: "0 0 100px", padding: "8px 10px", border: "1px solid #d7dbe2", borderRadius: 8, fontSize: 12 }} />
                <input value={item.name} onChange={(e) => updateItem(idx, "name", e.target.value)} placeholder="항목명" style={{ flex: "1 1 200px", padding: "8px 10px", border: "1px solid #d7dbe2", borderRadius: 8, fontSize: 12 }} />
                <input value={item.unit} onChange={(e) => updateItem(idx, "unit", e.target.value)} placeholder="단위" style={{ flex: "0 0 80px", padding: "8px 10px", border: "1px solid #d7dbe2", borderRadius: 8, fontSize: 12 }} />
                <input type="number" value={item.qty} onChange={(e) => updateItem(idx, "qty", e.target.value)} placeholder="수량" style={{ flex: "0 0 80px", padding: "8px 10px", border: "1px solid #d7dbe2", borderRadius: 8, fontSize: 12 }} />
                <input type="number" value={item.unitPrice} onChange={(e) => updateItem(idx, "unitPrice", e.target.value)} placeholder="단가" style={{ flex: "0 0 120px", padding: "8px 10px", border: "1px solid #d7dbe2", borderRadius: 8, fontSize: 12 }} />
                <input type="number" value={item.amount} onChange={(e) => updateItem(idx, "amount", e.target.value)} placeholder="금액" style={{ flex: "0 0 120px", padding: "8px 10px", border: "1px solid #d7dbe2", borderRadius: 8, fontSize: 12 }} />
                <button onClick={() => removeItem(idx)} style={{ flex: "0 0 auto", padding: "8px 12px", fontSize: 12 }}>삭제</button>
              </div>
              <input value={item.note} onChange={(e) => updateItem(idx, "note", e.target.value)} placeholder="비고" style={{ width: "100%", marginTop: 8, padding: "8px 10px", border: "1px solid #d7dbe2", borderRadius: 8, fontSize: 12 }} />
            </div>
          ))}
        </div>

        <div className="row" style={{ marginTop: 16, gap: 8 }}>
          <span className="spacer" />
          <button onClick={() => { setOptQ(""); setEditOpen(false); }}>취소</button>
          <button className="primary" onClick={saveEdit}>저장</button>
        </div>
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

  /* ===== A4 공통 스타일 ===== */
  .a4Sheet {
    width: 794px;
    min-height: 1123px;
    background: #fff;
    padding: 20px;
    box-sizing: border-box;
    font-size: 12px;
    border: 1px solid #ccc;
    flex-shrink: 0;
  }

  .a4Sheet table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .a4Sheet th, .a4Sheet td {
    border: 1px solid #333;
    padding: 6px 8px;
    vertical-align: middle;
  }

  .a4Sheet th {
    background: #f5f5f5;
    font-weight: 700;
    text-align: center;
  }

  .a4Sheet .center { text-align: center; }
  .a4Sheet .right { text-align: right; }

  /* ===== 견적서 스타일 ===== */
  .quoteHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 2px 10px;
    border-bottom: 2px solid #2e5b86;
    margin-bottom: 10px;
  }

  .quoteHeader .logo { width: 160px; height: 140px; }
  .quoteHeader .headerCenter {
    flex: 1;
    text-align: center;
    font-size: 34px;
    font-weight: 900;
    letter-spacing: 6px;
  }
  .quoteHeader .headerRight { width: 140px; }

  .infoTable { margin-bottom: 8px; }
  .infoTable th { width: 15%; background: #fff; font-weight: 900; }
  .infoTable .msgCell { text-align: center; font-weight: 700; }
  .infoTable .sumCell { font-size: 14px; font-weight: 900; }

  .itemsTable thead th { background: #e6e6e6; }
  .itemsTable tbody td { min-height: 24px; }

  .bottomTable { margin-top: 8px; }
  .bottomTable .sumRow td { background: #e6e6e6; font-weight: 900; }
  .bottomTable th { background: #e6e6e6; width: 15%; }
  .bottomTable .textCell { font-size: 11px; line-height: 1.5; }

  /* ===== 거래명세서 스타일 ===== */
  .statementSheet { background: #e8f4fc; }

  .statementTitle {
    text-align: center;
    font-size: 28px;
    font-weight: 900;
    color: #1a5276;
    padding: 10px 0 5px;
  }

  .statementSubtitle {
    text-align: center;
    font-size: 12px;
    color: #666;
    margin-bottom: 15px;
  }

  .statementInfoWrap {
    display: flex;
    gap: 20px;
    margin-bottom: 10px;
  }

  .statementLeft, .statementRight { flex: 1; }

  .statementInfoTable {
    background: #fff;
  }
  .statementInfoTable th {
    width: 25%;
    background: #d6eaf8;
    color: #1a5276;
  }
  .statementInfoTable td { background: #fff; }

  .stampIcon {
    display: inline-block;
    width: 20px;
    height: 20px;
    border: 2px solid #c0392b;
    border-radius: 50%;
    color: #c0392b;
    font-size: 10px;
    text-align: center;
    line-height: 18px;
    margin-left: 5px;
  }

  .statementSumRow {
    background: #d6eaf8;
    padding: 10px 15px;
    margin: 10px 0;
    display: flex;
    align-items: center;
    gap: 20px;
    border: 1px solid #333;
  }
  .statementSumRow .sumLabel { font-weight: 900; color: #1a5276; }
  .statementSumRow .sumValue { font-size: 18px; font-weight: 900; }
  .statementSumRow .bankInfo { margin-left: auto; font-size: 11px; }

  .statementItemsTable { background: #fff; }
  .statementItemsTable thead th { background: #d6eaf8; color: #1a5276; }
  .statementItemsTable tbody td { background: #fff; min-height: 24px; }
  .statementItemsTable .totalRow td { background: #d6eaf8; }

  /* ===== 임대차계약서 스타일 ===== */
  .rentalSheet { padding: 30px; }

  .rentalHeader {
    display: flex;
    align-items: center;
    gap: 20px;
    margin-bottom: 15px;
  }
  .rentalLogo { width: 120px; height: auto; }
  .rentalTitle {
    flex: 1;
    text-align: center;
    font-size: 32px;
    font-weight: 900;
    color: #1a5276;
    letter-spacing: 8px;
  }

  .rentalIntro {
    text-align: center;
    font-size: 13px;
    line-height: 1.6;
    margin-bottom: 20px;
    color: #333;
  }

  .rentalItemsTable { margin-bottom: 15px; }
  .rentalItemsTable thead th { background: #e8e8e8; }

  .rentalSum {
    font-size: 14px;
    font-weight: 900;
    margin: 15px 0;
  }

  .rentalConditionTitle {
    text-align: center;
    font-size: 14px;
    font-weight: 900;
    margin: 20px 0 10px;
  }

  .rentalConditionTable th {
    background: #e8e8e8;
    width: auto;
  }

  .rentalNotes {
    margin: 20px 0;
    font-size: 11px;
    line-height: 1.6;
  }
  .rentalNotes p { margin: 3px 0; }

  .rentalDate {
    text-align: center;
    font-size: 13px;
    margin: 20px 0;
  }

  .rentalPartyTable { margin-top: 15px; }
  .rentalPartyTable thead th {
    background: #d6eaf8;
    color: #1a5276;
    width: 50%;
  }
  .rentalPartyTable tbody th {
    width: 15%;
    background: #f5f5f5;
  }
  .rentalPartyTable a { color: #1a5276; }

  .rentalFooter {
    text-align: center;
    font-size: 12px;
    margin-top: 20px;
    color: #666;
  }

  /* ===== 반응형 ===== */
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
    .a4Sheet { transform: scale(0.5); transform-origin: top left; }
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
  
  .a4Sheet { 
    width: 210mm !important; 
    min-height: auto !important; 
    padding: 10mm !important;
    border: none !important; 
    box-shadow: none !important;
    margin: 0 !important;
    transform: none !important;
  }
  
  .statementSheet {
    width: 290mm !important;
    padding: 5mm !important;
  }
}

@page {
  size: A4;
  margin: 0;
}
`;
