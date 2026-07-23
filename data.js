/* data.js — trạng thái gia phả: đọc/ghi, kiểm tra, hoàn tác.
   Không biết gì về DOM. Mọi thay đổi đi qua đây rồi phát tín hiệu cho render. */
window.GP = window.GP || {};

GP.data = (function () {
  'use strict';

  var KEY = 'giapha.v1';
  var MAX_UNDO = 60;

  var state = null;
  var undoStack = [];
  var redoStack = [];
  var listeners = [];
  var lastEditKey = null; // gộp nhiều lần gõ trong cùng một ô thành 1 bước hoàn tác

  function uid() {
    return 'n' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  }

  /* Ngày và tháng để riêng chứ không gộp vào một chuỗi ngày-tháng-năm, vì phần lớn
     các cụ đời trước chỉ còn nhớ mỗi năm. Thiếu phần nào thì phần đó là null.
     Tên trường `namSinh`/`namMat` giữ nguyên như bản đầu để tệp cũ mở lại được.

     `namMat` nhận cả chữ ("không rõ", "mất lúc nhỏ") vì nhiều trường hợp chỉ biết
     là đã mất chứ không biết năm. Khi là chữ thì ngày/tháng mất bị bỏ qua lúc hiển thị.

     `lichSinh`/`lichMat` là 'duong' hoặc 'am'. Nhiều gia phả chỉ ghi ngày âm, nhất là ngày
     giỗ. Ở đây chỉ ghi nhận ngày đó thuộc lịch nào chứ KHÔNG quy đổi qua lại — quy đổi cần
     thuật toán âm lịch riêng, và quy sai thì hỏng dữ liệu gốc không lấy lại được. */
  function newPerson(hoDem, ten, namSinh, namMat) {
    return {
      hoDem: hoDem || '',
      ten: ten || '',
      ngaySinh: null,
      thangSinh: null,
      namSinh: namSinh == null ? null : namSinh,
      lichSinh: 'duong',
      ngayMat: null,
      thangMat: null,
      namMat: namMat == null ? null : namMat,
      lichMat: 'duong',
      ghiChu: ''
    };
  }

  function newNode() {
    return {
      id: uid(),
      doiTruyen: 'chong',
      chong: newPerson(),
      vo: [newPerson()],
      con: [],
      meIndex: 0,
      thuGon: false
    };
  }

  /* ---------- dựng dữ liệu ---------- */

  function emptyTree() {
    var root = newNode();
    var nodes = {};
    nodes[root.id] = root;
    return { version: 1, tenDongHo: 'Gia phả dòng họ', rootId: root.id, nodes: nodes };
  }

  function sampleTree() {
    var t = emptyTree();
    var root = t.nodes[t.rootId];
    t.tenDongHo = 'Gia phả họ Nguyễn';
    root.chong = newPerson('Nguyễn Văn', 'An', 1890, 1960);
    root.chong.ngaySinh = 12; root.chong.thangSinh = 5;
    root.chong.ngayMat = 3; root.chong.thangMat = 11;
    root.vo = [newPerson('Trần Thị', 'Bé', 1895, 1972)];
    root.vo[0].thangSinh = 8;   // chỉ nhớ tháng, không nhớ ngày

    function add(parent, chong, vo, doiTruyen) {
      var n = newNode();
      n.chong = chong;
      n.vo = [vo];
      n.doiTruyen = doiTruyen || 'chong';
      t.nodes[n.id] = n;
      parent.con.push(n.id);
      return n;
    }

    root.chong.ghiChu = 'Tổ khai cơ, lập nghiệp tại làng Đông Ngạc';

    var c1 = add(root, newPerson('Nguyễn Văn', 'Bình', 1915, 1988), newPerson('Lê Thị', 'Hoa', 1920, 1995));
    c1.chong.ghiChu = 'Liệt sĩ';
    c1.chong.ngayMat = 15; c1.chong.thangMat = 8;
    c1.chong.lichMat = 'am';        // giỗ tính theo ngày âm
    var c2 = add(root, newPerson('Nguyễn Văn', 'Cường', 1918, 1990), newPerson('Phạm Thị', 'Lan', 1922, 2001));
    var c3 = add(root, newPerson('Đỗ Văn', 'Tâm', 1919, 1993), newPerson('Nguyễn Thị', 'Mai', 1923, 2004), 'vo');

    var g1 = add(c1, newPerson('Nguyễn Văn', 'Dũng', 1945, null), newPerson('Vũ Thị', 'Nga', 1948, null));
    g1.vo[0].namMat = 'không rõ';   // biết là đã mất nhưng không rõ năm
    add(c1, newPerson('Nguyễn Văn', 'Đức', 1949, 2018), newPerson('Hoàng Thị', 'Thu', 1952, null));
    add(c2, newPerson('Nguyễn Văn', 'Giang', 1950, null), newPerson('Trần Thị', 'Hồng', 1954, null));
    add(c3, newPerson('Lý Văn', 'Hải', 1947, null), newPerson('Đỗ Thị', 'Thanh', 1950, null), 'vo');
    return t;
  }

  /* ---------- kiểm tra khi nhập file ---------- */

  function validate(obj) {
    if (!obj || typeof obj !== 'object') return 'Tệp không phải dữ liệu gia phả.';
    if (!obj.nodes || typeof obj.nodes !== 'object') return 'Thiếu danh sách các ô (nodes).';
    if (!obj.rootId || !obj.nodes[obj.rootId]) return 'Không tìm thấy ô gốc (đời 1).';

    var ids = Object.keys(obj.nodes);
    for (var i = 0; i < ids.length; i++) {
      var n = obj.nodes[ids[i]];
      if (!n || typeof n !== 'object') return 'Ô "' + ids[i] + '" bị hỏng.';
      if (!Array.isArray(n.con)) return 'Ô "' + ids[i] + '" thiếu danh sách con.';
      for (var j = 0; j < n.con.length; j++) {
        if (!obj.nodes[n.con[j]]) return 'Ô "' + ids[i] + '" trỏ tới người con không tồn tại.';
      }
    }

    // không được có vòng lặp, và mỗi ô chỉ có một cha
    var seen = {}, stack = [obj.rootId], guard = 0;
    while (stack.length) {
      if (++guard > ids.length + 5) return 'Cấu trúc cây bị lặp vòng.';
      var id = stack.pop();
      if (seen[id]) return 'Ô "' + id + '" xuất hiện ở hai nhánh khác nhau.';
      seen[id] = true;
      stack = stack.concat(obj.nodes[id].con);
    }
    return null;
  }

  /** Chuỗi toàn chữ số thì đưa về số, để chỗ hiển thị chỉ cần phân biệt số với chữ. */
  function chuanHoaNamMat(v) {
    if (typeof v !== 'string') return v;
    var t = v.trim();
    if (!t) return null;
    return /^\d{1,4}$/.test(t) ? parseInt(t, 10) : t;
  }

  function chuanHoaNguoi(p) {
    var out = Object.assign(newPerson(), p || {});
    out.namMat = chuanHoaNamMat(out.namMat);
    out.lichSinh = out.lichSinh === 'am' ? 'am' : 'duong';
    out.lichMat = out.lichMat === 'am' ? 'am' : 'duong';
    return out;
  }

  /** Bù các trường thiếu để dữ liệu cũ/ngoài vẫn dùng được. */
  function normalize(obj) {
    obj.version = 1;
    obj.tenDongHo = obj.tenDongHo || 'Gia phả dòng họ';
    Object.keys(obj.nodes).forEach(function (id) {
      var n = obj.nodes[id];
      n.id = id;
      n.doiTruyen = n.doiTruyen === 'vo' ? 'vo' : 'chong';
      n.chong = chuanHoaNguoi(n.chong);
      n.vo = (Array.isArray(n.vo) ? n.vo : []).map(chuanHoaNguoi);
      if (!n.vo.length) n.vo = [newPerson()];
      n.meIndex = typeof n.meIndex === 'number' ? n.meIndex : 0;
      n.thuGon = !!n.thuGon;
      n.con = Array.isArray(n.con) ? n.con : [];
    });
    return obj;
  }

  /* ---------- lưu trữ ---------- */

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Không lưu được vào localStorage:', e);
    }
  }

  function load() {
    var raw = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch (e) { /* chế độ riêng tư */ }

    if (raw) {
      try {
        var obj = JSON.parse(raw);
        if (!validate(obj)) {
          state = normalize(obj);
          return state;
        }
      } catch (e) { /* hỏng thì rơi xuống dữ liệu mẫu */ }
    }
    state = sampleTree();
    persist();
    return state;
  }

  /* ---------- hoàn tác ---------- */

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function snapshot() {
    undoStack.push(clone(state));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0;
  }

  function undo() {
    if (!undoStack.length) return false;
    redoStack.push(clone(state));
    state = undoStack.pop();
    lastEditKey = null;
    persist();
    emit();
    return true;
  }

  function redo() {
    if (!redoStack.length) return false;
    undoStack.push(clone(state));
    state = redoStack.pop();
    lastEditKey = null;
    persist();
    emit();
    return true;
  }

  /** Gọi trước mỗi thay đổi. `key` khác null sẽ gộp các lần gõ liên tiếp cùng ô. */
  function mark(key) {
    if (key == null) {
      lastEditKey = null;
      snapshot();
    } else if (key !== lastEditKey) {
      lastEditKey = key;
      snapshot();
    }
  }

  function emit() {
    listeners.forEach(function (fn) { fn(state); });
  }

  function commit() {
    persist();
    emit();
  }

  /* ---------- truy vấn ---------- */

  function get() { return state; }
  function node(id) { return state.nodes[id]; }

  /** Bản đồ con -> cha, dựng lại mỗi lần gọi để không bao giờ lệch với `con`. */
  function parentMap() {
    var map = {};
    Object.keys(state.nodes).forEach(function (id) {
      state.nodes[id].con.forEach(function (cid) { map[cid] = id; });
    });
    return map;
  }

  function ancestors(id) {
    var map = parentMap(), out = [], cur = map[id], guard = 0;
    while (cur && guard++ < 500) { out.push(cur); cur = map[cur]; }
    return out;
  }

  /** Số ô trong nhánh, kể cả chính nó. */
  function branchSize(id) {
    var n = state.nodes[id];
    if (!n) return 0;
    return n.con.reduce(function (s, cid) { return s + branchSize(cid); }, 1);
  }

  /** Tổng số người có tên trong toàn bộ gia phả. */
  function countPeople() {
    var total = 0;
    Object.keys(state.nodes).forEach(function (id) {
      var n = state.nodes[id];
      if (hasName(n.chong)) total++;
      n.vo.forEach(function (v) { if (hasName(v)) total++; });
    });
    return total;
  }

  function hasName(p) { return !!(p && (p.hoDem.trim() || p.ten.trim())); }

  function fullName(p) {
    if (!p) return '';
    return (p.hoDem.trim() + ' ' + p.ten.trim()).trim();
  }

  /* ---------- thay đổi ---------- */

  function setTenDongHo(v) {
    mark('tenDongHo');
    state.tenDongHo = v;
    commit();
  }

  function updatePerson(nodeId, who, index, field, value) {
    var n = node(nodeId);
    if (!n) return;
    var p = who === 'chong' ? n.chong : n.vo[index];
    if (!p) return;
    mark([nodeId, who, index, field].join('|'));
    p[field] = value;
    commit();
  }

  function setDoiTruyen(nodeId, who) {
    mark(null);
    node(nodeId).doiTruyen = who === 'vo' ? 'vo' : 'chong';
    commit();
  }

  /** Gạt một mốc giữa dương lịch và âm lịch. `field` là 'lichSinh' hoặc 'lichMat'. */
  function doiLich(nodeId, who, index, field) {
    var n = node(nodeId);
    if (!n) return;
    var p = who === 'chong' ? n.chong : n.vo[index];
    if (!p || (field !== 'lichSinh' && field !== 'lichMat')) return;
    mark(null);
    p[field] = p[field] === 'am' ? 'duong' : 'am';
    commit();
  }

  function setMeIndex(nodeId, index) {
    mark(null);
    node(nodeId).meIndex = index;
    commit();
  }

  function addSpouse(nodeId) {
    mark(null);
    node(nodeId).vo.push(newPerson());
    commit();
  }

  function removeSpouse(nodeId, index) {
    var n = node(nodeId);
    if (n.vo.length <= 1) return;
    mark(null);
    n.vo.splice(index, 1);
    // các con đang trỏ tới bà này hoặc bà đứng sau phải dời chỉ số
    n.con.forEach(function (cid) {
      var c = node(cid);
      if (c.meIndex === index) c.meIndex = 0;
      else if (c.meIndex > index) c.meIndex--;
    });
    commit();
  }

  function addChild(parentId) {
    mark(null);
    var n = newNode();
    state.nodes[n.id] = n;
    node(parentId).con.push(n.id);
    node(parentId).thuGon = false;
    commit();
    return n.id;
  }

  /** Thêm một đời phía trên ô gốc — dùng khi tra ra được cụ tổ xa hơn. */
  function addParentAboveRoot() {
    mark(null);
    var n = newNode();
    n.con = [state.rootId];
    state.nodes[n.id] = n;
    state.rootId = n.id;
    commit();
    return n.id;
  }

  function moveChild(parentId, index, delta) {
    var con = node(parentId).con;
    var to = index + delta;
    if (to < 0 || to >= con.length) return;
    mark(null);
    var x = con.splice(index, 1)[0];
    con.splice(to, 0, x);
    commit();
  }

  /**
   * Xoá một ô.
   *   mode 'branch'  — xoá cả nhánh bên dưới
   *   mode 'promote' — chỉ xoá ô này, các con nối thẳng lên ông bà
   * Trả về null nếu xoá được, hoặc chuỗi lý do nếu không.
   */
  function deleteNode(nodeId, mode) {
    if (nodeId === state.rootId) {
      return 'Không xoá được ô gốc. Dùng "Tạo mới" nếu muốn làm lại từ đầu.';
    }
    var map = parentMap();
    var parentId = map[nodeId];
    var parent = node(parentId);
    var at = parent.con.indexOf(nodeId);

    mark(null);
    if (mode === 'promote') {
      var con = node(nodeId).con.slice();
      parent.con.splice.apply(parent.con, [at, 1].concat(con));
      delete state.nodes[nodeId];
    } else {
      var doomed = [];
      (function collect(id) {
        doomed.push(id);
        node(id).con.forEach(collect);
      })(nodeId);
      parent.con.splice(at, 1);
      doomed.forEach(function (id) { delete state.nodes[id]; });
    }
    commit();
    return null;
  }

  function toggleCollapse(nodeId) {
    var n = node(nodeId);
    if (!n.con.length) return;
    n.thuGon = !n.thuGon; // trạng thái xem, không đưa vào hoàn tác
    commit();
  }

  function setAllCollapsed(v) {
    Object.keys(state.nodes).forEach(function (id) {
      var n = state.nodes[id];
      n.thuGon = v && n.con.length > 0 && id !== state.rootId;
    });
    commit();
  }

  function expandTo(nodeId) {
    ancestors(nodeId).forEach(function (id) { state.nodes[id].thuGon = false; });
    commit();
  }

  /* ---------- nhập / xuất / làm lại từ đầu ---------- */

  function replaceAll(obj) {
    var err = validate(obj);
    if (err) return err;
    mark(null);
    state = normalize(obj);
    commit();
    return null;
  }

  function reset() {
    mark(null);
    state = emptyTree();
    commit();
  }

  function toJSON() {
    return JSON.stringify(state, null, 2);
  }

  function onChange(fn) { listeners.push(fn); }

  return {
    load: load, get: get, node: node, onChange: onChange,
    parentMap: parentMap, ancestors: ancestors, branchSize: branchSize,
    countPeople: countPeople, hasName: hasName, fullName: fullName,
    setTenDongHo: setTenDongHo, updatePerson: updatePerson,
    setDoiTruyen: setDoiTruyen, setMeIndex: setMeIndex, doiLich: doiLich,
    addSpouse: addSpouse, removeSpouse: removeSpouse,
    addChild: addChild, addParentAboveRoot: addParentAboveRoot,
    moveChild: moveChild, deleteNode: deleteNode,
    toggleCollapse: toggleCollapse, setAllCollapsed: setAllCollapsed, expandTo: expandTo,
    undo: undo, redo: redo,
    replaceAll: replaceAll, reset: reset, toJSON: toJSON, validate: validate
  };
})();
