/* layout.js — xếp cây thành toạ độ. Thuần tính toán, không đụng DOM.
   Các ô cùng một đời luôn nằm trên cùng một hàng ngang; nhánh con không bao giờ đè nhau. */
window.GP = window.GP || {};

GP.layout = (function () {
  'use strict';

  var NODE_W = 250;   // bề ngang một ô, cố định
  var H_GAP = 30;     // cách nhau giữa hai ô anh em
  var V_GAP = 68;     // cách nhau giữa hai đời
  /* Bốn hằng số dưới đây phải khớp với chiều cao thật do CSS dựng ra, nếu không chữ
     sẽ tràn khỏi đáy ô. Đo bằng offsetHeight trên trình duyệt — đừng sửa styles.css
     phần chữ trong ô mà không đo lại. */
  var HEADER = 25;    // dải "Đời n"
  var PERSON = 65;    // một người: dòng họ (21) + tên riêng (21) + năm (16) + đệm (7)
  var GHI_CHU = 17;   // mỗi dòng ghi chú
  var PAD = 14;       // đệm đáy 10 + viền 2 + dư 2

  /* CSS cắt ghi chú ở tối đa 2 dòng. Ở đây không đo được chữ nên ước lượng theo độ dài,
     và cố ý ước lượng dư: dài quá 30 ký tự thì chừa luôn 2 dòng. Chừa dư chỉ tốn vài
     pixel trống, chừa thiếu thì chữ tràn ra khỏi ô. */
  function ghiChuHeight(p) {
    var t = (p.ghiChu || '').trim();
    if (!t) return 0;
    return (t.length > 30 ? GHI_CHU * 2 : GHI_CHU) + 2;
  }

  function nodeHeight(n) {
    var h = HEADER + PAD + PERSON + ghiChuHeight(n.chong);
    for (var i = 0; i < n.vo.length; i++) {
      h += PERSON + ghiChuHeight(n.vo[i]);
    }
    return h;
  }

  /**
   * @returns {{boxes: Array, edges: Array, width: number, height: number}}
   *   boxes: {id, node, depth, x, y, w, h} — x,y là góc trên bên trái
   *   edges: {parent, children, busY} — một cụm đường nối từ cha xuống các con
   */
  function compute(state) {
    var nodes = state.nodes;
    var rec = {};      // id -> bản ghi bố cục
    var order = [];

    // 1. đi qua các ô đang hiện (nhánh thu gọn thì dừng lại) để lấy đời + chiều cao
    (function walk(id, depth) {
      var n = nodes[id];
      if (!n) return;
      var r = { id: id, node: n, depth: depth, h: nodeHeight(n), w: NODE_W };
      rec[id] = r;
      order.push(r);
      if (!n.thuGon) {
        for (var i = 0; i < n.con.length; i++) walk(n.con[i], depth + 1);
      }
    })(state.rootId, 0);

    // 2. mỗi đời cao bằng ô cao nhất của đời đó, nhờ vậy các đời thẳng hàng
    var rowH = [];
    order.forEach(function (r) {
      rowH[r.depth] = Math.max(rowH[r.depth] || 0, r.h);
    });
    var rowY = [], acc = 0;
    for (var d = 0; d < rowH.length; d++) {
      rowY[d] = acc;
      acc += rowH[d] + V_GAP;
    }

    // 3. bề ngang mà cả nhánh chiếm chỗ
    function subtreeWidth(id) {
      var n = nodes[id], r = rec[id];
      if (n.thuGon || !n.con.length) {
        r.sw = NODE_W;
        r.childSpan = 0;
        return r.sw;
      }
      var total = 0;
      for (var i = 0; i < n.con.length; i++) {
        if (i) total += H_GAP;
        total += subtreeWidth(n.con[i]);
      }
      r.childSpan = total;
      r.sw = Math.max(NODE_W, total);
      return r.sw;
    }
    subtreeWidth(state.rootId);

    // 4. rải theo chiều ngang: cha nằm giữa hàng con
    function place(id, left) {
      var n = nodes[id], r = rec[id];
      if (n.thuGon || !n.con.length) {
        r.cx = left + NODE_W / 2;
      } else {
        // nhánh hẹp hơn chính ô cha thì đẩy các con vào giữa
        var cursor = left + (r.sw - r.childSpan) / 2;
        for (var i = 0; i < n.con.length; i++) {
          place(n.con[i], cursor);
          cursor += rec[n.con[i]].sw + H_GAP;
        }
        var first = rec[n.con[0]].cx;
        var last = rec[n.con[n.con.length - 1]].cx;
        r.cx = (first + last) / 2;
      }
      r.x = r.cx - NODE_W / 2;
      r.y = rowY[r.depth];
    }
    place(state.rootId, 0);

    // 5. dồn về gốc toạ độ 0,0
    var minX = Infinity, maxX = -Infinity, maxY = 0;
    order.forEach(function (r) {
      minX = Math.min(minX, r.x);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    });
    if (!isFinite(minX)) minX = 0;
    order.forEach(function (r) { r.x -= minX; r.cx -= minX; });

    // 6. các cụm đường nối
    var edges = [];
    order.forEach(function (r) {
      var n = r.node;
      if (n.thuGon || !n.con.length) return;
      var kids = n.con.map(function (cid) { return rec[cid]; }).filter(Boolean);
      if (!kids.length) return;
      edges.push({ parent: r, children: kids, busY: r.y + r.h + V_GAP / 2 });
    });

    return {
      boxes: order,
      byId: rec,
      edges: edges,
      width: maxX - minX,
      height: maxY
    };
  }

  return {
    compute: compute,
    NODE_W: NODE_W, H_GAP: H_GAP, V_GAP: V_GAP,
    HEADER: HEADER, PERSON: PERSON
  };
})();
