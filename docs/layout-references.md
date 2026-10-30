# FAB 배치 수정 근거 — 2026-10-30

## 확인한 자료

1. Zuo, Murray, Smith, **The Double-Bay Layout Problem**, IEEE Transactions on Semiconductor Manufacturing 29(4), 446–454, 2016. [대학 제공 원문](https://www.eng.auburn.edu/~aesmith/files/07553534.pdf)
   - p446–447, Fig.1: 두 bay에 네 장비열과 천장 반송 트랙을 배치하는 모델. 장비 사이 clearance, bay 폭, 뒤쪽 반출입 공간을 서로 다른 설계 변수로 취급한다.
2. Hung-Yu Lee, **Facility layout and emerging advanced material handling optimization**, Auburn University 박사논문, 2017. [대학 원문](https://holocron.lib.auburn.edu/bitstream/handle/10415/5790/Facility%20layout%20and%20emerging%20advanced%20material%20handling%20optimization.pdf?isAllowed=y&sequence=2)
   - 본문 p6–7 / Fig.2.2: 통로 양쪽의 평행 장비열. p12: 로드포트 면을 통로 좌우 경계에 맞추는 배치. 통로폭은 입력값이고 장비의 측면·후면 여유는 별도 조건이다.
3. [SK hynix M14 클린룸 공식 영상](https://news.skhynix.com/en/icheon-campus-m14_clean-room-5/)
   - 실제 영상에서 긴 통로 양옆으로 이어진 장비 전면·조작화면·로드포트와 촘촘한 측면 배치를 관찰했다. 영상만으로 실제 통로 폭·층고는 확정할 수 없다.
4. [Muratec 공식 OHT 제품 설명](https://www.muratec.com/cfa/products/)
   - 천장 레일 주행과 벨트 구동 호이스트를 통한 장비·스토커 로드포트 직접 접근을 설명한다.
5. [Daifuku 공식 기술 인터뷰](https://www.daifuku.com/daifuku-square/article/000999/)
   - 천장 반송으로 바닥의 장비 설치 공간을 확보하고 레일 사이 공간에 STB를 배치하는 구조를 소개한다.

## 이번 모델에 적용한 사항

- 로드포트가 마주 보는 10대 + 10대의 장비열을 한 bay로 반복. 수량 10대는 사용자 요청이며 논문 표준 수량이 아니다.
- 로드포트 중심으로부터 서비스 레일을 생성. 수직 승강만 구현한 이 모델에서는 FOUP·호이스트·로드포트 중심의 수평 좌표가 일치해야 한다.
- 모든 실물 OHT에 적용되는 절대 규칙은 아니다. [Murata 특허 US20170194182A1](https://patents.google.com/patent/US20170194182A1/en)의 Fig.3에는 측방 이송 기구가 있어 레일에서 옆으로 이동해 접근할 수도 있다.
- 120 × 180m, 층고 5m 유지. 16개 bay, 총 320대, 로드포트 960개.
- 전면·후면·중앙 통로의 목표 유효 폭은 5.2m. 외곽은 벽까지 명목상 5.2m이며 기둥의 국소 돌출은 별도다. 장비 측면 틈 0.4m는 비보행 공간이다.
- 이 치수는 관람 모델의 설정값이다. 실물의 정비·반출입·환기·피난 기준을 검증한 설계나 산업 공통 규격이 아니다.
- 각 bay의 로드포트 두 열 위를 둥근 끝단으로 연결한 독립 폐루프. bay 간 분기·병합·공장 전체 물류 연결은 이번 관람 범위에서 생략했다.
- 실제 장비 로드포트에서 FOUP 하강 → 분리 → 빈 호이스트 회수 → 빈 차량 한 바퀴 → 재접근 → 픽업 → 적재 주행. FOUP은 분리 중 로드포트 위에 남고 차량 내부는 비어 있다.

## 검증

`npm.cmd run check`, `npm.cmd test`, 브라우저 데스크톱·390 × 844 모바일 화면 확인. 기하 테스트는 960개 포트 정렬, 통로·측면 간격, 장비 중첩, 산책 충돌, 레일 위치·접선 연속성 및 반송 단계 연속성을 검사한다. 실제 휴대폰의 성능 측정은 별도다.
