# Gia phả dòng họ

Web app dựng cây gia phả nhiều đời. Mỗi ô là một gia đình (ông & bà), phân nhánh xuống các con.
Không cần server, không cần cài đặt — mở là chạy.

**Đang chạy tại: <https://gia-pha-mu.vercel.app>**

Vercel lấy thẳng từ nhánh `main` của repo này — cứ push là nó tự deploy lại.

## Chạy

Mở thẳng `index.html` bằng trình duyệt, hoặc chạy máy chủ tại chỗ:

```
cd "/Volumes/SOLIS WD/CLAUDE/giapha"
python3 -m http.server 8777
```

rồi vào <http://127.0.0.1:8777>.

Toàn bộ là tệp tĩnh, không có bước build — host ở đâu cũng được.

## Dữ liệu

Tự lưu vào `localStorage` của trình duyệt sau mỗi lần gõ. **Đây không phải bản sao lưu** — xoá dữ
liệu duyệt web là mất. Bấm **Xuất tệp** để tải file `.json` về máy; đó mới là bản lưu thật, và cũng
là cách gửi gia phả cho người khác. Người nhận bấm **Nhập tệp** để mở.

Cấu trúc một ô:

```jsonc
{
  "id": "n7",
  "doiTruyen": "chong",        // ai là người huyết thống của dòng họ: "chong" | "vo"
  "chong": {
    "hoDem": "Nguyễn Văn", "ten": "An",
    "ngaySinh": 12, "thangSinh": 5, "namSinh": 1890, "lichSinh": "duong",
    "ngayMat": 15, "thangMat": 8, "namMat": 1960,    "lichMat": "am",
    "ghiChu": ""
  },
  "vo": [ { "hoDem": "Trần Thị", "ten": "Bé", "thangSinh": 8, "namSinh": 1895, "namMat": 1972 } ],
  "con":   ["n8", "n9"],       // thứ tự trong mảng = thứ tự con trưởng → con út
  "meIndex": 0,                // ô này là con của bà thứ mấy của đời trên
  "thuGon": false
}
```

Ngày và tháng để riêng khỏi năm, phần nào không biết thì `null` — phần lớn các cụ đời trước chỉ
còn nhớ mỗi năm. Trong ô hiển thị `S:` là sinh, `M:` là mất, và chỉ hiện phần có dữ liệu:

| Có gì | Hiện ra |
|---|---|
| 12 / 5 / 1890 | `S: 12/05/1890` |
| 8 / 1895 | `S: 08/1895` |
| 1960 | `S: 1960` |
| 15 / 8 / "Ất Mão" | `S: 15/08 Ất Mão` |
| "không rõ" | `S: không rõ` |
| ngày mà thiếu tháng | bỏ ngày, chỉ hiện năm |

Tệp `.json` xuất từ bản trước (chỉ có `namSinh`/`namMat`) vẫn mở lại được — các trường ngày/tháng
tự được bù thành `null`.

**Hai ô năm ghi được bằng chữ.** Năm can chi (`"Ất Mão"`, `"Đinh Hợi"`) hoặc `"không rõ"`,
`"mất lúc nhỏ"`. Gõ toàn chữ số thì lưu thành số, còn lại lưu nguyên chữ.

Năm là chữ thì **ngày và tháng vẫn giữ nguyên bên cạnh**: `15/08 Ất Mão`, `20/03 không rõ`. Đây là
trường hợp phổ biến nhất trong gia phả — biết ngày giỗ nhưng không biết năm — nên ẩn ngày tháng đi
là làm mất đúng cái người ta cần.

**Âm lịch.** `lichSinh`/`lichMat` là `"duong"` hoặc `"am"`, mặc định dương lịch. Rất nhiều gia phả
chỉ ghi ngày âm, nhất là ngày giỗ. Ứng dụng **chỉ ghi nhận mốc đó thuộc lịch nào, không quy đổi** —
quy đổi cần thuật toán âm lịch riêng, và quy sai thì hỏng mất dữ liệu gốc. Trong ô, mốc âm lịch có
chữ `ÂL` nhỏ màu đỏ bên cạnh — kể cả khi năm ghi bằng chữ, vì năm can chi vốn là năm âm lịch.

Nếu cả sinh lẫn mất đều dài (đủ ngày/tháng/năm, lại thêm dấu âm lịch) thì dòng năm tự tách làm hai
dòng thay vì bị cắt cụt. `GP.layout.namHaiDong()` là chỗ **duy nhất** quyết định việc đó — cả bản
HTML, bản Canvas và phần tính chiều cao ô đều hỏi hàm này nên không bao giờ lệch nhau.

**Ghi chú hiện ngay trong ô** dưới dòng năm, in nghiêng. Dài quá thì cắt ở hai dòng, rê chuột vào
để đọc trọn. Muốn ghi dài thì viết trong bảng sửa, ô cây chỉ hiện phần đầu.

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
| Dương lịch / âm lịch | Nút **DL / ÂL** cạnh mỗi mốc, bấm để đổi. Đỏ là âm lịch. |
| Xoá | Trong bảng sửa: xoá cả nhánh, hoặc chỉ xoá ô đó và cho các con nối lên đời trên |
| Thu gọn nhánh | Nút `−` dưới đáy ô; khi gấp lại hiện `+N` là số ô đang ẩn |
| Tìm người | Gõ vào ô tìm (phím `/`), Enter để nhảy tới kết quả kế tiếp. Không cần gõ dấu. |
| Di chuyển | Kéo nền; lăn chuột để phóng to; "Vừa khung" để xem toàn cây |
| Hoàn tác | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Xuất ảnh | Nút **Ảnh JPEG** — cả cây thành một tấm ảnh để gửi Zalo/Messenger |
| Xuất sách | Nút **Sách PDF** — nhiều trang A3/A4, có mục lục, "xem tiếp trang N" và bảng tra tên A–Z |
| Xuất PDF | Nút **PDF 1 trang** — cả cây (hoặc một nhánh) trên một trang |
| Chọn phạm vi | Mọi nút xuất đều mở hộp chọn: toàn bộ / một nhánh / từ người đang chọn trở xuống, khổ và hướng giấy |
| In ra giấy | Nút "In" — khổ A4 nằm ngang, cây tự thu cho vừa trang |

## Các tệp

| Tệp | Việc |
|---|---|
| `nguoi.js` | chữ hiển thị của một người (họ, tên, ngày tháng, bỏ dấu) — dùng chung |
| `data.js` | trạng thái, kiểm tra dữ liệu, hoàn tác, lưu vào localStorage |
| `layout.js` | tính toạ độ cây (thuần tính toán, không đụng DOM) |
| | ⚠︎ các hằng số chiều cao ở đầu tệp phải khớp với CSS — sửa cỡ chữ trong ô thì phải đo lại |
| `render.js` | vẽ ô và đường nối, kéo/phóng to |
| `xuat-anh.js` | vẽ cây ra Canvas rồi xuất JPEG / PDF |
| `xuat-sach.js` | sách PDF nhiều trang (bìa, mục lục, tổng quát đời I–III, mỗi gia đình một trang, bảng tra tên) và ảnh JPEG theo từng nhánh |
| `editor.js` | bảng sửa bên phải |
| `app.js` | thanh công cụ, tìm kiếm, nhập/xuất, phím tắt |

Không dùng thư viện ngoài, không có bước build. Các tệp nạp bằng thẻ `<script>` thường và dùng chung
biến toàn cục `GP`, nên mở bằng `file://` cũng chạy.

## Xuất ảnh và PDF

Hai nút **Ảnh JPEG** và **PDF** vẽ lại toàn bộ cây thành một tấm hình, kể cả phần đang nằm ngoài
màn hình. Ảnh vẽ ở tỉ lệ gấp đôi cho nét, tự hạ tỉ lệ nếu cây quá lớn so với giới hạn của trình
duyệt. PDF là một trang duy nhất bằng đúng khổ cây, quy ở 150 dpi.

**Xuất đúng cái đang nhìn thấy** — nhánh nào đang thu gọn thì không có trong ảnh. Muốn đủ cả họ
thì bấm "Mở hết" trước.

Cây được vẽ lại bằng Canvas chứ không chụp màn hình, vì chụp DOM cần thư viện ngoài mà dự án này
cố ý không có thư viện và không có bước build. Cái giá là **có hai bộ vẽ song song**: `render.js`
vẽ ra HTML, `xuat-anh.js` vẽ ra Canvas. Hình học lấy chung từ `layout.js`, chữ lấy chung từ
`nguoi.js`, nên chỉ còn màu sắc và phông chữ là chép lại — sửa phần ô trong `styles.css` thì phải
ngó lại `xuat-anh.js`.

## Trên điện thoại

Thanh công cụ rút còn tên dòng họ, nút "Vừa khung" và nút **⋯** mở ra phần còn lại. Bảng sửa trượt
lên từ đáy màn hình thay vì từ bên phải, cao 78% màn hình để vẫn nhìn thấy cây phía trên. Ô nhập
để cỡ chữ 16px vì iOS tự phóng to trang khi gõ vào ô nhỏ hơn.

Một ngón kéo để di chuyển, hai ngón chụm để phóng to.

## Chưa làm

Ảnh chân dung, mộ phần, tiểu sử dài, đăng nhập, nhiều người cùng sửa một lúc.

Về âm lịch, **chưa** có: quy đổi âm ⇄ dương, và tháng nhuận (`tháng 5 nhuận` chưa ghi riêng được —
tạm thời viết vào ô ghi chú).
