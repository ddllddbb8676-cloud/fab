# 팹뿌 링크 공유 표지

## 원인과 변경

- 운영의 로그인 전 `/`은 `account/welcome.html`을 반환한다. 일반 요청, Meta/Facebook 수집기, Twitter 수집기 요청 모두 200이었지만 공유용 Open Graph 정보가 없었다. 게임 `index.html`에도 대표 이미지 정보가 없었다.
- 두 HTML의 `<head>`에 같은 Open Graph 제목/설명/유형/대표 URL/이미지/실제 이미지 크기/대체 텍스트, Twitter 대형 이미지 카드, canonical을 넣었다. 자바스크립트·로그인·게임 실행 없이 읽힌다. 봇마다 다른 게임/인증 동작을 만들지 않았다.
- 제목: `세미툰 | 팹뿌 · 반도체 팹 부수기`. canonical과 공유 주소는 `https://fab.semitoon.com/`다. 쿼리나 로그인 상태에 따라 다른 대표 주소가 되지 않는다.
- 원본/배포 표지: `assets/social/fab-share-20261110.jpg` / `dist/assets/social/fab-share-20261110.jpg`, 1734×907, 223,833바이트. 웹 공개 주소는 `https://fab.semitoon.com/assets/social/fab-share-20261110.jpg`다.
- 기존 게임 화면의 장비 폭발 로고를 `assets/social/fab-icon.svg`로 제공한다. 공유 이미지는 게임 실행 화면에 추가 로드하거나 preload하지 않는다. 정적 빌드에 두 파일을 복사한다.
- `src/`, `server/`, 인증·DB·칩·이벤트 코드는 변경하지 않았다. 빌드 스크립트 변경으로 게임 모듈의 캐시 버전만 함께 갱신된다.

## 표지 제작

- 기본 내장 `image_gen` 모드로 생성했다. 실제 로컬 게임 광고의 캐릭터/카트와 장비 파괴 장면을 참고한 홍보용 구성이다. 실제 플레이 화면을 그대로 캡처한 것이라고 주장하지 않는다.
- 참조: `outputs/fab-promo-2026-11-09/frames/10-end/0000.png`, `outputs/fab-promo-2026-11-09/frames/01-hook/0037.png`.
- 생성 PNG 원본은 `E:\.codex\generated_images\01a19a25-5848-7c30-9be2-2d72d25e48ea\exec-656fe242-68e9-4f74-82fa-87a09f58077d.png`에 보존한다. JPEG 인코딩만 최적화했으며 배치/텍스트/내용을 후처리로 변경하지 않았다.
- 표지 문구: `FAB@semitoon`, `세미툰 | 팹뿌`, `하고싶었던거 다하자 ㄱㄱㄱ!!`, `fab.semitoon.com`.

## 검증과 운영

- 관련 기존 로그인/입장/모듈 버전 검사 17개 통과. 새 게임 기능이나 매출/행동 테스트는 추가하지 않았다.
- 격리한 실제 Worker에서 익명/Meta/Threads/Twitter 수집기 UA, 기존 쿠키, 최초 선택 대기 쿠키, 바로 시작, 공유 쿼리의 8가지 HTML 응답을 확인했다. 정적 메타데이터·동일 canonical·JPEG 공개 바이트/MIME·HEAD·아이콘·기존 로그인 선택·일반 관리자 접근 차단을 검증했다. 수집기 요청은 쿠키나 게임 계정을 만들지 않는다.
- 운영 배포 전. 기준 운영 `3c409b08-78eb-4015-b84c-5ab5825fc2f4`, 소스 `d443d38b0aaf28dfb38f602fb448c43f0310dfaf`. 실행과 완료·검증·복구 산출물은 `outputs/share-card-20261110/`에 둔다. 이전 완료 실행기를 다시 실행하지 않는다.
- Threads에 실제 게시물을 작성하거나 계정으로 공유 미리보기를 확인하지 않았다. 메타데이터/이미지 제공 성공과 플랫폼의 실제 카드 노출은 구분한다. 이미 게시된 링크는 플랫폼의 이전 수집 결과나 게시 형태에 따라 같은 모습으로 남을 수 있으며 갱신 시점·댓글 카드 노출을 보장하지 않는다.
- 규격: [Open Graph protocol](https://ogp.me/). 공식 메타 설명을 확인했고 Meta 문서 직접 열기는 429였다. 플랫폼 UI나 재수집 작업을 완료했다고 주장하지 않는다.

## 최종 생성 프롬프트

```text
Use case: ads-marketing / compositing. Create one polished Korean social link preview cover for the existing browser game FAB@semitoon (팹뿌). Output landscape 1200 x 630 pixels, aspect ratio 1.91:1, full-bleed opaque image. Input image 1 is the genuine game character/group/cart/environment reference. Input image 2 is the genuine game equipment-breaking reference. Keep the game's distinctive simple 3D chibi cleanroom character identities, tiny dot eyes, pale masks, pastel cleanroom suits, orange/red/blue safety helmets and black cat-eared hood, white teal-trimmed semiconductor machines and the small two-deck metal cart. Make a carefully composed promotional cover, not a screenshot of an interface: a strong editorial left text area occupying about 45%, right half shows a cheerful cluster of 3-4 existing characters and the cart, backed by the white semiconductor FAB aisle; a modest stylized golden/orange equipment impact burst in the back right conveys equipment smashing as playful gameplay. Use the actual low-poly game aesthetic from the references, no realistic people, no science-fiction redesign, no different mascot style, no excessive new detail. Crisp contrast rather than the washed-out reference fog, mint-white background, deep petrol teal type, warm orange accent. Beautiful clean hierarchy, generous edge safe margins of 65px, uncluttered composition. All text MUST be exactly this and only this: small brand line 'FAB@semitoon'; HUGE main headline '세미툰 | 팹뿌'; readable second line '하고싶었던거 다하자 ㄱㄱㄱ!!'; at bottom small but clear 'fab.semitoon.com'. No badges, no extra slogans, no buttons, no UI controls, no personal nicknames, no follower counts, no labels from the reference, no watermark. Use excellent Korean lettering with all syllables correct, bold round sans-serif, make headline readable on a phone thumbnail. All important text and character faces remain within central 90% width and 85% height. Preserve playful cute proportions from the supplied actual game imagery.
```
