/* render.js — vẽ cây ra màn hình và xử lý kéo/phóng to.
   Nhận trạng thái, gọi GP.layout, dựng DOM. Không sửa dữ liệu. */
window.GP = window.GP || {};

GP.render = (function () {
  'use strict';

  var MIN_SCALE = 0.12, MAX_SCALE = 2.5;

  var viewport, canvas, svg, boxLayer;
  var view = { tx: 40, ty: 40, scale: 1 };
  var lastLayout = null;
  var selectedId = null;
  var matchIds = {};
  var focusMode = false;   // chỉ xem cửa sổ 3 đời quanh một người
  var focusId = null;      // người đang làm tiêu điểm
  var on = {};

  /* ---------- chữ hiển thị ---------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* "ÂL" viết nhỏ nhấc lên chứ không phải chữ thường: dòng năm chỉ rộng chừng 195px,
     thêm hai chữ cỡ thường cho cả sinh lẫn mất là tràn. */
  function mocHTML(nhan, chu, am) {
    return '<span class="nhan-nam">' + nhan + ':</span>' + esc(chu) +
      (am ? '<sup class="lich-am" title="âm lịch">ÂL</sup>' : '');
  }

  function lifeHTML(p) {
    var s = GP.nguoi.sinh(p);
    var m = GP.nguoi.mat(p);
    var out = [];
    if (s) out.push(mocHTML('S', s, GP.nguoi.amSinh(p)));
    if (m) out.push(mocHTML('M', m, GP.nguoi.amMat(p)));
    // <br> chứ không để CSS tự ngắt: chỗ ngắt phải trùng đúng chỗ layout.js đã chừa
    return out.join(GP.layout.namHaiDong(p) ? '<br>' : '<span class="cach-nam"></span>');
  }

  /* ---------- dựng DOM ---------- */

  function ghiChuHTML(p) {
    var t = GP.nguoi.ghiChu(p);
    if (!t) return '';
    // CSS cắt ở 2 dòng; title giữ nguyên văn để rê chuột đọc được phần bị cắt
    return '<div class="dong-ghi-chu" title="' + esc(t) + '">' + esc(t) + '</div>';
  }

  /* Ba dòng cho mỗi người: họ & tên đệm (đậm, hoa) — tên riêng — năm sinh/mất,
     thêm dòng ghi chú nếu có.
     Viết hoa bằng CSS chứ không bằng JS, để dữ liệu gốc giữ nguyên cách gõ của người dùng. */
  function personRow(p, label, isBlood) {
    var ho = esc(GP.nguoi.ho(p)), ten = esc(GP.nguoi.ten(p));
    var chuaNhap = !GP.nguoi.coTen(p);
    return '<div class="person' + (isBlood ? ' huyet-thong' : '') + '">' +
      '<div class="dong-ho"><span class="nhan">' + label + '</span>' +
      (chuaNhap ? '<span class="trong">chưa nhập</span>' : '<b>' + ho + '</b>') +
      '</div>' +
      '<div class="dong-ten">' + ten + '</div>' +
      '<div class="dong-nam" title="' + esc(GP.nguoi.moTa(p)) + '">' + lifeHTML(p) + '</div>' +
      ghiChuHTML(p) +
      '</div>';
  }

  function boxHTML(b) {
    var n = b.node;
    var cls = ['box'];
    if (n.id === selectedId) cls.push('chon');
    if (matchIds[n.id]) cls.push('khop');

    var rows = personRow(n.chong, 'Ông:', n.doiTruyen === 'chong');
    n.vo.forEach(function (v, i) {
      var label = n.vo.length > 1 ? 'Bà ' + (i + 1) + ':' : 'Bà:';
      rows += personRow(v, label, n.doiTruyen === 'vo' && i === 0);
    });

    var toggle = '';
    if (n.con.length) {
      // dùng trạng thái thu gọn của KHUNG NHÌN (b.collapsed), không phải cờ dữ liệu:
      // trong chế độ tiêu điểm nhiều ô bị gấp mà cờ n.thuGon vẫn false
      var dangGap = b.collapsed;
      var hidden = GP.data.branchSize(n.id) - 1;
      var title = dangGap ? (focusMode ? 'Xem nhánh này' : 'Mở nhánh') : 'Thu gọn nhánh';
      toggle = '<button class="nut-gap" data-act="toggle" title="' + title + '">' +
        (dangGap ? '+' + hidden : '−') + '</button>';
    }

    return '<div class="' + cls.join(' ') + '" data-id="' + n.id + '" style="left:' +
      b.x + 'px;top:' + b.y + 'px;width:' + b.w + 'px;height:' + b.h + 'px">' +
      '<div class="doi">Đời ' + (b.depth + 1) + '</div>' +
      rows +
      '<button class="nut-them" data-act="add" title="Thêm người con">＋ con</button>' +
      toggle +
      '</div>';
  }

  function round(v) { return Math.round(v * 10) / 10; }

  /* Chế độ tiêu điểm: chỉ vẽ một cửa sổ ba đời — cha của người đang chọn ở trên,
     người đó cùng các anh em ở giữa, các con ở dưới. Mật độ trên màn hình luôn cố định
     dù dòng họ đông tới đâu. Bấm sang ô nào thì ô đó thành tiêu điểm mới. */
  function focusOpts(state) {
    if (!focusMode || !focusId || !state.nodes[focusId]) return null;
    var parentId = GP.data.parentMap()[focusId];
    var effRoot = parentId || focusId;               // ô trên cùng của cửa sổ
    return {
      rootId: effRoot,
      baseDepth: GP.data.ancestors(effRoot).length,  // để nhãn "Đời n" vẫn là đời thật
      // chỉ mở ô trên cùng (để hiện anh em) và chính tiêu điểm (để hiện con);
      // mọi ô khác coi như thu gọn nên nhánh sâu không tràn ra
      collapsed: function (id) { return !(id === effRoot || id === focusId); }
    };
  }

  function draw(state) {
    var L = GP.layout.compute(state, focusOpts(state));
    lastLayout = L;

    var segs = [];
    L.edges.forEach(function (e) {
      var px = round(e.parent.cx), pb = round(e.parent.y + e.parent.h), by = round(e.busY);
      segs.push('M' + px + ' ' + pb + 'V' + by);
      if (e.children.length > 1) {
        var xs = e.children.map(function (c) { return c.cx; });
        segs.push('M' + round(Math.min.apply(null, xs)) + ' ' + by +
          'H' + round(Math.max.apply(null, xs)));
      }
      e.children.forEach(function (c) {
        segs.push('M' + round(c.cx) + ' ' + by + 'V' + round(c.y));
      });
    });

    svg.setAttribute('width', L.width);
    svg.setAttribute('height', L.height);
    svg.setAttribute('viewBox', '0 0 ' + L.width + ' ' + L.height);
    svg.innerHTML = '<path d="' + segs.join(' ') + '"/>';

    boxLayer.innerHTML = L.boxes.map(boxHTML).join('');
    canvas.style.width = L.width + 'px';
    canvas.style.height = L.height + 'px';
    return L;
  }

  /* ---------- kéo, phóng to ---------- */

  /* Semantic zoom: càng thu nhỏ càng bớt chi tiết để tên vẫn đọc được, không phải
     zoom ra zoom vào liên tục. Ngưỡng chọn theo mức chữ bắt đầu khó đọc.
     --s để CSS phóng ngược cỡ chữ tên, giữ nó gần như cố định trên màn hình. */
  function capNhatMatDo() {
    var s = view.scale;
    canvas.style.setProperty('--s', s);
    canvas.classList.toggle('zoom-xa', s < 0.45);
    canvas.classList.toggle('zoom-vua', s >= 0.45 && s < 0.8);
  }

  function applyView() {
    canvas.style.transform = 'translate(' + view.tx + 'px,' + view.ty + 'px) scale(' + view.scale + ')';
    capNhatMatDo();
    if (on.zoom) on.zoom(view.scale);
  }

  function clampScale(s) { return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s)); }

  /** Phóng to giữ nguyên điểm (cx,cy) trên màn hình. */
  function zoomAt(factor, cx, cy) {
    var s2 = clampScale(view.scale * factor);
    if (s2 === view.scale) return;
    var r = viewport.getBoundingClientRect();
    var px = cx - r.left, py = cy - r.top;
    view.tx = px - (px - view.tx) * (s2 / view.scale);
    view.ty = py - (py - view.ty) * (s2 / view.scale);
    view.scale = s2;
    applyView();
  }

  function zoomBy(factor) {
    var r = viewport.getBoundingClientRect();
    zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2);
  }

  function fit() {
    if (!lastLayout) return;
    var r = viewport.getBoundingClientRect();
    var pad = 48;
    var s = Math.min(
      (r.width - pad * 2) / Math.max(lastLayout.width, 1),
      (r.height - pad * 2) / Math.max(lastLayout.height, 1)
    );
    view.scale = clampScale(Math.min(s, 1));
    // căn giữa cả hai chiều; cây cao hơn khung thì bám mép trên
    var h = lastLayout.height * view.scale;
    view.tx = (r.width - lastLayout.width * view.scale) / 2;
    view.ty = h < r.height - pad * 2 ? (r.height - h) / 2 : pad;
    applyView();
  }

  function centerOn(id) {
    if (!lastLayout || !lastLayout.byId[id]) return;
    var b = lastLayout.byId[id];
    var r = viewport.getBoundingClientRect();
    view.tx = r.width / 2 - (b.x + b.w / 2) * view.scale;
    view.ty = r.height / 2 - (b.y + b.h / 2) * view.scale;
    applyView();
  }

  function initPanZoom() {
    var dragging = false, sx = 0, sy = 0, stx = 0, sty = 0, moved = false;

    viewport.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (e.target.closest('.box')) return; // bấm vào ô thì không kéo
      dragging = true; moved = false;
      sx = e.clientX; sy = e.clientY; stx = view.tx; sty = view.ty;
      viewport.classList.add('dang-keo');
    });

    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      view.tx = stx + (e.clientX - sx);
      view.ty = sty + (e.clientY - sy);
      if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 3) moved = true;
      applyView();
    });

    window.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      viewport.classList.remove('dang-keo');
      if (!moved && on.select) on.select(null); // bấm nền trống -> bỏ chọn
    });

    viewport.addEventListener('wheel', function (e) {
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
    }, { passive: false });

    // cảm ứng: một ngón kéo, hai ngón phóng to
    var touch = null;
    viewport.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) {
        if (e.target.closest('.box')) return;
        touch = { mode: 'pan', x: e.touches[0].clientX, y: e.touches[0].clientY, tx: view.tx, ty: view.ty };
      } else if (e.touches.length === 2) {
        touch = { mode: 'pinch', d: dist(e.touches), s: view.scale };
      }
    }, { passive: true });

    viewport.addEventListener('touchmove', function (e) {
      if (!touch) return;
      if (touch.mode === 'pan' && e.touches.length === 1) {
        view.tx = touch.tx + (e.touches[0].clientX - touch.x);
        view.ty = touch.ty + (e.touches[0].clientY - touch.y);
        applyView();
      } else if (touch.mode === 'pinch' && e.touches.length === 2) {
        var d = dist(e.touches);
        var mid = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2
        };
        var want = clampScale(touch.s * (d / touch.d));
        zoomAt(want / view.scale, mid.x, mid.y);
      }
      e.preventDefault();
    }, { passive: false });

    viewport.addEventListener('touchend', function () { touch = null; }, { passive: true });

    function dist(t) {
      var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
      return Math.hypot(dx, dy) || 1;
    }
  }

  function initClicks() {
    boxLayer.addEventListener('click', function (e) {
      var box = e.target.closest('.box');
      if (!box) return;
      var id = box.dataset.id;
      var act = e.target.closest('[data-act]');
      if (act && act.dataset.act === 'toggle') {
        // trong chế độ tiêu điểm, cái nút +N là để đi tới nhánh đó, không phải gấp/mở
        if (focusMode) { if (on.select) on.select(id); return; }
        if (on.toggle) on.toggle(id);
        return;
      }
      if (act && act.dataset.act === 'add') { if (on.addChild) on.addChild(id); return; }
      if (on.select) on.select(id);
    });
  }

  function init(opts) {
    viewport = document.getElementById('viewport');
    canvas = document.getElementById('canvas');
    svg = document.getElementById('lines');
    boxLayer = document.getElementById('boxes');
    on = opts || {};
    initPanZoom();
    initClicks();
    applyView();
  }

  return {
    init: init,
    draw: draw,
    fit: fit,
    zoomBy: zoomBy,
    centerOn: centerOn,
    getScale: function () { return view.scale; },
    setSelected: function (id) { selectedId = id; },
    setFocusMode: function (v) { focusMode = !!v; },
    setFocus: function (id) { focusId = id; },
    isFocusMode: function () { return focusMode; },
    getFocus: function () { return focusId; },
    setMatches: function (ids) {
      matchIds = {};
      (ids || []).forEach(function (id) { matchIds[id] = true; });
    },
    layout: function () { return lastLayout; }
  };
})();
