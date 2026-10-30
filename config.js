// config.js —— 全局配置（所有"写死的设定"集中放在这里），与 Python 版 config.py 完全对应
var CONFIG = {
  // 10 个数值特征：[英文列名, 中文名, 单位]（只用这 11 个特征，不增不减）
  NUMERIC_FEATURES: [
    ["pipe_age_year", "管龄", "年"],
    ["pH", "pH", "无单位"],
    ["pipe_soil_potential_V", "管地电位", "V"],
    ["resistivity_ohm_m", "电阻率", "Ω·m"],
    ["water_content_pct", "含水率", "%"],
    ["bulk_density_g_per_ml", "容重", "g/mL"],
    ["chloride_ppm", "氯离子", "ppm"],
    ["bicarbonate_ppm", "碳酸氢根", "ppm"],
    ["sulfate_ppm", "硫酸根", "ppm"],
    ["redox_potential_mV", "氧化还原电位", "mV"]
  ],
  // 1 个类别特征：涂层类型，只允许这 5 种
  CATEGORY_COLUMN: "coating_type",
  CATEGORY_LABEL: "涂层类型",
  COATING_TYPES: ["CTC", "WTC", "NC", "FBE", "AEC"],
  CONFORMAL_LEVEL: 0.80,
  // 深坑红字提示的触发值（毫米）——【不是】风险分级阈值，只决定是否显示红字。
  // 取值依据：259 组真实深度 dmax 的第 90 百分位数 4.756 mm，取 4.76 mm（已由项目方确认）。
  DEEP_PIT_WARNING_MM: 4.76,
  DEEP_PIT_WARNING_TEXT: "深坑样本少，模型可能低估，请结合实测复核"
};
// 派生出来的列表：数值列名、全部 11 个列名、英文名 -> 中文名
CONFIG.NUMERIC_COLUMNS = CONFIG.NUMERIC_FEATURES.map(function (f) { return f[0]; });
CONFIG.FEATURE_COLUMNS = CONFIG.NUMERIC_COLUMNS.concat([CONFIG.CATEGORY_COLUMN]);
CONFIG.FEATURE_LABELS = {};
CONFIG.NUMERIC_FEATURES.forEach(function (f) { CONFIG.FEATURE_LABELS[f[0]] = f[1]; });
CONFIG.FEATURE_LABELS[CONFIG.CATEGORY_COLUMN] = CONFIG.CATEGORY_LABEL;
if (typeof module !== "undefined") { module.exports = CONFIG; }
