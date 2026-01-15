// src/pages/DeliveryCalendarPage.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../QuoteService";

type DeliveryItem = {
  id: string;
  quote_id: string;
  customer_name: string;
  spec: string;
  delivery_date: string;
  site_name: string;
  drawing_no: string;
};

// ✅ 한국 법정공휴일 (2024-2026)
const KOREAN_HOLIDAYS: Record<string, string> = {
  // 2024
  "2024-01-01": "신정",
  "2024-02-09": "설날 연휴",
  "2024-02-10": "설날",
  "2024-02-11": "설날 연휴",
  "2024-02-12": "대체공휴일",
  "2024-03-01": "삼일절",
  "2024-04-10": "국회의원선거",
  "2024-05-05": "어린이날",
  "2024-05-06": "대체공휴일",
  "2024-05-15": "부처님오신날",
  "2024-06-06": "현충일",
  "2024-08-15": "광복절",
  "2024-09-16": "추석 연휴",
  "2024-09-17": "추석",
  "2024-09-18": "추석 연휴",
  "2024-10-03": "개천절",
  "2024-10-09": "한글날",
  "2024-12-25": "크리스마스",
  
  // 2025
  "2025-01-01": "신정",
  "2025-01-28": "설날 연휴",
  "2025-01-29": "설날",
  "2025-01-30": "설날 연휴",
  "2025-03-01": "삼일절",
  "2025-03-03": "대체공휴일",
  "2025-05-05": "어린이날",
  "2025-05-06": "부처님오신날",
  "2025-06-06": "현충일",
  "2025-08-15": "광복절",
  "2025-10-03": "개천절",
  "2025-10-05": "추석 연휴",
  "2025-10-06": "추석",
  "2025-10-07": "추석 연휴",
  "2025-10-08": "대체공휴일",
  "2025-10-09": "한글날",
  "2025-12-25": "크리스마스",
  
  // 2026
  "2026-01-01": "신정",
  "2026-02-16": "설날 연휴",
  "2026-02-17": "설날",
  "2026-02-18": "설날 연휴",
  "2026-03-01": "삼일절",
  "2026-03-02": "대체공휴일",
  "2026-05-05": "어린이날",
  "2026-05-24": "부처님오신날",
  "2026-05-25": "대체공휴일",
  "2026-06-06": "현충일",
  "2026-08-15": "광복절",
  "2026-08-17": "대체공휴일",
  "2026-09-24": "추석 연휴",
  "2026-09-25": "추석",
  "2026-09-26": "추석 연휴",
  "2026-10-03": "개천절",
  "2026-10-05": "대체공휴일",
  "2026-10-09": "한글날",
  "2026-12-25": "크리스마스",
};

export default function DeliveryCalendarPage({ onBack }: { onBack: () => void }) {
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const loadDeliveries = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("quotes")
      .select("id, quote_id, customer_name, spec, delivery_date, site_name, drawing_no")
      .eq("status", "confirmed")
      .not("delivery_date", "is", null)
      .order("delivery_date", { ascending: true });

    if (!error && data) {
      setDeliveries(data as DeliveryItem[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadDeliveries();
  }, []);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: Date[] = [];

    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(new Date(year, month, -firstDay.getDay() + i + 1));
    }

    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }

    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        days.push(new Date(year, month + 1, i));
      }
    }

    return days;
  };

  const formatDate = (date: Date) => {
    return date.toISOString().slice(0, 10);
  };

  const getDeliveriesForDate = (date: Date) => {
    const dateStr = formatDate(date);
    return deliveries.filter((d) => d.delivery_date === dateStr);
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return formatDate(date) === formatDate(today);
  };

  const isTomorrow = (date: Date) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDate(date) === formatDate(tomorrow);
  };

  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentMonth.getMonth();
  };

  // ✅ 공휴일 체크
  const getHoliday = (date: Date) => {
    const dateStr = formatDate(date);
    return KOREAN_HOLIDAYS[dateStr] || null;
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const days = getDaysInMonth(currentMonth);
  const weekDays = ["일", "월", "화", "수", "목", "금", "토"];

  const tomorrowDeliveries = deliveries.filter((d) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return d.delivery_date === formatDate(tomorrow);
  });

  return (
    <div style={{ padding: 16 }}>
      {/* 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>출고일정</h2>
        <button
          onClick={onBack}
          style={{
            padding: "8px 16px",
            background: "#111",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          ← 돌아가기
        </button>
      </div>

      {/* 내일 출고 알림 */}
      {tomorrowDeliveries.length > 0 && (
        <div
          style={{
            background: "#fff3cd",
            border: "1px solid #ffc107",
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 8, color: "#856404" }}>
            ⚠️ 내일 출고 예정 ({tomorrowDeliveries.length}건)
          </div>
          {tomorrowDeliveries.map((d) => (
            <div key={d.id} style={{ fontSize: 13, marginBottom: 4 }}>
              • {d.customer_name} ({d.spec}) - {d.site_name || "현장미정"}
            </div>
          ))}
        </div>
      )}

      {/* 월 네비게이션 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          padding: "8px 0",
        }}
      >
        <button
          onClick={prevMonth}
          style={{
            padding: "8px 16px",
            background: "#f5f5f5",
            border: "1px solid #ddd",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          ◀ 이전
        </button>
        <div style={{ fontSize: 18, fontWeight: 800 }}>
          {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월
        </div>
        <button
          onClick={nextMonth}
          style={{
            padding: "8px 16px",
            background: "#f5f5f5",
            border: "1px solid #ddd",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          다음 ▶
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#888" }}>로딩 중...</div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 8, border: "1px solid #ddd", overflow: "hidden" }}>
          {/* 요일 헤더 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: "#2e5b86" }}>
            {weekDays.map((day, i) => (
              <div
                key={day}
                style={{
                  padding: 10,
                  textAlign: "center",
                  fontWeight: 700,
                  color: i === 0 ? "#ffcccc" : i === 6 ? "#cce5ff" : "#fff",
                }}
              >
                {day}
              </div>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {days.map((date, idx) => {
              const dateDeliveries = getDeliveriesForDate(date);
              const dayOfWeek = date.getDay();
              const holiday = getHoliday(date);

              return (
                <div
                  key={idx}
                  style={{
                    minHeight: 80,
                    padding: 6,
                    border: "1px solid #eee",
                    background: isToday(date)
                      ? "#e3f2fd"
                      : isTomorrow(date) && dateDeliveries.length > 0
                      ? "#fff3cd"
                      : holiday
                      ? "#ffebee"  // ✅ 공휴일 배경색
                      : !isCurrentMonth(date)
                      ? "#f9f9f9"
                      : "#fff",
                  }}
                >
                  <div
                    style={{
                      fontWeight: isToday(date) ? 900 : 600,
                      fontSize: 12,
                      marginBottom: 2,
                      color: !isCurrentMonth(date)
                        ? "#ccc"
                        : holiday || dayOfWeek === 0
                        ? "#e53935"  // ✅ 공휴일/일요일 빨간색
                        : dayOfWeek === 6
                        ? "#1976d2"
                        : "#333",
                    }}
                  >
                    {date.getDate()}
                    {isToday(date) && <span style={{ marginLeft: 4, fontSize: 10 }}>(오늘)</span>}
                  </div>

                  {/* ✅ 공휴일 이름 표시 */}
                  {holiday && (
                    <div
                      style={{
                        fontSize: 9,
                        color: "#e53935",
                        marginBottom: 2,
                        fontWeight: 600,
                      }}
                    >
                      {holiday}
                    </div>
                  )}

                  {dateDeliveries.map((d) => (
                    <div
                      key={d.id}
                      style={{
                        background: "#2e5b86",
                        color: "#fff",
                        padding: "3px 6px",
                        borderRadius: 4,
                        fontSize: 10,
                        marginBottom: 2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={`${d.customer_name} (${d.spec}) - ${d.site_name || ""}`}
                    >
                      {d.drawing_no ? `#${d.drawing_no} ` : ""}
                      {d.customer_name}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 하단 리스트 */}
      <div style={{ marginTop: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>이번 달 출고 예정</h3>
        {deliveries
          .filter((d) => {
            const date = new Date(d.delivery_date);
            return (
              date.getMonth() === currentMonth.getMonth() &&
              date.getFullYear() === currentMonth.getFullYear()
            );
          })
          .map((d) => (
            <div
              key={d.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: 10,
                background: "#fff",
                borderRadius: 6,
                marginBottom: 6,
                border: "1px solid #eee",
              }}
            >
              <div>
                <span style={{ fontWeight: 700 }}>{d.customer_name}</span>
                <span style={{ marginLeft: 8, color: "#666" }}>({d.spec})</span>
                {d.drawing_no && (
                  <span style={{ marginLeft: 8, color: "#2e5b86" }}>#{d.drawing_no}</span>
                )}
              </div>
              <div style={{ fontWeight: 700, color: "#2e5b86" }}>{d.delivery_date}</div>
            </div>
          ))}
      </div>
    </div>
  );
}
