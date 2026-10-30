// predictor.js —— 预测核心（与 Python 版 predictor.py 对应），在浏览器里直接计算，不联网
// 1. validateRecord()  检查一条输入：11 项是否填全、数字是否合法、涂层是否在 5 种之内
// 2. predictOne()      用导出的 SVR 参数算预测深度（mm）、80% 区间、是否显示红字
// 计算步骤与 sklearn 完全一致：标准化 -> one-hot -> RBF 核 SVR -> expm1 还原成毫米
(function (root) {
  // 在 node 里测试时用 require 读入；在浏览器里直接用全局变量
  var CONFIG = root.CONFIG || require("./config.js");
  var MODEL = root.MODEL || require("./model.js");

  // 判断"没填"：空、null、全是空格
  function isBlank(v) {
    return v === undefined || v === null || String(v).trim() === "";
  }

  // 只接受英文小数点的普通数字，例如 6.84、-1.95、1e3；"6,84"、"abc" 都算格式不对
  var NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

  // 显示用的名称："中文名 英文列名"（pH 中英相同只显示一次）
  function labelOf(col) {
    var zh = CONFIG.FEATURE_LABELS[col];
    return zh === col ? col : zh + " " + col;
  }

  // 检查一条输入，返回 {clean: 转换好的数据 或 null, errors: 中文问题列表}
  function validateRecord(raw) {
    var missing = [], bad = [], clean = {};
    // 逐个检查 10 个数值特征
    CONFIG.NUMERIC_COLUMNS.forEach(function (col) {
      var v = raw[col];
      if (isBlank(v)) { missing.push(labelOf(col)); return; }
      var s = String(v).trim();
      if (!NUMBER_RE.test(s) || !isFinite(Number(s))) {
        bad.push(labelOf(col) + "（填的是「" + v + "」，不是有效数字，请用英文小数点）");
        return;
      }
      clean[col] = Number(s);
    });
    // 检查涂层类型
    var c = raw[CONFIG.CATEGORY_COLUMN];
    var cl = labelOf(CONFIG.CATEGORY_COLUMN);
    if (isBlank(c)) {
      missing.push(cl);
    } else {
      c = String(c).trim().toUpperCase();
      if (CONFIG.COATING_TYPES.indexOf(c) < 0) {
        bad.push(cl + "（填的是「" + c + "」，只能是 " + CONFIG.COATING_TYPES.join(" / ") + "）");
      } else {
        clean[CONFIG.CATEGORY_COLUMN] = c;
      }
    }
    var errors = [];
    if (missing.length) errors.push("缺少：" + missing.join("、"));
    if (bad.length) errors.push("格式不对：" + bad.join("；"));
    return errors.length ? { clean: null, errors: errors } : { clean: clean, errors: [] };
  }

  // 预处理：10 个数值做标准化 (x-均值)/标准差，再接 5 个 one-hot（0/1）列，共 15 个数
  function transform(rec) {
    var x = [];
    for (var i = 0; i < MODEL.numeric_columns.length; i++) {
      x.push((rec[MODEL.numeric_columns[i]] - MODEL.scaler_mean[i]) / MODEL.scaler_scale[i]);
    }
    for (var j = 0; j < MODEL.categories.length; j++) {
      x.push(rec[MODEL.category_column] === MODEL.categories[j] ? 1 : 0);
    }
    return x;
  }

  // SVR 预测（对数尺度）：Σ 权重 × exp(-gamma × 到支持向量距离²) + 截距
  function svrDecision(x) {
    var sum = 0;
    for (var k = 0; k < MODEL.support_vectors.length; k++) {
      var sv = MODEL.support_vectors[k], d2 = 0;
      for (var i = 0; i < x.length; i++) { var d = x[i] - sv[i]; d2 += d * d; }
      sum += MODEL.dual_coef[k] * Math.exp(-MODEL.gamma * d2);
    }
    return sum + MODEL.intercept;
  }

  // 对一条【已检查通过】的输入做预测：expm1 还原成毫米，再加减区间半宽（下限不低于 0）
  // 注意：这里不做风险分级，等级由 grading.js 负责
  function predictOne(rec) {
    var hw = MODEL.conformal_half_width_mm;
    var p = Math.expm1(svrDecision(transform(rec)));
    return {
      pred_mm: p,
      lower_mm: Math.max(0, p - hw),
      upper_mm: p + hw,
      deep_warning: p >= CONFIG.DEEP_PIT_WARNING_MM   // 只是红字提示开关，不是分级
    };
  }

  var api = { validateRecord: validateRecord, predictOne: predictOne, labelOf: labelOf,
              halfWidth: function () { return MODEL.conformal_half_width_mm; } };
  root.PREDICTOR = api;
  if (typeof module !== "undefined") { module.exports = api; }
})(typeof window !== "undefined" ? window : globalThis);
