// src/pages/DeliveryCalendarPage.tsx
import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../QuoteService";

type DeliveryItem = {
  quote_id: string;
  contract_type: string;
  customer_name: string;
  spec: string;
  items: any[];
  delivery_date: string;
  site_name?: string;
};

export default function DeliveryCalendarPage({ onBack }: { onBack: () => void }) {
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

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
  const summarizeOptions = (items: any[]) => {
    if (!items || items.length === 0) return "";
    const names = items.slice(0, 2).map((i: any) => {
      const name = i.optionName || i.displayName || i.itemName || "";
      // 긴 이름 줄이기
      return name.length > 8 ? name.slice(0, 8) + ".." : name;
    });
    const summary = names.join(", ");
    return items.length > 2 ? `${summary} 외${items.length - 2}` : summary;
  };

  // ✅ 현장명 가져오기
  const getSiteName = (item: DeliveryItem) => {
    // site_name이 있으면 사용
    if (item.site_name) return item.site_name;
    // items에서 운송비 품목의 현장 정보 찾기
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

  // ✅ 출고 라벨 생성
  const getDeliveryLabel = (item: DeliveryItem) => {
    const type = item.contract_type || "order";
    const spec = item.spec || "";
    const options = summarizeOptions(item.items);
    const site = getSiteName(item);
    const customer = item.customer_name || "";

    // 수량 (기본 1동)
    const qty = item.items?.length > 0 
      ? item.items.find((i: any) => i.qty > 0)?.qty || 1 
      : 1;
    const qtyText = qty > 1 ? `-${qty}동` : "";

    let prefix = "";
    let label = "";

    if (type === "used") {
      // 중고: [중고](사이즈-수량동) 옵션요약 현장
      prefix = "[중고]";
      label = `${prefix}(${spec}${qtyText}) ${options} ${site}`.trim();
    } else if (type === "branch") {
      // 영업소: [신품]영업소이름(사이즈-수량동) 옵션요약 현장
      prefix = "[신품]";
      label = `${prefix}${customer}(${spec}${qtyText}) ${options} ${site}`.trim();
    } else {
      // 수주(신품): [신품](사이즈-수량동) 옵션요약 현장
      prefix = "[신품]";
      label = `${prefix}(${spec}${qtyText}) ${options} ${site}`.trim();
    }

    return label;
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

    // 이번 달 첫날과 마지막날
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // 첫째주 시작 요일 (0=일, 1=월, ...)
    const startDayOfWeek = firstDay.getDay();

    // 캘린더 시작일 (이전 달 포함)
    const calendarStart = new Date(firstDay);
    calendarStart.setDate(calendarStart.getDate() - startDayOfWeek);

    const days: { date: Date; isCurrentMonth: boolean }[] = [];

    // 6주 (42일) 생성
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

  // 오늘 날짜
  const today = new Date();
  const todayKey = formatDateKey(today);

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
    </div>
  );
}
