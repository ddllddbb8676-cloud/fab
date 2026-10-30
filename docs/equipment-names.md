# 장비 이름과 분류

2026-10-30 확인. 이 관람 공간의 기존 장비 360대에 11개 공정·지원 분류와 35개 기능별 장비 종류를 배정했다. 개별 장비 이름과 식별 코드는 모형을 위해 만든 이름이며 실제 회사의 설비 번호나 제조사 모델명이 아니다.

이 프로젝트의 8개 공정군은 포토, 식각, 증착, 확산·산화, 이온주입, 금속배선, CMP, 세정이다. 계측, 결함 검사, 웨이퍼 소터를 별도 지원 분류로 둔다. 이 구분은 팹 내부를 관찰하기 위한 구성으로, 산업 전체에 통일된 8대 공정 정의나 일회성 순서를 뜻하지 않는다. 증착과 금속배선처럼 실제 기술 범위가 겹치는 항목은 관람 목적에 따라 구분했다.

## 이름 규칙

- `PHA0101`: 공정군 PH + FAB A + BAY 01 + BAY 내부 장비 순번 01. 총 7자리이며 하이픈을 넣지 않는다.
- `EUV 노광기 · PHA0101`: 화면에서 읽는 종류와 공식 장비 코드. 별도의 종류별 호기 번호를 붙이지 않는다.
- `BAY 01 · A열 · 01번`: 장비의 물리적 위치. A/B는 마주 보는 두 열이다.
- `PHA0101L1`: 해당 장비의 로드포트 식별자. 7자리 장비 코드 뒤에 L1·L2·L3를 덧붙여 구별한다. 기존 OHT 경로의 내부 포트 ID는 변경하지 않는다.

장비 순번은 각 BAY에서 A열 01~10번을 01~10, B열 01~10번을 11~20으로 정한다. 같은 배치에서 배열 순서만 바꾸어도 같은 코드와 이름이 나온다. 공정군이나 물리적 위치를 다시 배정하면 코드가 바뀌므로 장기 운영 자산 ID와는 구분한다. 현재 표시는 기능 설명이며 3D 외형은 공통 관람 모형이다.

## BAY 용도와 조명 설정

BAY 이름은 기존 숫자 `BAY 01`~`BAY 18`을 유지하고, 용도를 별도 정보로 표시한다.

| BAY | 용도 | Cu 전용 | 노란 조명 |
| --- | --- | --- | --- |
| 01, 10 | 포토 | 아니오 | 적용 |
| 06 | 메탈: 여러 금속 배선 장비 | 아니오 | 적용 |
| 08 | 일반 세정 | 아니오 | 미적용 |
| 15 | Cu 전용 세정 | 예 | 적용 |

노란 조명은 BAY 01·06·10·15의 네 곳에 적용한다. BAY 15의 세정 장비 20대는 기존 네 가지 세정 방식에 `Cu 전용`을 붙여 구분한다. 예를 들어 `Cu 전용 매엽 세정기 · CLA1501`이다. BAY 08은 기존 일반 세정 이름을 유지한다. 메탈 BAY에 구리 도금기가 포함되더라도 BAY 전체를 Cu 전용으로 표시하지 않는다. Cu 전용 여부를 추가하는 것만으로 장비 코드, 물리적 위치, 내부 OHT 포트 ID를 바꾸지는 않는다.

이 구분과 조명은 사용자가 지정한 관람 공간의 설정이며, 모든 실제 팹이 동일한 배치나 조명 규칙을 따른다는 뜻은 아니다. `bayPurposes[bayId]`와 `getBayPurpose(bayId)`는 `{ name, cuDedicated, yellowLight }`를 제공한다. 개별 장비에는 표시용 문자열 `bayPurpose`와 `cuDedicated`, `yellowLight`를 함께 저장한다. Cu 전용 세정은 제조사 모델명을 새로 만든 것이 아니라 동일한 네 가지 기능 유형의 용도를 구분한 것이다.

## 월 3만 장 계획에 맞춘 공정군 배정

FAB 외곽 120m × 180m, 층고 5m, BAY 18개와 물리적 장비 360대는 유지한다. 공정군별 수량을 조정하기 위해 BAY 13은 메탈에서 확산·산화로, BAY 14는 CMP에서 증착으로, BAY 16은 계측에서 식각으로 재배정했다. BAY 13은 확산·산화 용도이므로 노란 조명을 지정하지 않는다. BAY 08 일반 세정과 BAY 15 Cu 전용 세정은 그대로 유지한다.

| 공정군 | BAY | 배치 장비 수 |
| --- | --- | ---: |
| 포토 PH | 01, 10 | 40 |
| 식각 ET | 02, 11, 16 | 60 |
| 증착 CV | 03, 12, 14 | 60 |
| 확산·산화 DI | 04, 13 | 40 |
| 이온주입 IM | 05 | 20 |
| 금속배선 ME | 06 | 20 |
| CMP CM | 07 | 20 |
| 세정 CL | 08, 15 | 40 |
| 계측 MT | 09 | 20 |
| 검사 IN | 17 | 20 |
| 소터 SO | 18 | 20 |
| 합계 | 18개 BAY | 360 |

재배정한 세 BAY의 장비 코드는 새 공정 접두어를 따르며, 예시는 `DIA1301`, `CVA1401`, `ETA1601`이다. 7자리 규칙과 FAB·BAY·장비 순번은 유지하고, 내부 장비 ID·OHT 포트 ID·배치 좌표는 변경하지 않는다. 기능 유형 35개는 기존 관람용 분류를 유지한다. 이는 월 3만 장 계획 모델의 공정군별 수량을 맞춘 배정이며, 개별 장비의 실제 레시피 호환성이나 생산능력을 실증한 결과는 아니다.

## 분류와 종류

| 공정군 | 코드 | 종류 |
| --- | --- | --- |
| 포토 | PH | EUV 노광기, ArF 액침 노광기, KrF 노광기, 코팅·현상 트랙 |
| 식각 | ET | 산화막 식각기, 폴리실리콘 식각기, 금속막 식각기, 플라스마 애셔 |
| 증착 | CV | PECVD 증착기, LPCVD 증착로, ALD 증착기, 에피택시 성장기 |
| 확산·산화 | DI | 산화로, 확산로, 급속 열처리기 |
| 이온주입 | IM | 고전류, 중전류, 고에너지 이온주입기 |
| 금속배선 | ME | 금속 PVD 증착기, 배리어막 증착기, 구리 전해도금기 |
| CMP | CM | 산화막, 구리 CMP 연마기 |
| 세정 | CL | 매엽, 배치, 메가소닉 세정기, 브러시 스크러버 |
| 계측 | MT | CD-SEM, 박막 두께, 오버레이, 면저항 계측기 |
| 검사 | IN | 광학 결함, 전자빔 결함, 매크로 표면 검사기 |
| 소터 | SO | 웨이퍼 소터 |

## 확인한 제조사 자료

- [ASML 제품 소개](https://www.asml.com/en/products), [ASML 광원 설명](https://www.asml.com/en/technology/lithography-principles/light-and-lasers): EUV·DUV, ArF·KrF 노광 분류.
- [Tokyo Electron 공정별 제품](https://www.tel.com/product/index.html): 코팅·현상, 식각, CVD·ALD·열처리, 매엽·배치 세정, 스크러버. 분류가 회사의 제품군에 따라 달라짐도 명시한다.
- [Applied Materials 제품군](https://www.appliedmaterials.com/us/en/semiconductor/products.html), [PVD 설명](https://www.appliedmaterials.com/il/en/semiconductor/products/processes/pvd.html): 에피택시, 금속 증착, 도금, CMP와 열처리 등 기능 구분.
- [Applied Materials RTP](https://www.appliedmaterials.com/cn/zh_cn/semiconductor/products/modify/rapid-thermal-processing-treatments/vantage-radiance-plus-rtp.html): 매엽 급속 열처리 기능.
- [Axcelis 이온주입 제품군](https://www.axcelis.com/products/purion-ion-implantation-equipment/): 고전류·중전류·고에너지 등 이온주입 장비 구분.
- [Lam Research GAMMA](https://www.lamresearch.com/product/gamma-product-family/): 감광막과 공정 잔류물의 드라이 스트립. 애셔는 이 관람 모형에서 식각·스트립 그룹에 포함한다.
- [ACM Research 공정·장비](https://www.acmr.com/tools-and-processes/), [메가소닉 세정](https://www.acmr.com/tools-and-processes/wet-processing/ultra-c-saps-cleaning/): 습식·메가소닉 세정과 구리 전해도금 등 기능.
- [Hitachi High-Tech 계측과 검사](https://www.hitachi-hightech.com/global/en/knowledge/semiconductor/room/manufacturing/metrology-inspection.html), [반도체 용어](https://www.hitachi-hightech.com/global/en/knowledge/semiconductor/room/words.html): CD-SEM, 박막 두께, 오버레이 계측과 결함 위치를 찾는 검사의 구분.
- [ASML 계측·검사 제품](https://www.asml.com/products/metrology-and-inspection-systems): 광학 계측과 전자빔 결함 검사 기능.
- [KLA 면저항 측정](https://www.filmetrics.com/products/instruments/sheet-resistance-measurement), [공정 제어 자료](https://www.kla.com/documents/5.3_Practical_Applications_of_MSA_Sutherland_KLA.pdf): 면저항, 광학·매크로 검사, 막 두께와 오버레이의 역할.
- [RORZE ACE SORTER](https://www.rorze.com/en/products/ace-sorter/), [Hirata EFEM·Sorter](https://www.hirata.co.jp/en/products/semiconductor): 캐리어 사이 웨이퍼 이재, 방향 정렬과 ID 확인. 여기서 소터는 전기적 다이 시험을 수행하는 웨이퍼 프로버·테스터를 의미하지 않는다.

제조사별 치수, 처리량, 성능이나 공정 레시피를 이 모형의 공통 장비 외형에 그대로 적용하지 않았다. 세부 공정의 실제 채택 여부와 설비 구성은 제품·공장에 따라 다르다.
