# Audio

`@pixi/sound` is the chosen audio library (Pixi-native, integrates with `Assets`). One global init at app bootstrap handles the iOS Safari gesture-resume. Volume tracking is wired up by the BGM helper, not by `initAudio` itself.

Related: [Scene](./scene.md), [State Management § Settings store](./state.md#usesettingsstore), [Assets](./assets.md).

## API

```typescript
// engine/audio/index.ts
export function initAudio(): void;

export function playBgm(alias: string): void;
export function stopBgm(): void;

export function playSfx(alias: string): void;
```

## Contract

- **`initAudio`** is called once during engine bootstrap. It only attaches a one-shot `pointerdown` listener that resumes `sound.context.audioContext` (the iOS Safari requirement). It does **not** subscribe to settings.
- **`playBgm(alias)`** is a no-op when the current BGM already matches. Otherwise it stops the previous track, starts the new one looped at the current `useSettingsStore.bgmVolume`, and subscribes to volume changes for **that alias only**. The subscription is dropped on the next `playBgm` (different alias) or on `stopBgm`.
- **`stopBgm`** stops the current track and releases the BGM volume subscription. Called once at game shutdown (`GameModule.destroy`); not needed between scenes that swap BGM (the new `playBgm` handles it).
- **`playSfx(alias)`** reads `useSettingsStore.sfxVolume` once at play time. No subscription, no tracking — SFX is fire-and-forget. Game `destroy` unloads the SFX bundle, which stops any still-playing instances.

## BGM is scene-driven, SFX is fire-and-forget

- A scene that wants a soundtrack calls `playBgm('xxx')` in its `onEnter`. Same alias across scenes ⇒ no interruption. Different alias ⇒ swap.
- SFX is called inline from gameplay code (collision handler, button press) with no setup.

## Avoiding SFX overlap

For SFX that should never overlap (rapid collisions, repeated button clicks), set `singleInstance: true` in the asset entry's `data`:

```typescript
{ alias: 'paddle-hit', src: '...', data: { singleInstance: true } }
```
