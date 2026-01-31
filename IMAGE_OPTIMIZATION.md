# 이미지 최적화 가이드

## 현재 상태

### logo/ 폴더 (PNG → WebP 변환 권장)
22개의 PNG 파일이 있습니다. WebP로 변환 시 **50-80% 용량 절감** 가능합니다.

| 파일 | 상태 |
|------|------|
| kb-card.png | PNG → WebP 변환 필요 |
| shinhan-card.png | PNG → WebP 변환 필요 |
| hana-card.png | PNG → WebP 변환 필요 |
| woori-card.png | PNG → WebP 변환 필요 |
| samsung-card.png | PNG → WebP 변환 필요 |
| lotte-card.png | PNG → WebP 변환 필요 |
| hyundai-card.png | PNG → WebP 변환 필요 |
| bc-card.png | PNG → WebP 변환 필요 |
| tosspayments.png | PNG → WebP 변환 필요 |
| nicepayments.png | PNG → WebP 변환 필요 |
| 기타 12개 파일 | PNG → WebP 변환 필요 |

### images/ 폴더
대부분 WebP/SVG 형식으로 최적화되어 있습니다.
- strategy-i5.jpg, strategy-i6.jpg → WebP 변환 권장

---

## 변환 방법

### 방법 1: 온라인 변환 (가장 쉬움)
1. https://squoosh.app 접속
2. PNG 파일 드래그 & 드롭
3. 오른쪽에서 WebP 선택
4. Quality: 80-85 설정
5. 다운로드

### 방법 2: 일괄 변환 (CLI)
```bash
# Node.js 사용
npx sharp-cli -i logo/*.png -o logo/ -f webp -q 85

# 또는 cwebp 사용 (Google 공식 도구)
for f in logo/*.png; do cwebp -q 85 "$f" -o "${f%.png}.webp"; done
```

### 방법 3: Figma/Photoshop
- Figma: Export 시 WebP 선택
- Photoshop: Export As → WebP 선택

---

## HTML 수정 (변환 후)

변환 완료 후 `index.html`에서 이미지 경로를 업데이트하세요:

```html
<!-- AS-IS -->
<img src="logo/kb-card.png" alt="KB국민카드">

<!-- TO-BE -->
<img src="logo/kb-card.webp" alt="KB국민카드">
```

### 구버전 브라우저 호환 (선택사항)
```html
<picture>
    <source srcset="logo/kb-card.webp" type="image/webp">
    <img src="logo/kb-card.png" alt="KB국민카드">
</picture>
```

---

## 예상 효과

| 항목 | 개선 전 | 개선 후 |
|------|---------|---------|
| 로고 총 용량 | ~500KB (추정) | ~100KB |
| 페이지 로딩 | 2.5s | 1.5s |
| Lighthouse 점수 | 70점대 | 90점대 |

---

## 중복 파일 정리

발견된 중복 파일:
- `hana-card.png` / `hana-card (1).png` → 하나 삭제
- `kis-van.png` / `kis-van (1).png` → 하나 삭제
