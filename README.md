# 무역자격 드릴 (Trade Cert Study Drill)

간격 반복(SRS) 기반 **무역 자격 암기 학습 앱**. 원산지관리사·무역영어 1급·TOEIC 을
매일 짧게 반복 학습하기 위한 개인용 오프라인 PWA 입니다.

> 취약 과목인 **품목분류(HS)** 를 특별 취급합니다 — 라이트너 5-박스 SRS 에
> **HS 트리 드릴**과 **시험 D-day 대시보드**를 더한, Anki 로는 안 되는 무역 특화 기능을 담았습니다.

## 실행

빌드 과정이 없습니다. 정적 파일이므로 아무 정적 서버로나 열면 됩니다.

```bash
# 저장소 루트에서
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000
```

모바일에서는 브라우저의 **홈 화면에 추가**로 설치하면 오프라인 앱처럼 동작합니다
(Service Worker + IndexedDB). GitHub Pages 등 정적 호스팅에 그대로 배포할 수 있습니다.

### GitHub Pages 배포

저장소에 배포 워크플로(`.github/workflows/deploy-pages.yml`)가 포함되어 있습니다.
**최초 1회만** 수동으로 Pages 를 켜야 합니다(액션 토큰은 Pages 를 자동 생성할 수 없음):

1. 저장소 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 설정
2. `main` 브랜치에 병합되면(또는 Actions 탭에서 워크플로를 수동 실행하면) 자동 배포
3. 배포 주소: `https://lj962774-cpu.github.io/Trade-Cert-Study-Drill/`

> 단일 파일 버전이 필요하면 `node scripts/build-standalone.js` 로 `dist/index.html`
> (모든 CSS·JS 인라인)을 생성할 수 있습니다.

## 주요 기능

| 영역 | 내용 |
|------|------|
| **SRS** | 라이트너 5-박스. 정답 → `box+1`(최대 5), 오답 → `box=1` + 10분 뒤 재등장. 간격일 `{1:0, 2:1, 3:3, 4:7, 5:16}` 은 설정에서 조정 |
| **due 선별** | `due ≤ 지금` 카드 중 **낮은 box → 오래된 due** 우선. due 없으면 미리 학습(Study Ahead) |
| **덱** | 품목분류(HS)·원산지결정기준·무역영어·인코텀즈 2020·TOEIC 어휘 (5개 기본, 추가/이름변경/삭제 가능) |
| **카드** | 추가/수정/삭제/검색. 백틱(`` `코드` ``)·`**굵게**` 마크업 |
| **HS 트리 드릴** | 부(21)→류→호 계층. 정방향(이름→호)·역방향(호→이름) 문제 |
| **D-day 대시보드** | 시험별 시험일 → D-day·남은 due 표시 |
| **통계** | 덱별 진도%·box 분포·누적 정답률·최근 7일 히트맵 |
| **데이터** | JSON 전체 백업/복원, CSV 대량 import(중복 감지) |
| **오프라인·모바일** | PWA(Service Worker), IndexedDB 영속, 반응형·키보드·접근성 대응 |

## 학습 단축키

- `Space` / `Enter` — 정답 보기
- `1` — 틀림 · `2` — 맞음

## CSV 가져오기

`데이터` 탭에서 CSV 를 올리면 대량 입력됩니다.

```csv
deck,front,back,tags
무역영어,`FTA`,Free Trade Agreement — 자유무역협정,약어
품목분류(HS),제39류는?,플라스틱과 그 제품,구조;류
```

- 헤더 행 자동 인식(없어도 `deck, front, back, tags` 순서로 처리)
- 존재하지 않는 덱은 자동 생성, 같은 덱+앞면 **중복은 건너뜀**
- 선택 컬럼 `box`, `due` 로 시작 박스/일정 지정 가능
- 태그는 `;` `,` `|` 로 구분

## 콘텐츠 정확성 가드레일 (중요)

이 앱의 시드(내장) 콘텐츠는 **확실도 높은 "골격"만** 담습니다
(HS 통칙 GRI 1~6, HS 구조, 인코텀즈 2020 11규칙, 원산지결정기준 유형, 무역영어 핵심 약어,
부 21개 구조). 이 카드들은 UI 에 **`골격` 배지**로 표시됩니다.

앱은 다음을 **생성하지 않습니다** — 반드시 **현행 공식 기본서로 직접 입력**하세요:

- HS 세부 호·소호(6·10단위) 및 그 분류
- PSR 협정별 계산식·기준율·허용 비율
- 법령 조문·수치

HS 트리 드릴도 사용자가 공식 기본서로 추가한 호(4단위)만 출제합니다.

## 구조

```
index.html            앱 셸
manifest.webmanifest  PWA 매니페스트
sw.js                 서비스 워커(오프라인 캐시)
css/styles.css        스타일(라이트/다크, 모바일 우선)
js/seed.js            골격 시드 콘텐츠 + HS 트리 데이터
js/srs.js             라이트너 SRS 알고리즘
js/store.js           상태 관리 + IndexedDB 영속 + import/export
js/app.js             UI·뷰 라우팅·학습 세션
```

## 데이터 모델

전체 상태를 단일 JSON 으로 IndexedDB 에 저장합니다(백업 형식과 동일).

```json
{
  "version": 1,
  "settings": { "intervals": {"1":0,"2":1,"3":3,"4":7,"5":16}, "algo": "leitner", "lapseDelayMin": 10 },
  "exams": [ { "id": "origin", "name": "원산지관리사", "examDate": "" } ],
  "decks": { "hs": { "name": "품목분류(HS)", "tag": "…", "examId": "origin", "cards": [ … ] } },
  "hsTree": { "sections": [...], "chapters": [...], "headings": [...] },
  "reviewLog": [ { "ts": 0, "correct": true, "deckId": "hs" } ]
}
```
