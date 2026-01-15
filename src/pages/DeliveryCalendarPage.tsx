// src/pages/DeliveryCalendarPage.tsx
import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../QuoteService";

type DeliveryItem = {
  quote_id: string;
  contract_type: string;
  customer_name: string;
  customer_phone: string;
  spec: string;
  items: any[];
  delivery_date: string;
  site_name?: string;
  site_addr?: string;
  memo?: string;
  total_amount: number;
};

export default function DeliveryCalendarPage({ onBack }: { onBack: () => void }) {
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryItem | null>(null);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const loadDeliveries = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("quotes")
      .select("*")
      .eq("status", "confirmed")
      .not("delivery_date", "is", null);

    if (error) {
      console.error("Load error:", error);
    }
    if (data) {
      setDeliveries(data.filter((d: any) => d.delivery_date) as DeliveryItem[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadDeliveries();
  }, []);

  // ✅ 옵션 요약
  const summarizeOptions = (items: any[], short = true) => {
    if (!items || items.length === 0) return "";
    const limit = short ? 2 : 5;
    const names = items.slice(0, limit).map((i: any) => {
      const name = i.optionName || i.displayName || i.itemName || "";
      if (short) {
        return name.length > 8 ? name.slice(0, 8) + ".." : name;
      }
      return name;
    });
    const summary = names.join(", ");
    if (short) {
      return items.length > limit ? `${summary} 외${items.length - limit}` : summary;
    }
    return items.length > limit ? `${summary} 외 ${items.length - limit}건` : summary;
  };

  // ✅ 현장명 가져오기
  const getSiteName = (item: DeliveryItem) => {
    if (item.site_name) return item.site_name;
    if (item.items && item.items.length > 0) {
      const deliveryItem = item.items.find((i: any) =>
        (i.optionName || i.displayName || "").includes("운송")
      );
      if (deliveryItem && deliveryItem.displayName) {
        const match = deliveryItem.displayName.match(/운송비[^\-]*-(.+)/);
        if (match) return match[1];
      }
    }
    return "";
  };

  // ✅ 수량 가져오기 (컨테이너 본체 수량)
  const getQty = (item: DeliveryItem) => {
    if (!item.items || item.items.length === 0) return 1;
    // 컨테이너 본체 관련 품목 찾기
    const containerItem = item.items.find((i: any) => {
      const name = (i.optionName || i.displayName || "").toLowerCase();
      return name.includes("컨테이너") || name.includes("신품") || name.includes("중고");
    });
    return containerItem?.qty || 1;
  };

  // ✅ 출고 라벨 생성
  const getDeliveryLabel = (item: DeliveryItem) => {
    const type = item.contract_type || "order";
    const spec = item.spec || "";
    const options = summarizeOptions(item.items, true);
    const site = getSiteName(item);
    const customer = item.customer_name || "";
    const qty = getQty(item);
    const qtyText = qty > 1 ? `-${qty}동` : "";

    let prefix = "";
    let label = "";

    if (type === "used") {
      prefix = "[중고]";
      label = `${prefix}(${spec}${qtyText}) ${options} ${site}`.trim();
    } else if (type === "branch") {
      prefix = "[신품]";
      label = `${prefix}${customer}(${spec}${qtyText}) ${options} ${site}`.trim();
    } else {
      prefix = "[신품]";
      label = `${prefix}(${spec}${qtyText}) ${options} ${site}`.trim();
    }

    return label;
  };

  // ✅ 배차 양식 생성
  const generateDispatchText = (item: DeliveryItem) => {
    const type = item.contract_type || "order";
    const isUsed = type === "used";
    const saleType = isUsed ? "중고" : "신품";

    // 날짜 포맷 (1/16 형식)
    const date = new Date(item.delivery_date);
    const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;

    // 사이즈
    const spec = item.spec || "";

    // 수량
    const qty = getQty(item);
    const qtyText = qty > 1 ? `${qty}` : "1";

    // 하차 정보 (시간, 주소) - memo나 site_addr에서 가져오기
    let unloadInfo = "";
    if (item.site_addr) {
      unloadInfo = item.site_addr;
    }
    if (item.memo) {
      // memo에 시간이나 주소 정보가 있으면 추가
      unloadInfo = unloadInfo ? `${unloadInfo} ${item.memo}` : item.memo;
    }

    // 발주처 이름
    const customer = item.customer_name || "";

    // 인수자 전화번호
    const phone = item.customer_phone || "";

    // 양식 생성
    let text = `사장님 (${dateStr}) ${saleType}판매 (${spec})(${qtyText})-동 상차 현대`;

    if (unloadInfo) {
      text += ` 하차 ${unloadInfo}`;
    } else {
      text += ` 하차 `;
    }

    text += ` ${customer}`;

    if (phone) {
      text += ` 인수자${phone}`;
    } else {
      text += ` 인수자`;
    }

    text += ` 입니다~`;

    return text;
  };

  // ✅ 클립보드 복사
  const handleCopyDispatch = async () => {
    if (!selectedDelivery) return;

    const text = generateDispatchText(selectedDelivery);

    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      // 폴백: textarea 사용
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  // ✅ 날짜별 출고 그룹핑
  const deliveriesByDate = useMemo(() => {
    const map: Record<string, DeliveryItem[]> = {};
    deliveries.forEach((d) => {
      const date = d.delivery_date;
      if (!map[date]) map[date] = [];
      map[date].push(d);
    });
    return map;
  }, [deliveries]);

  // ✅ 캘린더 데이터 생성
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDay = new Date(year, month, 1);
    const startDayOfWeek = firstDay.getDay();

    const calendarStart = new Date(firstDay);
    calendarStart.setDate(calendarStart.getDate() - startDayOfWeek);

    const days: { date: Date; isCurrentMonth: boolean }[] = [];

    for (let i = 0; i < 42; i++) {
      const date = new Date(calendarStart);
      date.setDate(calendarStart.getDate() + i);
      days.push({
        date,
        isCurrentMonth: date.getMonth() === month,
      });
    }

    return days;
  }, [currentMonth]);

  const formatDateKey = (date: Date) => {
    return date.toISOString().slice(0, 10);
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const goToday = () => {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const monthLabel = `${currentMonth.getFullYear()}년 ${currentMonth.getMonth() + 1}월`;

  const weekDays = ["일", "월", "화", "수", "목", "금", "토"];

  const today = new Date();
  const todayKey = formatDateKey(today);

  const fmt = (n: number) => (Number(n) || 0).toLocaleString("ko-KR");

  return (
    <div style={{ padding: 16, background: "#f6f7fb", minHeight: "100vh" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
          출고일정
          <span style={{ fontSize: 12, fontWeight: 400, color: "#666", marginLeft: 8 }}>
            (총 {deliveries.length}건)
          </span>
        </h2>
      </div>

      {/* 월 네비게이션 */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 16,
        background: "#fff",
        padding: "12px 16px",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
      }}>
        <button
          onClick={prevMonth}
          style={{
            padding: "8px 16px",
            background: "#f5f5f5",
            border: "1px solid #ddd",
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          ◀ 이전
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 18, fontWeight: 800 }}>{monthLabel}</span>
          <button
            onClick={goToday}
            style={{
              padding: "6px 12px",
              background: "#2e5b86",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            오늘
          </button>
        </div>
        <button
          onClick={nextMonth}
          style={{
            padding: "8px 16px",
            background: "#f5f5f5",
            border: "1px solid #ddd",
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          다음 ▶
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#888" }}>로딩 중...</div>
      ) : (
        <div style={{
          background: "#fff",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          overflow: "hidden",
        }}>
          {/* 요일 헤더 */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            background: "#2e5b86",
          }}>
            {weekDays.map((day, idx) => (
              <div
                key={day}
                style={{
                  padding: "10px 4px",
                  textAlign: "center",
                  fontWeight: 700,
                  fontSize: 13,
                  color: idx === 0 ? "#ffcccc" : idx === 6 ? "#cce5ff" : "#fff",
                }}
              >
                {day}
              </div>
            ))}
          </div>

          {/* 캘린더 그리드 */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
          }}>
            {calendarDays.map(({ date, isCurrentMonth }, idx) => {
              const dateKey = formatDateKey(date);
              const dayDeliveries = deliveriesByDate[dateKey] || [];
              const isToday = dateKey === todayKey;
              const dayOfWeek = date.getDay();
              const isSunday = dayOfWeek === 0;
              const isSaturday = dayOfWeek === 6;

              return (
                <div
                  key={idx}
                  style={{
                    minHeight: 100,
                    padding: 4,
                    borderRight: idx % 7 !== 6 ? "1px solid #eee" : "none",
                    borderBottom: "1px solid #eee",
                    background: isToday ? "#fffde7" : isCurrentMonth ? "#fff" : "#f9f9f9",
                    opacity: isCurrentMonth ? 1 : 0.5,
                  }}
                >
                  {/* 날짜 */}
                  <div style={{
                    fontSize: 12,
                    fontWeight: isToday ? 800 : 600,
                    color: isSunday ? "#e53935" : isSaturday ? "#1976d2" : "#333",
                    marginBottom: 4,
                    padding: "2px 4px",
                    borderRadius: 4,
                    background: isToday ? "#2e5b86" : "transparent",
                    ...(isToday && { color: "#fff" }),
                    display: "inline-block",
                  }}>
                    {date.getDate()}
                  </div>

                  {/* 출고 항목들 */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {dayDeliveries.slice(0, 3).map((d, i) => {
                      const type = d.contract_type || "order";
                      const bgColor = type === "used" ? "#fff3e0" : type === "branch" ? "#e3f2fd" : "#e8f5e9";
                      const borderColor = type === "used" ? "#ff9800" : type === "branch" ? "#2196f3" : "#4caf50";

                      return (
                        <div
                          key={d.quote_id + i}
                          onClick={() => setSelectedDelivery(d)}
                          style={{
                            fontSize: 10,
                            padding: "3px 4px",
                            background: bgColor,
                            borderLeft: `3px solid ${borderColor}`,
                            borderRadius: 2,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            cursor: "pointer",
                          }}
                          title={getDeliveryLabel(d)}
                        >
                          {getDeliveryLabel(d)}
                        </div>
                      );
                    })}
                    {dayDeliveries.length > 3 && (
                      <div style={{
                        fontSize: 10,
                        color: "#666",
                        padding: "2px 4px",
                        cursor: "pointer",
                      }}>
                        +{dayDeliveries.length - 3}건 더
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 범례 */}
      <div style={{
        display: "flex",
        gap: 16,
        marginTop: 16,
        padding: "12px 16px",
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        fontSize: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 16, height: 16, background: "#e8f5e9", borderLeft: "3px solid #4caf50", borderRadius: 2 }}></div>
          <span>신품 (수주)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 16, height: 16, background: "#e3f2fd", borderLeft: "3px solid #2196f3", borderRadius: 2 }}></div>
          <span>영업소</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 16, height: 16, background: "#fff3e0", borderLeft: "3px solid #ff9800", borderRadius: 2 }}></div>
          <span>중고</span>
        </div>
      </div>

      {/* ✅ 상세보기 팝업 */}
      {selectedDelivery && !showDispatchModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
          }}
          onClick={() => setSelectedDelivery(null)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              width: "90%",
              maxWidth: 500,
              maxHeight: "80vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>출고 상세</h3>
              <button
                onClick={() => setSelectedDelivery(null)}
                style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            {/* 구분 태그 */}
            <div style={{ marginBottom: 16 }}>
              {(() => {
                const type = selectedDelivery.contract_type || "order";
                const bgColor = type === "used" ? "#fff3e0" : type === "branch" ? "#e3f2fd" : "#e8f5e9";
                const textColor = type === "used" ? "#e65100" : type === "branch" ? "#1565c0" : "#2e7d32";
                const label = type === "used" ? "중고" : type === "branch" ? "영업소" : "수주(신품)";
                return (
                  <span style={{
                    padding: "4px 12px",
                    background: bgColor,
                    color: textColor,
                    borderRadius: 20,
                    fontSize: 12,
                    fontWeight: 700,
                  }}>
                    {label}
                  </span>
                );
              })()}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", borderBottom: "1px solid #eee", paddingBottom: 8 }}>
                <span style={{ width: 80, color: "#666", fontSize: 13 }}>출고일</span>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{selectedDelivery.delivery_date}</span>
              </div>
              <div style={{ display: "flex", borderBottom: "1px solid #eee", paddingBottom: 8 }}>
                <span style={{ width: 80, color: "#666", fontSize: 13 }}>발주처</span>
                <span style={{ fontWeight: 700 }}>{selectedDelivery.customer_name || "-"}</span>
              </div>
              <div style={{ display: "flex", borderBottom: "1px solid #eee", paddingBottom: 8 }}>
                <span style={{ width: 80, color: "#666", fontSize: 13 }}>연락처</span>
                <span>{selectedDelivery.customer_phone || "-"}</span>
              </div>
              <div style={{ display: "flex", borderBottom: "1px solid #eee", paddingBottom: 8 }}>
                <span style={{ width: 80, color: "#666", fontSize: 13 }}>규격</span>
                <span style={{ fontWeight: 600 }}>{selectedDelivery.spec || "-"}</span>
              </div>
              <div style={{ display: "flex", borderBottom: "1px solid #eee", paddingBottom: 8 }}>
                <span style={{ width: 80, color: "#666", fontSize: 13 }}>현장</span>
                <span>{getSiteName(selectedDelivery) || "-"}</span>
              </div>
              <div style={{ display: "flex", borderBottom: "1px solid #eee", paddingBottom: 8 }}>
                <span style={{ width: 80, color: "#666", fontSize: 13 }}>주소</span>
                <span>{selectedDelivery.site_addr || "-"}</span>
              </div>
              <div style={{ display: "flex", borderBottom: "1px solid #eee", paddingBottom: 8 }}>
                <span style={{ width: 80, color: "#666", fontSize: 13 }}>금액</span>
                <span style={{ fontWeight: 700 }}>{fmt(selectedDelivery.total_amount)}원</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ color: "#666", fontSize: 13 }}>옵션</span>
                <span style={{ fontSize: 13, lineHeight: 1.5 }}>
                  {summarizeOptions(selectedDelivery.items, false) || "-"}
                </span>
              </div>
              {selectedDelivery.memo && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                  <span style={{ color: "#666", fontSize: 13 }}>메모</span>
                  <span style={{ fontSize: 13, background: "#f9f9f9", padding: 8, borderRadius: 6 }}>
                    {selectedDelivery.memo}
                  </span>
                </div>
              )}
            </div>

            {/* 버튼 */}
            <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
              <button
                onClick={() => setSelectedDelivery(null)}
                style={{
                  flex: 1,
                  padding: 14,
                  background: "#f5f5f5",
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                닫기
              </button>
              <button
                onClick={() => setShowDispatchModal(true)}
                style={{
                  flex: 1,
                  padding: 14,
                  background: "#2e5b86",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                🚚 배차하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 배차 양식 팝업 */}
      {selectedDelivery && showDispatchModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10001,
          }}
          onClick={() => setShowDispatchModal(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 24,
              width: "90%",
              maxWidth: 500,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>🚚 배차 양식</h3>
              <button
                onClick={() => setShowDispatchModal(false)}
                style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>아래 내용을 복사해서 사용하세요</div>
              <div style={{
                background: "#f9f9f9",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 16,
                fontSize: 14,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}>
                {generateDispatchText(selectedDelivery)}
              </div>
            </div>

            {/* 버튼 */}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setShowDispatchModal(false)}
                style={{
                  flex: 1,
                  padding: 14,
                  background: "#f5f5f5",
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ← 뒤로
              </button>
              <button
                onClick={handleCopyDispatch}
                style={{
                  flex: 1,
                  padding: 14,
                  background: copySuccess ? "#28a745" : "#2e5b86",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
              >
                {copySuccess ? "✓ 복사됨!" : "📋 복사하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
