/* render.js — vẽ cây ra màn hình và xử lý kéo/phóng to.
   Nhận trạng thái, gọi GP.layout, dựng DOM. Không sửa dữ liệu. */
window.GP = window.GP || {};

GP.render = (function () {
  'use strict';

  var MIN_SCALE = 0.12, MAX_SCALE = 2.5;

  var viewport, canvas, svg, boxLayer, listEl;
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

  /* ---------- chế độ tiêu điểm: danh sách dọc ----------
     Trên điện thoại, xếp cây theo hàng ngang là không đọc nổi khi một đời đông con.
     Chế độ tiêu điểm bỏ hẳn khung kéo/phóng, thay bằng một danh sách dọc cuộn tự nhiên:
     cha ở trên (bấm để lên), ô đang xem (đầy đủ chi tiết), rồi các con xếp dọc — bấm một
     người con là đi vào nhánh đó. Chỉ hiện đúng nhánh đang xem. */

  function tenChinh(n) {
    var p = n.doiTruyen === 'vo' ? n.vo[0] : n.chong;
    return GP.data.fullName(p) || 'chưa đặt tên';
  }

  function cardRows(n) {
    var rows = personRow(n.chong, 'Ông:', n.doiTruyen === 'chong');
    n.vo.forEach(function (v, i) {
      rows += personRow(v, n.vo.length > 1 ? 'Bà ' + (i + 1) + ':' : 'Bà:', n.doiTruyen === 'vo' && i === 0);
    });
    return rows;
  }

  /* Một thẻ trong danh sách dọc, dùng lại đúng các dòng người của bản cây (personRow)
     nên chữ, màu, dấu âm lịch… giống hệt, không có bộ vẽ thứ ba. */
  function doiCard(cls, id, dau, nut, duoi) {
    var n = GP.data.node(id);
    var depth = GP.data.ancestors(id).length;
    var kh = matchIds[id] ? ' khop' : '';
    var navAttr = cls.indexOf('d-con') >= 0 ? ' data-nav="' + id + '" role="button" tabindex="0"' : '';
    return '<div class="box ' + cls + kh + '"' + navAttr + '>' +
      '<div class="d-dau"><span class="doi">Đời ' + (depth + 1) + dau + '</span>' + nut + '</div>' +
      cardRows(n) + (duoi || '') + '</div>';
  }

  function renderList(state) {
    var nodes = state.nodes;
    var f = nodes[focusId];
    var parentId = GP.data.parentMap()[focusId];
    var h = '<div class="dcol">';

    if (parentId) {
      h += '<div class="d-len" data-nav="' + parentId + '" role="button" tabindex="0">' +
        '<span class="d-len-mui">↑</span><span>Lên đời trên · ' + esc(tenChinh(nodes[parentId])) + '</span></div>';
    }

    h += doiCard('la-focus', focusId, ' · đang xem',
      '<button class="d-sua" data-edit="' + focusId + '">✎ Sửa</button>', '');

    var con = f.con;
    h += '<div class="d-nhan-con">Các con (' + con.length + ')</div>';
    if (!con.length) {
      h += '<div class="d-trong">Chưa có người con nào. Bấm “Thêm con” để thêm.</div>';
    } else {
      con.forEach(function (cid) {
        var soCon = nodes[cid].con.length;
        var hint = soCon ? soCon + ' con ›' : 'xem ›';
        h += doiCard('d-con', cid, '', '', '<div class="d-vao">' + hint + '</div>');
      });
    }
    h += '<button class="d-them" data-add="' + focusId + '">＋ Thêm con</button>';
    h += '</div>';
    listEl.innerHTML = h;
  }

  function draw(state) {
    if (focusMode && focusId && state.nodes[focusId]) {
      renderList(state);
      listEl.hidden = false;
      canvas.style.display = 'none';
      lastLayout = null;
      return { boxes: [], edges: [], width: 0, height: 0, byId: {} };
    }
    canvas.style.display = '';
    listEl.hidden = true;
    var L = GP.layout.compute(state);
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

  function scrollListTop() { if (listEl) listEl.scrollTop = 0; }

  function fit() {
    if (focusMode) { scrollListTop(); return; }   // chế độ danh sách dùng cuộn thật, không "vừa khung"
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
      if (focusMode) return;                // chế độ danh sách: để cuộn tự nhiên
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
      if (focusMode) return;                // để trang cuộn danh sách bình thường
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
    }, { passive: false });

    // cảm ứng: một ngón kéo, hai ngón phóng to
    var touch = null;
    viewport.addEventListener('touchstart', function (e) {
      if (focusMode) return;                // chế độ danh sách: cuộn cảm ứng tự nhiên
      if (e.touches.length === 1) {
        if (e.target.closest('.box')) return;
        touch = { mode: 'pan', x: e.touches[0].clientX, y: e.touches[0].clientY, tx: view.tx, ty: view.ty };
      } else if (e.touches.length === 2) {
        touch = { mode: 'pinch', d: dist(e.touches), s: view.scale };
      }
    }, { passive: true });

    viewport.addEventListener('touchmove', function (e) {
      if (focusMode) return;                // đừng preventDefault, để cuộn danh sách chạy
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

  function initList() {
    listEl.addEventListener('click', function (e) {
      var edit = e.target.closest('[data-edit]');
      if (edit) { if (on.select) on.select(edit.dataset.edit); return; }
      var add = e.target.closest('[data-add]');
      if (add) { if (on.addChild) on.addChild(add.dataset.add); return; }
      var nav = e.target.closest('[data-nav]');
      if (nav) { if (on.focusNav) on.focusNav(nav.dataset.nav); return; }
    });
  }

  function init(opts) {
    viewport = document.getElementById('viewport');
    canvas = document.getElementById('canvas');
    svg = document.getElementById('lines');
    boxLayer = document.getElementById('boxes');
    listEl = document.getElementById('dan-doc');
    on = opts || {};
    initPanZoom();
    initClicks();
    initList();
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
    scrollListTop: scrollListTop,
    isFocusMode: function () { return focusMode; },
    getFocus: function () { return focusId; },
    setMatches: function (ids) {
      matchIds = {};
      (ids || []).forEach(function (id) { matchIds[id] = true; });
    },
    layout: function () { return lastLayout; }
  };
})();
