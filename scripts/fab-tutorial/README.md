# 팹뿌 90초 조작 안내영상 — 2026-11-12

사용자 요청: 대부분의 기능에서 어디를 클릭해야 하는지, 빠르고 역동적인
영상으로 설명한다. 모바일 세로 1080×1920, 30fps, 90초, 27장면이다.
연두색 터치 표시와 짧은 한국어 제목, 한국어 합성 음성, 원곡이 없는 직접
합성한 150 BPM 음악, 게임 자체 효과음을 사용한다.

## 제작 방식과 범위

- 게임의 Three.js 모델·표정·동작을 격리해서 연출한 **조작 시연**이다.
  실시간 멀티플레이나 실제 휴대폰 화면 녹화라고 표시하지 않는다.
- 클릭 위치와 버튼 이름은 `index.html`, `src/main.js`, `src/cart-controls.js`,
  `src/owner-speech-ui.js`, `src/world-events-ui.js`, `src/google-entry-notice.js`,
  `src/moving-walkway.js`, `src/stocker-layout.js` 및 계정 페이지에서 확인했다.
  조작창은 읽기 쉽게 확대해서 재현했다.
- 상점 두 장면은 기존 격리 QA 화면 `outputs/shop-oht-release/`의
  `clothing-final.png`, `items-final.png`에서 이름 영역을 제외해 잘랐다.
  보이는 아이템 탭의 60칩은 격리 테스트 화면의 값이며 실사용자 기록이 아니다.
- 기존 11/2, 11/9 광고의 모델 시연과 새 이동·시점·집기·카트 적재·무빙워크·
  감정표현 장면을 함께 편집했다. 현재 게임 화면의 인원수를 가장하지 않는다.
- 브라우저 촬영은 Work의 local browser 비활성 설정으로 사용할 수 없었다.
  우회 실행하지 않았다. 실제 iPhone 재생·터치 검증은 별도다.
- 게임 서버 접속, 이벤트 시작, 계정 변경, 프로덕션 배포는 하지 않는다.
  `source-world.mjs`의 `omitPortIds`는 촬영용이며 기본값은 빈 배열이다.

## 주요 안내

조이스틱, 빈 화면 드래그/거리, 장비 EMO, 장비 수리, 풉 집기/로드포트 놓기,
던지기/바닥에 놓기, 청소, 스토커 OUT/IN, 카트 잡기/적재/탑승, 무빙워크,
OHT 탑승/내리기, 감정표현 다음 줄, 5글자 대화, 앉기/눕기, 안전팀 해제 쿠폰,
상점/옷장/아이템, 베이 뿌시기, 황금 풉, 흑백 쟁탈전, 사진 모드, 지도/자동 산책,
구글 연동과 1,000칩 최초 보상을 다룬다.

특히 EMO 선택창의 두 번째 버튼, OUT 이후 나온 풉을 다시 누르는 과정,
카트 메뉴의 손잡이/빈칸/탑승을 각각 표시한다. 이벤트는 이미 열린 이벤트에
참여하는 이용자 관점이며 운영자 이벤트 시작 방법을 일반 기능으로 안내하지 않는다.

## 로컬 재현

프로젝트 루트에서 실행한다. 산출물은 Git에서 제외된
`outputs/tutorial-20261112/`에 저장한다. 의존 도구와 원본 광고 재현법은
[광고 제작 README](../fab-promo/README.md)를 따른다. 필요한 것은 설치된
Three.js, 이전 출력 경로의 `@napi-rs/canvas`, Blender 5.2, Pillow/NumPy/
imageio-ffmpeg, Windows 맑은 고딕/Segoe UI Emoji/Microsoft Heami Desktop이다.

1. `python -X utf8 scripts/fab-tutorial/story.py`
2. `node scripts/fab-tutorial/prepare-ui.mjs`
3. `node scripts/fab-tutorial/export-shots.mjs`
4. Blender 명령:
   `blender --background --factory-startup --python scripts/fab-promo/render-film.py -- move,look,pickup,walkway,social,cartload --root=outputs/tutorial-20261112/new-shots --samples=12`
5. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/fab-tutorial/narrate.ps1`
6. `python -X utf8 scripts/fab-tutorial/edit.py --audio`
7. `python -X utf8 scripts/fab-tutorial/edit.py --preview` 후 미리보기 검토.
8. `python -X utf8 scripts/fab-tutorial/edit.py --compose`
9. `python -X utf8 scripts/fab-tutorial/verify.py` 후 최종 추출 이미지 검토.

`story.py`가 길이·문구·음성·장면의 단일 기준이다. 6개 새 장면을 항상 한 번에
export한다. 공유 geometry index가 있으므로 다른 export의 JSON/bin을 섞지
않는다. 렌더러는 기존 프레임을 재사용하므로 변경 장면의 이전 출력은 별도
버전 폴더로 보존한 뒤 새로 렌더한다.

`verify.py`는 최종 MP4의 2,700프레임을 디코딩해 화면 크기·프레임수·지속 URL
대비·음성 길이와 클리핑을 확인하고 43개 장면/클릭 검토 프레임을 추출한다.
시각 검토 후에만 `verification.json`의 `visualReviewComplete`를 true로 표시한다.

최종 파일은 `FAB-controls-90s.mp4`, 편집용 자막은 `FAB-controls-90s.ko.srt`,
세부검증은 `verification.json`, 음성별 길이는 `audio-report.json`이다.

완성본 검증: 90.00초, 1080×1920, 30fps, 22,701,378바이트.
2,700프레임 디코딩과 URL 대비 검사 통과, 최종 추출 43장 시각 검토 완료.
스테레오 48kHz AAC를 디코딩한 최대치는 -2.182dBFS로 클리핑이 없다.
음성 27구간은 각 장면의 끝을 넘지 않는다.
SHA-256: `564a2d55a341dd124cd947e83b847264e6fdfbb37c26a7671449bf9fe185ff73`.
원본 게임 소스 기준: `c740858afea458fd72be68c0a0410aafacaedf08`.

## 휴대폰 확인 페이지

기존 owner-private Site `https://fab-promo-film.ddllddbb8676.chatgpt.site`를
사용한다. 게임 홈페이지와 별개의 영상 보관 페이지다. 공유 범위를 바꾸지 않고
11/2 58초, 11/9 30초 광고를 보존한다. 새 영상에는 25개 구간 이동 버튼과
MP4/자막 다운로드를 제공한다.

11/12 10:28 KST owner-private 배포 완료. Sites의 최종 상태는 `succeeded`다.
- 배포: `appgdep_6af51626bb9c819188ee4d811778301d`
- 영상 페이지 소스: `b7d78edcbe6c0bb31da478e5c14dde30b5436b00`
- 영상: https://fab-promo-film.ddllddbb8676.chatgpt.site/FAB-controls-90s.mp4
- 이전 영상 2편과 HTML 페이지 2개 보존, MP4 복사 해시 일치,
  25개 구간 버튼 및 모든 로컬 파일 참조 검사 통과.
- 브라우저 재생 검증은 사용 설정으로 불가했고 실제 휴대폰 재생은 미확인이다.

Sites 스킬대로 기존 Site의 권한과 원격 소스를 먼저 확인한 뒤 실행:
`python -X utf8 scripts/fab-tutorial/package-review.py --site-directory <검증된 체크아웃 경로>`

이 명령은 최종 파일 해시와 시각 검토 완료를 요구하고, 이전 영상을 보존하고,
페이지의 모든 로컬 참조와 복사된 MP4 해시를 검사한다. 그 뒤 Sites source helper로
정확한 소스를 push/package하고 owner-private 배포 결과를 확인한다.

다른 PC에서 Git만 clone하면 최종 영상, 과거 렌더 프레임, 음원, 폰트, 설치 도구가
따라오지 않는다. 제공한 영상 확인 페이지에서 완성본을 받거나 로컬 출력 자료를
옮긴다. 비밀값·운영 계정·인증 쿠키가 필요 없는 제작 작업이다.
