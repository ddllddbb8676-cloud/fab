# The Entertainer · FAB Piano

Scott Joplin의 원곡을 사용해 FAB용으로 새로 합성한 디지털 피아노 음원이다. 실제 피아노 연주자의 녹음이나 외부 악기 샘플은 사용하지 않았다. 현재 게임에는 연결하지 않았으며 재생/선로딩/자동 재생 요청도 추가하지 않았다.

- 전체 길이: 3분 4.282초 / 100 BPM / 스테레오 44.1kHz.
- `fab-entertainer-piano.mp3`: 미리듣기/일반용, 128kbps, 약 2.95MB.
- `fab-entertainer-piano-game.mp3`: 게임용 MP3, 96kbps, 약 2.21MB.
- `fab-entertainer-piano-game.ogg`: 게임용 Ogg Vorbis, 약 1.69MB.
- `fab-entertainer-preview.mp3`: 30초 미리듣기.
- 무압축 24비트 WAV 원본은 Git에 넣지 않고 `outputs/entertainer-audio-20261104/audio/fab-entertainer-piano-master.wav`에 보관한다. 약 48.8MB다.

## 원곡과 출처

- 작곡: Scott Joplin, The Entertainer (1902).
- 악보/MIDI: [Mutopia Project ID 263](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=263), 원판 재현 악보, Chris Sawer 식자. 해당 배포판은 Public Domain으로 명시되어 있다.
- 원본 LilyPond/MIDI를 `source/`에 보관했고 원본 파일 주소와 SHA-256은 `source/provenance.json`에 있다. 검토한 PDF는 위 원본 주소와 로컬 출력 폴더에 있다.
- 음색은 수학적으로 합성한 피아노 모델이며 다른 음원의 샘플/성음/연주 녹음/SoundFont를 사용하지 않았다. 새 음원의 음량·좌우 배치·잔향·연주 속도는 FAB 사용 목적에 맞춰 제작했다. 제3자 음원을 다운로드해 변환한 파일이 아니다.

## 재현과 검증

생성기: `scripts/render-entertainer.py`. Python의 numpy, scipy, mido, imageio-ffmpeg가 필요하다. 이번 실행용 의존성은 `outputs/entertainer-audio-20261104/python-lib/`에 별도로 설치했다. 결과는 같은 outputs 폴더에 기록한다.

원곡 MIDI의 2,621개 음표를 전부 사용했다. MP3/OGG/WAV를 끝까지 디코딩하고 길이·유한한 샘플·음량·클리핑을 검사했다. MP3 약 -19.45 LUFS, true peak 약 -6.02dB, 클리핑 0개다. 검증 값과 해시는 `verification.json`과 `manifest.json`에 있다. 에이전트의 직접 청취나 실제 휴대폰 재생 검증은 하지 않았다.

게임에 연결할 때는 기존 효과음/공조음 설정과 사용자 입력 후 재생 정책을 고려하고, 입장 첫 화면에서 음원 다운로드를 기다리지 않도록 한다. 사진/계정/칩/분석 데이터와 무관한 정적 파일이다.
