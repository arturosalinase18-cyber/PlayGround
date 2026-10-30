# Neon Dash

Un runner arcade inspirado en **Geometry Dash**, hecho para jugar en **móvil y tablet** (también funciona en escritorio). Todo el juego está hecho a mano con **Canvas 2D y JavaScript sin dependencias**.

## Cómo jugar

- **Toca o mantén pulsada la pantalla** para saltar.
- **Teclado:** `Espacio`, `↑` o `W` para saltar; `Esc` para pausar; `R` para reiniciar.
- Los **pinchos** y **sierras** te eliminan. Los **bloques** se pueden pisar.
- Recoge **monedas** y usa **pads** (impulso automático) y **orbes** (salto en el aire).
- **Inclinación (opcional):** actívala en Ajustes, acepta el permiso de movimiento y calibra el móvil. Inclina hacia delante o atrás para saltar.

En iOS, el permiso de movimiento se pide desde un toque del usuario mediante `DeviceOrientationEvent.requestPermission()`, tal como exige Safari.

## Niveles

| Nivel | Dificultad | Velocidad |
| --- | --- | --- |
| **PRISMA** | Fácil | 7.8 |
| **MAGENTA** | Medio | 8.8 |
| **SOLAR** | Difícil | 9.8 |

Cada nivel se genera de forma determinista a partir de una semilla, así que siempre es el mismo recorrido. El progreso, las monedas, los intentos y los ajustes se guardan en `localStorage` (`neon-dash-save-v1`).

## Ejecutar en local

No necesita build ni instalación:

```bash
./start.sh
# o
python3 -m http.server 3002
```

Abre `http://localhost:3002`.

Para probar el permiso de movimiento en un iPhone real, sirve el juego por **HTTPS** (Safari solo lo permite en contextos seguros).

## Características

- Controles táctiles, teclado e inclinación opcional con calibración y sensibilidad.
- Diseño responsive para vertical y horizontal, con `safe-area` para notch.
- Audio synthwave generado con WebAudio (música y efectos), sin archivos externos.
- Partículas, parallax, estelas, monedas, pads, orbes y meta final.
- Pausa, reintento rápido, pantalla de resultados y progreso persistente.
- Soporte de `prefers-reduced-motion`, vibración háptica opcional y PWA básica.

## Estructura

```
index.html            Estructura de pantallas y HUD
styles.css            Interfaz neón y estilos responsive
game.js               Física, niveles, render, audio e input
icon.svg              Icono de la PWA
manifest.webmanifest  Metadatos de instalación
screenshots/          Capturas de verificación
```

## Depuración

Con la consola abierta puedes usar:

```js
window.__neon.start(0);          // inicia el nivel 0
window.__neon.setAutoplay(true); // modo demo automático
window.__neon.simulate(90);      // simula 90 s y devuelve el estado
```

El modo demo también se activa con `?autoplay=1`.

## Créditos

Creado como proyecto abierto en [OMGithub](https://omgithub.com/arturosalinase18-cyber/PlayGround).

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://omgithub.com).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://omgithub.com/arturosalinase18-cyber/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/arturosalinase18-cyber/PlayGround)

- 🎮 [Open the project](https://omgithub.com/arturosalinase18-cyber/PlayGround).
- ✨ [Remix this project](https://omgithub.com/?remix=arturosalinase18-cyber%2FPlayGround).
- 💻 [Explore the source](https://github.com/arturosalinase18-cyber/PlayGround).
- 🛠️ [Check build runs](https://github.com/arturosalinase18-cyber/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/arturosalinase18-cyber/PlayGround/issues).
- 👤 [Explore the creator's projects](https://omgithub.com/arturosalinase18-cyber).
- 🌍 [Create with OMGithub](https://omgithub.com).
<!-- omgithub:readme:end -->
