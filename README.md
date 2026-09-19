# Systrudel

**Systrudel = System + Strudel**

Systrudel은 컴퓨터와 사용자, AI Agent의 실시간 상태를 입력으로 받아, [Strudel](https://strudel.cc/) 기반 음악을 동적으로 변화시키는 reactive soundscape 프로젝트입니다.

로컬 telemetry server가 시스템 및 활동 정보를 수집하고, 브라우저에서 이를 `energy`, `density`, `tension`, `balance` 등의 음악 제어값으로 변환합니다.

## Inputs

현재 주요 입력은 다음과 같습니다.

- **System**
  - CPU / RAM / GPU 사용량
  - Network / Disk activity

- **User activity**
  - Typing speed
  - Scroll speed
  - Click frequency 등

- **AI agent activity**
  - Agent output activity
  - Tool usage
  - Subagent activity
  - Thinking / workload level 등

- **Environment**
  - 현재 시간
  - 날씨 등의 외부 정보

Camera/image 입력도 사용할 수 있지만, 현재는 주요 입력이 아닌 보조적인 입력/데모 기능입니다.

이 입력들은 smoothing 및 mapping을 거쳐 Strudel의 rhythm, melody, velocity, filter, distortion, envelope 등의 파라미터에 반영됩니다.

## Dependencies

- Windows
- Node.js **20.19+ 또는 22.12+**
- npm
- Modern web browser
- Strudel (`@strudel/web`)
- Codex IDE

Claude Code, Codex CLI 등은 추후 추가 예정입니다.

개발 환경에서는 Node.js 26.9.0을 사용했습니다.

## Run

```powershell
git clone https://github.com/udyann/systrudel
cd systrudel

npm install
npm run dev
```

브라우저에서 다음 주소를 엽니다.

```text
http://localhost:5173
```

`npm run dev`는 Vite frontend와 local telemetry server를 함께 실행합니다.

빌드 및 테스트:

```powershell
npm test
npm run build
```

## TO-DO
금방 데모를 올려드리겠습니다 (_ _)

system metric, user environment 등 더 많은 input을, 음악을 알맞게 변화시키도록 interpolate하는 알고리즘 개발

현재 재생되는 음악은 크게 한 가지 뿐이므로, 다양한 종류/구조의 음악 추가

다른 os/agent harness 지원 추가
