// grading.js —— 风险分级（预留位置）
// 本版（v1）分级规则还没定，所以这里【不编任何阈值】，一律返回「待定（规则未定）」。
// 预测代码（predictor.js）只算深度和区间，不包含任何等级判断；以后定了规则只改这个文件。
var GRADING = {
  PENDING_GRADE: "待定（规则未定）",
  // 输入：预测深度（mm）、80% 区间上限（mm）；输出：等级文字。本版固定返回「待定」。
  // TODO（等分级规则确定后再填）：
  //   - 在这里根据 predMm 和/或 upperMm 判断高/中/低等级；
  //   - 阈值由项目方确定后写入，不要写进 predictor.js / app.js；
  //   - 填好后，单条页和批量页会自动显示新等级，无需改其他代码。
  grade: function (predMm, upperMm) {
    return GRADING.PENDING_GRADE;
  }
};
if (typeof module !== "undefined") { module.exports = GRADING; }
