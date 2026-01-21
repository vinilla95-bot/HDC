// src/pages/TodayTasksPage.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../QuoteService";

// 알림 허용 시간 체크 (컴퓨터 켠 후 1시간, 오후 3시)
const shouldShowNotification = (): boolean => {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  
  // 오후 3시 (15:00 ~ 15:05 사이만)
  if (hour === 15 && minute < 5) {
    const notified = localStorage.getItem('afternoon_notified_' + now.toDateString());
    if (!notified) {
      localStorage.setItem('afternoon_notified_' + now.toDateString(), 'true');
      return true;
    }
    return false;
  }
  
  // 컴퓨터 켠 후 1시간 체크
  const bootTime = localStorage.getItem('app_boot_time');
  const now_ts = Date.now();
  
  if (!bootTime) {
    localStorage.setItem('app_boot_time', String(now_ts));
    return false;
  }
  
  const bootTimestamp = Number(bootTime);
  const oneHourLater = bootTimestamp + (60 * 60 * 1000);
  
  if (now_ts >= oneHourLater && now_ts < oneHourLater + (5 * 60 * 1000)) {
    const notified = localStorage.getItem('boot_notified');
    if (!notified) {
      localStorage.setItem('boot_notified', 'true');
      return true;
    }
  }
  
  return false;
};

// 매일 자정에 리셋
const resetDailyFlags = () => {
  const today = new Date().toDateString();
  const lastReset = localStorage.getItem('last_reset_date');
  
  if (lastReset !== today) {
    localStorage.removeItem('app_boot_time');
    localStorage.removeItem('boot_notified');
    localStorage.setItem('last_reset_date', today);
  }
};

type PendingOrder = {
  id: number;
  quote_id: string;
  chat_room: string;
  message: string;
  order_date: string;
  delivery_date: string;
  status: string;
  sent_at?: string;
  error_message?: string;
  customer_name?: string;
  option_name?: string;
  qty?: number;
};

type DeliveryTask = {
  quote_id: string;
  customer_name: string;
  customer_phone: string;
  spec: string;
  delivery_date: string;
  site_addr: string;
  memo: string;
  contract_type: string;
  items: any[];
  dispatch_status?: string;
};

export default function TodayTasksPage() {
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [deliveryTasks, setDeliveryTasks] = useState<DeliveryTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | string | null>(null);
  const [editMessage, setEditMessage] = useState("");

  // 브라우저 알림 권한 요청
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
    resetDailyFlags();
  }, []);

  // 데이터 로드
  useEffect(() => {
    loadTasks();
    
    // 30초마다 자동 새로고침 (Python 전송 상태 확인)
    const interval = setInterval(loadTasks, 30000);
    return () => clearInterval(interval);
  }, []);

  // 브라우저 알림 표시 (컴퓨터 켠 후 1시간, 오후 3시에만)
  useEffect(() => {
    const pendingCount = pendingOrders.filter(o => o.status === "pending").length;
    const failedCount = pendingOrders.filter(o => o.status === "failed").length;
    const dispatchCount = deliveryTasks.filter(d => d.dispatch_status !== "완료").length;
    const totalTasks = pendingCount + failedCount + dispatchCount;
    
    // 알림 허용 시간인지 체크
    if (!shouldShowNotification() || totalTasks === 0) {
      return;
    }
    
    if ("Notification" in window && Notification.permission === "granted") {
      if (failedCount > 0) {
        new Notification("⚠️ 전송 실패 건 있음", {
          body: `${failedCount}건의 주문 전송이 실패했습니다. 수동 처리가 필요합니다.`,
          icon: "/favicon.ico"
        });
      } else {
        new Notification("📋 오늘 할 일", {
          body: `처리할 작업이 ${totalTasks}건 있습니다`,
          icon: "/favicon.ico"
        });
      }
    }
  }, [pendingOrders, deliveryTasks]);

  const loadTasks = async () => {
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

    // 1. 오늘 주문해야 할 자재 (pending_orders)
    const { data: orders } = await supabase
      .from("pending_orders")
      .select("*")
      .eq("order_date", today)
      .order("created_at", { ascending: true });

    if (orders) setPendingOrders(orders);

    // 2. 내일 출고 = 오늘 배차해야 할 것들
    const { data: deliveries } = await supabase
      .from("quotes")
      .select("*")
      .eq("status", "confirmed")
      .eq("delivery_date", tomorrow)
      .neq("contract_type", "memo");

    if (deliveries) setDeliveryTasks(deliveries);

    // 3. 자동으로 pending_orders 생성 (아직 없는 것들)
    await generatePendingOrders();

    setLoading(false);
  };

  // 계약 확정된 것들 중 주문 필요한 것 자동 생성
  const generatePendingOrders = async () => {
    const { data: rules } = await supabase.from("order_rules").select("*");
    if (!rules) return;

    const today = new Date();
    const weekLater = new Date(today);
    weekLater.setDate(weekLater.getDate() + 7);

    const { data: quotes } = await supabase
      .from("quotes")
      .select("*")
      .eq("status", "confirmed")
      .gte("delivery_date", today.toISOString().split("T")[0])
      .lte("delivery_date", weekLater.toISOString().split("T")[0]);

    if (!quotes) return;

    const { data: existingOrders } = await supabase
      .from("pending_orders")
      .select("quote_id, rule_id");

    const existingSet = new Set(
      (existingOrders || []).map(o => `${o.quote_id}_${o.rule_id}`)
    );

    for (const quote of quotes) {
      if (!quote.items || quote.items.length === 0) continue;

      for (const item of quote.items) {
        const optionName = (item.optionName || item.displayName || item.itemName || "").toLowerCase();

        for (const rule of rules) {
          const keywords = rule.keywords as string[];
          const matched = keywords.some(kw => optionName.includes(kw.toLowerCase()));

          if (matched) {
            const key = `${quote.quote_id}_${rule.id}`;
            if (existingSet.has(key)) continue;

            const deliveryDate = new Date(quote.delivery_date);
            const orderDate = new Date(deliveryDate);
            orderDate.setDate(orderDate.getDate() - rule.lead_days);

            const message = buildMessage(rule.message_template, {
              month: deliveryDate.getMonth() + 1,
              day: deliveryDate.getDate(),
              qty: item.qty || 1,
              customer: quote.customer_name || "",
              option_name: item.optionName || item.displayName || "",
              spec: quote.spec || "",
              color: extractColor(optionName) || "색상미정"
            });

            await supabase.from("pending_orders").insert({
              quote_id: quote.quote_id,
              rule_id: rule.id,
              chat_room: rule.chat_room,
              message: message,
              order_date: orderDate.toISOString().split("T")[0],
              delivery_date: quote.delivery_date,
              status: "pending"
            });

            existingSet.add(key);
          }
        }
      }
    }

    // 다시 로드
    const todayStr = new Date().toISOString().split("T")[0];
    const { data: orders } = await supabase
      .from("pending_orders")
      .select("*")
      .eq("order_date", todayStr)
      .order("created_at", { ascending: true });

    if (orders) setPendingOrders(orders);
  };

  const buildMessage = (template: string, data: any) => {
    return template
      .replace("{month}", data.month)
      .replace("{day}", data.day)
      .replace("{qty}", data.qty)
      .replace("{customer}", data.customer)
      .replace("{option_name}", data.option_name)
      .replace("{spec}", data.spec)
      .replace("{color}", data.color);
  };

  const extractColor = (text: string) => {
    const colors = ["화이트", "흰색", "백색", "그레이", "회색", "베이지", "아이보리", "블랙", "검정", "우드", "나무", "브라운", "갈색"];
    for (const color of colors) {
      if (text.includes(color)) return color;
    }
    return null;
  };

  // 배차 메시지 생성
  const generateDispatchMessage = (task: DeliveryTask) => {
    const type = task.contract_type || "order";
    const [year, month, day] = task.delivery_date.split("-").map(Number);
    const dateStr = `${month}/${day}`;
    const spec = task.spec || "";
    const qty = getQty(task);

    let saleType = "신품판매";
    if (type === "used") saleType = "중고판매";
    else if (type === "rental") saleType = "임대";

    let text = `사장님 (${dateStr}) ${saleType} (${spec})(${qty})-동 상차 현대`;
    if (task.site_addr) text += ` 하차 ${task.site_addr}`;
    else text += ` 하차 `;
    if (task.memo) text += ` ${task.memo}`;
    text += ` ${task.customer_name || ""}`;
    if (task.customer_phone) text += ` 인수자${task.customer_phone}`;
    else text += ` 인수자`;
    text += ` 입니다~`;

    return text;
  };

  const getQty = (task: DeliveryTask) => {
    if (!task.items || task.items.length === 0) return 1;
    const containerItem = task.items.find((i: any) => {
      const name = (i.optionName || i.displayName || "").toLowerCase();
      return name.includes("컨테이너") || name.includes("신품") || name.includes("중고");
    });
    return containerItem?.qty || 1;
  };

  // 주문 상태 업데이트
  const updateOrderStatus = async (id: number, status: string) => {
    await supabase
      .from("pending_orders")
      .update({ status })
      .eq("id", id);

    setPendingOrders(prev =>
      prev.map(o => (o.id === id ? { ...o, status } : o))
    );
  };

  // 배차 상태 업데이트
  const updateDispatchStatus = async (quoteId: string, status: string) => {
    await supabase
      .from("quotes")
      .update({ dispatch_status: status })
      .eq("quote_id", quoteId);

    setDeliveryTasks(prev =>
      prev.map(d => (d.quote_id === quoteId ? { ...d, dispatch_status: status } : d))
    );
  };

  // 메시지 수정 저장
  const saveEditMessage = async (id: number | string, type: "order" | "dispatch") => {
    if (type === "order") {
      await supabase
        .from("pending_orders")
        .update({ message: editMessage })
        .eq("id", id);

      setPendingOrders(prev =>
        prev.map(o => (o.id === id ? { ...o, message: editMessage } : o))
      );
    }
    setEditingId(null);
    setEditMessage("");
  };

  // 수동 복사 (실패 시 사용)
  const handleManualCopy = async (message: string, id: number | string, type: "order" | "dispatch", chatRoom: string) => {
    try {
      await navigator.clipboard.writeText(message);
      alert(`📋 메시지가 복사되었습니다!\n\n카카오톡 "${chatRoom}" 채팅방에 붙여넣기 하세요.`);
      
      if (type === "order") {
        await updateOrderStatus(id as number, "완료");
      } else {
        await updateDispatchStatus(id as string, "완료");
      }
    } catch (err) {
      const textarea = document.createElement("textarea");
      textarea.value = message;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      alert(`📋 메시지가 복사되었습니다!`);
    }
  };

  // 상태별 뱃지 렌더링
  const renderStatusBadge = (status: string, sentAt?: string) => {
    switch (status) {
      case "pending":
        return (
          <span style={{
            padding: "3px 8px",
            background: "#fff3e0",
            color: "#e65100",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 700
          }}>
            ⏳ 전송 대기
          </span>
        );
      case "sent":
        return (
          <span style={{
            padding: "3px 8px",
            background: "#e8f5e9",
            color: "#2e7d32",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 700
          }}>
            ✅ 자동 전송 완료
            {sentAt && <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.8 }}>
              ({new Date(sentAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })})
            </span>}
          </span>
        );
      case "failed":
        return (
          <span style={{
            padding: "3px 8px",
            background: "#ffebee",
            color: "#c62828",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 700
          }}>
            ❌ 전송 실패
          </span>
        );
      case "완료":
        return (
          <span style={{
            padding: "3px 8px",
            background: "#4caf50",
            color: "#fff",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 700
          }}>
            ✅ 완료
          </span>
        );
      default:
        return null;
    }
  };

  // pending 재시도 (status를 pending으로 다시)
  const retryOrder = async (id: number) => {
    await updateOrderStatus(id, "pending");
  };

  const pendingCount = pendingOrders.filter(o => o.status === "pending").length;
  const failedCount = pendingOrders.filter(o => o.status === "failed").length;
  const dispatchCount = deliveryTasks.filter(d => d.dispatch_status !== "완료").length;
  const totalPending = pendingCount + failedCount + dispatchCount;

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#888" }}>
        로딩 중...
      </div>
    );
  }

  return (
    <div style={{ padding: 16, background: "#f6f7fb", minHeight: "100vh" }}>
      {/* 헤더 */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 16
      }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>
          📋 오늘 할 일
          {totalPending > 0 && (
            <span style={{
              marginLeft: 8,
              padding: "4px 10px",
              background: failedCount > 0 ? "#c62828" : "#e53935",
              color: "#fff",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 700
            }}>
              {totalPending}건
              {failedCount > 0 && ` (실패 ${failedCount})`}
            </span>
          )}
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={loadTasks}
            style={{
              padding: "8px 16px",
              background: "#2e5b86",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: 700,
              cursor: "pointer"
            }}
          >
            🔄 새로고침
          </button>
        </div>
      </div>

      {/* 자동 전송 안내 */}
      <div style={{
        background: "#e3f2fd",
        border: "1px solid #90caf9",
        borderRadius: 10,
        padding: "12px 16px",
        marginBottom: 16,
        fontSize: 13
      }}>
        <strong>🤖 자동 전송 시스템</strong>
        <div style={{ marginTop: 4, color: "#1565c0" }}>
          Python 스크립트가 매일 오전 9시에 자동으로 카카오톡 전송합니다.
          <br />
          전송 실패 시 아래에서 수동으로 복사하여 전송할 수 있습니다.
        </div>
      </div>

      {/* 자재 주문 섹션 */}
      <div style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        marginBottom: 16,
        overflow: "hidden"
      }}>
        <div style={{
          padding: "14px 16px",
          borderBottom: "1px solid #eee",
          background: "#fafbfc",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>📦 자재 주문</span>
          <div style={{ display: "flex", gap: 6 }}>
            {failedCount > 0 && (
              <span style={{
                padding: "4px 10px",
                background: "#ffebee",
                color: "#c62828",
                borderRadius: 12,
                fontSize: 12,
                fontWeight: 700
              }}>
                ❌ {failedCount}건 실패
              </span>
            )}
            <span style={{
              padding: "4px 10px",
              background: pendingCount > 0 ? "#fff3e0" : "#e8f5e9",
              color: pendingCount > 0 ? "#e65100" : "#2e7d32",
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 700
            }}>
              {pendingCount > 0 ? `⏳ ${pendingCount}건 대기` : "✅ 완료"}
            </span>
          </div>
        </div>

        <div style={{ padding: 12 }}>
          {pendingOrders.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "#888" }}>
              오늘 주문할 자재가 없습니다
            </div>
          ) : (
            pendingOrders.map(order => {
              const isComplete = order.status === "sent" || order.status === "완료";
              const isFailed = order.status === "failed";

              return (
                <div
                  key={order.id}
                  style={{
                    background: isComplete ? "#f5f5f5" : isFailed ? "#fff5f5" : "#fff",
                    border: `1px solid ${isFailed ? "#ffcdd2" : "#e5e7eb"}`,
                    borderRadius: 10,
                    padding: 14,
                    marginBottom: 10,
                    opacity: isComplete ? 0.7 : 1
                  }}
                >
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8
                  }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>
                      → {order.chat_room}
                    </span>
                    {renderStatusBadge(order.status, order.sent_at)}
                  </div>

                  <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
                    출고일: {order.delivery_date}
                    {order.error_message && (
                      <span style={{ color: "#c62828", marginLeft: 8 }}>
                        | 오류: {order.error_message}
                      </span>
                    )}
                  </div>

                  {editingId === order.id ? (
                    <div>
                      <textarea
                        value={editMessage}
                        onChange={(e) => setEditMessage(e.target.value)}
                        style={{
                          width: "100%",
                          padding: 10,
                          border: "1px solid #ddd",
                          borderRadius: 6,
                          fontSize: 13,
                          minHeight: 60,
                          resize: "vertical",
                          boxSizing: "border-box"
                        }}
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button
                          onClick={() => setEditingId(null)}
                          style={{
                            flex: 1,
                            padding: 8,
                            background: "#f5f5f5",
                            border: "1px solid #ddd",
                            borderRadius: 6,
                            cursor: "pointer"
                          }}
                        >
                          취소
                        </button>
                        <button
                          onClick={() => saveEditMessage(order.id, "order")}
                          style={{
                            flex: 1,
                            padding: 8,
                            background: "#2e5b86",
                            color: "#fff",
                            border: "none",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontWeight: 700
                          }}
                        >
                          저장
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        background: "#f9f9f9",
                        padding: 10,
                        borderRadius: 6,
                        fontSize: 13,
                        lineHeight: 1.5,
                        marginBottom: 10
                      }}
                    >
                      {order.message}
                    </div>
                  )}

                  {/* 버튼 영역 */}
                  {editingId !== order.id && (
                    <div style={{ display: "flex", gap: 8 }}>
                      {/* pending 상태: 수정만 가능 */}
                      {order.status === "pending" && (
                        <button
                          onClick={() => {
                            setEditingId(order.id);
                            setEditMessage(order.message);
                          }}
                          style={{
                            flex: 1,
                            padding: 10,
                            background: "#fff",
                            border: "1px solid #2e5b86",
                            color: "#2e5b86",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontWeight: 600
                          }}
                        >
                          ✏️ 메시지 수정
                        </button>
                      )}

                      {/* failed 상태: 재시도 + 수동 복사 */}
                      {isFailed && (
                        <>
                          <button
                            onClick={() => retryOrder(order.id)}
                            style={{
                              flex: 1,
                              padding: 10,
                              background: "#fff3e0",
                              border: "1px solid #ff9800",
                              color: "#e65100",
                              borderRadius: 6,
                              cursor: "pointer",
                              fontWeight: 600
                            }}
                          >
                            🔄 재시도
                          </button>
                          <button
                            onClick={() => handleManualCopy(order.message, order.id, "order", order.chat_room)}
                            style={{
                              flex: 1,
                              padding: 10,
                              background: "#2e5b86",
                              color: "#fff",
                              border: "none",
                              borderRadius: 6,
                              cursor: "pointer",
                              fontWeight: 700
                            }}
                          >
                            📋 수동 복사 & 완료
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 배차 요청 섹션 */}
      <div style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        overflow: "hidden"
      }}>
        <div style={{
          padding: "14px 16px",
          borderBottom: "1px solid #eee",
          background: "#fafbfc",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>🚚 배차 요청 (내일 출고)</span>
          <span style={{
            padding: "4px 10px",
            background: dispatchCount > 0 ? "#fff3e0" : "#e8f5e9",
            color: dispatchCount > 0 ? "#e65100" : "#2e7d32",
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 700
          }}>
            {dispatchCount > 0 ? `${dispatchCount}건 대기` : "✅ 완료"}
          </span>
        </div>

        <div style={{ padding: 12 }}>
          {deliveryTasks.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "#888" }}>
              내일 출고 예정 건이 없습니다
            </div>
          ) : (
            deliveryTasks.map(task => {
              const message = generateDispatchMessage(task);
              const isComplete = task.dispatch_status === "완료";

              return (
                <div
                  key={task.quote_id}
                  style={{
                    background: isComplete ? "#f5f5f5" : "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    padding: 14,
                    marginBottom: 10,
                    opacity: isComplete ? 0.7 : 1
                  }}
                >
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8
                  }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>
                      [{task.contract_type === "rental" ? "임대" : task.contract_type === "used" ? "중고" : "신품"}]
                      {task.spec} - {task.customer_name}
                    </span>
                    {isComplete && (
                      <span style={{
                        padding: "3px 8px",
                        background: "#4caf50",
                        color: "#fff",
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 700
                      }}>
                        ✅ 완료
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
                    출고일: {task.delivery_date} | 연락처: {task.customer_phone || "-"}
                  </div>

                  <div
                    style={{
                      background: "#f9f9f9",
                      padding: 10,
                      borderRadius: 6,
                      fontSize: 13,
                      lineHeight: 1.5,
                      marginBottom: 10
                    }}
                  >
                    {message}
                  </div>

                  {!isComplete && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => handleManualCopy(message, task.quote_id, "dispatch", "배차기사")}
                        style={{
                          flex: 1,
                          padding: 10,
                          background: "#2e5b86",
                          color: "#fff",
                          border: "none",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontWeight: 700
                        }}
                      >
                        📋 복사 & 완료
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
