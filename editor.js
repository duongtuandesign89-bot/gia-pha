/* editor.js — bảng sửa bên phải. Đọc ô đang chọn, ghi thẳng vào GP.data.
   Không có nút Lưu: gõ tới đâu ghi tới đó. */
window.GP = window.GP || {};

GP.editor = (function () {
  'use strict';

  var panel, body, titleEl;
  var currentId = null;
  var xoaMo = false;   // đang mở phần xác nhận xoá
  var dangGo = false;  // đang gõ trong chính bảng này
  var on = {};

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* Các ô chỉ nhận chữ số: số chữ số tối đa và khoảng hợp lệ. */
  /* `namSinh`/`namMat` cố ý không nằm đây: hai ô đó nhận cả chữ
     (năm can chi "Ất Mão", hoặc "không rõ", "mất lúc nhỏ"). */
  var SO = {
    ngaySinh: { dai: 2, min: 1, max: 31 }, thangSinh: { dai: 2, min: 1, max: 12 },
    ngayMat: { dai: 2, min: 1, max: 31 }, thangMat: { dai: 2, min: 1, max: 12 }
  };

  function laONam(field) { return field === 'namSinh' || field === 'namMat'; }

  /** Gõ toàn số thì lưu thành số, còn lại lưu nguyên chữ. */
  function giaTriNam(v) {
    var t = String(v).trim();
    if (!t) return null;
    return /^\d{1,4}$/.test(t) ? parseInt(t, 10) : t;
  }

  function inputRow(nodeId, who, index, field, label, value, goiY) {
    var k = [nodeId, who, index, field].join('.');
    var so = SO[field];
    return '<label class="o-nhap">' +
      (label ? '<span>' + label + '</span>' : '') +
      '<input data-k="' + k + '" data-node="' + nodeId + '" data-who="' + who +
      '" data-index="' + index + '" data-field="' + field + '"' +
      // số là text chứ không phải type=number: number bị lăn chuột làm đổi giá trị,
      // mà người dùng lăn chuột liên tục để phóng to cây
      ' type="text"' +
      (so ? ' inputmode="numeric" maxlength="' + so.dai + '" class="o-so"' : '') +
      (laONam(field) ? ' maxlength="40"' : '') +
      (goiY ? ' placeholder="' + esc(goiY) + '"' : '') +
      ' value="' + esc(value == null ? '' : value) + '">' +
      '</label>';
  }

  /** Một mốc thời gian: ngày / tháng / năm + nút gạt dương lịch ⇄ âm lịch. */
  function mocThoiGian(nodeId, who, index, p, nhan, fNgay, fThang, fNam, fLich, goiYNam) {
    var am = p[fLich] === 'am';
    return '<div class="moc">' +
      '<span class="nhan-moc">' + nhan + '</span>' +
      '<div class="hang-3 cuoi-rong">' +
      inputRow(nodeId, who, index, fNgay, '', p[fNgay], 'ngày') +
      inputRow(nodeId, who, index, fThang, '', p[fThang], 'tháng') +
      inputRow(nodeId, who, index, fNam, '', p[fNam], goiYNam) +
      '</div>' +
      '<button class="nut-lich' + (am ? ' am' : '') + '" data-act="doi-lich"' +
      ' data-who="' + who + '" data-index="' + index + '" data-lich="' + fLich + '"' +
      ' title="Đang là ' + (am ? 'âm lịch' : 'dương lịch') + ' — bấm để đổi">' +
      (am ? 'ÂL' : 'DL') + '</button>' +
      '</div>';
  }

  function personBlock(nodeId, who, index, p, tieuDe, coXoa) {
    var h = '<div class="khoi-nguoi">' +
      '<div class="khoi-dau"><h3>' + esc(tieuDe) + '</h3>' +
      (coXoa ? '<button class="nut-nho nguy" data-act="xoa-vo" data-index="' + index + '">Xoá</button>' : '') +
      '</div>' +
      '<div class="hang-2">' +
      inputRow(nodeId, who, index, 'hoDem', 'Họ & tên đệm', p.hoDem) +
      inputRow(nodeId, who, index, 'ten', 'Tên riêng', p.ten) +
      '</div>' +
      mocThoiGian(nodeId, who, index, p, 'Sinh', 'ngaySinh', 'thangSinh', 'namSinh', 'lichSinh',
        'năm, hoặc “Ất Mão”') +
      mocThoiGian(nodeId, who, index, p, 'Mất', 'ngayMat', 'thangMat', 'namMat', 'lichMat',
        'năm, hoặc “không rõ”') +
      '<p class="chu-thich">Chỉ nhớ năm thì bỏ trống ngày và tháng. Hai ô năm ghi được cả chữ — ' +
      'năm can chi (“Ất Mão”) hoặc “không rõ”, “mất lúc nhỏ” — mà vẫn giữ được ngày tháng ' +
      'bên cạnh. Nút <b>DL/ÂL</b> đánh dấu mốc đó chép theo dương lịch hay âm lịch; ứng dụng ' +
      'chỉ ghi nhận chứ không quy đổi.</p>' +
      inputRow(nodeId, who, index, 'ghiChu', 'Ghi chú', p.ghiChu) +
      '</div>';
    return h;
  }

  function build(id) {
    var n = GP.data.node(id);
    if (!n) return '';

    var map = GP.data.parentMap();
    var parentId = map[id];
    var parent = parentId ? GP.data.node(parentId) : null;
    var depth = GP.data.ancestors(id).length;

    var h = '';

    h += personBlock(id, 'chong', 0, n.chong, 'Ông', false);
    n.vo.forEach(function (v, i) {
      h += personBlock(id, 'vo', i, v, n.vo.length > 1 ? 'Bà ' + (i + 1) : 'Bà', n.vo.length > 1);
    });
    h += '<button class="nut-phu" data-act="them-vo">+ Thêm bà (vợ hai…)</button>';

    h += '<div class="khoi">' +
      '<h3>Người mang huyết thống dòng họ</h3>' +
      '<div class="hang-radio">' +
      '<label><input type="radio" name="dt" value="chong" data-act="doi-truyen"' +
      (n.doiTruyen === 'chong' ? ' checked' : '') + '> Ông</label>' +
      '<label><input type="radio" name="dt" value="vo" data-act="doi-truyen"' +
      (n.doiTruyen === 'vo' ? ' checked' : '') + '> Bà</label>' +
      '</div>' +
      '<p class="chu-thich">Con gái lấy chồng thì chọn “Bà” — ông trong ô là con rể.</p>' +
      '</div>';

    if (parent && parent.vo.length > 1) {
      h += '<div class="khoi"><h3>Mẹ của ô này</h3><select data-act="me-index">' +
        parent.vo.map(function (v, i) {
          return '<option value="' + i + '"' + (n.meIndex === i ? ' selected' : '') + '>' +
            esc('Bà ' + (i + 1) + ' — ' + (GP.data.fullName(v) || 'chưa nhập')) + '</option>';
        }).join('') +
        '</select></div>';
    }

    h += '<div class="khoi"><h3>Các con (' + n.con.length + ')</h3>';
    if (!n.con.length) {
      h += '<p class="chu-thich">Chưa có người con nào.</p>';
    } else {
      h += '<ol class="ds-con">' + n.con.map(function (cid, i) {
        var c = GP.data.node(cid);
        var ten = GP.data.fullName(c.doiTruyen === 'vo' ? c.vo[0] : c.chong) || 'chưa nhập';
        return '<li>' +
          '<button class="ten-con" data-act="di-toi" data-id="' + cid + '">' + esc(ten) + '</button>' +
          '<span class="dieu-khien">' +
          '<button data-act="len" data-index="' + i + '"' + (i === 0 ? ' disabled' : '') + ' title="Lên trên">↑</button>' +
          '<button data-act="xuong" data-index="' + i + '"' + (i === n.con.length - 1 ? ' disabled' : '') + ' title="Xuống dưới">↓</button>' +
          '</span></li>';
      }).join('') + '</ol>';
    }
    h += '<button class="nut-chinh" data-act="them-con">+ Thêm người con</button></div>';

    h += '<div class="khoi vung-nguy">';
    if (!parentId) {
      h += '<p class="chu-thich">Đây là ô gốc (đời 1) nên không xoá được.</p>' +
        '<button class="nut-phu" data-act="them-cha">+ Thêm một đời phía trên</button>';
    } else if (!xoaMo) {
      h += '<button class="nut-phu nguy" data-act="mo-xoa">Xoá ô này…</button>';
    } else {
      var soO = GP.data.branchSize(id);
      h += '<p class="chu-thich">Xoá thế nào?</p>' +
        '<button class="nut-phu nguy" data-act="xoa-nhanh">Xoá cả nhánh (' + soO + ' ô)</button>' +
        '<button class="nut-phu" data-act="xoa-noi">Chỉ xoá ô này, các con nối lên đời trên</button>' +
        '<button class="nut-phu" data-act="huy-xoa">Thôi</button>';
    }
    h += '</div>';

    titleEl.textContent = 'Đời ' + (depth + 1);
    return h;
  }

  /**
   * Dựng lại bảng. Trong lúc người dùng đang gõ thì bỏ qua: ô nhập trên màn hình
   * đã đúng rồi, dựng lại chỉ tổ làm nhảy con trỏ. Cây bên trái vẫn vẽ lại bình thường.
   */
  function refresh() {
    if (dangGo) return;
    if (!currentId || !GP.data.node(currentId)) {
      close();
      return;
    }
    var af = document.activeElement;
    var key = af && panel.contains(af) && af.dataset ? af.dataset.k : null;
    var pos = null;
    if (key) { try { pos = af.selectionStart; } catch (e) { } }

    body.innerHTML = build(currentId);
    panel.classList.add('mo');

    if (key) {
      var el = body.querySelector('[data-k="' + key + '"]');
      if (el) {
        el.focus();
        if (pos != null) { try { el.setSelectionRange(pos, pos); } catch (e) { } }
      }
    }
  }

  function open(id) {
    currentId = id;
    xoaMo = false;
    refresh();
  }

  function close() {
    currentId = null;
    xoaMo = false;
    panel.classList.remove('mo');
    if (on.select) on.select(null);
  }

  function parseSo(v) {
    var s = String(v).trim();
    if (!s) return null;
    var n = parseInt(s, 10);
    return isNaN(n) ? null : n;
  }

  function init(opts) {
    panel = document.getElementById('bang-sua');
    body = document.getElementById('bang-sua-noi-dung');
    titleEl = document.getElementById('bang-sua-doi');
    on = opts || {};

    document.getElementById('dong-bang-sua').addEventListener('click', close);

    body.addEventListener('input', function (e) {
      var t = e.target;
      var field = t.dataset.field;
      if (!field) return;
      var so = SO[field];
      if (so) {
        var sach = t.value.replace(/[^0-9]/g, '').slice(0, so.dai);
        if (sach !== t.value) {
          var pos = t.selectionStart - (t.value.length - sach.length);
          t.value = sach;
          try { t.setSelectionRange(pos, pos); } catch (err) { }
        }
      }
      var val = so ? parseSo(t.value)
        : (laONam(field) ? giaTriNam(t.value) : t.value);
      dangGo = true;
      GP.data.updatePerson(t.dataset.node, t.dataset.who, +t.dataset.index, field, val);
      dangGo = false;
    });

    /* Kẹp về khoảng hợp lệ khi rời ô, chứ không kẹp lúc đang gõ: gõ "3" để tới "31"
       mà bị nhảy thành "3" ngay thì không nhập nổi. */
    body.addEventListener('change', function (e) {
      var t = e.target;
      var so = SO[t.dataset.field];
      if (!so) return;
      var v = parseSo(t.value);
      if (v == null) return;
      var kep = Math.min(so.max, Math.max(so.min, v));
      if (kep !== v) {
        t.value = kep;
        GP.data.updatePerson(t.dataset.node, t.dataset.who, +t.dataset.index, t.dataset.field, kep);
      }
    });

    body.addEventListener('change', function (e) {
      var act = e.target.dataset.act;
      if (act === 'doi-truyen') GP.data.setDoiTruyen(currentId, e.target.value);
      else if (act === 'me-index') GP.data.setMeIndex(currentId, +e.target.value);
    });

    body.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      var act = btn.dataset.act;

      if (act === 'doi-lich') {
        GP.data.doiLich(currentId, btn.dataset.who, +btn.dataset.index, btn.dataset.lich);
      }
      else if (act === 'them-vo') GP.data.addSpouse(currentId);
      else if (act === 'xoa-vo') GP.data.removeSpouse(currentId, +btn.dataset.index);
      else if (act === 'them-con') {
        var newId = GP.data.addChild(currentId);
        if (on.select) on.select(newId);
      } else if (act === 'them-cha') {
        var pid = GP.data.addParentAboveRoot();
        if (on.select) on.select(pid);
      } else if (act === 'di-toi') {
        if (on.select) on.select(btn.dataset.id);
      } else if (act === 'len') GP.data.moveChild(currentId, +btn.dataset.index, -1);
      else if (act === 'xuong') GP.data.moveChild(currentId, +btn.dataset.index, 1);
      else if (act === 'mo-xoa') { xoaMo = true; refresh(); }
      else if (act === 'huy-xoa') { xoaMo = false; refresh(); }
      else if (act === 'xoa-nhanh' || act === 'xoa-noi') {
        var err = GP.data.deleteNode(currentId, act === 'xoa-nhanh' ? 'branch' : 'promote');
        if (err) { alert(err); return; }
        if (on.select) on.select(null);
      }
    });
  }

  return {
    init: init,
    open: open,
    close: close,
    refresh: refresh,
    current: function () { return currentId; }
  };
})();
