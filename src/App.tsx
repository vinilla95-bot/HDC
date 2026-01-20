<td className="v">1688-1447</td>
</tr>
<tr>
                <td className="sum" colSpan={6}>
                  합계금액 : ₩{fmt(form.vatIncluded !== false ? total_amount : supply_amount)} ({form.vatIncluded !== false ? "부가세 포함" : "부가세 별도"})
                </td>
              </tr>
  <td className="sum" colSpan={6}>
    합계금액 : ₩{fmt(form.vatIncluded !== false ? total_amount : supply_amount)} (
    {editable && setForm ? (
      <select
        value={form.vatIncluded !== false ? "included" : "excluded"}
        onChange={(e) => setForm((p: any) => ({ ...p, vatIncluded: e.target.value === "included" }))}
        style={{ 
          border: "none", 
          background: "transparent", 
          fontSize: 14, 
          fontWeight: 900,
          cursor: "pointer"
        }}
      >
        <option value="included">부가세 포함</option>
        <option value="excluded">부가세 별도</option>
      </select>
    ) : (
      form.vatIncluded !== false ? "부가세 포함" : "부가세 별도"
    )}
    )
  </td>
</tr>
</tbody>
</table>
