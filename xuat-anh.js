/* xuat-anh.js — vẽ cả cây ra một tấm ảnh, rồi xuất JPEG hoặc PDF.

   Vì sao vẽ lại bằng Canvas thay vì chụp màn hình DOM: chụp DOM cần thư viện ngoài
   (html2canvas...) mà dự án này cố ý không có thư viện và không có bước build. Vẽ tay
   thì kiểm soát được độ phân giải, xuất được cả phần cây tràn ngoài màn hình.

   Cái giá: có hai bộ vẽ song song. Hình học lấy chung từ layout.js, chữ lấy chung từ
   nguoi.js, nên chỉ còn màu và phông là chép lại — sửa styles.css phần ô thì ngó lại đây. */
window.GP = window.GP || {};

GP.xuatAnh = (function () {
  'use strict';

  /* Phải khớp với styles.css */
  var MAU = {
    nen: '#f6f1e7',
    oNen: '#fffdf8',
    vien: '#d9cfbc',
    muc: '#2b2620',
    mucNhat: '#7d7367',
    son: '#9b2c2c',
    vang: '#b08d57',
    duong: '#b6a88e',
    ghiChu: '#8a7c68',
    trong: '#c3b8a5'
  };
  var SERIF = 'Georgia, "Times New Roman", serif';
  var SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

  var LE = 44;          // lề quanh ảnh
  var CAO_TIEU_DE = 74; // chỗ cho tên dòng họ phía trên

  /* Trình duyệt có giới hạn kích thước canvas; vượt thì toBlob trả về null.
     Chặn trước cho chắc, iOS là nơi chặt nhất. */
  var MAX_CANH = 12000;
  var MAX_DIEM = 40e6;

  /* ---------- tiện ích vẽ ---------- */

  function khungBo(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Cắt bớt và thêm "…" nếu chữ dài quá khung. */
  function catChu(ctx, chu, rong) {
    if (ctx.measureText(chu).width <= rong) return chu;
    var t = chu;
    while (t.length > 1 && ctx.measureText(t + '…').width > rong) {
      t = t.slice(0, -1);
    }
    return t + '…';
  }

  /** Ngắt chữ thành tối đa `toiDa` dòng, dòng cuối cắt bằng "…" nếu còn thừa. */
  function ngatDong(ctx, chu, rong, toiDa) {
    var tu = chu.split(/\s+/);
    var dong = [], hienTai = '';
    for (var i = 0; i < tu.length; i++) {
      var thu = hienTai ? hienTai + ' ' + tu[i] : tu[i];
      if (ctx.measureText(thu).width <= rong || !hienTai) {
        hienTai = thu;
      } else {
        dong.push(hienTai);
        hienTai = tu[i];
        if (dong.length === toiDa) break;
      }
    }
    if (dong.length < toiDa && hienTai) dong.push(hienTai);
    if (dong.length === toiDa) {
      // còn chữ chưa vẽ hết thì dòng cuối phải có dấu "…"
      var daVe = dong.join(' ');
      if (daVe.length < chu.length) dong[toiDa - 1] = catChu(ctx, dong[toiDa - 1] + ' …', rong);
    }
    return dong;
  }

  /* ---------- vẽ một người ---------- */

  /* Toạ độ trong một khối người, khớp với styles.css:
     đệm trên 3 · dòng họ 21 · dòng tên 21 · dòng năm 16 · (ghi chú 17 mỗi dòng) · đệm dưới 4 */
  function veNguoi(ctx, p, x, y, w, nhan, huyetThong) {
    var L = GP.layout;
    var traiChu = x + 16;
    var traiTen = traiChu + 30;
    var rongChu = w - (traiTen - x) - 12;
    var cao = L.PERSON + L.ghiChuHeight(p);

    if (huyetThong) {
      ctx.fillStyle = MAU.son;
      ctx.fillRect(x + 5, y + 3, 3, cao - 6);
    }

    ctx.textBaseline = 'alphabetic';

    ctx.font = '600 11px ' + SANS;
    ctx.fillStyle = MAU.mucNhat;
    ctx.fillText(nhan, traiChu, y + 18);

    var ho = GP.nguoi.ho(p);
    if (GP.nguoi.coTen(p)) {
      ctx.font = '700 14px ' + SERIF;
      ctx.fillStyle = MAU.muc;
      ctx.fillText(catChu(ctx, ho.toUpperCase(), rongChu), traiTen, y + 18);
    } else {
      ctx.font = 'italic 13px ' + SERIF;
      ctx.fillStyle = MAU.trong;
      ctx.fillText('chưa nhập', traiTen, y + 18);
    }

    ctx.font = '16px ' + SERIF;
    ctx.fillStyle = MAU.muc;
    ctx.fillText(catChu(ctx, GP.nguoi.ten(p), rongChu), traiTen, y + 40);

    var s = GP.nguoi.sinh(p), m = GP.nguoi.mat(p);
    var cx = traiTen, yNam = y + 57;
    ctx.font = '700 12px ' + SANS;
    if (s) {
      ctx.fillStyle = MAU.vang;
      ctx.fillText('S:', cx, yNam);
      cx += ctx.measureText('S:').width + 3;
      ctx.font = '12px ' + SANS;
      ctx.fillStyle = MAU.mucNhat;
      ctx.fillText(s, cx, yNam);
      cx += ctx.measureText(s).width + 12;
    }
    if (m) {
      ctx.font = '700 12px ' + SANS;
      ctx.fillStyle = MAU.vang;
      ctx.fillText('M:', cx, yNam);
      cx += ctx.measureText('M:').width + 3;
      ctx.font = '12px ' + SANS;
      ctx.fillStyle = MAU.mucNhat;
      ctx.fillText(catChu(ctx, m, x + w - 12 - cx), cx, yNam);
    }

    var gc = GP.nguoi.ghiChu(p);
    if (gc) {
      ctx.font = 'italic 11.5px ' + SANS;
      ctx.fillStyle = MAU.ghiChu;
      var dong = ngatDong(ctx, gc, rongChu, 2);
      for (var i = 0; i < dong.length; i++) {
        ctx.fillText(dong[i], traiTen, y + 75 + i * 17);
      }
    }

    return cao;
  }

  /* ---------- vẽ cả cây ---------- */

  function veCay(ctx, L, state) {
    ctx.strokeStyle = MAU.duong;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    L.edges.forEach(function (e) {
      var px = e.parent.cx, pb = e.parent.y + e.parent.h, by = e.busY;
      ctx.moveTo(px, pb); ctx.lineTo(px, by);
      if (e.children.length > 1) {
        var xs = e.children.map(function (c) { return c.cx; });
        ctx.moveTo(Math.min.apply(null, xs), by);
        ctx.lineTo(Math.max.apply(null, xs), by);
      }
      e.children.forEach(function (c) {
        ctx.moveTo(c.cx, by); ctx.lineTo(c.cx, c.y);
      });
    });
    ctx.stroke();

    L.boxes.forEach(function (b) {
      var n = b.node;
      khungBo(ctx, b.x, b.y, b.w, b.h, 10);
      ctx.fillStyle = MAU.oNen;
      ctx.fill();
      ctx.strokeStyle = MAU.vien;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = '600 10px ' + SANS;
      ctx.fillStyle = MAU.mucNhat;
      ctx.fillText('ĐỜI ' + (b.depth + 1), b.x + 13, b.y + 17);

      var y = b.y + GP.layout.HEADER;
      y += veNguoi(ctx, n.chong, b.x, y, b.w, 'Ông:', n.doiTruyen === 'chong');
      n.vo.forEach(function (v, i) {
        var nhan = n.vo.length > 1 ? 'Bà ' + (i + 1) + ':' : 'Bà:';
        y += veNguoi(ctx, v, b.x, y, b.w, nhan, n.doiTruyen === 'vo' && i === 0);
      });
    });
  }

  /**
   * Vẽ toàn bộ cây đang hiện ra một canvas.
   * Nhánh đang thu gọn thì không xuất — xuất đúng cái đang nhìn thấy.
   */
  function taoCanvas() {
    var state = GP.data.get();
    var L = GP.layout.compute(state);

    var rongLogic = L.width + LE * 2;
    var caoLogic = L.height + LE * 2 + CAO_TIEU_DE;

    // nét gấp đôi cho chữ sắc, nhưng phải nằm trong giới hạn canvas của trình duyệt
    var ti = 2;
    ti = Math.min(ti, MAX_CANH / rongLogic, MAX_CANH / caoLogic);
    ti = Math.min(ti, Math.sqrt(MAX_DIEM / (rongLogic * caoLogic)));
    if (!isFinite(ti) || ti <= 0) ti = 1;

    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(rongLogic * ti));
    canvas.height = Math.max(1, Math.round(caoLogic * ti));
    var ctx = canvas.getContext('2d');

    ctx.scale(ti, ti);
    ctx.fillStyle = MAU.nen;
    ctx.fillRect(0, 0, rongLogic, caoLogic);

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'center';
    ctx.font = '700 26px ' + SERIF;
    ctx.fillStyle = MAU.muc;
    ctx.fillText(state.tenDongHo || 'Gia phả dòng họ', rongLogic / 2, LE + 26);

    var d = new Date();
    ctx.font = '12px ' + SANS;
    ctx.fillStyle = MAU.mucNhat;
    ctx.fillText(
      GP.data.countPeople() + ' người · ' + L.boxes.length + ' ô · xuất ngày ' +
      d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear(),
      rongLogic / 2, LE + 48
    );

    ctx.textAlign = 'left';
    ctx.translate(LE, LE + CAO_TIEU_DE);
    veCay(ctx, L, state);

    return { canvas: canvas, ti: ti, rong: rongLogic, cao: caoLogic };
  }

  /* ---------- tải về ---------- */

  function taiVe(ten, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = ten;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function tenTep(duoi) {
    return GP.nguoi.slug(GP.data.get().tenDongHo) + '-' +
      new Date().toISOString().slice(0, 10) + '.' + duoi;
  }

  function xuatJPEG(xong) {
    var r = taoCanvas();
    r.canvas.toBlob(function (blob) {
      if (!blob) { xong('Cây quá lớn, trình duyệt không tạo được ảnh. Thử thu gọn bớt nhánh.'); return; }
      taiVe(tenTep('jpg'), blob);
      xong(null, r);
    }, 'image/jpeg', 0.92);
  }

  /* ---------- PDF ---------- */

  /* PDF một trang, bên trong nhúng nguyên tấm JPEG (bộ lọc DCTDecode nhận thẳng
     dữ liệu JPEG, không phải giải nén lại). Trang lấy đúng tỉ lệ ảnh, quy ở 150 dpi. */
  function taoPDF(jpeg, rongPx, caoPx) {
    var DPI = 150, MAX_PT = 14400;   // PDF không cho trang dài quá 14400 pt
    var ti = Math.min(72 / DPI, MAX_PT / rongPx, MAX_PT / caoPx);
    var rongPt = +(rongPx * ti).toFixed(2), caoPt = +(caoPx * ti).toFixed(2);

    var phan = [], dai = 0, moc = [];
    function themByte(b) { phan.push(b); dai += b.length; }
    function themChu(s) {
      var b = new Uint8Array(s.length);
      for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
      themByte(b);
    }
    function moDoiTuong(n, than) { moc[n] = dai; themChu(n + ' 0 obj\n' + than + '\n'); }

    themChu('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');

    moDoiTuong(1, '<</Type/Catalog/Pages 2 0 R>>\nendobj');
    moDoiTuong(2, '<</Type/Pages/Kids[3 0 R]/Count 1>>\nendobj');
    moDoiTuong(3, '<</Type/Page/Parent 2 0 R/MediaBox[0 0 ' + rongPt + ' ' + caoPt +
      ']/Resources<</XObject<</Im0 4 0 R>>>>/Contents 5 0 R>>\nendobj');

    moc[4] = dai;
    themChu('4 0 obj\n<</Type/XObject/Subtype/Image/Width ' + rongPx + '/Height ' + caoPx +
      '/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ' + jpeg.length + '>>\nstream\n');
    themByte(jpeg);
    themChu('\nendstream\nendobj\n');

    var noiDung = 'q\n' + rongPt + ' 0 0 ' + caoPt + ' 0 0 cm\n/Im0 Do\nQ\n';
    moc[5] = dai;
    themChu('5 0 obj\n<</Length ' + noiDung.length + '>>\nstream\n' + noiDung + 'endstream\nendobj\n');

    var mocXref = dai;
    var xref = 'xref\n0 6\n0000000000 65535 f \n';
    for (var i = 1; i <= 5; i++) {
      xref += ('0000000000' + moc[i]).slice(-10) + ' 00000 n \n';
    }
    themChu(xref + 'trailer\n<</Size 6/Root 1 0 R>>\nstartxref\n' + mocXref + '\n%%EOF\n');

    var ra = new Uint8Array(dai), o = 0;
    phan.forEach(function (b) { ra.set(b, o); o += b.length; });
    return ra;
  }

  function xuatPDF(xong) {
    var r = taoCanvas();
    r.canvas.toBlob(function (blob) {
      if (!blob) { xong('Cây quá lớn, trình duyệt không tạo được ảnh. Thử thu gọn bớt nhánh.'); return; }
      var doc = new FileReader();
      doc.onload = function () {
        try {
          var pdf = taoPDF(new Uint8Array(doc.result), r.canvas.width, r.canvas.height);
          taiVe(tenTep('pdf'), new Blob([pdf], { type: 'application/pdf' }));
          xong(null, r);
        } catch (e) {
          xong('Không tạo được PDF: ' + e.message);
        }
      };
      doc.onerror = function () { xong('Không đọc được ảnh vừa tạo.'); };
      doc.readAsArrayBuffer(blob);
    }, 'image/jpeg', 0.92);
  }

  return {
    taoCanvas: taoCanvas,
    taoPDF: taoPDF,
    xuatJPEG: xuatJPEG,
    xuatPDF: xuatPDF,
    catChu: catChu,
    ngatDong: ngatDong
  };
})();
