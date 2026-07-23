/* app.js — nối các phần lại: thanh công cụ, tìm kiếm, nhập/xuất, phím tắt. */
window.GP = window.GP || {};

(function () {
  'use strict';

  var selectedId = null;
  var matches = [];
  var matchAt = -1;

  /* ---------- tiện ích ---------- */

  function $(id) { return document.getElementById(id); }

  /** Bỏ dấu để tìm "an" ra "Ân", "duc" ra "Đức". */
  function boDau(s) {
    return String(s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .toLowerCase().trim();
  }

  function taiVe(ten, noiDung) {
    var blob = new Blob([noiDung], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = ten;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------- chọn ô ---------- */

  function select(id) {
    if (id === selectedId) return;
    selectedId = id;
    GP.render.setSelected(id);
    if (id) GP.editor.open(id); else GP.editor.close();
    ve();
  }

  /* ---------- vẽ lại ---------- */

  function ve() {
    var state = GP.data.get();
    var L = GP.render.draw(state);
    capNhatTrangThai(state, L);
  }

  function capNhatTrangThai(state, L) {
    var soO = Object.keys(state.nodes).length;
    var soNguoi = GP.data.countPeople();
    var soDoi = L.boxes.reduce(function (m, b) { return Math.max(m, b.depth + 1); }, 0);
    $('trang-thai').textContent =
      soNguoi + ' người · ' + soO + ' ô · ' + soDoi + ' đời đang hiện';
  }

  /* ---------- tìm kiếm ---------- */

  function timKiem(q) {
    var key = boDau(q);
    matches = [];
    matchAt = -1;
    if (key) {
      var nodes = GP.data.get().nodes;
      Object.keys(nodes).forEach(function (id) {
        var n = nodes[id];
        var ten = [GP.data.fullName(n.chong)].concat(n.vo.map(GP.data.fullName)).join(' ');
        if (boDau(ten).indexOf(key) !== -1) matches.push(id);
      });
    }
    GP.render.setMatches(matches);
    $('so-khop').textContent = key ? (matches.length ? '0/' + matches.length : 'không thấy') : '';
    ve();
  }

  function nhayToiKhop(buoc) {
    if (!matches.length) return;
    matchAt = (matchAt + buoc + matches.length) % matches.length;
    var id = matches[matchAt];
    GP.data.expandTo(id);   // tự bung các nhánh đang gấp phía trên
    ve();
    GP.render.centerOn(id);
    select(id);
    $('so-khop').textContent = (matchAt + 1) + '/' + matches.length;
  }

  /* ---------- nhập / xuất ---------- */

  function xuatFile() {
    var state = GP.data.get();
    var ten = boDau(state.tenDongHo).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'gia-pha';
    var ngay = new Date().toISOString().slice(0, 10);
    taiVe(ten + '-' + ngay + '.json', GP.data.toJSON());
  }

  function nhapFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var obj;
      try {
        obj = JSON.parse(reader.result);
      } catch (e) {
        alert('Không đọc được tệp: nội dung không phải JSON hợp lệ.');
        return;
      }
      var err = GP.data.replaceAll(obj);
      if (err) {
        alert('Tệp không dùng được: ' + err);
        return;
      }
      select(null);
      $('ten-dong-ho').value = GP.data.get().tenDongHo;
      timKiem('');
      GP.render.fit();
    };
    reader.onerror = function () { alert('Không đọc được tệp.'); };
    reader.readAsText(file);
  }

  /* ---------- in ra giấy ---------- */

  function chuanBiIn() {
    var L = GP.render.layout();
    if (!L) return;
    // A4 nằm ngang ở 96dpi, trừ lề
    var s = Math.min(1, (1040) / Math.max(L.width, 1), (720) / Math.max(L.height, 1));
    var canvas = $('canvas');
    canvas.dataset.transformCu = canvas.style.transform;
    canvas.style.transform = 'scale(' + s + ')';
    canvas.style.transformOrigin = 'top left';
    $('tieu-de-in').textContent = GP.data.get().tenDongHo;
  }

  function xongIn() {
    var canvas = $('canvas');
    canvas.style.transform = canvas.dataset.transformCu || '';
  }

  /* ---------- khởi động ---------- */

  function init() {
    var state = GP.data.load();

    GP.render.init({
      select: select,
      toggle: function (id) { GP.data.toggleCollapse(id); },
      addChild: function (id) { select(GP.data.addChild(id)); },
      zoom: function (s) { $('muc-phong').textContent = Math.round(s * 100) + '%'; }
    });
    GP.editor.init({ select: select });

    GP.data.onChange(function () {
      ve();
      if (GP.editor.current()) GP.editor.refresh();
    });

    // tên dòng họ
    var tenEl = $('ten-dong-ho');
    tenEl.value = state.tenDongHo;
    tenEl.addEventListener('input', function () { GP.data.setTenDongHo(tenEl.value); });

    // tìm kiếm
    var oTim = $('o-tim');
    oTim.addEventListener('input', function () { timKiem(oTim.value); });
    oTim.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); nhayToiKhop(e.shiftKey ? -1 : 1); }
    });
    $('khop-truoc').addEventListener('click', function () { nhayToiKhop(-1); });
    $('khop-sau').addEventListener('click', function () { nhayToiKhop(1); });

    // phóng to
    $('phong-to').addEventListener('click', function () { GP.render.zoomBy(1.2); });
    $('thu-nho').addEventListener('click', function () { GP.render.zoomBy(1 / 1.2); });
    $('vua-man-hinh').addEventListener('click', function () { GP.render.fit(); });

    // gấp / mở
    $('gap-tat-ca').addEventListener('click', function () { GP.data.setAllCollapsed(true); GP.render.fit(); });
    $('mo-tat-ca').addEventListener('click', function () { GP.data.setAllCollapsed(false); GP.render.fit(); });

    // hoàn tác
    $('hoan-tac').addEventListener('click', function () { GP.data.undo(); });
    $('lam-lai').addEventListener('click', function () { GP.data.redo(); });

    // tệp
    $('xuat').addEventListener('click', xuatFile);
    $('nhap').addEventListener('click', function () { $('chon-tep').click(); });
    $('chon-tep').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) nhapFile(e.target.files[0]);
      e.target.value = '';
    });
    $('in').addEventListener('click', function () { window.print(); });
    $('tao-moi').addEventListener('click', function () {
      if (!confirm('Xoá toàn bộ gia phả hiện tại và bắt đầu lại từ ô trống?\n' +
        'Nên bấm "Xuất tệp" để giữ bản sao trước khi làm việc này.')) return;
      GP.data.reset();
      select(null);
      $('ten-dong-ho').value = GP.data.get().tenDongHo;
      timKiem('');
      GP.render.fit();
    });

    // phím tắt
    document.addEventListener('keydown', function (e) {
      var trongONhap = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) GP.data.redo(); else GP.data.undo();
        return;
      }
      if (e.key === 'Escape') { select(null); return; }
      if (!trongONhap && e.key === '/') { e.preventDefault(); oTim.focus(); }
    });

    window.addEventListener('beforeprint', chuanBiIn);
    window.addEventListener('afterprint', xongIn);

    ve();
    GP.render.fit();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
