# Gia phả dòng họ

Web app dựng cây gia phả nhiều đời. Mỗi ô là một gia đình (ông & bà), phân nhánh xuống các con.
Không cần server, không cần cài đặt — mở là chạy.

## Chạy

Mở thẳng `index.html` bằng trình duyệt, hoặc chạy máy chủ tại chỗ:

```
cd "/Volumes/SOLIS WD/CLAUDE/giapha"
python3 -m http.server 8777
```

rồi vào <http://127.0.0.1:8777>.

Muốn đưa lên mạng thì đẩy cả thư mục lên Vercel / Netlify / GitHub Pages — chỉ là tệp tĩnh.

## Dữ liệu

Tự lưu vào `localStorage` của trình duyệt sau mỗi lần gõ. **Đây không phải bản sao lưu** — xoá dữ
liệu duyệt web là mất. Bấm **Xuất tệp** để tải file `.json` về máy; đó mới là bản lưu thật, và cũng
là cách gửi gia phả cho người khác. Người nhận bấm **Nhập tệp** để mở.

Cấu trúc một ô:

```jsonc
{
  "id": "n7",
  "doiTruyen": "chong",        // ai là người huyết thống của dòng họ: "chong" | "vo"
  "chong": { "hoDem": "Nguyễn Văn", "ten": "An", "namSinh": 1890, "namMat": 1960, "ghiChu": "" },
  "vo":    [ { "hoDem": "Trần Thị", "ten": "Bé", "namSinh": 1895, "namMat": 1972, "ghiChu": "" } ],
  "con":   ["n8", "n9"],       // thứ tự trong mảng = thứ tự con trưởng → con út
  "meIndex": 0,                // ô này là con của bà thứ mấy của đời trên
  "thuGon": false
}
```

`vo` là mảng để ghi được vợ cả / vợ hai. Ô chỉ có một người (chưa lập gia đình, mất sớm) thì để
trống bên còn lại.

`doiTruyen` đánh dấu ai mang huyết thống dòng họ — con gái lấy chồng thì chọn "Bà", ông trong ô là
con rể. Người mang huyết thống có vạch đỏ bên trái.

## Dùng

| Việc | Cách |
|---|---|
| Sửa một ô | Bấm vào ô, sửa ở bảng bên phải. Không có nút Lưu. |
| Thêm con | Nút `＋ con` hiện ra khi rê chuột lên ô, hoặc nút trong bảng sửa |
| Thêm đời phía trên gốc | Mở ô đời 1 → "Thêm một đời phía trên" |
| Đổi thứ tự các con | Mũi tên ↑ ↓ trong danh sách "Các con" |
| Xoá | Trong bảng sửa: xoá cả nhánh, hoặc chỉ xoá ô đó và cho các con nối lên đời trên |
| Thu gọn nhánh | Nút `−` dưới đáy ô; khi gấp lại hiện `+N` là số ô đang ẩn |
| Tìm người | Gõ vào ô tìm (phím `/`), Enter để nhảy tới kết quả kế tiếp. Không cần gõ dấu. |
| Di chuyển | Kéo nền; lăn chuột để phóng to; "Vừa khung" để xem toàn cây |
| Hoàn tác | `Ctrl+Z` / `Ctrl+Shift+Z` |
| In / xuất PDF | Nút "In" — khổ A4 nằm ngang, cây tự thu cho vừa trang |

## Các tệp

| Tệp | Việc |
|---|---|
| `data.js` | trạng thái, kiểm tra dữ liệu, hoàn tác, lưu vào localStorage |
| `layout.js` | tính toạ độ cây (thuần tính toán, không đụng DOM) |
| `render.js` | vẽ ô và đường nối, kéo/phóng to |
| `editor.js` | bảng sửa bên phải |
| `app.js` | thanh công cụ, tìm kiếm, nhập/xuất, phím tắt |

Không dùng thư viện ngoài, không có bước build. Các tệp nạp bằng thẻ `<script>` thường và dùng chung
biến toàn cục `GP`, nên mở bằng `file://` cũng chạy.

## Chưa làm

Ảnh chân dung, ngày âm lịch, mộ phần, tiểu sử dài, đăng nhập, nhiều người cùng sửa một lúc.
