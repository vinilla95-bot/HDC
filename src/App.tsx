// InlineEditTest.tsx - 견적서 양식 + 인라인 편집 테스트
import React, { useState, useRef, useEffect, useMemo } from "react";

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

// 테스트용 옵션 데이터
const SAMPLE_OPTIONS = [
  { option_id: "1", option_name: "모노륨 바닥재", unit: "㎡", unit_price: 15000 },
  { option_id: "2", option_name: "단열재 50T", unit: "㎡", unit_price: 8000 },
  { option_id: "3", option_name: "도어 방화문", unit: "EA", unit_price: 250000 },
  { option_id: "4", option_name: "창문 이중창", unit: "EA", unit_price: 180000 },
  { option_id: "5", option_name: "에어컨 설치", unit: "EA", unit_price: 350000 },
  { option_id: "6", option_name: "전기 배선", unit: "식", unit_price: 200000 },
  { option_id: "7", option_name: "조명 LED", unit: "EA", unit_price: 25000 },
  { option_id: "8", option_name: "싱크대", unit: "EA", unit_price: 450000 },
  { option_id: "9", option_name: "화장실 설치", unit: "식", unit_price: 800000 },
  { option_id: "10", option_name: "임대 3x6 기본형", unit: "개월", unit_price: 150000 },
  { option_id: "11", option_name: "벽걸이형 에어컨", unit: "EA", unit_price: 420000 },
  { option_id: "12", option_name: "벽걸이형 냉난방기", unit: "EA", unit_price: 580000 },
  { option_id: "13", option_name: "5톤 일반트럭 운송비(하차별도)", unit: "EA", unit_price: 150000 },
  { option_id: "14", option_name: "크레인 운송비", unit: "EA", unit_price: 250000 },
];

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

// ============ 인라인 품목 편집 셀 ============
function InlineItemCell({
  item,
  options,
  onSelectOption,
}: {
  item: any;
  options: any[];
  onSelectOption: (item: any, opt: any) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return options.slice(0, 15);
    const matched = options.filter((o: any) => matchKoreanLocal(String(o.option_name || ""), q));
    const qLower = q.toLowerCase();
    matched.sort((a: any, b: any) => {
      const nameA = String(a.option_name || "").toLowerCase();
      const nameB = String(b.option_name || "").toLowerCase();
      return (nameA.startsWith(qLower) ? 0 : 1) - (nameB.startsWith(qLower) ? 0 : 1);
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
    onSelectOption(item, opt);
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
        {showDropdown && (
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
        <span style={{ flex: 1 }}>{String(item.name || "")}</span>
        <span style={{ color: "#2e5b86", fontSize: 10 }}>🔍</span>
      </div>
    </td>
  );
}

// ============ 빈 행 클릭 시 품목 추가 ============
function EmptyRowCell({
  options,
  onAddItem,
}: {
  options: any[];
  onAddItem: (opt: any) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return options.slice(0, 15);
    const matched = options.filter((o: any) => matchKoreanLocal(String(o.option_name || ""), q));
    const qLower = q.toLowerCase();
    matched.sort((a: any, b: any) => {
      const nameA = String(a.option_name || "").toLowerCase();
      const nameB = String(b.option_name || "").toLowerCase();
      return (nameA.startsWith(qLower) ? 0 : 1) - (nameB.startsWith(qLower) ? 0 : 1);
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
    onAddItem(opt);
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
            placeholder="품목 검색..."
            autoFocus
            style={{
              width: "100%",
              padding: "6px 8px",
              border: "2px solid #2e5b86",
              fontSize: 12,
              boxSizing: "border-box",
            }}
          />
          {showDropdown && (
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
  const [items, setItems] = useState<any[]>([
    { key: "1", name: "모노륨 바닥재", unit: "㎡", qty: 18, unitPrice: 15000, spec: "3x6" },
    { key: "2", name: "단열재 50T", unit: "㎡", qty: 18, unitPrice: 8000, spec: "3x6" },
  ]);

  const [form] = useState({
    name: "홍길동",
    email: "test@test.com",
    phone: "010-1234-5678",
    quoteDate: new Date().toISOString().slice(0, 10),
    sitePickedLabel: "강릉",
    vatIncluded: true,
  });

  const handleSelectOption = (item: any, opt: any) => {
    setItems(prev => prev.map(i => {
      if (i.key !== item.key) return i;
      return {
        ...i,
        name: opt.option_name,
        unit: opt.unit || "EA",
        unitPrice: Number(opt.unit_price || 0),
      };
    }));
  };

  const handleAddItem = (opt: any) => {
    const newItem = {
      key: `item_${Date.now()}`,
      name: opt.option_name,
      unit: opt.unit || "EA",
      qty: 1,
      unitPrice: Number(opt.unit_price || 0),
      spec: "",
    };
    setItems(prev => [...prev, newItem]);
  };

  const handleUpdateQty = (key: string, qty: number) => {
    setItems(prev => prev.map(i => i.key === key ? { ...i, qty } : i));
  };

  const handleUpdatePrice = (key: string, unitPrice: number) => {
    setItems(prev => prev.map(i => i.key === key ? { ...i, unitPrice } : i));
  };

  const handleDelete = (key: string) => {
    setItems(prev => prev.filter(i => i.key !== key));
  };

  const supply_amount = items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);
  const vat_amount = Math.round(supply_amount * 0.1);
  const total_amount = supply_amount + vat_amount;

  const MIN_ROWS = 12;
  const blankCount = Math.max(0, MIN_ROWS - items.length);

  return (
    <div style={{ background: "#f5f6f8", minHeight: "100vh", padding: "20px 0" }}>
      <style>{a4css}</style>
      
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <span style={{ background: "#2e5b86", color: "#fff", padding: "8px 16px", borderRadius: 8, fontSize: 14 }}>
          🧪 인라인 편집 테스트 - 품목/수량/단가 클릭해서 수정해보세요
        </span>
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
                <td className="v" colSpan={3}>고은희</td>
                <th className="k center">견적일자</th>
                <td className="v">{form.quoteDate}</td>
              </tr>
              <tr>
                <th className="k center">고객명</th>
                <td className="v" colSpan={3}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{form.name}</span>
                    <span style={{ fontWeight: 900 }}>귀하</span>
                  </div>
                </td>
                <th className="k center">공급자</th>
                <td className="v">현대컨테이너</td>
              </tr>
              <tr>
                <th className="k center">이메일</th>
                <td className="v">{form.email}</td>
                <th className="k center">전화</th>
                <td className="v">{form.phone}</td>
                <th className="k center">등록번호</th>
                <td className="v">130-41-38154</td>
              </tr>
              <tr>
                <th className="k center">현장</th>
                <td className="v">{form.sitePickedLabel}</td>
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
                const supply = item.qty * item.unitPrice;
                const vat = Math.round(supply * 0.1);
                
                return (
                  <tr key={item.key}>
                    <td className="c center">{idx + 1}</td>
                    <InlineItemCell
                      item={item}
                      options={SAMPLE_OPTIONS}
                      onSelectOption={handleSelectOption}
                    />
                    <td className="c center">{item.spec}</td>
                    <td className="c center">
                      <EditableNumberCell
                        value={item.qty}
                        onChange={(val) => handleUpdateQty(item.key, val)}
                      />
                    </td>
                    <td className="c right">
                      <EditableNumberCell
                        value={item.unitPrice}
                        onChange={(val) => handleUpdatePrice(item.key, val)}
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
                      options={SAMPLE_OPTIONS}
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
