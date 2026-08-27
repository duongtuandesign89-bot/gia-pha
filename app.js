/* app.js — nối các phần lại: thanh công cụ, tìm kiếm, nhập/xuất, phím tắt. */
window.GP = window.GP || {};

(function () {
  'use strict';

  var selectedId = null;
  var matches = [];
  var matchAt = -1;
  var tieuDiem = false;   // chế độ chỉ xem quanh một người

  /* ---------- tiện ích ---------- */

  function $(id) { return document.getElementById(id); }

  var boDau = GP.nguoi.boDau;

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
    // trong chế độ tiêu điểm, chọn ai thì lấy người đó làm tâm cửa sổ
    if (tieuDiem && id) GP.render.setFocus(id);
    if (id) GP.editor.open(id); else GP.editor.close();
    ve();
    if (tieuDiem && id) GP.render.fit();   // đóng khung lại quanh tiêu điểm mới
  }

  /* ---------- chế độ tiêu điểm ---------- */

  function datTieuDiem(bat) {
    tieuDiem = bat;
    GP.render.setFocusMode(bat);
    var btn = $('che-do-tieu-diem');
    btn.classList.toggle('bat', bat);
    btn.setAttribute('aria-pressed', bat ? 'true' : 'false');
    if (bat) GP.render.setFocus(selectedId || GP.data.get().rootId);
    ve();
    GP.render.fit();   // trong chế độ danh sách, fit() chỉ cuộn lên đầu
  }

  /* Đi tới một người trong danh sách dọc: đổi tiêu điểm, KHÔNG mở bảng sửa
     (muốn sửa thì bấm nút “Sửa” trên thẻ đang xem). */
  function diToi(id) {
    if (!id) return;
    selectedId = null;
    GP.render.setSelected(null);
    GP.editor.close();
    GP.render.setFocus(id);
    ve();
    GP.render.scrollListTop();
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
    var s = soNguoi + ' người · ' + soO + ' ô';
    if (tieuDiem) {
      var f = GP.render.getFocus();
      var n = f && GP.data.node(f);
      var ten = n ? (GP.data.fullName(n.doiTruyen === 'vo' ? n.vo[0] : n.chong) || 'chưa đặt tên') : '';
      s += ' · đang xem quanh: ' + ten;
    } else {
      s += ' · ' + soDoi + ' đời đang hiện';
    }
    $('trang-thai').textContent = s;
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
    if (tieuDiem) {
      diToi(id);            // trong chế độ danh sách: nhảy tiêu điểm tới người tìm được
    } else {
      ve();
      GP.render.centerOn(id);
      select(id);
    }
    $('so-khop').textContent = (matchAt + 1) + '/' + matches.length;
  }

  /* ---------- nhập / xuất ---------- */

  function xuatFile() {
    var state = GP.data.get();
    var ten = GP.nguoi.slug(state.tenDongHo);
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

  /* ---------- xuất ảnh / PDF ---------- */

  function dongMenu() {
    document.body.classList.remove('menu-mo');
    $('nut-menu').setAttribute('aria-expanded', 'false');
  }

  /* Vẽ ảnh mất một lúc với cây lớn, mà canvas chạy đồng bộ nên màn hình sẽ đứng.
     Hiện lời báo trước, đợi trình duyệt vẽ xong lời báo rồi mới bắt đầu. */
  function xuatHinh(kieu) {
    dongMenu();
    var bao = $('dang-lam');
    bao.firstElementChild.textContent = 'Đang tạo ' + (kieu === 'pdf' ? 'PDF' : 'ảnh') + '…';
    bao.hidden = false;

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        function xong(loi) {
          bao.hidden = true;
          if (loi) alert(loi);
        }
        try {
          if (kieu === 'pdf') GP.xuatAnh.xuatPDF(xong);
          else GP.xuatAnh.xuatJPEG(xong);
        } catch (e) {
          xong('Không xuất được: ' + e.message);
        }
      });
    });
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
    // in thì luôn hiện đủ chi tiết, bỏ mức thu gọn của semantic zoom
    canvas.classList.remove('zoom-xa', 'zoom-vua');
    canvas.style.setProperty('--s', 1);
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
      focusNav: diToi,
      toggle: function (id) { GP.data.toggleCollapse(id); },
      addChild: function (id, me) {
        var newId = GP.data.addChild(id, me);
        if (tieuDiem) {
          // giữ tiêu điểm ở cha, chỉ mở bảng sửa cho người con mới
          selectedId = newId;
          GP.render.setSelected(newId);
          GP.editor.open(newId);
        } else {
          select(newId);
        }
      },
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
    $('che-do-tieu-diem').addEventListener('click', function () { datTieuDiem(!tieuDiem); });

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
    $('xuat-anh').addEventListener('click', function () { xuatHinh('jpeg'); });
    $('xuat-pdf').addEventListener('click', function () { xuatHinh('pdf'); });

    // nút ⋯ trên điện thoại
    var nutMenu = $('nut-menu');
    nutMenu.addEventListener('click', function (e) {
      e.stopPropagation();
      var mo = document.body.classList.toggle('menu-mo');
      nutMenu.setAttribute('aria-expanded', mo ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      if (!document.body.classList.contains('menu-mo')) return;
      if ($('menu').contains(e.target)) return;   // bấm trong menu thì để nguyên
      dongMenu();
    });
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
      if (e.key === 'Escape') { dongMenu(); select(null); return; }
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
