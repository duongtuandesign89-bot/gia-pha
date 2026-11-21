/* xuat-sach.js — xuất gia phả thành "cuốn sách" PDF nhiều trang, và ảnh JPEG theo từng nhánh.

   Cây hơn 500 ô không thể in đọc được trên một tờ giấy, nên sách chia cây ra nhiều trang
   như cuốn gia phả giấy:
     bìa · mục lục · tổng quát đời I–III · mỗi gia đình một trang · bảng tra tên A–Z.
   Mỗi trang cây cố gắng chứa nhiều đời nhất mà chữ vẫn đọc được; ô nào bị cắt ở đáy trang
   mà còn con cháu thì ghi "xem tiếp trang N", và trang đó ghi lại "tiếp từ trang M".

   Vẽ bằng Canvas, dùng lại bộ vẽ ô của xuat-anh.js (veCay) và hình học của layout.js,
   nên ô trong sách giống hệt ô trên màn hình. Mỗi trang là một ảnh JPEG nhúng vào PDF. */
window.GP = window.GP || {};

GP.xuatSach = (function () {
  'use strict';

  var XA = GP.xuatAnh;
  var MAU = XA.MAU, SERIF = XA.SERIF, SANS = XA.SANS;

  var DPI = 200;
  /* Tỉ lệ vẽ cây: bao nhiêu điểm ảnh (ở 200 dpi) cho một đơn vị của layout.js.
     Ở 1.15, tên in đậm 14px thành ~5.8pt, dòng năm 12px thành ~5pt: nhỏ nhưng vẫn đọc
     được trên giấy. Dưới mức đó thì chia trang thay vì thu nhỏ tiếp. */
  var TI_MIN = 1.15;
  var TI_MAX = 1.7;
  var CHO_NHAN = 40;   // chỗ dưới đáy cây cho dòng "xem tiếp trang N" (đơn vị layout)
  var SO_DOI_THU = [5, 4, 3, 2];   // mỗi trang thử chứa từng ấy đời, nhiều trước

  var TI_GOI = 1.3;    // tỉ lệ dùng để tính sức chứa khi gom nhiều gia đình lên một trang
  var GOI_X = 110, GOI_Y = 50, CHU_DAU = 34;   // khoảng cách giữa các gia đình chung trang; chỗ cho dòng chú thích

  var KHO = { A4: [297, 210], A3: [420, 297] };

  function mm(x) { return Math.round(x / 25.4 * DPI); }

  function laMa(n) {
    var so = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']], r = '';
    so.forEach(function (c) { while (n >= c[0]) { r += c[1]; n -= c[0]; } });
    return r;
  }

  /* ---------- chữ của một người / một ô ---------- */

  function tenDu(p) { return GP.data.fullName(p); }
  function nguoiHuyetThong(n) { return n.doiTruyen === 'vo' ? n.vo[0] : n.chong; }
  function nguoiPhoi(n) { return n.doiTruyen === 'vo' ? [n.chong] : n.vo; }

  function nienDai(p) {
    var s = GP.nguoi.sinh(p), m = GP.nguoi.mat(p);
    if (s && GP.nguoi.amSinh(p)) s += ' ÂL';
    if (m && GP.nguoi.amMat(p)) m += ' ÂL';
    if (s && m) return s + ' – ' + m;
    if (s) return 'S: ' + s;
    if (m) return 'M: ' + m;
    return '';
  }

  function tieuDeGiaDinh(n) {
    var p = nguoiHuyetThong(n);
    return (n.doiTruyen === 'vo' ? 'Gia đình bà ' : 'Gia đình ông ') + (tenDu(p) || 'chưa đặt tên');
  }

  /* ---------- lập kế hoạch các trang ---------- */

  function bangDoi(state) {
    // đời (0 = đời I) của mọi ô, tính từ gốc thật
    var doi = {};
    (function di(id, d) {
      doi[id] = d;
      state.nodes[id].con.forEach(function (c) { di(c, d + 1); });
    })(state.rootId, 0);
    return doi;
  }

  function khoGiay(opt) {
    var k = KHO[opt.kho] || KHO.A3;
    return opt.huong === 'doc' ? [k[1], k[0]] : [k[0], k[1]];
  }

  /** Vùng vẽ của một trang, đơn vị điểm ảnh 200 dpi. */
  function vungTrang(opt) {
    var g = khoGiay(opt);
    var W = mm(g[0]), H = mm(g[1]);
    var le = mm(12), dau = mm(21), chan = mm(11);
    return { W: W, H: H, le: le, x: le, y: le + dau, w: W - 2 * le, h: H - 2 * le - dau - chan, mm: g };
  }

  /** Các ô ở đúng bậc `bac` tính từ `goc` (bậc 0 là chính nó). */
  function oOBac(state, goc, bac) {
    var ra = [];
    (function di(id, b) {
      if (b === bac) { ra.push(id); return; }
      state.nodes[id].con.forEach(function (c) { di(c, b + 1); });
    })(goc, 0);
    return ra;
  }

  /* Trang có quá nhiều con không xếp nổi trên một hàng: xếp các con thành lưới
     nhiều hàng dưới ô cha, giống cách cuốn gia phả giấy vẫn trình bày. */
  function boCucLuoi(state, gocId, doiGoc, rongToiDa) {
    var L = GP.layout;
    var nodes = state.nodes, goc = nodes[gocId];
    var W = L.NODE_W, GX = L.H_GAP, GY = 56, TREN = 44;
    var cot = Math.max(1, Math.floor((rongToiDa + GX) / (W + GX)));
    var hang = Math.ceil(goc.con.length / cot);
    cot = Math.ceil(goc.con.length / hang);   // chia đều cho các hàng
    var rong = cot * W + (cot - 1) * GX;

    function ban(id, n, bac, parent) {
      var showMe = !!(parent && parent.vo.length > 1);
      var me = (parent && n.meIndex >= 0 && n.meIndex < parent.vo.length) ? n.meIndex : 0;
      return {
        id: id, node: n, level: bac, depth: doiGoc + bac, w: W,
        h: L.nodeHeight(n, showMe), collapsed: bac > 0 && n.con.length > 0,
        showMe: showMe, meIdx: me,
        meName: showMe ? (GP.nguoi.ten(parent.vo[me]) || GP.nguoi.ho(parent.vo[me])) : ''
      };
    }

    var r0 = ban(gocId, goc, 0, null);
    r0.x = (rong - W) / 2; r0.cx = r0.x + W / 2; r0.y = 0;
    var boxes = [r0], byId = {}, hangs = [];
    byId[gocId] = r0;
    var y = r0.h + TREN;
    for (var h = 0; h < hang; h++) {
      var tu = h * cot, den = Math.min(goc.con.length, tu + cot);
      var cao = 0, cacO = [];
      for (var i = tu; i < den; i++) {
        var o = ban(goc.con[i], nodes[goc.con[i]], 1, goc);
        cao = Math.max(cao, o.h);
        cacO.push(o);
      }
      var soO = cacO.length;
      var trai = (rong - (soO * W + (soO - 1) * GX)) / 2;
      cacO.forEach(function (o, k) {
        o.x = trai + k * (W + GX); o.cx = o.x + W / 2; o.y = y;
        boxes.push(o); byId[o.id] = o;
      });
      hangs.push({ y: y, cacO: cacO, cao: cao });
      y += cao + GY + CHO_NHAN;
    }
    return {
      boxes: boxes, byId: byId, edges: [], luoi: { goc: r0, hangs: hangs, TREN: TREN },
      width: rong, height: y - GY - CHO_NHAN
    };
  }

  function tiVua(vung, L) {
    return Math.min(vung.w / Math.max(L.width, 1), vung.h / Math.max(L.height + CHO_NHAN, 1), TI_MAX);
  }

  /**
   * opt: { rootId, kho: 'A3'|'A4', huong: 'ngang'|'doc' }
   * @returns danh sách trang theo thứ tự, mỗi trang có .so (số trang) và .loai
   */
  function lapKeHoach(opt) {
    var state = opt.state || GP.data.get();
    var doi = bangDoi(state);
    var goc = opt.rootId && state.nodes[opt.rootId] ? opt.rootId : state.rootId;
    var vung = vungTrang(opt);
    var trangCay = [];

    /* Bố cục cho một gia đình: thử chứa 5 đời, 4, 3, 2 — lấy nhiều nhất mà chữ còn đọc được.
       Không xếp nổi cả hàng con thì xếp con thành lưới. `cat`: các ô bị cắt, sang trang khác. */
    function chonBoCuc(id) {
      for (var i = 0; i < SO_DOI_THU.length; i++) {
        var cat = {};
        oOBac(state, id, SO_DOI_THU[i] - 1).forEach(function (c) { if (state.nodes[c].con.length) cat[c] = true; });
        var L = GP.layout.compute(state, {
          rootId: id, baseDepth: doi[id],
          collapsed: function (cid) { return !!cat[cid]; }
        });
        if (tiVua(vung, L) >= TI_MIN) return { L: L, cat: cat };
      }
      var catG = {};
      state.nodes[id].con.forEach(function (c) { if (state.nodes[c].con.length) catG[c] = true; });
      return { L: boCucLuoi(state, id, doi[id], vung.w / TI_MIN), cat: catG };
    }

    /* Gom nhiều gia đình nhỏ lên chung một trang (xếp thành hàng, hết chỗ thì xuống hàng,
       hết trang thì sang trang mới), để sách không thành trăm trang mỗi trang vài ô.
       Trả về bản đồ id -> trang chứa gia đình đó. */
    function dongGoi(ids, tu, chaId) {
      var capW = vung.w / TI_GOI, capH = vung.h / TI_GOI;
      var trangMoi = [], cur = null, x = 0, yHang = 0, caoHang = 0, hang = null;
      var dich = {};
      function moTrang() {
        cur = { loai: 'cay', muc: [], hangs: [], tu: tu, chaId: chaId };
        trangMoi.push(cur); x = 0; yHang = 0; caoHang = 0; hang = null;
      }
      function moHang(y) { hang = []; cur.hangs.push(hang); yHang = y; x = 0; caoHang = 0; }
      ids.forEach(function (id) {
        var bc = chonBoCuc(id);
        var m = { rootId: id, L: bc.L, cat: bc.cat, tiep: {},
          w: bc.L.width, h: CHU_DAU + bc.L.height + CHO_NHAN };
        m.doiDau = doi[id]; m.doiCuoi = 0;
        bc.L.boxes.forEach(function (b) { m.doiCuoi = Math.max(m.doiCuoi, b.depth); });
        if (m.w > capW || m.h > capH) {           // gia đình lớn: đứng riêng một trang
          var rieng = { loai: 'cay', muc: [m], hangs: [[m]], tu: tu, chaId: chaId };
          m.ox = 0; m.oy = 0;
          trangMoi.push(rieng); dich[id] = rieng; cur = null;
          return;
        }
        if (!cur) { moTrang(); moHang(0); }
        if (x > 0 && x + GOI_X + m.w > capW) {
          var yMoi = yHang + caoHang + GOI_Y;
          if (yMoi + m.h > capH) { moTrang(); moHang(0); } else { moHang(yMoi); }
        }
        m.ox = x ? x + GOI_X : 0; m.oy = yHang;
        x = m.ox + m.w; caoHang = Math.max(caoHang, m.h);
        hang.push(m); cur.muc.push(m); dich[id] = cur;
      });
      trangMoi.forEach(function (t) {
        var rong = 0, cao = 0;
        t.hangs.forEach(function (h) {
          var r = h[h.length - 1].ox + h[h.length - 1].w;
          rong = Math.max(rong, r);
        });
        t.hangs.forEach(function (h) {   // căn giữa từng hàng
          var r = h[h.length - 1].ox + h[h.length - 1].w, lech = (rong - r) / 2;
          h.forEach(function (m) { m.ox += lech; cao = Math.max(cao, m.oy + m.h); });
        });
        t.rong = rong; t.cao = cao;
        t.ti = Math.min(vung.w / rong, vung.h / cao, TI_MAX);
        t.doiDau = Math.min.apply(null, t.muc.map(function (m) { return m.doiDau; }));
        t.doiCuoi = Math.max.apply(null, t.muc.map(function (m) { return m.doiCuoi; }));
        trangCay.push(t);
      });
      // các nhánh bị cắt của từng gia đình: gom tiếp, theo thứ tự xuất hiện
      trangMoi.forEach(function (t) {
        t.muc.forEach(function (m) {
          var cat = m.L.boxes.filter(function (b) { return m.cat[b.id]; }).map(function (b) { return b.id; });
          if (!cat.length) return;
          var d = dongGoi(cat, t, m.rootId);
          cat.forEach(function (cid) { m.tiep[cid] = d[cid]; });
        });
      });
      return dich;
    }

    var trangTongQuat = [];
    if (goc === state.rootId && state.nodes[goc].con.length) {
      trangTongQuat = lapTongQuat(state, goc, vung);
      trangTongQuat.forEach(function (t) {
        // gom theo từng nhánh đời II để một trang chỉ chứa con cháu của cùng một ông/bà đời II
        t.o.filter(function (r) { return r.bac === 1; }).forEach(function (r2) {
          var cat = r2.con.filter(function (r) { return r.node.con.length; }).map(function (r) { return r.id; });
          if (!cat.length) return;
          var d = dongGoi(cat, t, r2.id);
          cat.forEach(function (id) { t.tiep[id] = d[id]; });
        });
      });
    } else {
      dongGoi([goc], null, null);
    }

    // mục lục: một dòng cho mỗi trang tổng quát và mỗi gia đình có trang riêng
    var mucLuc = [];
    trangTongQuat.forEach(function (t, i) {
      mucLuc.push({ trang: t, chu: 'Tổng quát đời I – III' + (trangTongQuat.length > 1 ? ' (phần ' + (i + 1) + ')' : ''), thut: 0, dam: true });
    });
    var doiGoc = doi[goc];
    var thuTu = [];
    trangCay.forEach(function (t) { t.muc.forEach(function (m) { thuTu.push({ t: t, m: m }); }); });
    // mục lục đi theo cây (cha trước, con sau) chứ không theo thứ tự trang
    var viTri = {};
    (function di(id, k) { viTri[id] = k.n++; state.nodes[id].con.forEach(function (c) { di(c, k); }); })(goc, { n: 0 });
    thuTu.sort(function (a, b) { return viTri[a.m.rootId] - viTri[b.m.rootId]; });
    // khi in cả dòng họ: chèn dòng tiêu đề mỗi khi sang nhánh đời II khác
    var nhanhCua = {}, trangTQ = {};
    if (trangTongQuat.length) {
      state.nodes[goc].con.forEach(function (c2) {
        (function di(id) { nhanhCua[id] = c2; state.nodes[id].con.forEach(di); })(c2);
      });
      trangTongQuat.forEach(function (t) { t.cacO.forEach(function (id) { trangTQ[id] = t; }); });
    }
    var nhanhTruoc = null;
    thuTu.forEach(function (x) {
      var n = state.nodes[x.m.rootId];
      var nh = nhanhCua[x.m.rootId];
      if (nh && nh !== nhanhTruoc) {
        nhanhTruoc = nh;
        mucLuc.push({ trang: trangTQ[nh], thut: 0, dam: true,
          chu: 'Nhánh ' + tieuDeGiaDinh(state.nodes[nh]).replace('Gia đình ', '') });
      }
      mucLuc.push({
        trang: x.t, thut: x.m.doiDau - doiGoc - (trangTongQuat.length ? 1 : 0),
        chu: tieuDeGiaDinh(n) + '  ·  đời ' + laMa(x.m.doiDau + 1) +
          (x.m.doiCuoi > x.m.doiDau ? '–' + laMa(x.m.doiCuoi + 1) : '')
      });
    });

    var traTen = lapTraTen(state, doi, goc);

    var bia = { loai: 'bia' };
    var soDongMucLuc = soDongMoiCot(vung, mm(7.2)) * soCot(vung, mm(140));
    var trangMucLuc = [];
    for (var m = 0; m < Math.max(1, Math.ceil(mucLuc.length / soDongMucLuc)); m++) {
      trangMucLuc.push({ loai: 'mucluc', dong: mucLuc.slice(m * soDongMucLuc, (m + 1) * soDongMucLuc), phan: m });
    }
    var trangTra = chiaTrangTraTen(traTen, vung);

    var tatCa = [bia].concat(trangMucLuc, trangTongQuat, trangCay, trangTra);
    tatCa.forEach(function (t, i) { t.so = i + 1; });

    // trang của từng người cho bảng tra tên: lấy trang mà ô đó hiện đủ (không bị cắt)
    var trangCuaO = {};
    trangTongQuat.forEach(function (t) { t.cacO.forEach(function (id) { trangCuaO[id] = t.so; }); });
    trangCay.forEach(function (t) {
      t.muc.forEach(function (m) {
        m.L.boxes.forEach(function (b) { if (!m.cat[b.id]) trangCuaO[b.id] = t.so; });
      });
    });
    traTen.forEach(function (e) { e.trang = trangCuaO[e.id] || ''; });

    return {
      trang: tatCa, vung: vung, state: state, doi: doi, goc: goc,
      soNguoi: traTen.length, soTrangCay: trangCay.length, phuDe: opt.phuDe,
      soDoi: traTen.reduce(function (m, e) { return Math.max(m, e.doi + 1); }, 0) - doi[goc]
    };
  }

  /* ---------- trang tổng quát đời I–III: cây nằm ngang, ô gọn ---------- */

  var TQ = { W: 400, H: 58, GX: 90, GY: 10 };
  var TI_TQ_MIN = 1.05;

  function lapTongQuat(state, goc, vung) {
    var nodes = state.nodes;
    var con2 = nodes[goc].con;
    // số dòng mỗi nhánh đời II chiếm (mỗi ô đời III một dòng, nhánh không con chiếm 1)
    function soDong(id) { return Math.max(1, nodes[id].con.length); }
    var dongToiDa = Math.floor((vung.h / TI_TQ_MIN + TQ.GY) / (TQ.H + TQ.GY));
    var nhom = [], hienTai = [], dem = 0;
    con2.forEach(function (id) {
      var s = soDong(id);
      if (hienTai.length && dem + s > dongToiDa) { nhom.push(hienTai); hienTai = []; dem = 0; }
      hienTai.push(id); dem += s;
    });
    if (hienTai.length) nhom.push(hienTai);

    return nhom.map(function (ds) {
      var dong = 0, o = [];
      function them(id, bac) {
        var r = { id: id, node: nodes[id], bac: bac, x: bac * (TQ.W + TQ.GX) };
        o.push(r);
        if (bac < 2 && nodes[id].con.length) {
          var con = nodes[id].con.map(function (c) { return them(c, bac + 1); });
          r.y = (con[0].y + con[con.length - 1].y) / 2;
          r.con = con;
        } else {
          r.y = dong * (TQ.H + TQ.GY);
          dong++;
          r.con = [];
        }
        return r;
      }
      var cacCon = ds.map(function (id) { return them(id, 1); });
      var g = { id: goc, node: nodes[goc], bac: 0, x: 0, con: cacCon,
        y: (cacCon[0].y + cacCon[cacCon.length - 1].y) / 2 };
      o.unshift(g);
      var rong = 3 * TQ.W + 2 * TQ.GX + 150;   // 150: chỗ cho "→ tr. N"
      var cao = dong * (TQ.H + TQ.GY) - TQ.GY + 30;   // 30: dòng nhãn ĐỜI I/II/III
      return {
        loai: 'tongquat', o: o, goc: g, rong: rong, cao: cao, tiep: {},
        cuoi: o.filter(function (r) { return r.bac === 2 && r.node.con.length; }).map(function (r) { return r.id; }),
        cacO: o.map(function (r) { return r.id; })
      };
    });
  }

  /* ---------- bảng tra tên ---------- */

  function lapTraTen(state, doi, goc) {
    var ra = [];
    (function di(id) {
      var n = state.nodes[id];
      var ht = nguoiHuyetThong(n);
      [n.chong].concat(n.vo).forEach(function (p) {
        if (!GP.data.hasName(p)) return;
        var ho = GP.nguoi.ho(p);
        var tu = ho.split(/\s+/);
        var tenRieng = tu[tu.length - 1] || ho;
        ra.push({
          id: id, p: p, doi: doi[id], huyet: p === ht,
          khoa: GP.nguoi.boDau(tenRieng) + ' ' + GP.nguoi.boDau(ho) + ' ' + GP.nguoi.boDau(GP.nguoi.ten(p)),
          chuDau: (GP.nguoi.boDau(tenRieng).charAt(0) || '#').toUpperCase()
        });
      });
      n.con.forEach(di);
    })(goc);
    ra.sort(function (a, b) { return a.khoa < b.khoa ? -1 : a.khoa > b.khoa ? 1 : a.doi - b.doi; });
    return ra;
  }

  function soCot(vung, rongCot) { return Math.max(1, Math.floor(vung.w / rongCot)); }
  function soDongMoiCot(vung, caoDong) { return Math.max(1, Math.floor((vung.h - mm(4)) / caoDong)); }

  /* Chia bảng tra tên thành trang/cột; mỗi chữ cái mới chiếm thêm một dòng tiêu đề. */
  function chiaTrangTraTen(ds, vung) {
    var cot = soCot(vung, mm(132)), dongCot = soDongMoiCot(vung, mm(5.6));
    var trang = [], tr = null, c = 0, d = 0, chuTruoc = '';
    function trangMoi() { tr = { loai: 'traten', cot: [[]] }; trang.push(tr); c = 0; d = 0; }
    function cotMoi() {
      c++; d = 0;
      if (c >= cot) { trangMoi(); } else { tr.cot.push([]); }
    }
    trangMoi();
    ds.forEach(function (e) {
      if (e.chuDau !== chuTruoc) {
        if (d + 2 > dongCot) cotMoi();
        tr.cot[c].push({ chuCai: e.chuDau });
        d++;
        chuTruoc = e.chuDau;
      }
      if (d >= dongCot) cotMoi();
      tr.cot[c].push(e);
      d++;
    });
    trang.forEach(function (t, i) { t.phan = i; });
    return trang;
  }

  /* ---------- vẽ ---------- */

  function canvasTrang(vung) {
    var cv = document.createElement('canvas');
    cv.width = vung.W; cv.height = vung.H;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = MAU.nen;
    ctx.fillRect(0, 0, vung.W, vung.H);
    ctx.textBaseline = 'alphabetic';
    return { cv: cv, ctx: ctx };
  }

  function chuGiua(ctx, chu, x, y, font, mau) {
    ctx.font = font; ctx.fillStyle = mau; ctx.textAlign = 'center';
    ctx.fillText(chu, x, y);
    ctx.textAlign = 'left';
  }

  function vienTrang(ctx, kh, t, tieuDe, phuDe) {
    var v = kh.vung, st = kh.state;
    // dòng trên cùng: tên dòng họ (trái), đường kẻ
    ctx.font = '600 ' + mm(2.6) + 'px ' + SANS;
    ctx.fillStyle = MAU.mucNhat;
    ctx.textAlign = 'left';
    ctx.fillText((st.tenDongHo || 'Gia phả').toUpperCase(), v.le, v.le + mm(2));
    if (tieuDe) chuGiua(ctx, tieuDe, v.W / 2, v.le + mm(9), '700 ' + mm(5.2) + 'px ' + SERIF, MAU.muc);
    if (phuDe) chuGiua(ctx, phuDe, v.W / 2, v.le + mm(14.5), mm(3) + 'px ' + SANS, MAU.mucNhat);
    ctx.strokeStyle = MAU.vien; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(v.le, v.y - mm(3)); ctx.lineTo(v.W - v.le, v.y - mm(3));
    ctx.moveTo(v.le, v.H - v.le - mm(5)); ctx.lineTo(v.W - v.le, v.H - v.le - mm(5));
    ctx.stroke();
    // số trang
    chuGiua(ctx, String(t.so), v.W / 2, v.H - v.le, '600 ' + mm(3.2) + 'px ' + SERIF, MAU.muc);
    ctx.font = mm(2.4) + 'px ' + SANS; ctx.fillStyle = MAU.mucNhat;
    ctx.textAlign = 'right';
    ctx.fillText('trang ' + t.so + ' / ' + kh.trang.length, v.W - v.le, v.H - v.le);
    ctx.textAlign = 'left';
  }

  function chuoiDong(kh, id) {
    // "Luông › Sanh › Dậu": tên riêng của người huyết thống các đời phía trên
    var st = kh.state;
    var ds = GP.data.ancestors(id).reverse().concat([id]);
    return ds.map(function (x) {
      var p = nguoiHuyetThong(st.nodes[x]);
      var ho = GP.nguoi.ho(p).split(/\s+/);
      return ho[ho.length - 1] || '?';
    }).join(' › ');
  }

  function veTrangCay(kh, t) {
    var v = kh.vung, st = kh.state;
    var c = canvasTrang(v), ctx = c.ctx;
    var nhieu = t.muc.length > 1;
    var tieuDe = nhieu && t.chaId ?
      'Con cháu ' + tieuDeGiaDinh(st.nodes[t.chaId]).replace('Gia đình ', '') :
      tieuDeGiaDinh(st.nodes[t.muc[0].rootId]);
    var dong = nhieu && t.chaId ? t.chaId : t.muc[0].rootId;
    var phuDe = 'Đời ' + laMa(t.doiDau + 1) + (t.doiCuoi > t.doiDau ? ' – ' + laMa(t.doiCuoi + 1) : '') +
      '   ·   Dòng: ' + chuoiDong(kh, dong) +
      (t.tu ? '   ·   tiếp từ trang ' + t.tu.so : '');
    vienTrang(ctx, kh, t, tieuDe, phuDe);

    var ti = t.ti;
    var x0 = v.x + (v.w - t.rong * ti) / 2;
    var y0 = v.y + Math.max(0, (v.h - t.cao * ti) / 3);
    t.muc.forEach(function (m) {
      var L = m.L;
      ctx.save();
      ctx.translate(x0 + m.ox * ti, y0 + m.oy * ti);
      ctx.scale(ti, ti);
      ctx.textAlign = 'left';
      if (nhieu) {
        // chú thích nhỏ phía trên mỗi gia đình: thuộc dòng nào
        ctx.font = '700 15px ' + SANS; ctx.fillStyle = MAU.vang;
        ctx.fillText(XA.catChu(ctx, 'Dòng: ' + chuoiDong(kh, m.rootId), Math.max(L.width, 250)), 0, 18);
      }
      ctx.translate(0, CHU_DAU);
      if (L.luoi) veNoiLuoi(ctx, L.luoi);
      XA.veCay(ctx, L, st);
      L.boxes.forEach(function (b) {
        var tiep = m.tiep[b.id];
        if (!tiep) return;
        ctx.strokeStyle = MAU.son; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(b.cx, b.y + b.h); ctx.lineTo(b.cx, b.y + b.h + 8); ctx.stroke();
        chuGiua(ctx, '▼ xem tiếp trang ' + tiep.so, b.cx, b.y + b.h + 26, '700 14px ' + SANS, MAU.son);
      });
      ctx.restore();
    });
    return c.cv;
  }

  /* đường nối cho bố cục lưới: thân dọc bên trái, mỗi hàng con một thanh ngang phía trên */
  function veNoiLuoi(ctx, g) {
    ctx.strokeStyle = MAU.duong; ctx.lineWidth = 1.6;
    ctx.beginPath();
    var goc = g.goc, trucX = -16;
    var nhieuHang = g.hangs.length > 1;
    var yDau = g.hangs[0].y - g.TREN / 2;
    ctx.moveTo(goc.cx, goc.y + goc.h); ctx.lineTo(goc.cx, yDau);
    g.hangs.forEach(function (h, i) {
      var by = h.y - g.TREN / 2;
      var xs = h.cacO.map(function (o) { return o.cx; });
      var trai = Math.min.apply(null, xs), phai = Math.max.apply(null, xs);
      if (nhieuHang) trai = trucX;
      if (i === 0) { trai = Math.min(trai, goc.cx); phai = Math.max(phai, goc.cx); }
      ctx.moveTo(trai, by); ctx.lineTo(phai, by);
      h.cacO.forEach(function (o) { ctx.moveTo(o.cx, by); ctx.lineTo(o.cx, o.y); });
    });
    if (nhieuHang) {
      ctx.moveTo(trucX, yDau);
      ctx.lineTo(trucX, g.hangs[g.hangs.length - 1].y - g.TREN / 2);
    }
    ctx.stroke();
  }

  function veTongQuat(kh, t, i, tong) {
    var v = kh.vung, st = kh.state;
    var c = canvasTrang(v), ctx = c.ctx;
    vienTrang(ctx, kh, t, 'Tổng quát đời I – III' + (tong > 1 ? ' (phần ' + (i + 1) + '/' + tong + ')' : ''),
      'Mỗi ô là một gia đình · vạch đỏ: người mang huyết thống dòng họ · số trang bên phải: xem chi tiết');
    var ti = Math.min(v.w / t.rong, v.h / Math.max(t.cao, 1), 2.2);
    var x0 = v.x + (v.w - t.rong * ti) / 2;
    var y0 = v.y + Math.max(0, (v.h - t.cao * ti) / 2);
    ctx.save();
    ctx.translate(x0, y0);
    ctx.scale(ti, ti);
    ctx.translate(0, 30);

    // đường nối kiểu khuỷu tay
    ctx.strokeStyle = MAU.duong; ctx.lineWidth = 1.6;
    ctx.beginPath();
    t.o.forEach(function (r) {
      if (!r.con.length) return;
      var xm = r.x + TQ.W + TQ.GX / 2, ym = r.y + TQ.H / 2;
      ctx.moveTo(r.x + TQ.W, ym); ctx.lineTo(xm, ym);
      var ys = r.con.map(function (k) { return k.y + TQ.H / 2; });
      ctx.moveTo(xm, Math.min.apply(null, ys)); ctx.lineTo(xm, Math.max.apply(null, ys));
      r.con.forEach(function (k) { ctx.moveTo(xm, k.y + TQ.H / 2); ctx.lineTo(k.x, k.y + TQ.H / 2); });
    });
    ctx.stroke();

    // nhãn đời phía trên các cột
    ['ĐỜI I', 'ĐỜI II', 'ĐỜI III'].forEach(function (s, k) {
      chuGiua(ctx, s, k * (TQ.W + TQ.GX) + TQ.W / 2, -10, '700 13px ' + SANS, MAU.vang);
    });

    t.o.forEach(function (r) {
      var n = r.node, p = nguoiHuyetThong(n);
      XA.khungBo(ctx, r.x, r.y, TQ.W, TQ.H, 8);
      ctx.fillStyle = MAU.oNen; ctx.fill();
      ctx.strokeStyle = MAU.vien; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = MAU.son; ctx.fillRect(r.x + 5, r.y + 6, 3, TQ.H - 12);
      ctx.textAlign = 'left';
      ctx.font = '700 18px ' + SERIF; ctx.fillStyle = MAU.muc;
      var dong1 = (tenDu(p) || 'chưa đặt tên');
      var nd = nienDai(p);
      ctx.fillText(XA.catChu(ctx, dong1, TQ.W - 24), r.x + 16, r.y + 23);
      var phoi = nguoiPhoi(n).filter(GP.data.hasName).map(tenDu);
      var dong2 = (nd ? nd : '') + (phoi.length ? (nd ? '  ·  ' : '') + (n.doiTruyen === 'vo' ? 'chồng: ' : 'vợ: ') + phoi.join(', ') : '');
      ctx.font = '14px ' + SANS; ctx.fillStyle = MAU.mucNhat;
      ctx.fillText(XA.catChu(ctx, dong2, TQ.W - 24), r.x + 16, r.y + 46);
      var tiep = t.tiep[r.id];
      if (tiep) {
        ctx.font = '700 15px ' + SANS; ctx.fillStyle = MAU.son;
        ctx.fillText('→ trang ' + tiep.so, r.x + TQ.W + 12, r.y + TQ.H / 2 + 5);
      }
    });
    ctx.restore();
    return c.cv;
  }

  function veBia(kh, t) {
    var v = kh.vung, st = kh.state;
    var c = canvasTrang(v), ctx = c.ctx;
    ctx.strokeStyle = MAU.vang; ctx.lineWidth = mm(0.8);
    ctx.strokeRect(mm(14), mm(14), v.W - mm(28), v.H - mm(28));
    ctx.lineWidth = mm(0.3);
    ctx.strokeRect(mm(18), mm(18), v.W - mm(36), v.H - mm(36));
    var cx = v.W / 2, cy = v.H / 2;
    if (GP.nguoi.boDau(st.tenDongHo || '').indexOf('gia pha') !== 0) {
      chuGiua(ctx, 'GIA PHẢ', cx, cy - mm(28), '600 ' + mm(7) + 'px ' + SERIF, MAU.son);
    }
    var ten = (st.tenDongHo || 'Gia phả dòng họ').toUpperCase();
    var co = mm(13);
    ctx.font = '700 ' + co + 'px ' + SERIF;
    while (co > mm(6) && ctx.measureText(ten).width > v.W - mm(60)) { co -= 4; ctx.font = '700 ' + co + 'px ' + SERIF; }
    chuGiua(ctx, ten, cx, cy, '700 ' + co + 'px ' + SERIF, MAU.muc);
    var soDoi = kh.soDoi;
    var goc = st.nodes[kh.goc];
    var pham = kh.goc === st.rootId ? 'Toàn bộ dòng họ' :
      'Nhánh ' + tieuDeGiaDinh(goc).replace('Gia đình ', '') + ' (đời ' + laMa(kh.doi[kh.goc] + 1) + ') trở xuống';
    var d = new Date();
    if (kh.phuDe) pham += ' · ' + kh.phuDe;
    chuGiua(ctx, pham, cx, cy + mm(16), mm(4.5) + 'px ' + SERIF, MAU.muc);
    chuGiua(ctx, kh.soNguoi + ' người  ·  ' + soDoi + ' đời  ·  ' + kh.trang.length + ' trang', cx, cy + mm(25),
      mm(3.6) + 'px ' + SANS, MAU.mucNhat);
    chuGiua(ctx, 'Xuất ngày ' + d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear(), cx, cy + mm(32),
      mm(3.2) + 'px ' + SANS, MAU.mucNhat);
    return c.cv;
  }

  function veMucLuc(kh, t) {
    var v = kh.vung;
    var c = canvasTrang(v), ctx = c.ctx;
    vienTrang(ctx, kh, t, 'Mục lục' + (t.phan ? ' (tiếp)' : ''), '');
    var caoDong = mm(7.2), rongCot = mm(140);
    var cot = soCot(v, rongCot), moiCot = soDongMoiCot(v, caoDong);
    var rongThat = v.w / cot;
    t.dong.forEach(function (e, i) {
      var k = Math.floor(i / moiCot), d = i % moiCot;
      var x = v.x + k * rongThat, y = v.y + mm(4) + d * caoDong;
      var thut = Math.min(e.thut, 6) * mm(5);
      var so = String(e.trang.so);
      ctx.font = '600 ' + mm(3.3) + 'px ' + SERIF;
      var rongSo = ctx.measureText(so).width;
      ctx.font = (e.thut === 0 ? '700 ' : '') + mm(3.3) + 'px ' + SERIF;
      ctx.fillStyle = e.dam ? MAU.son : MAU.muc;
      var chu = XA.catChu(ctx, e.chu, rongThat - mm(10) - thut - rongSo - mm(8));
      ctx.fillText(chu, x + thut, y);
      var cuoiChu = x + thut + ctx.measureText(chu).width + mm(2);
      var dauSo = x + rongThat - mm(8) - rongSo;
      ctx.fillStyle = MAU.trong;
      for (var px = cuoiChu; px < dauSo - mm(2); px += mm(1.8)) ctx.fillRect(px, y - mm(0.4), mm(0.35), mm(0.35));
      ctx.font = '600 ' + mm(3.3) + 'px ' + SERIF;
      ctx.fillStyle = MAU.muc;
      ctx.fillText(so, dauSo, y);
    });
    return c.cv;
  }

  function veTraTen(kh, t) {
    var v = kh.vung;
    var c = canvasTrang(v), ctx = c.ctx;
    vienTrang(ctx, kh, t, 'Bảng tra tên' + (t.phan ? ' (tiếp)' : ''),
      'Xếp theo tên riêng A–Z · in đậm: người mang huyết thống dòng họ · số cuối dòng: trang có ô của người đó');
    var caoDong = mm(5.6), cot = soCot(v, mm(132));
    var rongThat = v.w / cot;
    t.cot.forEach(function (ds, k) {
      var x = v.x + k * rongThat, phai = x + rongThat - mm(8);
      ds.forEach(function (e, d) {
        var y = v.y + mm(4) + d * caoDong;
        if (e.chuCai) {
          ctx.font = '700 ' + mm(3.8) + 'px ' + SERIF; ctx.fillStyle = MAU.son;
          ctx.fillText(e.chuCai, x, y);
          ctx.fillStyle = MAU.vien; ctx.fillRect(x + mm(7), y - mm(1.2), rongThat - mm(16), mm(0.25));
          return;
        }
        var cuoi = 'đời ' + laMa(e.doi + 1) + ' · tr. ' + e.trang;
        ctx.font = mm(2.7) + 'px ' + SANS; ctx.fillStyle = MAU.mucNhat;
        var rc = ctx.measureText(cuoi).width;
        ctx.textAlign = 'right'; ctx.fillText(cuoi, phai, y); ctx.textAlign = 'left';
        var ten = GP.nguoi.ho(e.p) + (GP.nguoi.ten(e.p) ? ' ' + GP.nguoi.ten(e.p) : '');
        var ns = e.p.namSinh && typeof e.p.namSinh === 'number' ? ' · ' + e.p.namSinh : '';
        ctx.font = (e.huyet ? '700 ' : '') + mm(3) + 'px ' + SERIF; ctx.fillStyle = MAU.muc;
        var chu = XA.catChu(ctx, ten, phai - rc - x - mm(14));
        ctx.fillText(chu, x, y);
        var w = ctx.measureText(chu).width;
        if (ns) {
          ctx.font = mm(2.6) + 'px ' + SANS; ctx.fillStyle = MAU.mucNhat;
          if (x + w + ctx.measureText(ns).width < phai - rc - mm(3)) ctx.fillText(ns, x + w, y);
        }
      });
    });
    return c.cv;
  }

  function veTrang(kh, t) {
    if (t.loai === 'bia') return veBia(kh, t);
    if (t.loai === 'mucluc') return veMucLuc(kh, t);
    if (t.loai === 'traten') return veTraTen(kh, t);
    if (t.loai === 'tongquat') {
      var tq = kh.trang.filter(function (x) { return x.loai === 'tongquat'; });
      return veTongQuat(kh, t, tq.indexOf(t), tq.length);
    }
    return veTrangCay(kh, t);
  }

  /* ---------- PDF nhiều trang ---------- */

  function taoPDFNhieuTrang(anh, trangMm) {
    var wPt = +(trangMm[0] * 72 / 25.4).toFixed(2), hPt = +(trangMm[1] * 72 / 25.4).toFixed(2);
    var phan = [], dai = 0, moc = [];
    function themByte(b) { phan.push(b); dai += b.length; }
    function themChu(s) {
      var b = new Uint8Array(s.length);
      for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
      themByte(b);
    }
    themChu('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
    var soTrang = anh.length;
    // đối tượng: 1 catalog, 2 pages, rồi mỗi trang 3 đối tượng: page, ảnh, nội dung
    var kids = [];
    for (var i = 0; i < soTrang; i++) kids.push((3 + i * 3) + ' 0 R');
    moc[1] = dai; themChu('1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n');
    moc[2] = dai; themChu('2 0 obj\n<</Type/Pages/Kids[' + kids.join(' ') + ']/Count ' + soTrang + '>>\nendobj\n');
    anh.forEach(function (a, i) {
      var pg = 3 + i * 3, im = pg + 1, nd = pg + 2;
      moc[pg] = dai;
      themChu(pg + ' 0 obj\n<</Type/Page/Parent 2 0 R/MediaBox[0 0 ' + wPt + ' ' + hPt +
        ']/Resources<</XObject<</Im0 ' + im + ' 0 R>>>>/Contents ' + nd + ' 0 R>>\nendobj\n');
      moc[im] = dai;
      themChu(im + ' 0 obj\n<</Type/XObject/Subtype/Image/Width ' + a.w + '/Height ' + a.h +
        '/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ' + a.jpeg.length + '>>\nstream\n');
      themByte(a.jpeg);
      themChu('\nendstream\nendobj\n');
      var noiDung = 'q\n' + wPt + ' 0 0 ' + hPt + ' 0 0 cm\n/Im0 Do\nQ\n';
      moc[nd] = dai;
      themChu(nd + ' 0 obj\n<</Length ' + noiDung.length + '>>\nstream\n' + noiDung + 'endstream\nendobj\n');
    });
    var tong = 3 + soTrang * 3;
    var mocXref = dai;
    var xref = 'xref\n0 ' + tong + '\n0000000000 65535 f \n';
    for (var k = 1; k < tong; k++) xref += ('0000000000' + moc[k]).slice(-10) + ' 00000 n \n';
    themChu(xref + 'trailer\n<</Size ' + tong + '/Root 1 0 R>>\nstartxref\n' + mocXref + '\n%%EOF\n');
    var ra = new Uint8Array(dai), o = 0;
    phan.forEach(function (b) { ra.set(b, o); o += b.length; });
    return ra;
  }

  function canvasRaJPEG(cv, xong) {
    cv.toBlob(function (blob) {
      if (!blob) { xong(new Error('trình duyệt không tạo được ảnh')); return; }
      var doc = new FileReader();
      doc.onload = function () { xong(null, new Uint8Array(doc.result)); };
      doc.onerror = function () { xong(new Error('không đọc được ảnh vừa tạo')); };
      doc.readAsArrayBuffer(blob);
    }, 'image/jpeg', 0.88);
  }

  /**
   * Tạo sách PDF.
   * opt: { rootId, kho, huong }
   * tienDo(i, tong) gọi trước khi vẽ mỗi trang; xong(loi, {bytes, soTrang})
   */
  function taoSach(opt, tienDo, xong) {
    var kh;
    try {
      kh = lapKeHoach(opt);
    } catch (e) { xong('Không lập được bố cục sách: ' + e.message); return; }
    var anh = [], i = 0;
    function buoc() {
      if (i >= kh.trang.length) {
        try {
          var bytes = taoPDFNhieuTrang(anh, kh.vung.mm);
          xong(null, { bytes: bytes, soTrang: kh.trang.length, keHoach: kh });
        } catch (e) { xong('Không ghép được PDF: ' + e.message); }
        return;
      }
      if (tienDo) tienDo(i + 1, kh.trang.length);
      var cv;
      try { cv = veTrang(kh, kh.trang[i]); } catch (e) { xong('Lỗi khi vẽ trang ' + (i + 1) + ': ' + e.message); return; }
      canvasRaJPEG(cv, function (loi, jpeg) {
        if (loi) { xong('Trang ' + (i + 1) + ': ' + loi.message); return; }
        anh.push({ jpeg: jpeg, w: cv.width, h: cv.height });
        cv.width = cv.height = 1;   // trả bộ nhớ
        i++;
        setTimeout(buoc, 0);
      });
    }
    buoc();
  }

  function xuatSach(opt, tienDo, xong) {
    taoSach(opt, tienDo, function (loi, kq) {
      if (loi) { xong(loi); return; }
      var ten = GP.nguoi.slug(GP.data.get().tenDongHo) + '-sach-' + (opt.kho || 'A3') +
        '-' + new Date().toISOString().slice(0, 10) + '.pdf';
      XA.taiVe(ten, new Blob([kq.bytes], { type: 'application/pdf' }));
      xong(null, kq);
    });
  }

  /* ---------- ảnh JPEG theo từng nhánh ---------- */

  /**
   * opt.rootId: ô bắt đầu. opt.tachNhanh: true thì mỗi con của ô đó một ảnh riêng
   * (mặc định với ô gốc: mỗi nhánh đời II một ảnh). Ảnh vẽ đủ cả nhánh, kể cả phần đang thu gọn.
   */
  function lapDanhSachAnh(opt) {
    var st = opt.state || GP.data.get();
    var goc = opt.rootId && st.nodes[opt.rootId] ? opt.rootId : st.rootId;
    var ds = [];
    /* Ảnh rộng quá giới hạn canvas thì bị thu nhỏ, chữ nhoè khi phóng to trên điện thoại.
       Nhánh nào vẽ ra nhỏ hơn cỡ thật thì tách tiếp thành từng nhánh con. */
    function rongNhanh(id) {
      return GP.layout.compute(st, { rootId: id, collapsed: function () { return false; } }).width + 88;
    }
    function them(id) {
      if (opt.tachNhanh && !opt.doc && st.nodes[id].con.length && 12000 / rongNhanh(id) < 1) {
        ds.push({ id: id, chiCon: true });   // ảnh gọn: ô này và các con, để không sót người con không có cháu
        st.nodes[id].con.forEach(function (c) { if (st.nodes[c].con.length) them(c); });
      } else {
        ds.push({ id: id });
      }
    }
    if (opt.tachNhanh && st.nodes[goc].con.length) {
      ds.push({ id: goc, chiCon: true });
      st.nodes[goc].con.forEach(function (c) { if (st.nodes[c].con.length) them(c); });
    } else {
      ds.push({ id: goc });
    }
    return ds;
  }

  function xuatAnhNhanh(opt, tienDo, xong) {
    var st = opt.state || GP.data.get();
    var ds = lapDanhSachAnh(opt);
    var i = 0, ghiChu = [];
    function buoc() {
      if (i >= ds.length) { xong(null, { soAnh: ds.length, ghiChu: ghiChu }); return; }
      var id = ds[i].id, chiCon = ds[i].chiCon, n = st.nodes[id], p = nguoiHuyetThong(n);
      if (tienDo) tienDo(i + 1, ds.length);
      var tieuDe = 'Nhánh ' + tieuDeGiaDinh(n).replace('Gia đình ', '') +
        (GP.data.ancestors(id).length ? '  ·  ' + chuoiDong({ state: st }, id) : '');
      var r;
      if (chiCon) tieuDe = tieuDe.replace('Nhánh ', 'Gia đình ') + '  (các con; mỗi người con có cháu xem ảnh riêng)';
      try { r = XA.taoCanvas({ state: st, rootId: id, moHet: true, chiCon: chiCon, tieuDe: tieuDe, doc: opt.doc, phuDe: opt.phuDe }); } catch (e) { xong('Không vẽ được: ' + e.message); return; }
      if (r.ti < 1) ghiChu.push(tieuDe + ' (ảnh thu nhỏ còn ' + Math.round(r.ti * 100) + '% vì nhánh quá rộng)');
      var ten = GP.nguoi.slug(st.tenDongHo) + '-' + String(i + 1).padStart(2, '0') + '-' +
        GP.nguoi.slug(GP.nguoi.ho(p) + ' ' + GP.nguoi.ten(p)) + (chiCon ? '-cac-con' : '') + (opt.doc ? '-doc' : '') + '.jpg';
      r.canvas.toBlob(function (blob) {
        if (!blob) { xong('Nhánh "' + tieuDe + '" quá lớn, trình duyệt không tạo được ảnh.'); return; }
        XA.taiVe(ten, blob);
        r.canvas.width = r.canvas.height = 1;
        i++;
        setTimeout(buoc, 700);   // tải nhiều tệp liền nhau thì trình duyệt hay chặn, giãn ra một chút
      }, 'image/jpeg', 0.9);
    }
    buoc();
  }

  return {
    lapKeHoach: lapKeHoach,
    veTrang: veTrang,
    taoSach: taoSach,
    xuatSach: xuatSach,
    xuatAnhNhanh: xuatAnhNhanh,
    lapDanhSachAnh: lapDanhSachAnh,
    taoPDFNhieuTrang: taoPDFNhieuTrang,
    KHO: KHO
  };
})();
