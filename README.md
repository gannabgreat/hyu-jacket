# 한양대 과잠 공동구매 페이지

유학생 대상 한양대 야구점퍼(과잠) 공동구매 랜딩 페이지입니다. 파일 하나로 동작하며 사진은 모두 HTML 안에 포함되어 있습니다.

## 파일

| 파일 | 용도 |
|---|---|
| `index.html` | **더블클릭하면 바로 열리는 완성본.** 어느 웹호스팅에 올려도 그대로 동작합니다. |
| `artifact-source.html` | Claude 아티팩트용 원본. `<!doctype>`·`<head>` 없이 본문만 있습니다. 수정은 이 파일에 하고 `index.html`을 다시 생성합니다. |
| `*.jpg`, `*.png` | 페이지에 삽입된 사진 원본. HTML에는 base64로 들어가 있어 이 파일들이 없어도 페이지는 동작합니다. |
| `SESSION-LOG.md` | 2026-09-10 세션에서 수정한 내용 기록. |

두 HTML의 내용은 같습니다. `index.html`은 `artifact-source.html`에 doctype·charset·viewport·기본 리셋만 씌운 것입니다.

## 공개 주소

https://gannabgreat.github.io/hyu-jacket/  (GitHub Pages, `main` 브랜치 루트)

## 로컬에서 보기

    cd hyu-jacket
    python3 -m http.server 8765

그리고 http://localhost:8765 접속.

## 페이지 구성

1. 히어로 — 제목, 학생 뒷모습 사진, 가격(₩60,000 ~ ₩75,000), 앞면·뒷면 사진, Detail Info, 소매 자수 예시
2. Customization — 소매 이니셜(최대 9자) · 국기(같은 국기 8명 이상일 때 제작)
3. Production — 5주 일정 (9/14까지 가수요조사 → 결제 → 제작 → 수령)
4. Spec & Sizing — 제조사 사이즈표
5. Join — 주문 폼 (이니셜, 국가, 사이즈, 이메일, 한국 계좌 유무, 결제 수단, 질문)
6. FAQ

## 알아둘 것

**신청 내역 저장은 아티팩트에서만 동작합니다.**
`index.html`을 로컬이나 일반 웹호스팅에서 열면 신청 폼은 브라우저 저장으로 대체되고, 신청자가 복사한 스펙을 직접 보내는 방식이 됩니다. 페이지는 깨지지 않습니다.

아티팩트 주소:
https://claude.ai/code/artifact/b49de482-cc7d-412f-87fb-2813bf82bdaf

## 아직 채워야 할 것

- Join 섹션 오른쪽 연락처 박스의 카카오 오픈채팅 링크, 인스타그램 아이디
- 문의 이메일은 wpalskdl03@gmail.com 로 들어가 있음

## 신청 자동 전송 (구글 시트)

`apps-script.gs`를 Google Apps Script로 배포하면 신청이 구글 시트에 자동으로 쌓입니다.

1. https://script.google.com 접속 → **새 프로젝트**
2. 기본 코드를 지우고 `apps-script.gs` 내용을 붙여넣기 → 저장
3. 오른쪽 위 **배포 → 새 배포** → 유형 **웹 앱**
   - 실행 계정: **나**
   - 액세스 권한: **모든 사용자**
4. **배포** → 권한 승인 → **웹 앱 URL** 복사 (`https://script.google.com/macros/s/…/exec`)
5. `artifact-source.html`의 `var SHEET_ENDPOINT = "";` 에 그 URL을 넣고 `index.html`을 다시 생성

시트는 첫 신청 때 드라이브에 "HYU Jacket Orders" 이름으로 자동 생성됩니다. 같은 브라우저에서 다시 신청하면 새 줄이 아니라 기존 줄이 갱신됩니다.
