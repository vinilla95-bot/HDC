// InlineEditTest.tsx - Supabase 연동 + 인라인 편집 테스트
import React, { useState, useRef, useEffect, useMemo } from "react";
import { supabase, calculateOptionLine } from "./QuoteService";
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
    if (!q) return []; // 검색어 없으면 목록 안 보임
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
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#fffde7")}
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
      style={{ cursor: "pointer", background: "#fffde7" }}
      title="클릭하여 품목 변경"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ flex: 1 }}>{String(item.displayName || "")}</span>
        <span style={{ color: "#2e5b86", fontSize: 10 }}>🔍</span>
      </div>
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
    if (!q) return []; // 검색어 없으면 목록 안 보임
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
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#fffde7")}
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
        background: "#fffde7",
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

// ============ 메인 테스트 컴포넌트 ============
export default function InlineEditTest() {
  // Supabase에서 데이터 로드
  const [options, setOptions] = useState<any[]>([]);
  const [bizcards, setBizcards] = useState<Bizcard[]>([]);
  const [selectedBizcardId, setSelectedBizcardId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // 품목 목록
  const [items, setItems] = useState<any[]>([]);

  // 폼 데이터
  const [form, setForm] = useState({
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
      if (isRentRow(i)) return i; // 임대는 단가 수정 불가
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

  // 합계 계산
  const supply_amount = items.reduce((sum, i) => sum + (i.finalAmount || 0), 0);
  const vat_amount = Math.round(supply_amount * 0.1);
  const total_amount = supply_amount + vat_amount;

  const MIN_ROWS = 12;
  const blankCount = Math.max(0, MIN_ROWS - items.length);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <p>데이터 로딩 중...</p>
      </div>
    );
  }

  return (
    <div style={{ background: "#f5f6f8", minHeight: "100vh", padding: "20px 0" }}>
      <style>{a4css}</style>
      
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <span style={{ background: "#2e5b86", color: "#fff", padding: "8px 16px", borderRadius: 8, fontSize: 14 }}>
          🧪 인라인 편집 테스트 - Supabase 연동
        </span>
      </div>

      {/* 상단 입력 폼 */}
      <div style={{ maxWidth: 800, margin: "0 auto 20px", padding: "16px", background: "#fff", borderRadius: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
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
            <label style={{ fontSize: 12, color: "#666" }}>가로(m)</label>
            <input
              type="number"
              value={form.w}
              onChange={(e) => setForm({ ...form, w: Number(e.target.value) })}
              style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 4 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#666" }}>세로(m)</label>
            <input
              type="number"
              value={form.l}
              onChange={(e) => setForm({ ...form, l: Number(e.target.value) })}
              style={{ width: "100%", padding: 8, border: "1px solid #ddd", borderRadius: 4 }}
            />
          </div>
          <div>
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
        <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
          면적: {(form.w * form.l).toFixed(2)}㎡ | 옵션 {options.length}개 로드됨
        </div>
      </div>

      <div className="a4Wrap">
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
            <tbody>
              {items.map((item, idx) => {
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
                  <tr key={item.key}>
                    <td className="c center">{idx + 1}</td>
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
              })}

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
`;
