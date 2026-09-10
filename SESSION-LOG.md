# 작업 기록 — 2026-09-10 세션

Claude Code와 함께 `index.html` / `artifact-source.html`을 수정한 내용을 요청 순서대로 정리한 기록입니다.
로컬 확인은 `python3 -m http.server 8765` 로 띄운 http://localhost:8765 에서 했습니다.

## 1. 히어로 (첫 화면)

- 제목 "WEAR HANYANG HOME" 오른쪽, 제목 첫 줄부터 가격 위 구분선까지 세로로 학생 뒷모습 사진을 넣음 (`jacket-back.jpg`).
- 사진 자리를 확보하려고 제목 크기를 줄이고 히어로 좌우 칸을 같은 너비로 변경.
- 가격 표시를 `₩60,000 ~ ₩70,000 per jacket` 으로 변경. 두 금액을 같은 크기로, 물결표로 연결. (75,000을 거쳐 최종 70,000)
- 가격 아래 "MORE PEOPLE JOIN, / LOWER EVERYONE PAYS." 를 큰 디스플레이 서체 두 줄 + 금색 세로선 박스로 강조. 한글 줄은 삭제.
- "See the price ladder" 버튼 삭제 (가격 사다리 섹션이 없어졌기 때문).

## 2. 오른쪽 사진 영역

- 등판 일러스트(SVG) 패널을 없애고 실제 사진으로 교체.
  - 앞면 / 뒷면 두 장 나란히 (`jacket-front.jpg`, `jacket-back-flat.jpg`). 뒷면 사진의 검색 화면 아이콘은 배경색으로 지움. 앞면 사진은 두 번 교체되어 최종본은 옷걸이에 걸린 정면 사진.
  - 그 아래 **Detail Info** 2행 배치: Front(H), Back(아치+사자), Left sleeve(사자), Right sleeve(한양 엠블럼). 뒷면 타일만 워터마크 없는 이미지로 교체. 캡션은 원본 이미지 문구 그대로.
  - 그 아래 **Sleeve examples** 4장: Stars & symbol / Name in Chinese characters / Flag + initials (example) / Cursive name.
- 이니셜·국기·사이즈 미리보기 박스와 히어로 입력칸 3개는 삭제.
- 사진 카드 8장 모두 앞면·뒷면과 같은 그림자 적용.

## 3. Customization 섹션

- 제목 "Two ways to make it yours". 선택 가능한 건 **소매 이니셜**과 **국기** 두 가지, 등판은 전원 동일.
- 이니셜 규칙: 최대 9자, 영어·Korean·한자·특수문자 `^!@#$%&*()_=~/` 만 가능, 공백 허용, 숫자 불가.
- 국기 규칙: 같은 국기를 **8명 이상** 선택해야 제작, 8명 미만이면 국기 없이 이니셜만 제작 가능.
- 목록에 없는 국기는 wpalskdl03@gmail.com 로 문의 (mailto 링크). "재고 외 국가 +1주" 문구는 삭제.

## 4. 삭제한 섹션

- **Group pricing** 섹션(가격 사다리 + 실시간 인원 카운터) 전체 삭제. 관련 CSS/JS, 가격 구간 데이터, 실시간 집계 리스너 정리.
- Spec & Sizing 섹션에서 소재 스펙 목록과 HTML 사이즈 표 삭제. 제조사 사이즈표 이미지(`size-chart.png`)와 치수 설명만 남김.

## 5. Production 타임라인 (5주)

- Week 0: Interest survey — 9/14까지 가수요조사
- Week 1: Payment — 결제 확인 및 주문
- Week 2–3: Cut & stitch — 재단 · 자수 · 봉제
- Week 4–5: Pick up — 택배 가능(수량에 따라 택배비 변동), 주변에 많이 홍보하면 싸져요!!

## 6. 주문(Join) 폼

- 카드 색을 남색에서 **흰색**으로 변경, 항목 라벨은 12.5px 굵은 글씨.
- 항목 순서: Initials → Country / Size → Email → 한국 계좌 유무 → (계좌 없음일 때만) 편한 결제 수단 → Questions.
- 국기 선택창에 **No flag — 국기 없음** 옵션 추가, 기본값. 국기를 고르면 빨간 안내문(8명 규칙 + 이니셜만 제작 가능) 표시.
- 이니셜 입력은 허용 문자 외 자동 삭제, 삭제 시 빨간 안내문.
- Email 필수(형식 검사), 한국 계좌 여부 필수. 계좌 없음이면 결제 수단(예: PayPal, Wise, coin, cash) 입력 필수.
- Questions for the organizer 텍스트 영역 추가.
- 신청 내역(국가, 국기, 사이즈, 이메일, 계좌 여부, 결제 수단, 질문)이 아티팩트 DB에 기록되고, 복사용 스펙 텍스트에도 포함됨. 로컬에서는 브라우저 저장으로 대체.
- 추가 소식 수신 체크박스는 잠깐 넣었다가 요청으로 삭제.

## 7. FAQ

- 가격 구간 관련 항목 삭제. "8명 미만이면?"과 "이니셜에 쓸 수 있는 문자는?" 항목 추가. 총 8개로 재번호.

## 아직 비어 있는 것

- Join 섹션 오른쪽 연락처 박스의 카카오 오픈채팅 링크와 인스타그램 아이디.
