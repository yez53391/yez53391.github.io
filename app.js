// app.js —— 页面逻辑：生成输入表单、切换三个页面、处理单条预测、批量 CSV 上传/排序/导出
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var lastBatchRows = [];   // 最近一次批量计算的结果（用于导出）

  // 把文字中的特殊符号转义，防止 CSV 里的内容被当成网页代码执行（安全措施）
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // 切换页面：只显示指定的那一部分
  function show(pageId) {
    ["page-input", "page-result", "page-batch"].forEach(function (id) {
      $(id).classList.toggle("active", id === pageId);
    });
    window.scrollTo(0, 0);
  }

  // 显示 / 隐藏红色错误框
  function showErrors(boxId, errors) {
    var box = $(boxId);
    box.innerHTML = errors.map(function (e) { return "<p>" + esc(e) + "</p>"; }).join("");
    box.style.display = errors.length ? "block" : "none";
  }

  // ---------- 初始化：生成 11 行输入框、填页脚的区间半宽 ----------
  function buildForm() {
    var rows = CONFIG.NUMERIC_FEATURES.map(function (f) {
      return "<tr><td>" + f[1] + "</td><td><code>" + f[0] + "</code></td><td>" + f[2] +
        '</td><td><input type="text" inputmode="decimal" name="' + f[0] + '" placeholder="数字，英文小数点"></td></tr>';
    });
    var opts = '<option value="">-- 请选择 --</option>' +
      CONFIG.COATING_TYPES.map(function (c) { return '<option value="' + c + '">' + c + "</option>"; }).join("");
    rows.push("<tr><td>" + CONFIG.CATEGORY_LABEL + "</td><td><code>" + CONFIG.CATEGORY_COLUMN +
      '</code></td><td>类别</td><td><select name="' + CONFIG.CATEGORY_COLUMN + '">' + opts + "</select></td></tr>");
    $("input-table").insertAdjacentHTML("beforeend", rows.join(""));
    $("col-list").textContent = CONFIG.FEATURE_COLUMNS.join(", ");
    $("hw").textContent = PREDICTOR.halfWidth().toFixed(2);
    document.querySelectorAll(".level").forEach(function (el) {
      el.textContent = Math.round(CONFIG.CONFORMAL_LEVEL * 100);
    });
  }

  // ---------- 第 1 页 -> 第 2 页：单条预测 ----------
  // 有缺项/错项：留在输入页，红字列出问题（已填内容保留）；全部正确：显示结果页
  function onPredict(ev) {
    ev.preventDefault();
    var form = $("input-form"), raw = {};
    CONFIG.FEATURE_COLUMNS.forEach(function (c) { raw[c] = form.elements[c].value; });
    var v = PREDICTOR.validateRecord(raw);
    showErrors("input-errors", v.errors);
    if (v.errors.length) { window.scrollTo(0, 0); return; }
    var res = PREDICTOR.predictOne(v.clean);
    $("r-pred").textContent = res.pred_mm.toFixed(1) + " mm";
    $("r-interval").textContent = res.lower_mm.toFixed(1) + " – " + res.upper_mm.toFixed(1) + " mm";
    $("r-grade").textContent = GRADING.grade(res.pred_mm, res.upper_mm);   // 本版固定「待定」
    $("r-warning").textContent = CONFIG.DEEP_PIT_WARNING_TEXT;
    $("r-warning").style.display = res.deep_warning ? "block" : "none";     // 只在深坑时显示
    $("r-inputs").innerHTML = CONFIG.FEATURE_COLUMNS.map(function (c) {
      return "<tr><td>" + CONFIG.FEATURE_LABELS[c] + "</td><td><code>" + c + "</code></td><td>" + esc(v.clean[c]) + "</td></tr>";
    }).join("");
    show("page-result");
  }

  // ---------- CSV 读取 ----------
  // 解码：先按 UTF-8（含 BOM），不是 UTF-8 时按 GBK（中文 Excel 另存的普通 CSV）
  function decode(buf) {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^\uFEFF/, ""); }
    catch (e) { return new TextDecoder("gbk").decode(buf); }
  }

  // 把 CSV 文字拆成二维表（支持引号包起来的单元格）
  function parseCSV(text) {
    var rows = [], row = [], cell = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    // 去掉完全空白的行
    return rows.filter(function (r) { return r.some(function (c) { return c.trim() !== ""; }); });
  }

  // ---------- 第 3 页：批量计算 ----------
  // 1. 检查 11 列是否齐全；2. 逐行检查，坏行列出行号和原因后跳过；3. 按区间上限从高到低排序
  function runBatch(text) {
    var table = parseCSV(text);
    if (!table.length) return { errors: ["CSV 文件是空的"], rows: [] };
    var header = table[0].map(function (h) { return h.trim(); });
    var missing = CONFIG.FEATURE_COLUMNS.filter(function (c) { return header.indexOf(c) < 0; })
      .map(PREDICTOR.labelOf);
    if (missing.length) return { errors: ["CSV 缺少以下列（列名要和英文列名完全一致）：" + missing.join("、")], rows: [] };
    if (table.length < 2) return { errors: ["CSV 里没有数据行"], rows: [] };
    var idCol = ["编号", "id", "ID", "entry"].filter(function (c) { return header.indexOf(c) >= 0; })[0];
    var errors = [], rows = [];
    table.slice(1).forEach(function (cells, k) {
      var rec = {};
      header.forEach(function (h, j) { rec[h] = cells[j]; });
      var n = k + 1;
      var rid = (idCol && rec[idCol] ? String(rec[idCol]).trim() : "") || String(n);
      var v = PREDICTOR.validateRecord(rec);
      if (v.errors.length) { errors.push("第 " + n + " 行数据（编号 " + rid + "）已跳过：" + v.errors.join("；")); return; }
      var res = PREDICTOR.predictOne(v.clean);
      rows.push({ id: rid, pred_mm: res.pred_mm, upper_mm: res.upper_mm, grade: GRADING.grade(res.pred_mm, res.upper_mm) });
    });
    rows.sort(function (a, b) { return b.upper_mm - a.upper_mm; });   // 区间上限从高到低
    return { errors: errors, rows: rows };
  }

  // 把批量结果画成表格
  function renderBatch(out) {
    showErrors("batch-errors", out.errors);
    lastBatchRows = out.rows;
    if (!out.rows.length) { $("batch-result").style.display = "none"; return; }
    $("batch-summary").textContent = "共 " + out.rows.length + " 行，已按「区间上限」从高到低排序。";
    $("batch-table").innerHTML = "<tr><th>编号</th><th>预测深度 (mm)</th><th>区间上限 (mm)</th><th>风险等级</th></tr>" +
      out.rows.map(function (r) {
        return "<tr><td>" + esc(r.id) + "</td><td>" + r.pred_mm.toFixed(1) + "</td><td>" + r.upper_mm.toFixed(1) +
          '</td><td class="grey">' + esc(r.grade) + "</td></tr>";
      }).join("");
    $("batch-result").style.display = "block";
  }

  // 点「上传并计算」：读文件 -> 计算 -> 显示
  function onBatch() {
    var f = $("batch-file").files[0];
    if (!f) { renderBatch({ errors: ["请先选择一个 CSV 文件再上传"], rows: [] }); return; }
    var reader = new FileReader();
    reader.onload = function () {
      try { renderBatch(runBatch(decode(reader.result))); }
      catch (e) { renderBatch({ errors: ["读取文件失败：" + e.message], rows: [] }); }
    };
    reader.readAsArrayBuffer(f);
  }

  // 生成导出用的 CSV 文字（开头加 BOM \uFEFF，Excel 打开中文不乱码）
  function exportCSV(rows) {
    var q = function (s) { s = String(s); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var lines = ["编号,预测深度_mm,区间上限_mm,风险等级"].concat(rows.map(function (r) {
      return [q(r.id), r.pred_mm.toFixed(2), r.upper_mm.toFixed(2), q(r.grade)].join(",");
    }));
    return "\uFEFF" + lines.join("\r\n") + "\r\n";
  }

  // 点「导出」：在浏览器里生成文件并下载（不经过任何服务器）
  function onExport() {
    var blob = new Blob([exportCSV(lastBatchRows)], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "batch_result.csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  // 给 node 测试用：把批量计算和导出函数暴露出来
  window.APP_TEST = { runBatch: runBatch, exportCSV: exportCSV, decode: decode };

  // ---------- 绑定按钮 ----------
  buildForm();
  $("input-form").addEventListener("submit", onPredict);
  $("nav-input").addEventListener("click", function () { show("page-input"); });
  $("nav-batch").addEventListener("click", function () { show("page-batch"); });
  $("back-input").addEventListener("click", function (e) { e.preventDefault(); show("page-input"); });
  $("batch-run").addEventListener("click", onBatch);
  $("batch-export").addEventListener("click", onExport);
})();
