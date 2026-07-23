/* nguoi.js — chữ hiển thị của một người, tính từ dữ liệu thô.
   Dùng chung cho bản vẽ HTML (render.js) và bản vẽ ảnh (xuat-anh.js).
   Hai nơi đó vẽ khác nhau nhưng phải ra đúng cùng một nội dung chữ. */
window.GP = window.GP || {};

GP.nguoi = (function () {
  'use strict';

  function hai(v) { return (v < 10 ? '0' : '') + v; }

  /** "12/05/1890" nếu đủ, "05/1890" nếu thiếu ngày, "1890" nếu chỉ có năm.
      Ngày mà không có tháng thì bỏ ngày — "12//1890" vô nghĩa. */
  function ngayThangNam(ngay, thang, nam) {
    var p = [];
    if (ngay && thang) p.push(hai(ngay));
    if (thang) p.push(hai(thang));
    if (nam) p.push(nam);
    return p.join('/');
  }

  function ho(p) { return String(p && p.hoDem || '').trim(); }
  function ten(p) { return String(p && p.ten || '').trim(); }
  function ghiChu(p) { return String(p && p.ghiChu || '').trim(); }
  function coTen(p) { return !!(ho(p) || ten(p)); }

  /* Năm ghi bằng chữ ("Ất Mão", "không rõ") thì vẫn giữ nguyên ngày và tháng nếu có:
     "biết ngày giỗ nhưng không rõ năm" là trường hợp phổ biến nhất trong gia phả,
     ẩn ngày tháng đi là làm mất đúng cái người ta cần. */
  function mocText(ngay, thang, nam) {
    if (typeof nam === 'string') {
      var chu = nam.trim();
      var dm = (ngay && thang) ? hai(ngay) + '/' + hai(thang) : (thang ? hai(thang) : '');
      return dm && chu ? dm + ' ' + chu : (dm || chu);
    }
    return ngayThangNam(ngay, thang, nam);
  }

  function sinh(p) { return mocText(p.ngaySinh, p.thangSinh, p.namSinh); }

  /* Âm lịch chỉ là cái nhãn dán lên mốc thời gian, không quy đổi gì cả. */
  function amSinh(p) { return p.lichSinh === 'am'; }
  function amMat(p) { return p.lichMat === 'am'; }

  function mat(p) { return mocText(p.ngayMat, p.thangMat, p.namMat); }

  /** Bỏ dấu để tìm "an" ra "Ân", "duc" ra "Đức". Chữ đ không tách được bằng NFD nên xử riêng. */
  function boDau(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .toLowerCase().trim();
  }

  /** Tên dòng họ -> chuỗi đặt tên tệp được: "Gia phả họ Nguyễn" -> "gia-pha-ho-nguyen". */
  function slug(s) {
    return boDau(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'gia-pha';
  }

  /** Câu đầy đủ để rê chuột đọc: "Sinh 12/05/1890 âm lịch · Mất 1960". */
  function moTa(p) {
    var ra = [];
    var s = sinh(p), m = mat(p);
    if (s) ra.push('Sinh ' + s + (amSinh(p) ? ' âm lịch' : ''));
    if (m) ra.push('Mất ' + m + (amMat(p) ? ' âm lịch' : ''));
    return ra.join(' · ');
  }

  return {
    ngayThangNam: ngayThangNam,
    amSinh: amSinh, amMat: amMat, moTa: moTa,
    ho: ho, ten: ten, ghiChu: ghiChu, coTen: coTen,
    sinh: sinh, mat: mat,
    boDau: boDau, slug: slug
  };
})();
