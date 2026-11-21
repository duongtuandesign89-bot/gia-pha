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

  /* ---------- hộp chọn khi xuất ---------- */

  function tenO(id) {
    var n = GP.data.node(id);
    if (!n) return '';
    var p = n.doiTruyen === 'vo' ? n.vo[0] : n.chong;
    return (n.doiTruyen === 'vo' ? 'bà ' : 'ông ') + (GP.data.fullName(p) || 'chưa đặt tên');
  }

  function laMa(n) {
    var so = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']], r = '';
    so.forEach(function (c) { while (n >= c[0]) { r += c[1]; n -= c[0]; } });
    return r;
  }

  /** Đời (0 = đời I) của mọi ô. */
  function bangDoi() {
    var st = GP.data.get(), doi = {};
    (function di(id, d) { doi[id] = d; st.nodes[id].con.forEach(function (c) { di(c, d + 1); }); })(st.rootId, 0);
    return doi;
  }

  /* Danh sách nhánh để chọn: mọi ô có con, theo thứ tự cây, thụt lề theo đời. */
  function napDanhSachNhanh() {
    var st = GP.data.get(), sel = $('xuat-nhanh'), cu = sel.value;
    sel.innerHTML = '';
    (function di(id, d) {
      var n = st.nodes[id];
      if (d > 0 && n.con.length) {
        var o = document.createElement('option');
        o.value = id;
        o.textContent = new Array(d).join('\u00a0\u00a0\u00a0') + 'Đời ' + laMa(d + 1) + ' · ' + tenO(id) +
          ' (' + n.con.length + ' con)';
        sel.appendChild(o);
      }
      n.con.forEach(function (c) { di(c, d + 1); });
    })(st.rootId, 0);
    if (cu && st.nodes[cu]) sel.value = cu;
  }

  function gocDangChon() {
    var f = $('form-xuat'), st = GP.data.get();
    var pham = f.querySelector('[name=pham]:checked').value;
    if (pham === 'nhanh') return $('xuat-nhanh').value || st.rootId;
    if (pham === 'chon' && selectedId) return selectedId;
    return st.rootId;
  }

  /* Hai hộp "từ con thứ … đến …" và hộp "đến đời …" đổi theo ô bắt đầu đang chọn. */
  function napGioiHan() {
    var st = GP.data.get(), goc = gocDangChon(), n = st.nodes[goc], doi = bangDoi();
    if ($('xuat-tu').dataset.goc !== goc) {
      ['xuat-tu', 'xuat-den'].forEach(function (k, j) {
        var sel = $(k);
        sel.innerHTML = '';
        n.con.forEach(function (c, i) {
          var o = document.createElement('option');
          o.value = i; o.textContent = (i + 1) + '. ' + tenO(c).replace(/^(ông|bà) /, '');
          sel.appendChild(o);
        });
        sel.value = j ? n.con.length - 1 : 0;
        sel.disabled = n.con.length < 2;
        sel.dataset.goc = goc;
      });
    }
    var sauNhat = doi[goc];
    (function di(id) { sauNhat = Math.max(sauNhat, doi[id]); st.nodes[id].con.forEach(di); })(goc);
    var selD = $('xuat-doi'), cu = selD.value;
    selD.innerHTML = '';
    for (var d = doi[goc] + 1; d <= sauNhat; d++) {
      var o = document.createElement('option');
      o.value = d; o.textContent = 'Đời ' + laMa(d + 1) + (d === sauNhat ? ' (hết)' : '');
      selD.appendChild(o);
    }
    if (!selD.options.length) {
      var o0 = document.createElement('option'); o0.value = doi[goc]; o0.textContent = 'Đời ' + laMa(doi[goc] + 1);
      selD.appendChild(o0);
    }
    selD.value = (cu && +cu > doi[goc] && +cu <= sauNhat) ? cu : String(sauNhat > doi[goc] ? sauNhat : doi[goc]);
    return { sauNhat: sauNhat };
  }

  /* Bản sao dữ liệu đã cắt theo giới hạn: chỉ giữ các con trong khoảng đã chọn của ô bắt đầu,
     và bỏ các đời sau đời đã chọn. Mã ô giữ nguyên nên số đời, tên, trang vẫn khớp. */
  function catDuLieu(goc, tu, den, denDoi) {
    var st = GP.data.get(), doi = bangDoi(), nodes = {};
    Object.keys(st.nodes).forEach(function (id) {
      var n = st.nodes[id];
      var con = n.con.filter(function (c) { return doi[c] <= denDoi; });
      if (id === goc) con = n.con.slice(tu, den + 1).filter(function (c) { return doi[c] <= denDoi; });
      nodes[id] = Object.assign({}, n, { con: con, thuGon: false });
    });
    return { version: st.version, tenDongHo: st.tenDongHo, rootId: st.rootId, nodes: nodes };
  }

  function giaTriXuat() {
    var f = $('form-xuat');
    var kieu = f.querySelector('[name=kieu]:checked').value;
    var pham = f.querySelector('[name=pham]:checked').value;
    var st = GP.data.get();
    var rootId = gocDangChon();
    var kho = $('xuat-kho').value;
    if (kho === 'cay' && kieu !== 'pdf1') kho = 'A3';
    var n = st.nodes[rootId], doi = bangDoi();
    var tu = +$('xuat-tu').value || 0, den = $('xuat-den').value === '' ? n.con.length - 1 : +$('xuat-den').value;
    if (den < tu) { var t = tu; tu = den; den = t; }
    var denDoi = +$('xuat-doi').value;
    var catCon = n.con.length > 1 && (tu > 0 || den < n.con.length - 1);
    var sauNhat = doi[rootId];
    (function di(id) { sauNhat = Math.max(sauNhat, doi[id]); st.nodes[id].con.forEach(di); })(rootId);
    var catDoi = denDoi < sauNhat;
    var phuDe = [];
    if (catCon) phuDe.push('các con thứ ' + (tu + 1) + '–' + (den + 1));
    if (catDoi) phuDe.push('đến đời ' + laMa(denDoi + 1));
    var huong = f.querySelector('[name=huong]:checked').value;
    return {
      kieu: kieu, pham: pham, rootId: rootId, kho: kho, huong: huong,
      tachNhanh: $('xuat-tach').checked, moHet: $('xuat-mo-het').checked,
      doc: huong === 'doc',
      state: (catCon || catDoi) ? catDuLieu(rootId, tu, den, denDoi) : null,
      phuDe: phuDe.join(', ')
    };
  }

  /** Số ô sẽ được xuất, tính trên dữ liệu đã cắt theo giới hạn. */
  function demO(g) {
    var st = g.state || GP.data.get();
    return (function dem(id) { return st.nodes[id].con.reduce(function (t, c) { return t + dem(c); }, 1); })(g.rootId);
  }

  function capNhatHopXuat() {
    var f = $('form-xuat');
    napGioiHan();
    var g = giaTriXuat();
    $('nhan-kho').textContent = g.kieu === 'anh' ? 'Hướng ảnh' : 'Khổ giấy';
    f.dataset.kieu = g.kieu;
    var dongChon = $('dong-nguoi-chon');
    dongChon.classList.toggle('tat', !selectedId);
    dongChon.querySelector('input').disabled = !selectedId;
    $('xuat-nguoi-chon').textContent = selectedId ? tenO(selectedId) : '(chưa chọn ô nào — bấm vào một ô trên cây trước)';
    var n = GP.data.node(g.rootId);
    var con = n ? n.con.length : 0;
    var goiY = '';
    if (g.kieu === 'sach') {
      goiY = 'Sách khổ ' + g.kho + (g.huong === 'doc' ? ' dọc' : ' ngang') + ', ' +
        demO(g) + ' ô. A3 chứa được nhiều đời hơn trên mỗi trang; A4 thì nhiều trang hơn.';
    } else if (g.kieu === 'anh') {
      var soAnh = GP.xuatSach.lapDanhSachAnh({ state: g.state, rootId: g.rootId, tachNhanh: g.tachNhanh, doc: g.doc }).length;
      goiY = soAnh > 1 ? 'Sẽ tải về ' + soAnh + ' ảnh. Nhánh nào quá rộng (chữ sẽ nhoè) thì tự tách tiếp thành từng gia đình. ' +
        'Trình duyệt có thể hỏi cho phép tải nhiều tệp — bấm Cho phép.' :
        'Sẽ tải về 1 ảnh gồm ' + demO(g) + ' ô.';
    } else {
      goiY = g.kho === 'cay' ? 'Trang PDF to đúng bằng cây.' : 'Cả cây thu vào một trang ' + g.kho + '.';
      if (g.doc) goiY += ' Hướng dọc: cây xếp thành danh sách thụt lề, chia cột.';
    }
    if (g.kieu === 'anh' && g.doc) goiY += ' Ảnh dọc: cây xếp thành danh sách thụt lề (con dưới cha), dài thì chia cột.';
    if (g.phuDe) goiY += ' Giới hạn: ' + g.phuDe + '.';
    $('xuat-goi-y').textContent = goiY;
  }

  function moHopXuat(kieu) {
    dongMenu();
    napDanhSachNhanh();
    var f = $('form-xuat');
    f.querySelector('[name=kieu][value=' + kieu + ']').checked = true;
    if (!selectedId && f.querySelector('[name=pham][value=chon]').checked) {
      f.querySelector('[name=pham][value=tatca]').checked = true;
    }
    capNhatHopXuat();
    $('hop-xuat').returnValue = '';
    $('hop-xuat').showModal();
  }

  /* Vẽ mất một lúc với cây lớn, mà canvas chạy đồng bộ nên màn hình sẽ đứng.
     Hiện lời báo trước, đợi trình duyệt vẽ xong lời báo rồi mới bắt đầu. */
  function chayXuat(g) {
    var bao = $('dang-lam');
    var chu = bao.firstElementChild;
    chu.textContent = 'Đang chuẩn bị…';
    bao.hidden = false;
    function xong(loi, kq) {
      bao.hidden = true;
      if (loi) { alert(loi); return; }
      if (kq && kq.ghiChu && kq.ghiChu.length) alert('Đã xuất xong. Lưu ý:\n' + kq.ghiChu.join('\n'));
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        try {
          if (g.kieu === 'sach') {
            GP.xuatSach.xuatSach(g, function (i, tong) { chu.textContent = 'Đang vẽ trang ' + i + ' / ' + tong + '…'; }, xong);
          } else if (g.kieu === 'anh') {
            GP.xuatSach.xuatAnhNhanh({ state: g.state, rootId: g.rootId, tachNhanh: g.tachNhanh, doc: g.doc, phuDe: g.phuDe },
              function (i, tong) { chu.textContent = 'Đang tạo ảnh ' + i + ' / ' + tong + '…'; }, xong);
          } else {
            chu.textContent = 'Đang tạo PDF…';
            var kho = GP.xuatSach.KHO[g.kho];
            GP.xuatAnh.xuatPDF(xong, {
              state: g.state, doc: g.doc, phuDe: g.phuDe,
              rootId: g.rootId === GP.data.get().rootId ? null : g.rootId,
              moHet: g.moHet || !!g.state,
              trangMm: kho ? (g.huong === 'doc' ? [kho[1], kho[0]] : kho) : null
            });
          }
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
    $('xuat-sach').addEventListener('click', function () { moHopXuat('sach'); });
    $('xuat-anh').addEventListener('click', function () { moHopXuat('anh'); });
    $('xuat-pdf').addEventListener('click', function () { moHopXuat('pdf1'); });
    $('form-xuat').addEventListener('change', capNhatHopXuat);
    $('xuat-nhanh').addEventListener('focus', function () {
      $('form-xuat').querySelector('[name=pham][value=nhanh]').checked = true;
      capNhatHopXuat();
    });
    $('hop-xuat').addEventListener('close', function () {
      if ($('hop-xuat').returnValue === 'ok') chayXuat(giaTriXuat());
    });

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
